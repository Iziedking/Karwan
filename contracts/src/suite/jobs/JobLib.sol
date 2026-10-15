// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanHub, Outcome} from "../interfaces/IKarwanSuite.sol";
import {IAgenticCommerce} from "../interfaces/IAgenticCommerce.sol";
import {SettlementStore, SettlementLib, DealAccount} from "../settlement/SettlementLib.sol";
import {DisputeLib} from "../dispute/DisputeLib.sol";
import {JobStatus, JobTerms, JobCore, JobStore} from "./JobTypes.sol";

/// @title JobLib
/// @notice The ERC-8183 job flow on the settlement base. The client creates a
///         job, names the provider and the evaluator, agrees a budget with the
///         provider and funds it; the provider submits; the evaluator
///         completes or rejects. On top of the standard: the evaluator's
///         silence pays the provider once the review window ends, a rejection
///         of submitted work waits 3 days for the provider to take it to the
///         shared dispute path, a submitted job never expires into a refund,
///         and the fee is split as in every family. Hooks are not taken.
library JobLib {
    uint16 internal constant BPS = 10_000;
    uint32 internal constant DEFAULT_REVIEW = 5 days;
    uint32 internal constant MIN_REVIEW = 1 hours;
    uint32 internal constant MAX_REVIEW = 14 days;
    uint64 internal constant REJECT_WINDOW = 3 days;
    uint64 internal constant MIN_EXPIRY = 1 hours;
    uint64 internal constant MAX_EXPIRY = 365 days;
    uint256 internal constant MAX_DESCRIPTION = 2_048;

    uint8 internal constant CLIENT = 0;
    uint8 internal constant PROVIDER = 1;

    event RejectionPending(uint256 indexed jobId, bytes32 reason, uint64 disputeBy);
    event RejectionDisputed(uint256 indexed jobId, bytes32 clauseHash);

    error HooksOff();
    error BadParties();
    error BadTerms();
    error BadState();
    error BadCaller();
    error BudgetChanged();
    error Late();
    error Early();
    error OnHold();

    // ------------------------------- Opening ------------------------------

    function defaultTerms() internal pure returns (JobTerms memory) {
        return JobTerms(DEFAULT_REVIEW, 5_000, 5_000);
    }

    /// @notice The client creates a job. The provider may be named later.
    function create(
        JobStore storage g,
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook,
        JobTerms memory t
    ) external returns (uint256 id) {
        if (hook != address(0)) revert HooksOff();
        if (evaluator == address(0) || provider == msg.sender || (provider != address(0) && provider == evaluator)) {
            revert BadParties();
        }
        if (expiredAt < block.timestamp + MIN_EXPIRY || expiredAt > block.timestamp + MAX_EXPIRY) revert BadTerms();
        if (bytes(description).length > MAX_DESCRIPTION) revert BadTerms();
        if (t.reviewWindow < MIN_REVIEW || t.reviewWindow > MAX_REVIEW) revert BadTerms();
        if (t.partialBps >= BPS || t.fallbackBps > BPS) revert BadTerms();
        id = ++g.count;
        JobCore storage j = g.jobs[id];
        j.client = msg.sender;
        j.provider = provider;
        j.evaluator = evaluator;
        j.expiredAt = uint64(expiredAt);
        j.reviewWindow = t.reviewWindow;
        j.partialBps = t.partialBps;
        j.fallbackBps = t.fallbackBps;
        j.description = description;
        emit IAgenticCommerce.JobCreated(id, msg.sender, provider, evaluator, expiredAt, hook);
    }

    function setProvider(JobStore storage g, uint256 id, address provider) external {
        JobCore storage j = _job(g, id);
        if (msg.sender != j.client) revert BadCaller();
        if (j.status != JobStatus.Open || j.provider != address(0)) revert BadState();
        if (provider == address(0) || provider == j.client || provider == j.evaluator) revert BadParties();
        j.provider = provider;
        emit IAgenticCommerce.ProviderSet(id, provider);
    }

    /// @notice The client or the provider proposes the budget while the job is
    ///         open; the client funds exactly the budget it expects.
    function setBudget(JobStore storage g, uint256 id, uint256 amount) external {
        JobCore storage j = _job(g, id);
        if (msg.sender != j.client && (msg.sender != j.provider || j.provider == address(0))) revert BadCaller();
        if (j.status != JobStatus.Open) revert BadState();
        if (amount > type(uint128).max) revert BadTerms();
        j.budget = uint128(amount);
        emit IAgenticCommerce.BudgetSet(id, amount);
    }

    /// @notice The client funds the budget and half the fee on it. The
    ///         settlement account opens now, so the fee, caps and reviewers are
    ///         those in force when the money arrives.
    function fund(SettlementStore storage s, JobStore storage g, IKarwanHub hub, address asset, uint256 id, uint256 expected)
        external
    {
        JobCore storage j = _job(g, id);
        if (msg.sender != j.client) revert BadCaller();
        if (j.status != JobStatus.Open || j.provider == address(0) || j.budget == 0) revert BadState();
        if (j.budget != expected) revert BudgetChanged();
        if (block.timestamp >= j.expiredAt) revert Late();
        bytes32 key = bytes32(id);
        address[] memory payees = new address[](1);
        payees[0] = j.provider;
        uint64 horizon = uint64(
            uint256(j.expiredAt) + j.reviewWindow + REJECT_WINDOW + DisputeLib.LONGEST + SettlementLib.HOLD_BUDGET
        );
        IKarwanHub.OpeningConfig memory cfg = SettlementLib.open(s, hub, key, asset, msg.sender, payees, horizon);
        address reviewer = cfg.highValue != 0 && j.budget >= cfg.highValue ? cfg.seniorSafe : cfg.reviewSafe;
        DisputeLib.setPanel(g.disputes, key, cfg.autoArbiter, reviewer);
        j.status = JobStatus.Funded;
        uint256 budget = j.budget;
        emit IAgenticCommerce.JobFunded(id, msg.sender, budget);
        SettlementLib.fund(s, hub, key, budget + ((budget * cfg.feeBps) / BPS) / 2);
    }

    // ------------------------------- Work ---------------------------------

    function submit(SettlementStore storage s, JobStore storage g, uint256 id, bytes32 deliverable) external {
        JobCore storage j = _job(g, id);
        if (msg.sender != j.provider) revert BadCaller();
        if (j.status != JobStatus.Funded || j.bounty) revert BadState();
        if (block.timestamp >= j.expiredAt) revert Late();
        j.status = JobStatus.Submitted;
        j.submittedAt = uint64(block.timestamp);
        j.deliverable = deliverable;
        SettlementLib.markConsent(s, bytes32(id), msg.sender);
        emit IAgenticCommerce.JobSubmitted(id, msg.sender, deliverable);
    }

    /// @notice The evaluator completes submitted work: the provider is paid
    ///         at once. It also ends a pending rejection or its dispute.
    function complete(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id, bytes32 reason)
        external
    {
        JobCore storage j = _job(g, id);
        if (msg.sender != j.evaluator) revert BadCaller();
        if (j.status != JobStatus.Submitted) revert BadState();
        if (j.disputed) {
            j.disputed = false;
            DisputeLib.drop(g.disputes, bytes32(id));
        }
        emit IAgenticCommerce.JobCompleted(id, msg.sender, reason);
        _settle(s, g, hub, id, j.budget, JobStatus.Completed, Outcome.COMPLETED, 0);
    }

    /// @notice Once the review window after submission ends with no rejection,
    ///         anyone completes the job for the provider: silence pays.
    function release(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id) external {
        JobCore storage j = _job(g, id);
        if (j.status != JobStatus.Submitted || j.rejectedAt != 0) revert BadState();
        if (block.timestamp < uint256(j.submittedAt) + j.reviewWindow) revert Early();
        notHeld(s, id);
        emit IAgenticCommerce.JobCompleted(id, j.evaluator, bytes32("silence"));
        _settle(s, g, hub, id, j.budget, JobStatus.Completed, Outcome.COMPLETED, 0);
    }

    /// @notice The client rejects an open job; the evaluator rejects a funded
    ///         job, refunded at once, or submitted work within the review
    ///         window, which waits 3 days for the provider's dispute.
    function reject(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id, bytes32 reason)
        external
    {
        JobCore storage j = _job(g, id);
        JobStatus st = j.status;
        if (st == JobStatus.Open) {
            if (msg.sender != j.client) revert BadCaller();
            j.status = JobStatus.Rejected;
            emit IAgenticCommerce.JobRejected(id, msg.sender, reason);
        } else if (st == JobStatus.Funded && !j.bounty) {
            if (msg.sender != j.evaluator) revert BadCaller();
            emit IAgenticCommerce.JobRejected(id, msg.sender, reason);
            _settle(s, g, hub, id, 0, JobStatus.Rejected, Outcome.CANCELLED, 0);
        } else if (st == JobStatus.Submitted) {
            if (msg.sender != j.evaluator) revert BadCaller();
            if (j.rejectedAt != 0) revert BadState();
            if (block.timestamp >= uint256(j.submittedAt) + j.reviewWindow) revert Late();
            j.rejectedAt = uint64(block.timestamp);
            j.reason = reason;
            emit RejectionPending(id, reason, uint64(block.timestamp + REJECT_WINDOW));
        } else {
            revert BadState();
        }
    }

    /// @notice Within 3 days of a rejection of submitted work, the provider
    ///         takes it to the shared dispute path.
    function disputeRejection(JobStore storage g, uint256 id, bytes32 clauseHash) external {
        JobCore storage j = _job(g, id);
        if (msg.sender != j.provider) revert BadCaller();
        if (j.status != JobStatus.Submitted || j.rejectedAt == 0 || j.disputed) revert BadState();
        if (block.timestamp >= uint256(j.rejectedAt) + REJECT_WINDOW) revert Late();
        j.disputed = true;
        emit RejectionDisputed(id, clauseHash);
        DisputeLib.open(g.disputes, bytes32(id), clauseHash);
    }

    /// @notice A rejection the provider did not dispute in time refunds the
    ///         client; anyone triggers it.
    function confirmRejection(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id) external {
        JobCore storage j = _job(g, id);
        if (j.status != JobStatus.Submitted || j.rejectedAt == 0 || j.disputed) revert BadState();
        if (block.timestamp < uint256(j.rejectedAt) + REJECT_WINDOW) revert Early();
        notHeld(s, id);
        emit IAgenticCommerce.JobRejected(id, j.evaluator, j.reason);
        _settle(s, g, hub, id, 0, JobStatus.Rejected, Outcome.FAILED, 0);
    }

    /// @notice A funded job nobody submitted for by its expiry goes back to
    ///         the client; anyone triggers it. Submitted work never expires
    ///         into a refund: it is completed, rejected, or paid by silence.
    function claimRefund(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id) external {
        JobCore storage j = _job(g, id);
        if (j.status != JobStatus.Funded || j.bounty) revert BadState();
        if (block.timestamp < j.expiredAt) revert Early();
        notHeld(s, id);
        emit IAgenticCommerce.JobExpired(id);
        _settle(s, g, hub, id, 0, JobStatus.Expired, Outcome.CANCELLED, 0);
    }

    /// @notice Pays a ruling on a disputed rejection: the provider's share of
    ///         the budget, the rest back to the client.
    function payRuling(SettlementStore storage s, JobStore storage g, IKarwanHub hub, uint256 id, uint16 bps) public {
        JobCore storage j = g.jobs[id];
        j.disputed = false;
        uint256 gross = (uint256(j.budget) * bps) / BPS;
        if (bps == 0) emit IAgenticCommerce.JobRejected(id, j.evaluator, bytes32("ruling"));
        else emit IAgenticCommerce.JobCompleted(id, j.evaluator, bytes32("ruling"));
        _settle(s, g, hub, id, gross, bps == 0 ? JobStatus.Rejected : JobStatus.Completed, Outcome.RULED, bps);
    }

    // ------------------------------ Internals -----------------------------

    /// Pays `gross` of the budget to the provider, the fee on it, and the rest
    /// of the job's money back to the client, then closes the account and
    /// records the outcome for both. The status and the events come first.
    function _settle(
        SettlementStore storage s,
        JobStore storage g,
        IKarwanHub hub,
        uint256 id,
        uint256 gross,
        JobStatus status,
        uint8 outcome,
        uint16 detail
    ) private {
        JobCore storage j = g.jobs[id];
        bytes32 key = bytes32(id);
        DealAccount storage a = s.accounts[key];
        uint256 fee = (gross * a.feeBps) / BPS;
        uint256 toProvider = gross - (fee - fee / 2);
        uint256 back = a.balance - toProvider - fee;
        j.status = status;
        if (toProvider != 0) emit IAgenticCommerce.PaymentReleased(id, j.provider, toProvider);
        if (back != 0) emit IAgenticCommerce.Refunded(id, j.client, back);
        SettlementLib.payTo(s, key, j.provider, toProvider);
        SettlementLib.payFee(s, key, fee);
        SettlementLib.payTo(s, key, j.client, back);
        SettlementLib.close(s, key);
        SettlementLib.setRecordValue(s, key, gross);
        SettlementLib.recordOutcome(s, hub, key, CLIENT, outcome, detail);
        SettlementLib.recordOutcome(s, hub, key, PROVIDER, outcome, detail);
    }

    function _job(JobStore storage g, uint256 id) internal view returns (JobCore storage j) {
        j = g.jobs[id];
        if (j.client == address(0)) revert BadState();
    }

    function notHeld(SettlementStore storage s, uint256 id) internal view {
        if (s.accounts[bytes32(id)].holdUntil > block.timestamp) revert OnHold();
    }
}
