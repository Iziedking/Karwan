// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IKarwanHub, IKarwanIdentity, IKarwanRecord, Outcome} from "./interfaces/IKarwanSuite.sol";
import {SigCheck} from "./SigCheck.sol";

/// @title KarwanSettlementBase
/// @notice The money rules every Karwan escrow family inherits. A family holds
///         its own deals' money and decides when it moves; this base decides
///         where it may go. Whatever a family does, money leaves a deal only to
///         the payer or a payee recorded before any money left the deal, to an
///         assignee a payee signed for, or to the fee recipient within a fee
///         fixed at opening and never above 10%. A transfer that fails is kept
///         as an owed balance that only the same address can withdraw. A payee's
///         record shows the deal only once the payee accepted it.
abstract contract KarwanSettlementBase is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    struct Account {
        address asset;
        uint64 horizon;
        uint8 payeeCount;
        bool closed;
        uint8 consentMask;
        address payer;
        uint64 payerId;
        uint16 feeBps;
        address feeRecipient;
        uint64 holdUntil;
        address seniorSafe;
        uint64 holdUsed;
        uint128 perDealCap;
        uint128 funded;
        uint128 balance;
        uint128 feePaid;
    }

    struct Assignment {
        address assignee;
        uint128 amount;
        uint128 paid;
    }

    uint16 internal constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 1_000;
    uint8 public constant MAX_PAYEES = 8;
    uint64 public constant LONGSTOP = 180 days;
    uint64 public constant MAX_HORIZON = 730 days;
    uint64 public constant HOLD_STEP = 7 days;
    uint64 public constant HOLD_BUDGET = 30 days;
    bytes32 public constant ASSIGN_TYPEHASH = keccak256(
        "Assign(bytes32 dealId,address payee,address assignee,uint128 amount,uint256 nonce,uint256 deadline)"
    );

    IKarwanHub public immutable hub;

    mapping(bytes32 => Account) internal _accounts;
    mapping(bytes32 => address[MAX_PAYEES]) internal _payees;
    mapping(bytes32 => uint64[MAX_PAYEES]) internal _payeeIds;
    mapping(bytes32 => mapping(address => Assignment)) public assignmentOf;
    mapping(address => mapping(address => uint256)) public owed;
    mapping(address => uint256) public owedTotal;
    mapping(address => uint256) public held;
    mapping(address => mapping(uint256 => bool)) public nonceUsed;
    mapping(bytes32 => uint24) public pendingRecord;

    event AccountOpened(
        bytes32 indexed dealId, address indexed asset, address indexed payer, uint8 payees, uint16 feeBps, address feeRecipient
    );
    event Funded(bytes32 indexed dealId, address indexed from, uint256 amount);
    event Paid(bytes32 indexed dealId, address indexed to, uint256 amount, bool toAssignee);
    event FeePaid(bytes32 indexed dealId, address indexed to, uint256 amount);
    event PayoutCredited(address indexed asset, address indexed to, uint256 amount);
    event OwedWithdrawn(address indexed asset, address indexed to, uint256 amount);
    event PayoutAssigned(bytes32 indexed dealId, address indexed payee, address indexed assignee, uint128 amount);
    event AssignmentReleased(bytes32 indexed dealId, address indexed payee, address indexed assignee);
    event NonceCancelled(address indexed payee, uint256 nonce);
    event PayeeAdded(bytes32 indexed dealId, address indexed payee);
    event Accepted(bytes32 indexed dealId, address indexed payee);
    event Held(bytes32 indexed dealId, uint64 until, bytes32 reasonHash);
    event HoldReleased(bytes32 indexed dealId);
    event HorizonSet(bytes32 indexed dealId, uint64 horizon);
    event LongstopSplit(bytes32 indexed dealId, address indexed by);
    event OutcomeUnrecorded(bytes32 indexed dealId, uint8 party);
    event RecordPending(bytes32 indexed dealId, uint8 party, uint8 outcome, uint16 detail);

    error NotOpen();
    error Exists();
    error Closed();
    error BadParties();
    error BadHorizon();
    error NonceUsed();
    error NotAllowed();
    error NotParty();
    error BadAmount();
    error OverCap();
    error FeeTooHigh();
    error BadDelivery();
    error NothingOwed();
    error Assigned();
    error NotAssignee();
    error BadSignature();
    error Expired();
    error NotGuardian();
    error OnHold();
    error HoldBudget();
    error NotSenior();
    error Early();
    error NoPending();

    constructor(address hub_, string memory name, string memory version) EIP712(name, version) {
        hub = IKarwanHub(hub_);
    }

    // ------------------------------- Owed ---------------------------------

    /// @notice Collect payouts that could not be delivered earlier, only to
    ///         the address they are owed to.
    function withdrawOwed(address asset) external nonReentrant {
        uint256 amount = owed[asset][msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[asset][msg.sender] = 0;
        owedTotal[asset] -= amount;
        IERC20(asset).safeTransfer(msg.sender, amount);
        emit OwedWithdrawn(asset, msg.sender, amount);
    }

    // ----------------------------- Assignment -----------------------------

    /// @notice A payee signs part of their payouts over to someone else, for
    ///         example a financier. The assignee is paid first, up to `amount`.
    ///         With an empty signature, the payee must be the caller. Nonces
    ///         are single-use in any order, and the payee can cancel one.
    function assignPayout(
        bytes32 dealId,
        address payee,
        address assignee,
        uint128 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata sig
    ) external {
        _live(dealId);
        if (!_isPayee(dealId, payee)) revert NotParty();
        if (assignee == address(0) || assignee == payee || assignee == address(this) || amount == 0) {
            revert BadParties();
        }
        if (assignmentOf[dealId][payee].assignee != address(0)) revert Assigned();
        if (msg.sender != payee) {
            if (block.timestamp > deadline) revert Expired();
            if (nonceUsed[payee][nonce]) revert NonceUsed();
            nonceUsed[payee][nonce] = true;
            if (!SigCheck.isValid(payee, assignDigest(dealId, payee, assignee, amount, nonce, deadline), sig)) {
                revert BadSignature();
            }
        }
        assignmentOf[dealId][payee] = Assignment(assignee, amount, 0);
        emit PayoutAssigned(dealId, payee, assignee, amount);
    }

    /// @notice A payee withdraws a signature before anyone uses it.
    function cancelNonce(uint256 nonce) external {
        nonceUsed[msg.sender][nonce] = true;
        emit NonceCancelled(msg.sender, nonce);
    }

    /// @notice The assignee gives the assignment up.
    function releaseAssignment(bytes32 dealId, address payee) external {
        Assignment storage s = assignmentOf[dealId][payee];
        if (s.assignee == address(0) || msg.sender != s.assignee) revert NotAssignee();
        delete assignmentOf[dealId][payee];
        emit AssignmentReleased(dealId, payee, msg.sender);
    }

    // -------------------------------- Holds -------------------------------

    /// @notice The guardian holds a deal's claims for 7 days, at most 30 days
    ///         per deal in total. A hold never moves money and never touches a
    ///         refund; each family decides which of its paths a hold delays.
    function hold(bytes32 dealId, bytes32 reasonHash) external {
        if (msg.sender != hub.guardian()) revert NotGuardian();
        Account storage a = _live(dealId);
        if (a.holdUntil > block.timestamp) revert OnHold();
        uint64 step = HOLD_STEP;
        if (a.holdUsed + step > HOLD_BUDGET) step = HOLD_BUDGET - a.holdUsed;
        if (step == 0) revert HoldBudget();
        a.holdUsed += step;
        a.holdUntil = uint64(block.timestamp) + step;
        emit Held(dealId, a.holdUntil, reasonHash);
    }

    function releaseHold(bytes32 dealId) external {
        if (msg.sender != hub.guardian()) revert NotGuardian();
        _accounts[dealId].holdUntil = uint64(block.timestamp);
        emit HoldReleased(dealId);
    }

    // ------------------------------ Long-stop -----------------------------

    /// @notice A deal still open 180 days after its last clock can be split by
    ///         the senior reviewer Safe recorded at opening, only between the
    ///         deal's own parties, so no money is held forever.
    function longstopSplit(bytes32 dealId, uint256 toPayer, uint256[] calldata toPayees) external nonReentrant {
        Account storage a = _live(dealId);
        if (msg.sender != a.seniorSafe) revert NotSenior();
        if (block.timestamp < uint256(a.horizon) + LONGSTOP) revert Early();
        uint8 n = a.payeeCount;
        if (toPayees.length != n) revert BadParties();
        uint256 sum = toPayer;
        for (uint8 i; i < n; ++i) {
            sum += toPayees[i];
        }
        if (sum != a.balance) revert BadAmount();
        _onLongstop(dealId);
        _payTo(dealId, a.payer, toPayer);
        for (uint8 i; i < n; ++i) {
            _payTo(dealId, _payees[dealId][i], toPayees[i]);
        }
        a.closed = true;
        for (uint8 p; p <= n; ++p) {
            _recordOutcome(dealId, p, Outcome.LONGSTOP, 0);
        }
        emit LongstopSplit(dealId, msg.sender);
    }

    // ------------------------------- Record -------------------------------

    /// @notice Write an outcome that failed earlier. Anyone can call it.
    function retryRecord(bytes32 dealId, uint8 party) external {
        bytes32 key = keccak256(abi.encode(dealId, party));
        uint24 p = pendingRecord[key];
        if (p == 0) revert NoPending();
        delete pendingRecord[key];
        IKarwanRecord(hub.record()).recordOutcome(
            dealId, _subject(dealId, party), party, uint8(p >> 16), _band(_accounts[dealId].funded), uint16(p)
        );
    }

    // -------------------------------- Views -------------------------------

    function accountOf(bytes32 dealId) external view returns (Account memory) {
        return _accounts[dealId];
    }

    function payeesOf(bytes32 dealId) external view returns (address[] memory out) {
        uint8 n = _accounts[dealId].payeeCount;
        out = new address[](n);
        for (uint8 i; i < n; ++i) {
            out[i] = _payees[dealId][i];
        }
    }

    function isParty(bytes32 dealId, address who) external view returns (bool) {
        return who == _accounts[dealId].payer || _isPayee(dealId, who);
    }

    function feeLeft(bytes32 dealId) public view returns (uint256) {
        Account storage a = _accounts[dealId];
        return (uint256(a.funded) * a.feeBps) / BPS - a.feePaid;
    }

    function assignDigest(
        bytes32 dealId,
        address payee,
        address assignee,
        uint128 amount,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(ASSIGN_TYPEHASH, dealId, payee, assignee, amount, nonce, deadline)));
    }

    // ------------------------- Paths for families -------------------------

    /// @dev Opens a deal's account and copies what it needs from the hub.
    ///      Returns the hub's opening config so the family can copy its own.
    function _open(bytes32 dealId, address asset, address payer, address[] memory payees, uint64 horizon)
        internal
        returns (IKarwanHub.OpeningConfig memory cfg)
    {
        Account storage a = _accounts[dealId];
        if (a.payer != address(0)) revert Exists();
        cfg = hub.openingConfig(address(this), asset);
        if (!cfg.open) revert NotOpen();
        if (cfg.feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        uint256 n = payees.length;
        if (payer == address(0) || n > MAX_PAYEES) revert BadParties();
        _checkHorizon(horizon);
        a.asset = asset;
        a.payer = payer;
        a.payerId = IKarwanIdentity(hub.identity()).identityOf(payer);
        a.horizon = horizon;
        for (uint256 i; i < n; ++i) {
            _appendPayee(dealId, a, payees[i]);
        }
        a.feeBps = cfg.feeBps;
        a.feeRecipient = cfg.feeRecipient;
        a.seniorSafe = cfg.seniorSafe;
        a.perDealCap = cfg.perDealCap;
        emit AccountOpened(dealId, asset, payer, uint8(n), cfg.feeBps, cfg.feeRecipient);
    }

    /// @dev Adds a payee while no money has left the deal, for deals whose
    ///      payees are chosen after funding (open jobs, bounties, contests).
    function _addPayee(bytes32 dealId, address payee) internal {
        Account storage a = _live(dealId);
        if (a.balance != a.funded) revert NotAllowed();
        _appendPayee(dealId, a, payee);
        emit PayeeAdded(dealId, payee);
    }

    /// @dev A payee accepts the deal; only then does it reach their record.
    ///      Families call this from the payee's own action.
    function _markConsent(bytes32 dealId, address payee) internal {
        Account storage a = _live(dealId);
        uint8 n = a.payeeCount;
        for (uint8 i; i < n; ++i) {
            if (_payees[dealId][i] == payee) {
                a.consentMask |= uint8(1) << i;
                emit Accepted(dealId, payee);
                return;
            }
        }
        revert NotParty();
    }

    /// @dev The payer adds money to their deal. Caps: the deal's own cap from
    ///      opening, and the family's total cap as it stands now.
    function _fund(bytes32 dealId, uint256 amount) internal {
        Account storage a = _live(dealId);
        if (msg.sender != a.payer) revert NotParty();
        if (amount == 0) revert BadAmount();
        if (!hub.openingConfig(address(this), a.asset).open) revert NotOpen();
        if (uint256(a.funded) + amount > a.perDealCap) revert OverCap();
        if (held[a.asset] + amount > hub.totalCapOf(address(this), a.asset)) revert OverCap();
        a.funded += uint128(amount);
        a.balance += uint128(amount);
        held[a.asset] += amount;
        IKarwanIdentity(hub.identity()).useAgentAllowance(msg.sender, amount);
        IERC20 token = IERC20(a.asset);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) revert BadDelivery();
        emit Funded(dealId, msg.sender, amount);
    }

    /// @dev Pays a recorded party. A payee's assignee is paid first, up to
    ///      what was assigned.
    function _payTo(bytes32 dealId, address party, uint256 amount) internal {
        if (amount == 0) return;
        Account storage a = _accounts[dealId];
        if (party != a.payer && !_isPayee(dealId, party)) revert NotParty();
        _take(a, amount);
        Assignment storage s = assignmentOf[dealId][party];
        uint256 cut;
        if (s.assignee != address(0) && s.paid < s.amount) {
            uint256 left = uint256(s.amount) - s.paid;
            cut = amount < left ? amount : left;
            s.paid += uint128(cut);
            _deliver(a.asset, s.assignee, cut);
            emit Paid(dealId, s.assignee, cut, true);
        }
        if (amount > cut) {
            _deliver(a.asset, party, amount - cut);
            emit Paid(dealId, party, amount - cut, false);
        }
    }

    function _payFee(bytes32 dealId, uint256 amount) internal {
        if (amount == 0) return;
        Account storage a = _accounts[dealId];
        if (amount > feeLeft(dealId)) revert FeeTooHigh();
        _take(a, amount);
        a.feePaid += uint128(amount);
        _deliver(a.asset, a.feeRecipient, amount);
        emit FeePaid(dealId, a.feeRecipient, amount);
    }

    function _close(bytes32 dealId) internal {
        Account storage a = _live(dealId);
        if (a.balance != 0) revert BadAmount();
        a.closed = true;
    }

    function _extendHorizon(bytes32 dealId, uint64 horizon) internal {
        Account storage a = _live(dealId);
        _checkHorizon(horizon);
        if (horizon > a.horizon) {
            a.horizon = horizon;
            emit HorizonSet(dealId, horizon);
        }
    }

    function _requireNotHeld(bytes32 dealId) internal view {
        if (_accounts[dealId].holdUntil > block.timestamp) revert OnHold();
    }

    /// @dev Writes how the deal ended for one party (0 is the payer, 1..n the
    ///      payees). A party with no identity at opening gets no record. A
    ///      failed write is kept for `retryRecord`.
    function _recordOutcome(bytes32 dealId, uint8 party, uint8 outcome, uint16 detail) internal {
        uint64 subject = _subject(dealId, party);
        if (subject == 0 || (party != 0 && _accounts[dealId].consentMask & (uint8(1) << (party - 1)) == 0)) {
            emit OutcomeUnrecorded(dealId, party);
            return;
        }
        IKarwanRecord rec = IKarwanRecord(hub.record());
        uint8 band = _band(_accounts[dealId].funded);
        try rec.recordOutcome(dealId, subject, party, outcome, band, detail) {}
        catch {
            pendingRecord[keccak256(abi.encode(dealId, party))] = (uint24(outcome) << 16) | detail;
            emit RecordPending(dealId, party, outcome, detail);
        }
    }

    /// @dev A family marks its own state final before a long-stop pays out.
    function _onLongstop(bytes32 dealId) internal virtual;

    // ------------------------------ Internals -----------------------------

    function _live(bytes32 dealId) internal view returns (Account storage a) {
        a = _accounts[dealId];
        if (a.payer == address(0) || a.closed) revert Closed();
    }

    function _appendPayee(bytes32 dealId, Account storage a, address p) private {
        uint8 n = a.payeeCount;
        if (n == MAX_PAYEES || p == address(0) || p == a.payer || p == address(this) || _isPayee(dealId, p)) {
            revert BadParties();
        }
        uint64 pid = IKarwanIdentity(hub.identity()).identityOf(p);
        if (pid != 0 && pid == a.payerId) revert BadParties();
        _payees[dealId][n] = p;
        _payeeIds[dealId][n] = pid;
        a.payeeCount = n + 1;
    }

    function _checkHorizon(uint64 horizon) private view {
        if (horizon <= block.timestamp || horizon > block.timestamp + MAX_HORIZON) revert BadHorizon();
    }

    function _isPayee(bytes32 dealId, address who) internal view returns (bool) {
        uint8 n = _accounts[dealId].payeeCount;
        for (uint8 i; i < n; ++i) {
            if (_payees[dealId][i] == who) return true;
        }
        return false;
    }

    function _subject(bytes32 dealId, uint8 party) internal view returns (uint64) {
        if (party == 0) return _accounts[dealId].payerId;
        if (party > _accounts[dealId].payeeCount) revert NotParty();
        return _payeeIds[dealId][party - 1];
    }

    function _take(Account storage a, uint256 amount) private {
        if (amount > a.balance) revert BadAmount();
        a.balance -= uint128(amount);
        held[a.asset] -= amount;
    }

    function _deliver(address asset, address to, uint256 amount) private {
        if (IERC20(asset).trySafeTransfer(to, amount)) return;
        owed[asset][to] += amount;
        owedTotal[asset] += amount;
        emit PayoutCredited(asset, to, amount);
    }

    function _band(uint256 amount) internal pure returns (uint8) {
        if (amount < 100e6) return 0;
        if (amount < 1_000e6) return 1;
        if (amount < 10_000e6) return 2;
        return 3;
    }
}
