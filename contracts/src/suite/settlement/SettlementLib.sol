// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IKarwanHub, IKarwanIdentity, IKarwanRecord, IKarwanYieldPool, Outcome} from "../interfaces/IKarwanSuite.sol";
import {SigCheck} from "../SigCheck.sol";

struct DealAccount {
    address asset;
    uint64 horizon;
    uint8 payeeCount;
    bool closed;
    uint8 consentMask;
    address payer;
    uint64 payerId;
    uint16 feeBps;
    /// The share of this deal's money that may sit in the yield pool, fixed at
    /// opening; zero for none.
    uint16 yieldBps;
    address feeRecipient;
    uint64 holdUntil;
    address seniorSafe;
    uint64 holdUsed;
    uint128 perDealCap;
    uint128 funded;
    uint128 balance;
    uint128 feePaid;
    /// Money the payer promised at opening and has not paid yet, such as the
    /// rest of an instalment plan. It already counts against the caps.
    uint128 promised;
}

struct Assignment {
    address assignee;
    uint128 amount;
    uint128 paid;
}

/// @notice Every family's books, kept in one storage struct so the settlement
///         library can work on them.
struct SettlementStore {
    mapping(bytes32 => DealAccount) accounts;
    mapping(bytes32 => address[8]) payees;
    mapping(bytes32 => uint64[8]) payeeIds;
    mapping(bytes32 => mapping(address => Assignment)) assignments;
    mapping(address => mapping(address => uint256)) owed;
    mapping(address => uint256) owedTotal;
    mapping(address => uint256) held;
    mapping(address => uint256) promisedTotal;
    mapping(address => mapping(uint256 => bool)) nonceUsed;
    mapping(bytes32 => uint24) pendingRecord;
    /// Per asset, what the family may park: each eligible deal's balance times
    /// its yield share.
    mapping(address => uint256) parkable;
    /// Per asset, what the family has in the yield pool.
    mapping(address => uint256) parked;
    mapping(address => address) yieldPool;
}

