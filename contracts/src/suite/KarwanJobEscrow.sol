// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KarwanSettlementBase} from "./KarwanSettlementBase.sol";
import {IAgenticCommerce} from "./interfaces/IAgenticCommerce.sol";
import {Job, JobStatus, JobTerms, BountyTerms, JobCore, JobStore} from "./jobs/JobTypes.sol";
import {JobLib} from "./jobs/JobLib.sol";
import {BountyLib} from "./jobs/BountyLib.sol";
import {JobDisputeLib} from "./jobs/JobDisputeLib.sol";
import {Dispute, DisputeLib} from "./dispute/DisputeLib.sol";

/// @title KarwanJobEscrow
/// @notice Agent-to-agent jobs, bounties and contests. Jobs follow ERC-8183,
///         so outside agents use them through the standard interface; on top
///         of it, the evaluator's silence pays once the review window ends, a
///         rejection of submitted work can go to the shared dispute path, and
///         submitted work never expires into a refund. Bounties and contests
///         pay up to 8 winners from the entries, with shares fixed when they
///         open. One asset per escrow, fixed at deployment, as ERC-8183 asks.
///         The rules live in `JobLib`, `BountyLib` and `JobDisputeLib`, linked
///         once at deploy; every payout goes through the settlement base.
contract KarwanJobEscrow is KarwanSettlementBase, IAgenticCommerce {
    address public immutable asset;
    JobStore internal _g;

    error NoAsset();

    constructor(address hub_, address asset_) KarwanSettlementBase(hub_, "KarwanJobs", "1") {
        if (asset_ == address(0)) revert NoAsset();
        asset = asset_;
    }

    // ------------------------------- Views --------------------------------

    function getJob(uint256 id) external view returns (Job memory job) {
        JobCore storage j = _g.jobs[id];
        job = Job(id, j.client, j.provider, j.evaluator, j.description, j.budget, j.expiredAt, j.status, address(0));
    }

    function jobOf(uint256 id) external view returns (JobCore memory) {
        return _g.jobs[id];
    }

    function jobCount() external view returns (uint256) {
        return _g.count;
    }

    function entryOf(uint256 id, address entrant) external view returns (bytes32) {
        return _g.entries[id][entrant];
    }

    function sharesOf(uint256 id) external view returns (uint16[] memory) {
        return _g.shares[id];
    }

    function disputeOf(uint256 id) external view returns (Dispute memory) {
        return _g.disputes.disputes[bytes32(id)];
    }

    // -------------------------------- Jobs --------------------------------

    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external returns (uint256) {
        return JobLib.create(_g, provider, evaluator, expiredAt, description, hook, JobLib.defaultTerms());
    }

    /// @notice `createJob` with Karwan's terms: the review window, and the
    ///         partial and fallback shares for a dispute.
    function createJobWithTerms(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        JobTerms calldata t
    ) external returns (uint256) {
        return JobLib.create(_g, provider, evaluator, expiredAt, description, address(0), t);
    }

    function setProvider(uint256 id, address provider, bytes calldata) external {
        JobLib.setProvider(_g, id, provider);
    }

    function setBudget(uint256 id, uint256 amount, bytes calldata) external {
        JobLib.setBudget(_g, id, amount);
    }

    function fund(uint256 id, uint256 expectedBudget, bytes calldata) external nonReentrant {
        JobLib.fund(_s, _g, hub, asset, id, expectedBudget);
    }

    function submit(uint256 id, bytes32 deliverable, bytes calldata) external {
        JobLib.submit(_s, _g, id, deliverable);
    }

    function complete(uint256 id, bytes32 reason, bytes calldata) external nonReentrant {
        JobLib.complete(_s, _g, hub, id, reason);
    }

    /// @notice Anyone completes a job whose review window ended in silence.
    function release(uint256 id) external nonReentrant {
        JobLib.release(_s, _g, hub, id);
    }

    function reject(uint256 id, bytes32 reason, bytes calldata) external nonReentrant {
        if (_g.jobs[id].bounty) BountyLib.cancel(_s, _g, hub, id, reason);
        else JobLib.reject(_s, _g, hub, id, reason);
    }

    function disputeRejection(uint256 id, bytes32 clauseHash) external {
        JobLib.disputeRejection(_g, id, clauseHash);
    }

    function confirmRejection(uint256 id) external nonReentrant {
        JobLib.confirmRejection(_s, _g, hub, id);
    }

    function claimRefund(uint256 id) external nonReentrant {
        if (_g.jobs[id].bounty) BountyLib.expire(_s, _g, hub, id);
        else JobLib.claimRefund(_s, _g, hub, id);
    }

    // ------------------------------ Bounties ------------------------------

    function openBounty(BountyTerms calldata t) external nonReentrant returns (uint256) {
        return BountyLib.open(_s, _g, hub, asset, t);
    }

    function enter(uint256 id, bytes32 deliverable) external {
        BountyLib.enter(_s, _g, hub, id, deliverable);
    }

    function award(uint256 id, address[] calldata winners) external nonReentrant {
        BountyLib.award(_s, _g, hub, id, winners);
    }

    // ------------------------------ Disputes ------------------------------

    function proposeRuling(uint256 id, uint16 providerBps, bytes32 rulingHash) external {
        JobDisputeLib.propose(_g, id, providerBps, rulingHash);
    }

    function escalate(uint256 id) external {
        JobDisputeLib.escalate(_g, id);
    }

    function executeRuling(uint256 id) external nonReentrant {
        JobDisputeLib.executeRuling(_s, _g, hub, id);
    }

    function rule(uint256 id, uint16 providerBps, bytes32 rulingHash) external nonReentrant {
        JobDisputeLib.rule(_s, _g, hub, id, providerBps, rulingHash);
    }

    function applyFallback(uint256 id) external nonReentrant {
        JobDisputeLib.applyFallback(_s, _g, hub, id);
    }

    // ------------------------------ Internals -----------------------------

    /// The long-stop paid out the job; nothing on it runs again, and an open
    /// dispute on it ends.
    function _onLongstop(bytes32 dealId) internal override {
        JobCore storage j = _g.jobs[uint256(dealId)];
        j.status = JobStatus.Expired;
        if (j.disputed) {
            j.disputed = false;
            DisputeLib.drop(_g.disputes, dealId);
        }
    }
}
