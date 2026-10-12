// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IKarwanHub} from "./interfaces/IKarwanSuite.sol";
import {DealAccount, Assignment, SettlementStore, SettlementLib} from "./settlement/SettlementLib.sol";

/// @title KarwanSettlementBase
/// @notice The money rules every Karwan escrow family inherits. A family holds
///         its own deals' money and decides when it moves; this base decides
///         where it may go. Whatever a family does, money leaves a deal only to
///         the payer or a payee recorded before any money left the deal, to an
///         assignee a payee signed for, or to the fee recipient within a fee
///         fixed at opening and never above 10%. A transfer that fails is kept
///         as an owed balance that only the same address can withdraw. A payee's
///         record shows the deal only once the payee accepted it. The rules run
///         in `SettlementLib`, linked once at deploy and never changeable.
abstract contract KarwanSettlementBase is ReentrancyGuard, EIP712 {
    uint16 public constant MAX_FEE_BPS = SettlementLib.MAX_FEE_BPS;
    uint8 public constant MAX_PAYEES = SettlementLib.MAX_PAYEES;
    uint64 public constant LONGSTOP = SettlementLib.LONGSTOP;
    uint64 public constant MAX_HORIZON = SettlementLib.MAX_HORIZON;
    uint64 public constant HOLD_STEP = SettlementLib.HOLD_STEP;
    uint64 public constant HOLD_BUDGET = SettlementLib.HOLD_BUDGET;

    IKarwanHub public immutable hub;
    SettlementStore internal _s;

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
    event AccountClosed(bytes32 indexed dealId);
    event LongstopSplit(bytes32 indexed dealId, address indexed by);
    event OutcomeUnrecorded(bytes32 indexed dealId, uint8 party);
    event RecordPending(bytes32 indexed dealId, uint8 party, uint8 outcome, uint16 detail);
    event RecordAlreadyWritten(bytes32 indexed dealId, uint8 party);

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
    error BadOutcome();

    constructor(address hub_, string memory name, string memory version) EIP712(name, version) {
        hub = IKarwanHub(hub_);
    }

    // --------------------------- Public paths -----------------------------

    /// @notice Collect payouts that could not be delivered earlier, only to
    ///         the address they are owed to.
    function withdrawOwed(address asset) external nonReentrant {
        SettlementLib.withdrawOwed(_s, asset);
    }

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
        SettlementLib.assignPayout(_s, _domainSeparatorV4(), dealId, payee, assignee, amount, nonce, deadline, sig);
    }

    /// @notice A payee withdraws a signature before anyone uses it.
    function cancelNonce(uint256 nonce) external {
        _s.nonceUsed[msg.sender][nonce] = true;
        emit NonceCancelled(msg.sender, nonce);
    }

    /// @notice The assignee gives the assignment up.
    function releaseAssignment(bytes32 dealId, address payee) external {
        SettlementLib.releaseAssignment(_s, dealId, payee);
    }

    /// @notice The guardian holds a deal's claims for 7 days, at most 30 days
    ///         per deal in total. A hold never moves money and never touches a
    ///         refund; each family decides which of its paths a hold delays.
    function hold(bytes32 dealId, bytes32 reasonHash) external {
        SettlementLib.hold(_s, hub, dealId, reasonHash);
    }

    function releaseHold(bytes32 dealId) external {
        if (msg.sender != hub.guardian()) revert NotGuardian();
        _s.accounts[dealId].holdUntil = uint64(block.timestamp);
        emit HoldReleased(dealId);
    }

    /// @notice A deal still open 180 days after its last clock can be split by
    ///         the senior reviewer Safe recorded at opening, only between the
    ///         deal's own parties, so no money is held forever.
    function longstopSplit(bytes32 dealId, uint256 toPayer, uint256[] calldata toPayees) external nonReentrant {
        SettlementLib.checkLongstop(_s, dealId, toPayer, toPayees);
        _onLongstop(dealId);
        SettlementLib.payLongstop(_s, hub, dealId, toPayer, toPayees);
    }

    /// @notice Write an outcome that failed earlier. Anyone can call it. An
    ///         outcome the record already holds is dropped from the queue.
    function retryRecord(bytes32 dealId, uint8 party) external {
        SettlementLib.retryRecord(_s, hub, dealId, party);
    }

    // -------------------------------- Views -------------------------------

    function accountOf(bytes32 dealId) external view returns (DealAccount memory) {
        return _s.accounts[dealId];
    }

    function payeesOf(bytes32 dealId) external view returns (address[] memory out) {
        uint8 n = _s.accounts[dealId].payeeCount;
        out = new address[](n);
        for (uint8 i; i < n; ++i) {
            out[i] = _s.payees[dealId][i];
        }
    }

    function isParty(bytes32 dealId, address who) external view returns (bool) {
        return who == _s.accounts[dealId].payer || SettlementLib.isPayee(_s, dealId, who);
    }

    function feeLeft(bytes32 dealId) external view returns (uint256) {
        return SettlementLib.feeLeft(_s, dealId);
    }

    function assignmentOf(bytes32 dealId, address payee)
        external
        view
        returns (address assignee, uint128 amount, uint128 paid)
    {
        Assignment storage g = _s.assignments[dealId][payee];
        return (g.assignee, g.amount, g.paid);
    }

    function owed(address asset, address who) external view returns (uint256) {
        return _s.owed[asset][who];
    }

    function owedTotal(address asset) external view returns (uint256) {
        return _s.owedTotal[asset];
    }

    function held(address asset) external view returns (uint256) {
        return _s.held[asset];
    }

    function nonceUsed(address payee, uint256 nonce) external view returns (bool) {
        return _s.nonceUsed[payee][nonce];
    }

    function pendingRecord(bytes32 key) external view returns (uint24) {
        return _s.pendingRecord[key];
    }

    function assignDigest(
        bytes32 dealId,
        address payee,
        address assignee,
        uint128 amount,
        uint256 nonce,
        uint256 deadline
    ) external view returns (bytes32) {
        return SettlementLib.assignDigest(_domainSeparatorV4(), dealId, payee, assignee, amount, nonce, deadline);
    }

    // ------------------------- Paths for families -------------------------

    function _open(bytes32 dealId, address asset, address payer, address[] memory payees, uint64 horizon)
        internal
        returns (IKarwanHub.OpeningConfig memory)
    {
        return SettlementLib.open(_s, hub, dealId, asset, payer, payees, horizon);
    }

    function _addPayee(bytes32 dealId, address payee) internal {
        SettlementLib.addPayee(_s, hub, dealId, payee);
    }

    function _markConsent(bytes32 dealId, address payee) internal {
        SettlementLib.markConsent(_s, dealId, payee);
    }

    function _fund(bytes32 dealId, uint256 amount) internal {
        SettlementLib.fund(_s, hub, dealId, amount);
    }

    function _payTo(bytes32 dealId, address party, uint256 amount) internal {
        SettlementLib.payTo(_s, dealId, party, amount);
    }

    function _payFee(bytes32 dealId, uint256 amount) internal {
        SettlementLib.payFee(_s, dealId, amount);
    }

    function _close(bytes32 dealId) internal {
        SettlementLib.close(_s, dealId);
    }

    function _extendHorizon(bytes32 dealId, uint64 horizon) internal {
        SettlementLib.extendHorizon(_s, dealId, horizon);
    }

    function _requireNotHeld(bytes32 dealId) internal view {
        if (_s.accounts[dealId].holdUntil > block.timestamp) revert OnHold();
    }

    function _recordOutcome(bytes32 dealId, uint8 party, uint8 outcome, uint16 detail) internal {
        SettlementLib.recordOutcome(_s, hub, dealId, party, outcome, detail);
    }

    function _account(bytes32 dealId) internal view returns (DealAccount storage) {
        return _s.accounts[dealId];
    }

    /// @dev A family marks its own state final before a long-stop pays out.
    function _onLongstop(bytes32 dealId) internal virtual;
}