/// @title SettlementLib
/// @notice The settlement base's money rules, linked once into every family at
///         deploy and never changeable. It runs in the family's own context on
///         the family's own books.
library SettlementLib {
    using SafeERC20 for IERC20;

    uint16 internal constant BPS = 10_000;
    uint16 internal constant MAX_FEE_BPS = 1_000;
    uint8 internal constant MAX_PAYEES = 8;
    uint64 internal constant LONGSTOP = 180 days;
    uint64 internal constant MAX_HORIZON = 730 days;
    uint64 internal constant HOLD_STEP = 7 days;
    uint64 internal constant HOLD_BUDGET = 30 days;
    /// A deal is eligible for yield only if it can run at least this long.
    uint64 internal constant MIN_YIELD_TERM = 3 days;
    bytes32 internal constant ASSIGN_TYPEHASH = keccak256(
        "Assign(bytes32 dealId,address payee,address assignee,uint128 amount,address submitter,uint256 nonce,uint256 deadline)"
    );

    event AccountOpened(
        bytes32 indexed dealId, address indexed asset, address indexed payer, uint8 payees, uint16 feeBps, address feeRecipient
    );
    event Funded(bytes32 indexed dealId, address indexed from, uint256 amount);
    event Promised(bytes32 indexed dealId, uint256 amount);
    event Paid(bytes32 indexed dealId, address indexed to, uint256 amount, bool toAssignee);
    event FeePaid(bytes32 indexed dealId, address indexed to, uint256 amount);
    event PayoutCredited(address indexed asset, address indexed to, uint256 amount);
    event OwedWithdrawn(address indexed asset, address indexed to, uint256 amount);
    event PayoutAssigned(bytes32 indexed dealId, address indexed payee, address indexed assignee, uint128 amount);
    event AssignmentReleased(bytes32 indexed dealId, address indexed payee, address indexed assignee);
    event PayeeAdded(bytes32 indexed dealId, address indexed payee);
    event Accepted(bytes32 indexed dealId, address indexed payee);
    event Held(bytes32 indexed dealId, uint64 until, bytes32 reasonHash);
    event HorizonSet(bytes32 indexed dealId, uint64 horizon);
    event AccountClosed(bytes32 indexed dealId);
    event LongstopSplit(bytes32 indexed dealId, address indexed by);
    event OutcomeUnrecorded(bytes32 indexed dealId, uint8 party);
    event RecordPending(bytes32 indexed dealId, uint8 party, uint8 outcome, uint16 detail);
    event RecordAlreadyWritten(bytes32 indexed dealId, uint8 party);
    event YieldParked(address indexed asset, uint256 amount);
    event YieldPulled(address indexed asset, uint256 amount);

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
    error PoolBusy();

    // ------------------------------ Opening -------------------------------

    function open(
        SettlementStore storage s,
        IKarwanHub hub,
        bytes32 dealId,
        address asset,
        address payer,
        address[] memory payees,
        uint64 horizon
    ) external returns (IKarwanHub.OpeningConfig memory cfg) {
        DealAccount storage a = s.accounts[dealId];
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
            _appendPayee(s, hub, dealId, a, payees[i]);
        }
        a.feeBps = cfg.feeBps;
        a.feeRecipient = cfg.feeRecipient;
        a.seniorSafe = cfg.seniorSafe;
        a.perDealCap = cfg.perDealCap;
        if (cfg.yieldBps != 0 && horizon >= block.timestamp + MIN_YIELD_TERM) a.yieldBps = cfg.yieldBps;
        emit AccountOpened(dealId, asset, payer, uint8(n), cfg.feeBps, cfg.feeRecipient);
    }

    function addPayee(SettlementStore storage s, IKarwanHub hub, bytes32 dealId, address payee) external {
        DealAccount storage a = live(s, dealId);
        if (a.balance != a.funded) revert NotAllowed();
        _appendPayee(s, hub, dealId, a, payee);
        emit PayeeAdded(dealId, payee);
    }

    function markConsent(SettlementStore storage s, bytes32 dealId, address payee) external {
        DealAccount storage a = live(s, dealId);
        uint8 n = a.payeeCount;
        for (uint8 i; i < n; ++i) {
            if (s.payees[dealId][i] == payee) {
                a.consentMask |= uint8(1) << i;
                emit Accepted(dealId, payee);
                return;
            }
        }
        revert NotParty();
    }

    /// @notice The payer funds the deal. Money promised at opening is taken
    ///         even while the family is paused or its caps are full, and after
    ///         an agent's binding has expired, because it was counted then; only
    ///         a revoked family or a delisted asset refuses it.
    function fund(SettlementStore storage s, IKarwanHub hub, bytes32 dealId, uint256 amount) external {
        DealAccount storage a = live(s, dealId);
        if (msg.sender != a.payer) revert NotParty();
        if (amount == 0) revert BadAmount();
        uint256 promised = a.promised;
        bool pledged = promised != 0;
        if (pledged) {
            if (amount > promised) revert OverCap();
            if (!takesPromised(hub, a.asset)) revert NotOpen();
            a.promised = uint128(promised - amount);
            s.promisedTotal[a.asset] -= amount;
        } else {
            if (!hub.acceptsMoney(address(this), a.asset)) revert NotOpen();
            if (uint256(a.funded) + amount > a.perDealCap) revert OverCap();
            _checkTotal(s, hub, a.asset, amount);
        }
        a.funded += uint128(amount);
        a.balance += uint128(amount);
        s.held[a.asset] += amount;
        if (a.yieldBps != 0) s.parkable[a.asset] += (amount * a.yieldBps) / BPS;
        if (!pledged) IKarwanIdentity(hub.identity()).useAgentAllowance(msg.sender, amount);
        IERC20 token = IERC20(a.asset);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) revert BadDelivery();
        emit Funded(dealId, msg.sender, amount);
    }

    /// @notice The payer promises money the deal will take later. It counts
    ///         against the caps and an agent payer's signed limits now, as one
    ///         payment, so a later part is never refused for room another deal
    ///         took, and an agent cannot split a deal to pass its per-payment
    ///         limit.
    function pledge(SettlementStore storage s, IKarwanHub hub, bytes32 dealId, uint256 amount) external {
        DealAccount storage a = live(s, dealId);
        if (msg.sender != a.payer) revert NotParty();
        if (amount == 0 || a.promised != 0) revert BadAmount();
        if (uint256(a.funded) + amount > a.perDealCap) revert OverCap();
        _checkTotal(s, hub, a.asset, amount);
        a.promised = uint128(amount);
        s.promisedTotal[a.asset] += amount;
        emit Promised(dealId, amount);
        IKarwanIdentity(hub.identity()).useAgentAllowance(msg.sender, amount);
    }

    function takesPromised(IKarwanHub hub, address asset) public view returns (bool) {
        return hub.isFamily(address(this)) && hub.assetAllowed(asset);
    }

    function _checkTotal(SettlementStore storage s, IKarwanHub hub, address asset, uint256 amount) private view {
        if (s.held[asset] + s.promisedTotal[asset] + amount > hub.totalCapOf(address(this), asset)) revert OverCap();
    }

    // ------------------------------- Payouts ------------------------------

    function payTo(SettlementStore storage s, bytes32 dealId, address party, uint256 amount) public {
        if (amount == 0) return;
        DealAccount storage a = s.accounts[dealId];
        if (party != a.payer && !isPayee(s, dealId, party)) revert NotParty();
        _take(s, a, amount);
        Assignment storage g = s.assignments[dealId][party];
        address assignee = g.assignee;
        uint256 cut;
        if (assignee != address(0) && g.paid < g.amount) {
            uint256 left = uint256(g.amount) - g.paid;
            cut = amount < left ? amount : left;
            g.paid += uint128(cut);
            emit Paid(dealId, assignee, cut, true);
        }
        if (amount > cut) emit Paid(dealId, party, amount - cut, false);
        if (a.yieldBps != 0) _trim(s, a.asset);
        if (cut != 0) _deliver(s, a.asset, assignee, cut);
        if (amount > cut) _deliver(s, a.asset, party, amount - cut);
    }

    function payFee(SettlementStore storage s, bytes32 dealId, uint256 amount) external {
        if (amount == 0) return;
        DealAccount storage a = s.accounts[dealId];
        if (amount > feeLeft(s, dealId)) revert FeeTooHigh();
        _take(s, a, amount);
        a.feePaid += uint128(amount);
        emit FeePaid(dealId, a.feeRecipient, amount);
        if (a.yieldBps != 0) _trim(s, a.asset);
        _deliver(s, a.asset, a.feeRecipient, amount);
    }

    function withdrawOwed(SettlementStore storage s, address asset) external {
        uint256 amount = s.owed[asset][msg.sender];
        if (amount == 0) revert NothingOwed();
        s.owed[asset][msg.sender] = 0;
        s.owedTotal[asset] -= amount;
        emit OwedWithdrawn(asset, msg.sender, amount);
        if (!_liquid(s, asset, amount)) revert PoolBusy();
        IERC20(asset).safeTransfer(msg.sender, amount);
    }

    function close(SettlementStore storage s, bytes32 dealId) public {
        DealAccount storage a = live(s, dealId);
        if (a.balance != 0) revert BadAmount();
        _endPromise(s, a);
        a.closed = true;
        emit AccountClosed(dealId);
    }

    function _endPromise(SettlementStore storage s, DealAccount storage a) private {
        uint256 promised = a.promised;
        if (promised != 0) {
            a.promised = 0;
            s.promisedTotal[a.asset] -= promised;
        }
    }

    // ----------------------------- Assignment -----------------------------

    function assignPayout(
        SettlementStore storage s,
        bytes32 domainSeparator,
        bytes32 dealId,
        address payee,
        address assignee,
        uint128 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata sig
    ) external {
        live(s, dealId);
        if (!isPayee(s, dealId, payee)) revert NotParty();
        if (assignee == address(0) || assignee == payee || assignee == address(this) || amount == 0) {
            revert BadParties();
        }
        if (s.assignments[dealId][payee].assignee != address(0)) revert Assigned();
        if (msg.sender != payee) {
            if (block.timestamp > deadline) revert Expired();
            if (s.nonceUsed[payee][nonce]) revert NonceUsed();
            s.nonceUsed[payee][nonce] = true;
            bytes32 digest = assignDigest(domainSeparator, dealId, payee, assignee, amount, msg.sender, nonce, deadline);
            if (!SigCheck.isValid(payee, digest, sig)) revert BadSignature();
        }
        s.assignments[dealId][payee] = Assignment(assignee, amount, 0);
        emit PayoutAssigned(dealId, payee, assignee, amount);
    }

    function releaseAssignment(SettlementStore storage s, bytes32 dealId, address payee) external {
        Assignment storage g = s.assignments[dealId][payee];
        if (g.assignee == address(0) || msg.sender != g.assignee) revert NotAssignee();
        delete s.assignments[dealId][payee];
        emit AssignmentReleased(dealId, payee, msg.sender);
    }

    // -------------------------------- Yield -------------------------------

    /// @notice Moves the family's parked money toward its target: the eligible
    ///         share of its deals' balances, never more than it holds for
    ///         deals. A revoked family, or a delisted asset, brings it all back.
    ///         Anyone may call it;
    ///         a pool that cannot pay back yet leaves the money parked.
    function rebalanceYield(SettlementStore storage s, IKarwanHub hub, address asset) external {
        address pool = s.yieldPool[asset];
        if (pool == address(0)) {
            pool = hub.yieldPoolOf(asset);
            if (pool == address(0)) revert NotOpen();
            s.yieldPool[asset] = pool;
        }
        uint256 target = s.parkable[asset];
        if (target > s.held[asset]) target = s.held[asset];
        if (!hub.isFamily(address(this)) || !hub.assetAllowed(asset)) target = 0;
        uint256 parked = s.parked[asset];
        if (parked < target) {
            uint256 add = target - parked;
            s.parked[asset] = target;
            emit YieldParked(asset, add);
            IERC20(asset).forceApprove(pool, add);
            IKarwanYieldPool(pool).deposit(add);
        } else if (parked > target) {
            _pull(s, asset, parked - target);
        }
    }

    // -------------------------------- Holds -------------------------------

    function hold(SettlementStore storage s, IKarwanHub hub, bytes32 dealId, bytes32 reasonHash) external {
        if (msg.sender != hub.guardian()) revert NotGuardian();
        DealAccount storage a = live(s, dealId);
        if (a.holdUntil > block.timestamp) revert OnHold();
        uint64 step = HOLD_STEP;
        if (a.holdUsed + step > HOLD_BUDGET) step = HOLD_BUDGET - a.holdUsed;
        if (step == 0) revert HoldBudget();
        a.holdUsed += step;
        a.holdUntil = uint64(block.timestamp) + step;
        emit Held(dealId, a.holdUntil, reasonHash);
    }

    // ------------------------------ Long-stop -----------------------------

    function checkLongstop(SettlementStore storage s, bytes32 dealId, uint256 toPayer, uint256[] calldata toPayees)
        external
        view
    {
        DealAccount storage a = live(s, dealId);
        if (msg.sender != a.seniorSafe) revert NotSenior();
        if (block.timestamp < uint256(a.horizon) + LONGSTOP) revert Early();
        uint8 n = a.payeeCount;
        if (toPayees.length != n) revert BadParties();
        uint256 sum = toPayer;
        for (uint8 i; i < n; ++i) {
            sum += toPayees[i];
        }
        if (a.balance == 0 || sum != a.balance) revert BadAmount();
    }

    function payLongstop(
        SettlementStore storage s,
        IKarwanHub hub,
        bytes32 dealId,
        uint256 toPayer,
        uint256[] calldata toPayees
    ) external {
        DealAccount storage a = s.accounts[dealId];
        uint8 n = a.payeeCount;
        _endPromise(s, a);
        a.closed = true;
        emit AccountClosed(dealId);
        payTo(s, dealId, a.payer, toPayer);
        for (uint8 i; i < n; ++i) {
            payTo(s, dealId, s.payees[dealId][i], toPayees[i]);
        }
        for (uint8 p; p <= n; ++p) {
            recordOutcome(s, hub, dealId, p, Outcome.LONGSTOP, 0);
        }
        emit LongstopSplit(dealId, msg.sender);
    }

    // ------------------------------- Record -------------------------------

    function recordOutcome(
        SettlementStore storage s,
        IKarwanHub hub,
        bytes32 dealId,
        uint8 party,
        uint8 outcome,
        uint16 detail
    ) public {
        if (outcome == 0 || outcome > Outcome.MAX) revert BadOutcome();
        uint64 subject = subjectOf(s, dealId, party);
        if (subject == 0 || (party != 0 && s.accounts[dealId].consentMask & (uint8(1) << (party - 1)) == 0)) {
            emit OutcomeUnrecorded(dealId, party);
            return;
        }
        IKarwanRecord rec = IKarwanRecord(hub.record());
        uint8 band = _band(s.accounts[dealId].funded);
        try rec.recordOutcome(dealId, subject, party, outcome, band, detail) {}
        catch {
            s.pendingRecord[keccak256(abi.encode(dealId, party))] = (uint24(outcome) << 16) | detail;
            emit RecordPending(dealId, party, outcome, detail);
        }
    }

    function retryRecord(SettlementStore storage s, IKarwanHub hub, bytes32 dealId, uint8 party) external {
        bytes32 key = keccak256(abi.encode(dealId, party));
        uint24 p = s.pendingRecord[key];
        if (p == 0) revert NoPending();
        delete s.pendingRecord[key];
        IKarwanRecord rec = IKarwanRecord(hub.record());
        uint64 subject = subjectOf(s, dealId, party);
        if (rec.outcomeRecorded(rec.outcomeKey(address(this), dealId, subject, party))) {
            emit RecordAlreadyWritten(dealId, party);
            return;
        }
        rec.recordOutcome(dealId, subject, party, uint8(p >> 16), _band(s.accounts[dealId].funded), uint16(p));
    }

    // ------------------------------ Horizon -------------------------------

    function extendHorizon(SettlementStore storage s, bytes32 dealId, uint64 horizon) external {
        DealAccount storage a = live(s, dealId);
        _checkHorizon(horizon);
        if (horizon > a.horizon) {
            a.horizon = horizon;
            emit HorizonSet(dealId, horizon);
        }
    }

    // -------------------------------- Views -------------------------------

    function live(SettlementStore storage s, bytes32 dealId) public view returns (DealAccount storage a) {
        a = s.accounts[dealId];
        if (a.payer == address(0) || a.closed) revert Closed();
    }

    function isPayee(SettlementStore storage s, bytes32 dealId, address who) public view returns (bool) {
        uint8 n = s.accounts[dealId].payeeCount;
        for (uint8 i; i < n; ++i) {
            if (s.payees[dealId][i] == who) return true;
        }
        return false;
    }

    function subjectOf(SettlementStore storage s, bytes32 dealId, uint8 party) public view returns (uint64) {
        if (party == 0) return s.accounts[dealId].payerId;
        if (party > s.accounts[dealId].payeeCount) revert NotParty();
        return s.payeeIds[dealId][party - 1];
    }

    function feeLeft(SettlementStore storage s, bytes32 dealId) public view returns (uint256) {
        DealAccount storage a = s.accounts[dealId];
        return (uint256(a.funded) * a.feeBps) / BPS - a.feePaid;
    }

    function assignDigest(
        bytes32 domainSeparator,
        bytes32 dealId,
        address payee,
        address assignee,
        uint128 amount,
        address submitter,
        uint256 nonce,
        uint256 deadline
    ) public pure returns (bytes32) {
        return MessageHashUtils.toTypedDataHash(
            domainSeparator,
            keccak256(abi.encode(ASSIGN_TYPEHASH, dealId, payee, assignee, amount, submitter, nonce, deadline))
        );
    }

    // ------------------------------ Internals -----------------------------

    function _appendPayee(SettlementStore storage s, IKarwanHub hub, bytes32 dealId, DealAccount storage a, address p)
        private
    {
        uint8 n = a.payeeCount;
        if (n == MAX_PAYEES || p == address(0) || p == a.payer || p == address(this) || isPayee(s, dealId, p)) {
            revert BadParties();
        }
        uint64 pid = IKarwanIdentity(hub.identity()).identityOf(p);
        if (pid != 0 && pid == a.payerId) revert BadParties();
        s.payees[dealId][n] = p;
        s.payeeIds[dealId][n] = pid;
        a.payeeCount = n + 1;
    }

    function _checkHorizon(uint64 horizon) private view {
        if (horizon <= block.timestamp || horizon > block.timestamp + MAX_HORIZON) revert BadHorizon();
    }

    function _take(SettlementStore storage s, DealAccount storage a, uint256 amount) private {
        if (amount > a.balance) revert BadAmount();
        a.balance -= uint128(amount);
        s.held[a.asset] -= amount;
        if (a.yieldBps != 0) {
            uint256 share = (amount * a.yieldBps) / BPS;
            uint256 left = s.parkable[a.asset];
            s.parkable[a.asset] = left > share ? left - share : 0;
        }
    }

    /// When an eligible deal pays out, what is parked beyond the new target
    /// comes back at once, so the cash behind deals that take no yield stays in
    /// the escrow. A pool that cannot pay yet leaves it parked.
    function _trim(SettlementStore storage s, address asset) private {
        uint256 parked = s.parked[asset];
        if (parked == 0) return;
        uint256 target = s.parkable[asset];
        if (target > s.held[asset]) target = s.held[asset];
        if (parked > target) _pull(s, asset, parked - target);
    }

    /// A payout the family cannot cover from its own balance pulls the rest
    /// from the yield pool; if the pool cannot pay yet, the payout is owed.
    function _deliver(SettlementStore storage s, address asset, address to, uint256 amount) private {
        if (_liquid(s, asset, amount) && IERC20(asset).trySafeTransfer(to, amount)) return;
        s.owed[asset][to] += amount;
        s.owedTotal[asset] += amount;
        emit PayoutCredited(asset, to, amount);
    }

    function _liquid(SettlementStore storage s, address asset, uint256 amount) private returns (bool) {
        uint256 have = IERC20(asset).balanceOf(address(this));
        if (have >= amount) return true;
        return _pull(s, asset, amount - have);
    }

    function _pull(SettlementStore storage s, address asset, uint256 amount) private returns (bool) {
        uint256 parked = s.parked[asset];
        if (amount > parked) return false;
        s.parked[asset] = parked - amount;
        try IKarwanYieldPool(s.yieldPool[asset]).withdraw(amount) {
            emit YieldPulled(asset, amount);
            return true;
        } catch {
            s.parked[asset] = parked;
            return false;
        }
    }

    function _band(uint256 amount) private pure returns (uint8) {
        if (amount < 100e6) return 0;
        if (amount < 1_000e6) return 1;
        if (amount < 10_000e6) return 2;
        return 3;
    }
}
