// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IKarwanHub, IKarwanStakeVault, IFinanceable, Receivable} from "./interfaces/IKarwanSuite.sol";

/// @title KarwanTradeFinance
/// @notice Purchase-order financing and invoice factoring against a deal the
///         buyer has funded and the seller has accepted. In one transaction a
///         financier advances money to the seller, the seller's signed
///         assignment makes the deal's escrow repay the financier first, and
///         the seller's signed stake is reserved for the financier. This
///         contract holds no money. When the deal ends, anyone settles the
///         line: repaid in full frees the stake, a shortfall is slashed from the
///         stake to the financier and the rest is recovered off chain.
contract KarwanTradeFinance is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    /// An advance is backed by stake worth at least 10% of it.
    uint16 public constant MIN_STAKE_BPS = 1_000;
    uint64 public constant LONGSTOP = 180 days;
    uint64 public constant SETTLE_WINDOW = 30 days;

    uint8 internal constant OPEN = 1;
    uint8 internal constant REPAID = 2;
    uint8 internal constant DEFAULTED = 3;
    uint8 internal constant WAIVED = 4;

    struct Line {
        address escrow;
        uint8 state;
        bytes32 dealId;
        address seller;
        address financier;
        address asset;
        uint128 advance;
        uint128 repay;
        uint128 stake;
    }

    /// The seller's signature on the escrow's payout assignment, naming this
    /// contract as the one that may submit it.
    struct Signed {
        uint256 nonce;
        uint256 deadline;
        bytes sig;
    }

    /// The seller's signature on the stake reservation. It needs no nonce: the
    /// vault reserves a line id once, ever.
    struct StakeSig {
        uint256 deadline;
        bytes sig;
    }

    IKarwanHub public immutable hub;
    mapping(bytes32 => Line) internal _lines;
    /// The latest line on each seller's payout in a deal. A new line can only
    /// open once the earlier one's assignment is gone, so it waives that line.
    mapping(bytes32 => bytes32) public lineOfSeat;

    event LineOpened(
        bytes32 indexed lineId,
        address indexed escrow,
        bytes32 indexed dealId,
        address seller,
        address financier,
        uint256 advance,
        uint256 repay,
        uint256 stake
    );
    event LineRepaid(bytes32 indexed lineId, uint256 repaid);
    event LineDefaulted(bytes32 indexed lineId, uint256 shortfall, uint256 fromStake);
    event LineWaived(bytes32 indexed lineId);

    error NotFamily();
    error NotFinanceable();
    error BadTerms();
    error StakeTooLow();
    error LineExists();
    error NotOpen();
    error StillLive();
    error NotFinancier();

    constructor(address hub_) {
        hub = IKarwanHub(hub_);
    }

    /// @notice The line id commits to every term, so the seller's stake
    ///         signature over it is also their consent to the advance and the
    ///         repayment.
    function lineIdFor(address escrow, bytes32 dealId, address financier, uint128 advance, uint128 repay, uint128 stake)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), escrow, dealId, financier, advance, repay, stake));
    }

    /// @notice The financier opens a line. The deal must be accepted and fully
    ///         funded, the repayment must fit in what the deal still owes the
    ///         seller, and the stake must be at least 10% of the advance.
    ///         `expiresAt` is the stake reservation's end the seller signed; it
    ///         must outlast the deal's long-stop and the settling window.
    function open(
        address escrow,
        bytes32 dealId,
        uint128 advance,
        uint128 repay,
        uint128 stake,
        uint64 expiresAt,
        Signed calldata assignment,
        StakeSig calldata reservation
    ) external nonReentrant returns (bytes32 lineId) {
        if (!hub.isFamily(escrow)) revert NotFamily();
        Receivable memory r = IFinanceable(escrow).receivableOf(dealId);
        if (!r.financeable) revert NotFinanceable();
        if (advance == 0 || advance > repay || repay > r.unpaid) revert BadTerms();
        if (uint256(stake) * BPS < uint256(advance) * MIN_STAKE_BPS) revert StakeTooLow();
        if (expiresAt < uint256(r.horizon) + LONGSTOP + SETTLE_WINDOW) revert BadTerms();
        lineId = lineIdFor(escrow, dealId, msg.sender, advance, repay, stake);
        if (_lines[lineId].state != 0) revert LineExists();
        bytes32 seat = keccak256(abi.encode(escrow, dealId, r.seller));
        bytes32 replaced = lineOfSeat[seat];
        if (_lines[replaced].state == OPEN) {
            _lines[replaced].state = WAIVED;
            emit LineWaived(replaced);
        } else {
            replaced = 0;
        }
        lineOfSeat[seat] = lineId;
        _lines[lineId] = Line(escrow, OPEN, dealId, r.seller, msg.sender, r.asset, advance, repay, stake);
        emit LineOpened(lineId, escrow, dealId, r.seller, msg.sender, advance, repay, stake);
        IFinanceable(escrow).assignPayout(
            dealId, r.seller, msg.sender, repay, assignment.nonce, assignment.deadline, assignment.sig
        );
        IKarwanStakeVault vault = IKarwanStakeVault(hub.stakeVault());
        if (replaced != 0) vault.release(replaced);
        vault.reserve(lineId, r.seller, r.asset, stake, msg.sender, expiresAt, reservation.deadline, reservation.sig);
        IERC20(r.asset).safeTransferFrom(msg.sender, r.seller, advance);
    }

    /// @notice Anyone settles a line once its deal has ended. A financier who
    ///         gave the line's assignment up has waived the line, so the stake
    ///         is freed. A shortfall is slashed while the reservation stands;
    ///         once it has expired or been freed, the line still records the
    ///         default.
    function settle(bytes32 lineId) external nonReentrant {
        Line storage l = _lines[lineId];
        if (l.state != OPEN) revert NotOpen();
        if (IFinanceable(l.escrow).receivableOf(l.dealId).open) revert StillLive();
        (address assignee, uint128 amount, uint128 paid) = IFinanceable(l.escrow).assignmentOf(l.dealId, l.seller);
        IKarwanStakeVault vault = IKarwanStakeVault(hub.stakeVault());
        if (assignee != l.financier || amount != l.repay) {
            l.state = WAIVED;
            emit LineWaived(lineId);
            vault.release(lineId);
            return;
        }
        if (paid >= l.repay) {
            l.state = REPAID;
            emit LineRepaid(lineId, paid);
            vault.release(lineId);
            return;
        }
        uint256 shortfall = uint256(l.repay) - paid;
        l.state = DEFAULTED;
        uint256 fromStake;
        if (vault.expiryOf(address(this), lineId) >= block.timestamp && hub.isFamily(address(this))) {
            fromStake = vault.slash(lineId, shortfall);
        }
        emit LineDefaulted(lineId, shortfall, fromStake);
        vault.release(lineId);
    }

    /// @notice The financier gives up their claim on the stake, for example
    ///         after the seller repaid them another way.
    function waive(bytes32 lineId) external {
        Line storage l = _lines[lineId];
        if (l.state != OPEN) revert NotOpen();
        if (msg.sender != l.financier) revert NotFinancier();
        l.state = WAIVED;
        emit LineWaived(lineId);
        IKarwanStakeVault(hub.stakeVault()).release(lineId);
    }

    /// @notice Anyone keeps the stake reserved for as long as the deal can
    ///         still run, when the deal's horizon has moved later.
    function keepStake(bytes32 lineId) external {
        Line storage l = _lines[lineId];
        if (l.state != OPEN) revert NotOpen();
        uint64 horizon = IFinanceable(l.escrow).receivableOf(l.dealId).horizon;
        IKarwanStakeVault(hub.stakeVault()).extend(lineId, horizon + LONGSTOP + SETTLE_WINDOW);
    }

    function lineOf(bytes32 lineId) external view returns (Line memory) {
        return _lines[lineId];
    }
}
