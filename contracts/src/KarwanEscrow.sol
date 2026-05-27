// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice KarwanVault subset used for insurance reservations.
interface IKarwanVault {
    function reserve(bytes32 jobId, address seller, uint256 amount) external;
    function release(bytes32 jobId) external;
    function slash(bytes32 jobId, address beneficiary) external;
    function freeStakeOf(address owner) external view returns (uint256);
}

/// @notice KarwanReputation subset.
interface IKarwanReputation {
    enum Outcome {
        None,
        Success,
        DisputeResolved,
        Failed
    }

    function recordCompletion(bytes32 jobId, address buyer, address seller, Outcome outcome)
        external;
}

/// @title KarwanEscrow
/// @notice Milestone-based USDC escrow with staking-insurance backstop.
///
///         Funding flow:
///           1. Buyer funds via fundEscrow. State: None -> Funded.
///           2. Seller calls acceptEscrow. Vault reserves
///              dealAmount * reservationBps of the seller's free stake.
///              State: Funded -> Accepted.
///           3. Buyer releases milestones (releaseProgress / releaseFinal).
///              Final milestone moves state to Settled, releases the vault
///              reservation, and records reputation as Success.
///
///         Dispute paths:
///           - Either party can dispute from Funded OR Accepted.
///           - From Disputed:
///               (a) buyer.releaseFromDispute -> seller paid, reservation
///                   released, reputation recorded as DisputeResolved.
///               (b) buyer.refund -> buyer refunded + slash of the seller's
///                   reservation as insurance compensation. Reputation
///                   recorded as Failed. If the slash itself reverts for
///                   any reason, the refund still completes and a
///                   SlashFailed event fires so an operator can follow up.
contract KarwanEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum EscrowState {
        None,
        Funded,
        Accepted,
        Settled,
        Disputed,
        Refunded
    }

    struct EscrowAccount {
        address buyer;
        address seller;
        uint256 dealAmount;
        uint256 sellerNet;
        uint256 feeTotal;
        uint256 released;
        uint256 feeReleased;
        /// Amount reserved in the vault against this jobId. 0 until
        /// acceptEscrow. Doubles as the "was-Accepted" sentinel: refund and
        /// releaseFromDispute check `reservedAmount > 0` to decide whether
        /// to release / slash / record reputation.
        uint256 reservedAmount;
        uint8[] milestonePcts;
        uint8 milestonesReleased;
        EscrowState state;
    }

    uint8 internal constant MAX_MILESTONES = 4;
    uint8 internal constant PCT_TOTAL = 100;
    uint16 internal constant BPS_DENOMINATOR = 10000;

    IERC20 public immutable usdc;
    /// @notice Platform fee in basis points applied to the deal amount.
    uint16 public immutable feeBps;
    /// @notice Address that collects the platform fee.
    address public immutable treasury;
    /// @notice Vault used for insurance reservations.
    IKarwanVault public immutable vault;
    /// @notice Reputation contract that records deal outcomes.
    IKarwanReputation public immutable reputation;
    /// @notice Reservation ratio in basis points. 5000 = 50% of deal value.
    uint16 public immutable reservationBps;

    mapping(bytes32 => EscrowAccount) public escrows;

    event EscrowFunded(
        bytes32 indexed jobId,
        address indexed buyer,
        address indexed seller,
        uint256 dealAmount,
        uint256 fundedAmount,
        uint256 feeTotal,
        uint8[] milestonePcts
    );
    event EscrowAccepted(bytes32 indexed jobId, address indexed seller, uint256 reservedAmount);
    event ProgressReleased(
        bytes32 indexed jobId, uint8 milestoneIndex, uint256 amount, address indexed to
    );
    event FeeCollected(bytes32 indexed jobId, uint8 milestoneIndex, uint256 amount, address indexed treasury);
    event EscrowSettled(bytes32 indexed jobId, uint256 sellerTotal, uint256 feeTotal);
    event EscrowDisputed(bytes32 indexed jobId, string reasonHash);
    event EscrowRefunded(bytes32 indexed jobId, uint256 amount);
    event EscrowReleasedFromDispute(bytes32 indexed jobId, uint256 sellerTotal, uint256 feeTotal);
    /// @notice Emitted when the buyer's refund completed but the vault
    ///         slash that should have followed reverted for some reason
    ///         (a defence-in-depth audit fix: the buyer's primary remedy
    ///         must never block on a slash side-effect). The operator can
    ///         follow up by manually verifying the seller's vault state.
    event SlashFailed(bytes32 indexed jobId, address indexed seller, string reason);

    error AlreadyFunded();
    error NotBuyer();
    error NotSeller();
    error NotParty();
    error InvalidMilestones();
    error InvalidState();
    error TooManyReleases();
    error InvalidTreasury();
    error InvalidUSDC();
    error InvalidVault();
    error InvalidReputation();
    error FeeTooHigh();
    error ReservationTooHigh();
    error InvalidSeller();
    error InvalidAmount();
    error InsufficientStake();

    constructor(
        address _usdc,
        uint16 _feeBps,
        address _treasury,
        address _vault,
        address _reputation,
        uint16 _reservationBps
    ) {
        if (_usdc == address(0)) revert InvalidUSDC();
        if (_treasury == address(0)) revert InvalidTreasury();
        if (_vault == address(0)) revert InvalidVault();
        if (_reputation == address(0)) revert InvalidReputation();
        if (_feeBps > 1000) revert FeeTooHigh();
        if (_reservationBps > BPS_DENOMINATOR) revert ReservationTooHigh();
        usdc = IERC20(_usdc);
        feeBps = _feeBps;
        treasury = _treasury;
        vault = IKarwanVault(_vault);
        reputation = IKarwanReputation(_reputation);
        reservationBps = _reservationBps;
    }

    /// @notice Explicit struct getter. The auto-generated public-mapping
    ///         getter for `escrows` drops the `milestonePcts` dynamic-array
    ///         field (Solidity limitation), which trapped off-chain
    ///         consumers in an off-by-one tuple destructure. This view
    ///         returns the whole struct including the milestones so
    ///         callers never have to count positions.
    function getEscrow(bytes32 jobId) external view returns (EscrowAccount memory) {
        return escrows[jobId];
    }

    /// @notice Fund an escrow. State: None -> Funded.
    function fundEscrow(
        bytes32 jobId,
        address seller,
        uint256 dealAmount,
        uint8[] calldata milestonePcts
    ) external nonReentrant {
        if (escrows[jobId].state != EscrowState.None) revert AlreadyFunded();
        if (seller == address(0) || seller == msg.sender) revert InvalidSeller();
        if (dealAmount == 0) revert InvalidAmount();
        uint256 milestoneCount = milestonePcts.length;
        if (milestoneCount == 0 || milestoneCount > MAX_MILESTONES) revert InvalidMilestones();

        uint256 sum;
        for (uint256 i = 0; i < milestoneCount; i++) {
            sum += milestonePcts[i];
        }
        if (sum != PCT_TOTAL) revert InvalidMilestones();

        uint256 feeTotal = (dealAmount * feeBps) / BPS_DENOMINATOR;
        uint256 buyerFee = feeTotal / 2;
        uint256 sellerFee = feeTotal - buyerFee;
        uint256 sellerNet = dealAmount - sellerFee;
        uint256 fundedAmount = dealAmount + buyerFee;

        escrows[jobId] = EscrowAccount({
            buyer: msg.sender,
            seller: seller,
            dealAmount: dealAmount,
            sellerNet: sellerNet,
            feeTotal: feeTotal,
            released: 0,
            feeReleased: 0,
            reservedAmount: 0,
            milestonePcts: milestonePcts,
            milestonesReleased: 0,
            state: EscrowState.Funded
        });

        usdc.safeTransferFrom(msg.sender, address(this), fundedAmount);

        emit EscrowFunded(jobId, msg.sender, seller, dealAmount, fundedAmount, feeTotal, milestonePcts);
    }

    /// @notice Seller-only acceptance. Triggers the vault reservation.
    ///         State: Funded -> Accepted.
    function acceptEscrow(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.seller) revert NotSeller();

        uint256 reserveAmount = (e.dealAmount * reservationBps) / BPS_DENOMINATOR;
        // Surface the actionable error to the seller before bouncing into
        // the vault. The vault rechecks (defence in depth).
        if (vault.freeStakeOf(msg.sender) < reserveAmount) revert InsufficientStake();
        vault.reserve(jobId, msg.sender, reserveAmount);

        e.reservedAmount = reserveAmount;
        e.state = EscrowState.Accepted;
        emit EscrowAccepted(jobId, msg.sender, reserveAmount);
    }

    /// @notice Release one milestone. Final milestone settles + releases
    ///         the reservation + records Success.
    function releaseProgress(bytes32 jobId, uint8 milestoneIndex) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();
        if (milestoneIndex != e.milestonesReleased) revert TooManyReleases();
        if (milestoneIndex >= e.milestonePcts.length) revert TooManyReleases();

        bool isFinalMilestone = (e.milestonesReleased + 1) == e.milestonePcts.length;

        uint256 sellerCut;
        uint256 feeCut;
        if (isFinalMilestone) {
            sellerCut = e.sellerNet - e.released;
            feeCut = e.feeTotal - e.feeReleased;
        } else {
            uint8 pct = e.milestonePcts[milestoneIndex];
            sellerCut = (e.sellerNet * pct) / PCT_TOTAL;
            feeCut = (e.feeTotal * pct) / PCT_TOTAL;
        }

        e.released += sellerCut;
        e.feeReleased += feeCut;
        e.milestonesReleased += 1;
        if (isFinalMilestone) {
            e.state = EscrowState.Settled;
        }

        if (sellerCut > 0) {
            usdc.safeTransfer(e.seller, sellerCut);
        }
        emit ProgressReleased(jobId, milestoneIndex, sellerCut, e.seller);

        if (feeCut > 0) {
            usdc.safeTransfer(treasury, feeCut);
            emit FeeCollected(jobId, milestoneIndex, feeCut, treasury);
        }

        if (isFinalMilestone) {
            _finalizeSuccess(jobId, e);
        }
    }

    /// @notice Settle a funded escrow in one call, sweeping all remaining
    ///         seller and treasury balances.
    function releaseFinal(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();

        uint256 sellerRemaining = e.sellerNet - e.released;
        uint256 feeRemaining = e.feeTotal - e.feeReleased;
        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.milestonesReleased = uint8(e.milestonePcts.length);
        e.state = EscrowState.Settled;

        if (sellerRemaining > 0) {
            usdc.safeTransfer(e.seller, sellerRemaining);
        }
        if (feeRemaining > 0) {
            usdc.safeTransfer(treasury, feeRemaining);
            emit FeeCollected(jobId, e.milestonesReleased, feeRemaining, treasury);
        }
        emit EscrowSettled(jobId, e.sellerNet, e.feeTotal);
        _finalizeSuccess(jobId, e);
    }

    /// @notice Either party flags a dispute. Callable from Funded or
    ///         Accepted. State -> Disputed.
    function dispute(bytes32 jobId, string calldata reasonHash) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded && e.state != EscrowState.Accepted) revert InvalidState();
        if (msg.sender != e.buyer && msg.sender != e.seller) revert NotParty();
        e.state = EscrowState.Disputed;
        emit EscrowDisputed(jobId, reasonHash);
    }

    /// @notice Buyer-only path from Disputed to Settled. Pays the seller
    ///         and releases the vault reservation. Records reputation as
    ///         DisputeResolved on both sides when a reservation existed.
    function releaseFromDispute(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Disputed) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();

        uint256 sellerRemaining = e.sellerNet - e.released;
        uint256 feeRemaining = e.feeTotal - e.feeReleased;
        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.milestonesReleased = uint8(e.milestonePcts.length);
        e.state = EscrowState.Settled;

        if (sellerRemaining > 0) {
            usdc.safeTransfer(e.seller, sellerRemaining);
        }
        if (feeRemaining > 0) {
            usdc.safeTransfer(treasury, feeRemaining);
            emit FeeCollected(jobId, e.milestonesReleased, feeRemaining, treasury);
        }
        emit EscrowReleasedFromDispute(jobId, e.sellerNet, e.feeTotal);

        if (e.reservedAmount > 0) {
            vault.release(jobId);
            e.reservedAmount = 0;
            reputation.recordCompletion(
                jobId, e.buyer, e.seller, IKarwanReputation.Outcome.DisputeResolved
            );
        }
    }

    /// @notice Return all unreleased funds to the buyer. If the seller had
    ///         Accepted, also slash the seller's reservation to the buyer
    ///         as insurance compensation and record Failed reputation.
    ///         Audit M-2: a `vault.slash` revert MUST NOT block the
    ///         buyer's refund. We wrap the slash in try/catch and emit
    ///         SlashFailed if it fails, leaving operator follow-up.
    function refund(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Disputed) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();

        uint256 remaining = (e.sellerNet - e.released) + (e.feeTotal - e.feeReleased);
        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.state = EscrowState.Refunded;
        if (remaining > 0) {
            usdc.safeTransfer(e.buyer, remaining);
        }
        emit EscrowRefunded(jobId, remaining);

        // Slash + reputation only when the seller had actually accepted.
        // A pre-accept buyer-cancel (Funded -> Disputed -> Refunded) is a
        // no-fault retraction with no on-chain credit consequence.
        if (e.reservedAmount > 0) {
            address seller = e.seller;
            e.reservedAmount = 0; // clear BEFORE the external call (CEI)
            try vault.slash(jobId, e.buyer) {
                // Slash succeeded; record reputation. The recordCompletion
                // call is also a candidate for try/catch, but it has no
                // value-bearing side-effects and a revert here surfaces a
                // real backend bug rather than a recoverable RPC condition.
                reputation.recordCompletion(
                    jobId, e.buyer, seller, IKarwanReputation.Outcome.Failed
                );
            } catch Error(string memory reason) {
                emit SlashFailed(jobId, seller, reason);
            } catch (bytes memory) {
                emit SlashFailed(jobId, seller, "low-level revert");
            }
        }
    }

    /* =============================================================== */
    /*                            INTERNALS                             */
    /* =============================================================== */

    function _finalizeSuccess(bytes32 jobId, EscrowAccount storage e) internal {
        emit EscrowSettled(jobId, e.released, e.feeReleased);
        if (e.reservedAmount > 0) {
            vault.release(jobId);
            e.reservedAmount = 0;
        }
        reputation.recordCompletion(
            jobId, e.buyer, e.seller, IKarwanReputation.Outcome.Success
        );
    }
}
