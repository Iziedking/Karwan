// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Guardable} from "./Guardable.sol";

/// @notice KarwanVault subset used for insurance reservations + identity
///         resolution. resolveOwner is the v2.E addition that lets the
///         escrow translate agent addresses to identity wallets before
///         crediting reputation.
interface IKarwanVault {
    function reserve(bytes32 jobId, address seller, uint256 amount, address beneficiary) external;
    function release(bytes32 jobId) external;
    function slash(bytes32 jobId) external;
    function slashTo(bytes32 jobId, uint256 amount) external;
    function freeStakeOf(address owner) external view returns (uint256);
    function resolveOwner(address addr) external view returns (address);
}

/// @notice Treasury-side hook for escrow idle-yield routing. The escrow sweeps
///         idle USDC into the Treasury (which wraps it to USYC for yield the
///         Treasury owns) and pulls exactly that USDC back on demand for a
///         payout. The escrow never holds USYC and needs no Circle whitelist;
///         the Treasury, holding the NAV upside, absorbs any shortfall.
interface IEscrowYieldBackstop {
    /// Pulls `amount` USDC from the escrow (which approved first) and books it
    /// as a liquid reserved float. Escrow-only on the Treasury side.
    function receiveEscrowFloat(uint256 amount) external;

    /// Escrow-only on the Treasury side. MUST deliver exactly `amount` USDC to
    /// msg.sender (the escrow). Reverts if it cannot cover it, so the escrow's
    /// payout reverts rather than paying short: funds are delayed, never lost.
    function returnEscrowLiquidity(uint256 amount) external;
}

/// @notice KarwanReputation subset.
interface IKarwanReputation {
    enum Outcome {
        None,
        Success,
        DisputeResolved,
        Failed
    }

    /// v2: carries dealAmount so the reputation contract can value-weight the
    /// completion (audit M-1) instead of scoring on raw counts.
    function recordCompletion(
        bytes32 jobId,
        address buyer,
        address seller,
        Outcome outcome,
        uint256 dealAmount
    ) external;

    /// v2: arbiter resolution routed through the escrow. sellerBps is the
    /// arbiter's split; the reputation contract bands it into an outcome and
    /// records the resolution with the deal value.
    function recordResolution(
        bytes32 jobId,
        address buyer,
        address seller,
        uint16 sellerBps,
        uint256 dealAmount
    ) external;
}

/// @title KarwanEscrow
/// @notice Milestone-based USDC escrow with optional staking-insurance backstop.
///
///         v2.E changes vs v2.D:
///           - Per-deal `reservationBps` stored on the EscrowAccount. The
///             buyer picks at fund time:
///                  0          = casual deal, no stake required from seller
///                  5000-10000 = trusted match, that pct of dealAmount is
///                               reserved against the seller's free stake
///             The global protocol-wide reservationBps becomes a hard
///             ceiling (maxReservationBps, immutable).
///           - Reputation crediting resolves agent addresses to their
///             identity wallets via vault.resolveOwner. The on-chain
///             reputation contract now holds scores keyed by identity, not
///             by agent address, so the off-chain composite engine reads
///             one address instead of summing two.
///           - EscrowRefunded event includes priorReleased so indexers can
///             reconstruct partial-release state on refund (audit D.6).
///
///         Funding flow (per-deal bps > 0):
///           1. Buyer funds via fundEscrow(jobId, seller, dealAmount,
///              milestonePcts, reservationBps). State: None -> Funded.
///           2. Seller calls acceptEscrow. Vault reserves
///              dealAmount * e.reservationBps / 10000 of the seller's free
///              stake. State: Funded -> Accepted.
///           3. Buyer releases milestones. Final milestone settles, releases
///              the reservation, and records reputation as Success.
///
///         Casual flow (per-deal bps == 0):
///           1. Buyer funds with reservationBps=0.
///           2. Seller calls acceptEscrow. NO vault call. State Funded -> Accepted.
///           3. Buyer releases milestones. No vault release on final.
///              Reputation still records Success.
///
///         Dispute paths handle both modes via the e.reservedAmount > 0
///         sentinel; refund with reservedAmount=0 simply skips slash and
///         records nothing (no rep credit either way, buyer just got their
///         money back, no on-chain story to tell).
contract KarwanEscrow is ReentrancyGuard, Guardable {
    using SafeERC20 for IERC20;

    function _guardianAdmin() internal view override returns (address) {
        return owner;
    }

    /// @dev Audit N-2: a hold on an in-review milestone pushes the SELLER's
    ///      claim deadline out by the hold budget, so a flagged delivery can't
    ///      become claimable the instant the hold auto-expires. Only the claim
    ///      clock moves — the buyer's own reclaim/refund path is never delayed
    ///      by a hold (a hold protects the buyer, it can't trap their money).
    function _afterHold(bytes32 id, uint64 holdSecs) internal override {
        EscrowAccount storage e = escrows[id];
        if (e.deliveredAt != 0 && e.claimDeadline != 0) {
            e.claimDeadline += holdSecs;
        }
    }

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
        /// acceptEscrow (and stays 0 forever on casual deals where
        /// reservationBps==0). Doubles as the "was-Accepted-with-insurance"
        /// sentinel: refund and releaseFromDispute check `reservedAmount > 0`
        /// to decide whether to release / slash / record reputation.
        uint256 reservedAmount;
        uint8[] milestonePcts;
        uint8 milestonesReleased;
        EscrowState state;
        /// Per-deal stake gate set at fund time. 0 = casual (no stake
        /// required from seller). 5000..maxReservationBps = trusted match,
        /// gates acceptEscrow on freeStakeOf(seller) >= dealAmount*bps/10000.
        uint16 reservationBps;
        /// H-1 lifecycle. `wasAccepted` gates the exit paths: a post-accept
        /// dispute can only resolve via the arbiter, never a buyer refund, so
        /// the buyer loses the unilateral clawback. `deliveredAt` /
        /// `claimDeadline` drive the seller's claim-after-review-window: once
        /// the seller marks the current milestone delivered, the buyer has
        /// until `claimDeadline` to release or dispute, after which the seller
        /// can claim it, so a vanished buyer can no longer trap funds.
        bool wasAccepted;
        uint64 deliveredAt;
        uint64 claimDeadline;
        /// v2b per-deal clock, proposed by the buyer at fund time and consented
        /// by the seller at acceptEscrow. deliveryDeadline: when the next
        /// undelivered milestone is late (0 = open-ended deal, no timeout
        /// reclaim). reviewWindow / reclaimGrace are snapshotted at fund so a
        /// 4-minute demo window and a 90-day shipment deadline are equally
        /// valid, the counterparty agreed to that clock before money locked.
        /// disputedAt powers the dispute lapse and the clock-pause rule.
        uint64 deliveryDeadline;
        uint64 reviewWindow;
        uint64 reclaimGrace;
        uint64 disputedAt;
    }

    /// @notice Per-deal clock passed to fundEscrow. reviewWindow 0 = use the
    ///         protocol default at fund time.
    struct Timing {
        uint64 deliveryDeadline;
        uint64 reviewWindow;
        uint64 reclaimGrace;
    }

    /// @notice Two-step mutual-cancel handshake (same consent pattern as the
    ///         vault's approveAgent): one side proposes a split plus a payee
    ///         for its own side, the other side accepts with its own payee.
    struct CancelProposal {
        address proposer;
        uint16 sellerBps;
        bool proposerIsBuyer;
        address proposerPayee;
        bool active;
    }

    uint8 internal constant MAX_MILESTONES = 5;
    uint8 internal constant PCT_TOTAL = 100;
    uint16 internal constant BPS_DENOMINATOR = 10000;
    /// @notice Minimum reservation when Trusted Match is on. Anything below
    ///         this (other than 0 = casual) is rejected at fund time so a
    ///         buyer can't pick a meaningless 1% gate that looks like
    ///         insurance but slashes nothing useful.
    uint16 public constant MIN_TRUSTED_BPS = 5000;

    IERC20 public immutable usdc;
    /// @notice Platform fee in basis points applied to the deal amount. v2:
    ///         owner-settable so the base fee can adjust as the ecosystem grows
    ///         (default set to 2% at deploy). Each deal SNAPSHOTS its fee at
    ///         fund time (feeTotal/sellerNet are computed then and stored), so a
    ///         later change only affects deals funded afterward. Bounded by
    ///         MAX_FEE_BPS so it can never be raised to a confiscatory level.
    uint16 public feeBps;
    /// @notice Hard ceiling on the adjustable base fee (10%). Immutable.
    uint16 public constant MAX_FEE_BPS = 1000;
    /// @notice Address that collects the platform fee. In v2.E this is the
    ///         KarwanTreasury contract address, not an EOA, fees route to a
    ///         contract that can sweep idle balance into USYC for yield.
    address public immutable treasury;
    /// @notice Vault used for insurance reservations.
    IKarwanVault public immutable vault;
    /// @notice Reputation contract that records deal outcomes.
    IKarwanReputation public immutable reputation;
    /// @notice Hard ceiling on per-deal reservationBps. 10000 = up to 100%
    ///         of deal value can be reserved. Set in constructor, immutable.
    uint16 public immutable maxReservationBps;

    /// @notice Owner (multisig on mainnet, deployer EOA on testnet) that sets
    ///         the arbiter and the review window. Two-step transfer.
    address public owner;
    address public pendingOwner;

    /// @notice Neutral party that resolves post-accept disputes via resolve().
    ///         Settable by the owner. On the security-agent bundle this points
    ///         at the security council. Zero until set; resolve reverts while
    ///         unset so a mis-deploy can't strand disputes silently.
    address public arbiter;

    /// @notice Default buyer review window used when a deal doesn't set one.
    ///         The buyer must release or dispute within the window after a
    ///         markDelivered; afterward the seller can claim.
    uint64 public reviewWindowSecs = 5 days;
    /// @notice Per-network guardrails on per-deal review windows, owner-set
    ///         inside immutable hard caps: permissive on testnet so a full
    ///         lifecycle can demo in minutes, industry-grade minimums on
    ///         mainnet. Same bytecode either way; per-deal values are
    ///         consented by the seller at accept regardless.
    uint64 public minReviewWindow = 60;
    uint64 public maxReviewWindow = 180 days;
    uint64 public constant HARD_MIN_REVIEW = 60;
    uint64 public constant HARD_MAX_REVIEW = 365 days;
    /// @notice How long a dispute may sit unresolved before either party can
    ///         lapse it back to Accepted. The arbiter SLA is a protocol
    ///         property, not a deal property: a dispute can delay settlement
    ///         but never trap it behind a dead arbiter key.
    uint64 public disputeTimeoutSecs = 14 days;
    uint64 public constant MIN_DISPUTE_TIMEOUT = 1 hours;
    uint64 public constant MAX_DISPUTE_TIMEOUT = 90 days;

    /// @notice Review window a milestone collapses to on a PASSING guardian
    ///         delivery attestation (agent-verified good delivery lets the
    ///         seller claim sooner). Owner-settable, bounded by the review
    ///         guardrails. Default 24h.
    uint64 public attestedWindowSecs = 1 days;
    /// @notice Fund-time cap on how far out a delivery deadline may sit.
    uint64 public maxDeadlineHorizon = 730 days;
    uint64 public constant HARD_MAX_HORIZON = 1095 days;

    /// @notice Pending mutual-cancel handshakes by jobId.
    mapping(bytes32 => CancelProposal) public cancelProposals;

    // ============================ Idle yield ============================
    // Escrowed USDC earns USYC yield by being swept into the Treasury, which
    // owns the yield. The escrow's books stay pure USDC: it always pulls back
    // exactly what it swept, so principal is guaranteed regardless of NAV.

    /// @notice Total unreleased USDC the escrow still owes across all deals
    ///         (principal + unreleased fee). The liability every exit must be
    ///         able to honour. Incremented by the funded amount on fund,
    ///         decremented by each payout leg. Invariant, always true:
    ///         usdc.balanceOf(this) + atTreasury >= escrowedTotal.
    uint256 public escrowedTotal;
    /// @notice USDC currently parked in the Treasury for yield, recoverable 1:1
    ///         via the backstop. Grows on sweepIdle, shrinks when a payout
    ///         pulls liquidity back.
    uint256 public atTreasury;
    /// @notice Liquid USDC the operator must leave in the escrow; sweepIdle can
    ///         only move the surplus above it. A tuning buffer to avoid frequent
    ///         pull-backs, not the safety mechanism (that is the exact-USDC
    ///         accounting + the payout-time pull-back). Owner-settable.
    uint256 public coverageFloor;
    /// @notice Treasury that holds swept USDC and honours pull-backs. Zero
    ///         disables yield routing entirely (the escrow ships yield-inert;
    ///         sweepIdle reverts and no payout ever calls the backstop).
    address public yieldBackstop;
    /// @notice Keeper allowed to sweep idle USDC to the backstop. Owner-set.
    address public yieldOperator;
    /// @notice Audit N-1: once locked, the yield wiring (backstop, operator,
    ///         coverage floor, cap) is frozen forever, so a compromised owner
    ///         key can't repoint the backstop to a drain address. One-way.
    bool public yieldWiringLocked;
    /// @notice Audit N-1: hard cap on how much of the total liability may sit at
    ///         the backstop (bps of escrowedTotal), so even a mis-set coverage
    ///         floor can't move the whole balance out. Owner-set within the 100%
    ///         ceiling; combined with returnEscrowLiquidity, principal stays
    ///         recoverable. Default 80%.
    uint16 public maxYieldBps = 8000;

    /// @dev Internal, not public: the struct is now large enough that the
    ///      auto-generated getter hits stack-too-deep under the non-viaIR
    ///      pipeline. Read via getEscrow(jobId), which returns the whole
    ///      struct (including milestonePcts) anyway.
    mapping(bytes32 => EscrowAccount) internal escrows;

    event EscrowFunded(
        bytes32 indexed jobId,
        address indexed buyer,
        address indexed seller,
        uint256 dealAmount,
        uint256 fundedAmount,
        uint256 feeTotal,
        uint8[] milestonePcts,
        uint16 reservationBps
    );
    event EscrowAccepted(bytes32 indexed jobId, address indexed seller, uint256 reservedAmount);
    event ProgressReleased(
        bytes32 indexed jobId, uint8 milestoneIndex, uint256 amount, address indexed to
    );
    event FeeCollected(bytes32 indexed jobId, uint8 milestoneIndex, uint256 amount, address indexed treasury);
    event EscrowSettled(bytes32 indexed jobId, uint256 sellerTotal, uint256 feeTotal);
    event EscrowDisputed(bytes32 indexed jobId, string reasonHash);
    /// @notice priorReleased carries the amount already released to the
    ///         seller before the refund (audit D.6). Indexers reconstruct
    ///         partial-release state without re-reading the struct.
    event EscrowRefunded(bytes32 indexed jobId, uint256 amount, uint256 priorReleased);
    event EscrowReleasedFromDispute(bytes32 indexed jobId, uint256 sellerTotal, uint256 feeTotal);
    /// @notice Emitted when the buyer's refund completed but the vault
    ///         slash that should have followed reverted for some reason.
    ///         The buyer's primary remedy must never block on a slash
    ///         side-effect (audit B.1 / M-2). The operator can follow up.
    event SlashFailed(bytes32 indexed jobId, address indexed seller, string reason);
    /// @notice Reputation recording is a non-critical side effect; if it
    ///         reverts, the payout must still land (audit I-3). This surfaces
    ///         the failure for an operator retry.
    event ReputationRecordFailed(bytes32 indexed jobId, string reason);
    event Delivered(bytes32 indexed jobId, uint8 milestoneIndex, bytes32 proofHash, uint64 claimDeadline);
    event MilestoneClaimed(bytes32 indexed jobId, uint8 milestoneIndex, uint256 amount, address indexed to);
    event DisputeResolved(bytes32 indexed jobId, uint16 sellerBps, uint256 sellerCut, uint256 buyerCut, bytes32 rulingHash);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ArbiterSet(address indexed arbiter);
    event ReviewWindowSet(uint64 secs);
    event AttestedWindowSet(uint64 secs);
    event DeliveryAttested(bytes32 indexed jobId, uint8 milestoneIndex, bool pass, bytes32 evidenceHash);
    event FeeBpsSet(uint16 bps);
    event ReviewBoundsSet(uint64 minSecs, uint64 maxSecs);
    event DisputeTimeoutSet(uint64 secs);
    event DeadlineHorizonSet(uint64 secs);
    /// @notice Separate from EscrowFunded so the funded-event signature (and
    ///         the indexers parsing it) stays stable across v2b.
    event DealTiming(bytes32 indexed jobId, uint64 deliveryDeadline, uint64 reviewWindow, uint64 reclaimGrace);
    event DeadlineReclaimed(bytes32 indexed jobId, uint256 amount, uint256 priorReleased, address indexed to);
    event DeadlineExtended(bytes32 indexed jobId, uint64 newDeadline);
    event DisputeLapsed(bytes32 indexed jobId, uint64 frozenSecs);
    event CancelProposed(bytes32 indexed jobId, address indexed proposer, bool proposerIsBuyer, uint16 sellerBps);
    event CancelWithdrawn(bytes32 indexed jobId);
    event MutualCancelled(bytes32 indexed jobId, uint16 sellerBps, uint256 sellerCut, uint256 buyerCut);
    event IdleSwept(uint256 amount, uint256 atTreasuryAfter);
    event LiquidityPulled(uint256 amount, uint256 atTreasuryAfter);
    event YieldBackstopSet(address indexed backstop);
    event YieldOperatorSet(address indexed operator);
    event CoverageFloorSet(uint256 floor);
    event YieldWiringLocked();
    event MaxYieldBpsSet(uint16 bps);

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
    error InvalidReservation();
    error InvalidSeller();
    error InvalidAmount();
    error InsufficientStake();
    error NotOwner();
    error NotArbiter();
    error ArbiterNotSet();
    error ZeroAddress();
    error NotDelivered();
    error ReviewWindowOpen();
    error InvalidWindow();
    error InvalidBps();
    error RefundAfterAccept();
    error InvalidTiming();
    error NoDeadline();
    error DeliveryPending();
    error DeadlineNotPassed();
    error DisputeStillFresh();
    error NoCancelProposal();
    error CancelMismatch();
    error InvalidPayee();
    error NotYieldOperator();
    error BackstopNotSet();
    error FloorBreach();
    error YieldShortfall();
    error YieldWiringLockedErr();
    error SweepCapExceeded();
    error InvalidYieldBps();

    constructor(
        address _usdc,
        uint16 _feeBps,
        address _treasury,
        address _vault,
        address _reputation,
        uint16 _maxReservationBps
    ) {
        if (_usdc == address(0)) revert InvalidUSDC();
        if (_treasury == address(0)) revert InvalidTreasury();
        if (_vault == address(0)) revert InvalidVault();
        if (_reputation == address(0)) revert InvalidReputation();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (_maxReservationBps > BPS_DENOMINATOR) revert ReservationTooHigh();
        if (_maxReservationBps < MIN_TRUSTED_BPS) revert ReservationTooHigh();
        usdc = IERC20(_usdc);
        feeBps = _feeBps;
        treasury = _treasury;
        vault = IKarwanVault(_vault);
        reputation = IKarwanReputation(_reputation);
        maxReservationBps = _maxReservationBps;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ============================== Ownership ==============================

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Two-step ownership transfer (OZ Ownable2Step semantics).
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }

    /// @notice Set the dispute arbiter. Zero disables arbitration (resolve
    ///         reverts), so leave it set in production.
    function setArbiter(address _arbiter) external onlyOwner {
        if (_arbiter == address(0)) revert ZeroAddress();
        arbiter = _arbiter;
        emit ArbiterSet(_arbiter);
    }

    /// @notice Set the DEFAULT review window (used when a deal passes 0).
    ///         Applies to deals funded AFTER this call; funded deals keep
    ///         their snapshotted window.
    function setReviewWindow(uint64 secs) external onlyOwner {
        if (secs < minReviewWindow || secs > maxReviewWindow) revert InvalidWindow();
        reviewWindowSecs = secs;
        emit ReviewWindowSet(secs);
    }

    /// @notice Set the per-network review-window guardrails. Hard caps keep
    ///         the owner from griefing either direction, and the default must
    ///         stay inside the new bounds.
    function setReviewBounds(uint64 minSecs, uint64 maxSecs) external onlyOwner {
        if (minSecs < HARD_MIN_REVIEW || maxSecs > HARD_MAX_REVIEW || minSecs >= maxSecs) revert InvalidWindow();
        if (reviewWindowSecs < minSecs || reviewWindowSecs > maxSecs) revert InvalidWindow();
        minReviewWindow = minSecs;
        maxReviewWindow = maxSecs;
        emit ReviewBoundsSet(minSecs, maxSecs);
    }

    function setDisputeTimeout(uint64 secs) external onlyOwner {
        if (secs < MIN_DISPUTE_TIMEOUT || secs > MAX_DISPUTE_TIMEOUT) revert InvalidWindow();
        disputeTimeoutSecs = secs;
        emit DisputeTimeoutSet(secs);
    }

    function setDeadlineHorizon(uint64 secs) external onlyOwner {
        if (secs == 0 || secs > HARD_MAX_HORIZON) revert InvalidWindow();
        maxDeadlineHorizon = secs;
        emit DeadlineHorizonSet(secs);
    }

    /// @notice Adjust the base platform fee for FUTURE deals. Existing deals
    ///         keep the fee they snapshotted at fund. Bounded by MAX_FEE_BPS.
    function setFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = bps;
        emit FeeBpsSet(bps);
    }

    function setAttestedWindow(uint64 secs) external onlyOwner {
        if (secs < minReviewWindow || secs > maxReviewWindow) revert InvalidWindow();
        attestedWindowSecs = secs;
        emit AttestedWindowSet(secs);
    }

    // ============================ Security agent ===========================

    /// @notice The guardian (security agent) attests a marked delivery. This is
    ///         the verification requirement at the contract level: the agent can
    ///         speed up or freeze settlement, but never move money.
    ///         pass=true  -> agent-verified good delivery: the review window
    ///                       collapses toward attestedWindowSecs so the seller
    ///                       claims sooner (only ever shortens, never extends).
    ///         pass=false -> suspicious delivery: an automatic hold freezes the
    ///                       seller-paying paths until the agent clears it or the
    ///                       hold budget auto-expires.
    function attestDelivery(bytes32 jobId, uint8 milestoneIndex, bool pass, bytes32 evidenceHash)
        external
        onlyGuardian
    {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        if (milestoneIndex != e.milestonesReleased) revert TooManyReleases();
        if (e.deliveredAt == 0) revert NotDelivered();
        if (pass) {
            uint64 shortened = e.deliveredAt + attestedWindowSecs;
            if (shortened < e.claimDeadline) e.claimDeadline = shortened;
        } else {
            _applyHold(jobId, evidenceHash);
        }
        emit DeliveryAttested(jobId, milestoneIndex, pass, evidenceHash);
    }

    // ============================ Idle yield ============================

    /// @notice Wire (or unwire) the Treasury backstop. Zero disables routing.
    ///         Refuses to unwire while USDC is still parked at the Treasury so
    ///         the pull-back path can never be orphaned.
    function setYieldBackstop(address backstop) external onlyOwner {
        if (yieldWiringLocked) revert YieldWiringLockedErr();
        if (backstop == address(0) && atTreasury > 0) revert YieldShortfall();
        yieldBackstop = backstop;
        emit YieldBackstopSet(backstop);
    }

    function setYieldOperator(address op) external onlyOwner {
        if (yieldWiringLocked) revert YieldWiringLockedErr();
        yieldOperator = op;
        emit YieldOperatorSet(op);
    }

    /// @notice Liquid buffer sweepIdle must leave behind. Tuning only; safety
    ///         is the exact-USDC accounting + payout-time pull-back, so no hard
    ///         minimum is needed.
    function setCoverageFloor(uint256 floor) external onlyOwner {
        if (yieldWiringLocked) revert YieldWiringLockedErr();
        coverageFloor = floor;
        emit CoverageFloorSet(floor);
    }

    /// @notice Audit N-1: cap how much of the total liability may sit at the
    ///         backstop. Owner-set within 100%; locked once the wiring is.
    function setMaxYieldBps(uint16 bps) external onlyOwner {
        if (yieldWiringLocked) revert YieldWiringLockedErr();
        if (bps > BPS_DENOMINATOR) revert InvalidYieldBps();
        maxYieldBps = bps;
        emit MaxYieldBpsSet(bps);
    }

    /// @notice Audit N-1: freeze the yield wiring forever. After this, the
    ///         backstop, operator, coverage floor and cap can't change, so a
    ///         compromised owner key can't repoint the backstop to drain the
    ///         escrow. One-way; call once the Treasury backstop is trusted.
    function lockYieldWiring() external onlyOwner {
        yieldWiringLocked = true;
        emit YieldWiringLocked();
    }

    /// @notice Sweep idle USDC into the Treasury for yield. Keeper-only. Moves
    ///         only the surplus above coverageFloor, so short-lived float and
    ///         the buffer stay liquid. The swept USDC is recoverable 1:1 via
    ///         the backstop; escrowedTotal is untouched (the liability is
    ///         unchanged, the USDC just moved custody).
    function sweepIdle(uint256 amount) external nonReentrant {
        if (msg.sender != yieldOperator) revert NotYieldOperator();
        if (yieldBackstop == address(0)) revert BackstopNotSet();
        if (amount == 0) revert InvalidAmount();
        uint256 bal = usdc.balanceOf(address(this));
        if (bal < amount || bal - amount < coverageFloor) revert FloorBreach();
        // Audit N-1: even with a mis-set coverage floor, never park more than
        // maxYieldBps of the outstanding liability at the backstop, so the whole
        // balance can't be swept out in one move.
        if (atTreasury + amount > (escrowedTotal * maxYieldBps) / BPS_DENOMINATOR) {
            revert SweepCapExceeded();
        }
        atTreasury += amount;
        // Pull model: approve and let the backstop draw, so it books the float
        // atomically. Reset the allowance after in case the pull took less.
        usdc.forceApprove(yieldBackstop, amount);
        IEscrowYieldBackstop(yieldBackstop).receiveEscrowFloat(amount);
        usdc.forceApprove(yieldBackstop, 0);
        emit IdleSwept(amount, atTreasury);
    }

    /// @dev Guarantees the escrow holds at least `need` liquid USDC before a
    ///      payout, pulling the gap back from the Treasury. With yield disabled
    ///      (nothing swept) balance always covers `need` and this is a no-op.
    ///      A backstop that can't cover the gap reverts, so the payout reverts
    ///      whole (funds delayed, never paid short). CEI: atTreasury is
    ///      decremented before the external call.
    function _ensureLiquid(uint256 need) internal {
        uint256 bal = usdc.balanceOf(address(this));
        if (bal >= need) return;
        uint256 gap = need - bal;
        if (gap > atTreasury) revert YieldShortfall();
        atTreasury -= gap;
        IEscrowYieldBackstop(yieldBackstop).returnEscrowLiquidity(gap);
        if (usdc.balanceOf(address(this)) < need) revert YieldShortfall();
        emit LiquidityPulled(gap, atTreasury);
    }

    /// @notice Explicit struct getter. The auto-generated public-mapping
    ///         getter for `escrows` drops the `milestonePcts` dynamic-array
    ///         field (Solidity limitation), which trapped off-chain
    ///         consumers in an off-by-one tuple destructure. This view
    ///         returns the whole struct including the milestones so callers
    ///         never have to count positions.
    function getEscrow(bytes32 jobId) external view returns (EscrowAccount memory) {
        return escrows[jobId];
    }

    /// @notice Lightweight party lookup for cross-contract consumers (invoice
    ///         registry, PO financing). Decoupled from the full struct so
    ///         adding fields to EscrowAccount never breaks their ABI decode.
    function partiesOf(bytes32 jobId) external view returns (address buyer, address seller) {
        EscrowAccount storage e = escrows[jobId];
        return (e.buyer, e.seller);
    }

    /// @notice Seller of a deal, or address(0) if unknown. Convenience for
    ///         consumers that only need the recipient.
    function sellerOf(bytes32 jobId) external view returns (address) {
        return escrows[jobId].seller;
    }

    /// @notice Fund an escrow. State: None -> Funded.
    /// @param _reservationBps  per-deal stake gate. 0 = casual (no stake
    ///                         required from seller). 5000..maxReservationBps
    ///                         = trusted match, that pct of dealAmount will
    ///                         be reserved against seller's free stake when
    ///                         they call acceptEscrow.
    function fundEscrow(
        bytes32 jobId,
        address seller,
        uint256 dealAmount,
        uint8[] calldata milestonePcts,
        uint16 _reservationBps
    ) external nonReentrant {
        _fundEscrow(jobId, seller, dealAmount, milestonePcts, _reservationBps, Timing(0, 0, 0));
    }

    /// @notice Timing-aware variant. The buyer proposes the deal's clock; the
    ///         seller reads it via getEscrow and consents by accepting.
    function fundEscrow(
        bytes32 jobId,
        address seller,
        uint256 dealAmount,
        uint8[] calldata milestonePcts,
        uint16 _reservationBps,
        Timing calldata timing
    ) external nonReentrant {
        _fundEscrow(jobId, seller, dealAmount, milestonePcts, _reservationBps, timing);
    }

    function _fundEscrow(
        bytes32 jobId,
        address seller,
        uint256 dealAmount,
        uint8[] calldata milestonePcts,
        uint16 _reservationBps,
        Timing memory timing
    ) internal {
        if (escrows[jobId].state != EscrowState.None) revert AlreadyFunded();
        if (seller == address(0) || seller == msg.sender) revert InvalidSeller();
        // Identity-level self-deal guard: a user's buyer agent funding their
        // own seller agent resolves to the same identity in the vault.
        if (vault.resolveOwner(seller) == vault.resolveOwner(msg.sender)) revert InvalidSeller();
        if (dealAmount == 0) revert InvalidAmount();

        uint64 window = timing.reviewWindow == 0 ? reviewWindowSecs : timing.reviewWindow;
        if (window < minReviewWindow || window > maxReviewWindow) revert InvalidTiming();
        if (timing.deliveryDeadline != 0) {
            if (timing.deliveryDeadline <= block.timestamp) revert InvalidTiming();
            if (timing.deliveryDeadline > block.timestamp + maxDeadlineHorizon) revert InvalidTiming();
        }
        if (timing.reclaimGrace > HARD_MAX_REVIEW) revert InvalidTiming();
        // Per-deal bps validation: 0 OR within [MIN_TRUSTED_BPS, max].
        // Below 5000 (except 0) means a meaningless gate.
        if (_reservationBps != 0) {
            if (_reservationBps < MIN_TRUSTED_BPS) revert InvalidReservation();
            if (_reservationBps > maxReservationBps) revert InvalidReservation();
        }
        uint256 milestoneCount = milestonePcts.length;
        if (milestoneCount == 0 || milestoneCount > MAX_MILESTONES) revert InvalidMilestones();

        {
            uint256 sum;
            for (uint256 i = 0; i < milestoneCount; i++) {
                sum += milestonePcts[i];
            }
            if (sum != PCT_TOTAL) revert InvalidMilestones();
        }

        // Fee math kept inside this scope so the local vars don't pile up
        // when we hit the emit below (stack-too-deep otherwise on solc 0.8.24).
        uint256 feeTotal = (dealAmount * feeBps) / BPS_DENOMINATOR;
        uint256 fundedAmount;
        {
            uint256 buyerFee = feeTotal / 2;
            uint256 sellerFee = feeTotal - buyerFee;
            fundedAmount = dealAmount + buyerFee;
            escrows[jobId] = EscrowAccount({
                buyer: msg.sender,
                seller: seller,
                dealAmount: dealAmount,
                sellerNet: dealAmount - sellerFee,
                feeTotal: feeTotal,
                released: 0,
                feeReleased: 0,
                reservedAmount: 0,
                milestonePcts: milestonePcts,
                milestonesReleased: 0,
                state: EscrowState.Funded,
                reservationBps: _reservationBps,
                wasAccepted: false,
                deliveredAt: 0,
                claimDeadline: 0,
                deliveryDeadline: timing.deliveryDeadline,
                reviewWindow: window,
                reclaimGrace: timing.reclaimGrace,
                disputedAt: 0
            });
        }

        usdc.safeTransferFrom(msg.sender, address(this), fundedAmount);
        // Track the new liability. Every payout leg decrements this; it returns
        // to 0 when the deal fully settles or refunds.
        escrowedTotal += fundedAmount;

        emit EscrowFunded(
            jobId, msg.sender, seller, dealAmount, fundedAmount, feeTotal, milestonePcts, _reservationBps
        );
        emit DealTiming(jobId, timing.deliveryDeadline, window, timing.reclaimGrace);
    }

    /// @notice Seller-only acceptance. On trusted-match deals, triggers the
    ///         vault reservation. On casual deals (reservationBps==0), skips
    ///         the vault entirely. State: Funded -> Accepted either way.
    function acceptEscrow(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (!_isParty(e.seller, msg.sender)) revert NotSeller();

        if (e.reservationBps > 0) {
            uint256 reserveAmount = (e.dealAmount * e.reservationBps) / BPS_DENOMINATOR;
            // Surface the actionable error to the seller before bouncing
            // into the vault. The vault rechecks (defence in depth).
            if (vault.freeStakeOf(msg.sender) < reserveAmount) revert InsufficientStake();
            // Vault v2: the slash beneficiary (the buyer) is locked in at
            // reserve time, so slash below carries no beneficiary arg.
            vault.reserve(jobId, msg.sender, reserveAmount, e.buyer);
            e.reservedAmount = reserveAmount;
        }
        // Casual deals: reservedAmount stays 0. The release / dispute paths
        // all gate vault calls on reservedAmount > 0 so they no-op cleanly.

        e.state = EscrowState.Accepted;
        // H-1: mark that the seller committed. From here the only exits are a
        // buyer release, a seller claim after the review window, or an arbiter
        // resolve. A buyer refund is no longer reachable.
        e.wasAccepted = true;
        emit EscrowAccepted(jobId, msg.sender, e.reservedAmount);
    }

    // ========================= Identity standing ==========================

    /// @dev v2b: a party's registered identity wallet (bound in the vault via
    ///      the consented approveAgent/registerOwner handshake) can drive the
    ///      deal alongside the stored agent wallet. If the platform's signer
    ///      dies, the human with their own key keeps every lifecycle lever.
    function _isParty(address stored, address caller) internal view returns (bool) {
        if (caller == stored) return true;
        return vault.resolveOwner(caller) == vault.resolveOwner(stored);
    }

    /// @dev Payee choice for the remedy paths: the stored party wallet or its
    ///      vault-registered identity, nothing else. Both are consented
    ///      addresses of the same human, so there is no redirect vector.
    ///      address(0) means "the stored wallet".
    function _validPayee(address stored, address requested) internal view returns (address) {
        if (requested == address(0) || requested == stored) return stored;
        if (requested == vault.resolveOwner(stored)) return requested;
        revert InvalidPayee();
    }

    // ============================ H-1 lifecycle ============================

    /// @notice Seller marks the current milestone delivered, opening the buyer
    ///         review window. Callable only on the milestone next in line.
    ///         Re-callable (e.g. after re-delivery) which resets the window.
    function markDelivered(bytes32 jobId, bytes32 proofHash) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        if (!_isParty(e.seller, msg.sender)) revert NotSeller();
        e.deliveredAt = uint64(block.timestamp);
        e.claimDeadline = uint64(block.timestamp) + e.reviewWindow;
        emit Delivered(jobId, e.milestonesReleased, proofHash, e.claimDeadline);
    }

    /// @notice After the review window elapses with no buyer release and no
    ///         dispute, the seller claims the current milestone. Same payout
    ///         and fee math as a buyer release. Closes the "buyer vanished ->
    ///         funds stuck" liveness hole.
    function claimMilestone(bytes32 jobId, uint8 milestoneIndex) external nonReentrant {
        _claimMilestone(jobId, milestoneIndex, address(0));
    }

    /// @notice Claim variant with an explicit payee for the platform-death
    ///         remedy: the payout may go to the stored seller wallet or its
    ///         vault-registered identity, nothing else.
    function claimMilestone(bytes32 jobId, uint8 milestoneIndex, address payee) external nonReentrant {
        _claimMilestone(jobId, milestoneIndex, payee);
    }

    function _claimMilestone(bytes32 jobId, uint8 milestoneIndex, address payee) internal {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        _requireNotHeld(jobId);
        if (!_isParty(e.seller, msg.sender)) revert NotSeller();
        if (milestoneIndex != e.milestonesReleased) revert TooManyReleases();
        if (milestoneIndex >= e.milestonePcts.length) revert TooManyReleases();
        if (e.deliveredAt == 0) revert NotDelivered();
        if (block.timestamp < e.claimDeadline) revert ReviewWindowOpen();

        address to = _validPayee(e.seller, payee);
        uint256 sellerCut = _payMilestone(jobId, e, milestoneIndex, to);
        emit MilestoneClaimed(jobId, milestoneIndex, sellerCut, to);
        if (e.state == EscrowState.Settled) {
            _finalizeSuccess(jobId, e);
        }
    }

    /// @dev Shared milestone payout used by both buyer release and seller
    ///      claim. Advances released/fee/milestone counters, transfers the
    ///      seller + treasury cuts, resets the delivery window for the next
    ///      milestone, and flips to Settled on the final milestone. Returns
    ///      the seller cut for the caller's event.
    function _payMilestone(bytes32 jobId, EscrowAccount storage e, uint8 milestoneIndex, address sellerTo)
        internal
        returns (uint256 sellerCut)
    {
        bool isFinalMilestone = (e.milestonesReleased + 1) == e.milestonePcts.length;

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
        // Reset the delivery window; the next milestone must be marked afresh.
        e.deliveredAt = 0;
        e.claimDeadline = 0;
        if (isFinalMilestone) {
            e.state = EscrowState.Settled;
        }

        uint256 out = sellerCut + feeCut;
        _ensureLiquid(out);
        escrowedTotal -= out;
        if (sellerCut > 0) {
            usdc.safeTransfer(sellerTo, sellerCut);
        }
        if (feeCut > 0) {
            usdc.safeTransfer(treasury, feeCut);
            emit FeeCollected(jobId, milestoneIndex, feeCut, treasury);
        }
    }

    /// @notice Release one milestone. Final milestone settles + releases
    ///         the reservation (if any) + records Success.
    function releaseProgress(bytes32 jobId, uint8 milestoneIndex) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        _requireNotHeld(jobId);
        if (!_isParty(e.buyer, msg.sender)) revert NotBuyer();
        if (milestoneIndex != e.milestonesReleased) revert TooManyReleases();
        if (milestoneIndex >= e.milestonePcts.length) revert TooManyReleases();

        uint256 sellerCut = _payMilestone(jobId, e, milestoneIndex, e.seller);
        emit ProgressReleased(jobId, milestoneIndex, sellerCut, e.seller);

        if (e.state == EscrowState.Settled) {
            _finalizeSuccess(jobId, e);
        }
    }

    /// @notice Settle a funded escrow in one call, sweeping all remaining
    ///         seller and treasury balances.
    function releaseFinal(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        _requireNotHeld(jobId);
        if (!_isParty(e.buyer, msg.sender)) revert NotBuyer();

        uint256 sellerRemaining = e.sellerNet - e.released;
        uint256 feeRemaining = e.feeTotal - e.feeReleased;
        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.milestonesReleased = uint8(e.milestonePcts.length);
        e.state = EscrowState.Settled;

        uint256 out = sellerRemaining + feeRemaining;
        _ensureLiquid(out);
        escrowedTotal -= out;
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
        if (!_isParty(e.buyer, msg.sender) && !_isParty(e.seller, msg.sender)) revert NotParty();
        e.state = EscrowState.Disputed;
        e.disputedAt = uint64(block.timestamp);
        emit EscrowDisputed(jobId, reasonHash);
    }

    /// @notice Buyer-only path from Disputed to Settled. Pays the seller and
    ///         (when a reservation existed) releases the vault reservation
    ///         and records DisputeResolved on both identities.
    function releaseFromDispute(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Disputed) revert InvalidState();
        _requireNotHeld(jobId);
        if (!_isParty(e.buyer, msg.sender)) revert NotBuyer();

        uint256 sellerRemaining = e.sellerNet - e.released;
        uint256 feeRemaining = e.feeTotal - e.feeReleased;
        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.milestonesReleased = uint8(e.milestonePcts.length);
        e.state = EscrowState.Settled;

        uint256 out = sellerRemaining + feeRemaining;
        _ensureLiquid(out);
        escrowedTotal -= out;
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
            _recordReputation(
                jobId, e.buyer, e.seller, IKarwanReputation.Outcome.DisputeResolved, e.dealAmount
            );
        }
        // Casual deals: no reservation, no reputation credit on a disputed
        // resolution, the deal didn't carry the trust signal either way.
    }

    /// @notice Return all unreleased funds to the buyer. If the seller had
    ///         Accepted with a reservation, also slash that reservation to
    ///         the buyer as insurance compensation and record Failed.
    ///         Audit M-2: a `vault.slash` revert MUST NOT block the buyer's
    ///         refund. We wrap the slash in try/catch and emit SlashFailed
    ///         on inner revert, leaving the buyer with their USDC and an
    ///         operator follow-up trail.
    /// @notice PRE-ACCEPT cancel only. A buyer who funded a deal the seller
    ///         never accepted can dispute + refund to get their money back.
    ///         H-1: once the seller has accepted, refund is unreachable, so the
    ///         buyer can no longer take delivery off-chain then claw funds back
    ///         and slash the seller. Post-accept disputes go through resolve().
    function refund(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Disputed) revert InvalidState();
        if (!_isParty(e.buyer, msg.sender)) revert NotBuyer();
        if (e.wasAccepted) revert RefundAfterAccept();

        // Pre-accept => nothing released yet and no reservation exists, so this
        // simply returns the funded amount and there is nothing to slash.
        uint256 remaining = (e.sellerNet - e.released) + (e.feeTotal - e.feeReleased);
        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.state = EscrowState.Refunded;
        _ensureLiquid(remaining);
        escrowedTotal -= remaining;
        if (remaining > 0) {
            usdc.safeTransfer(e.buyer, remaining);
        }
        emit EscrowRefunded(jobId, remaining, 0);
    }

    // ============================ v2b lifecycle ============================

    /// @notice The buyer's trustless timeout exit, mirror-image of the
    ///         seller's claimMilestone: when the consented delivery deadline
    ///         plus grace passes with nothing pending review, the buyer
    ///         reclaims the unreleased funds. The reservation slashes
    ///         proportionally to the UNDELIVERED fraction of the deal, so a
    ///         seller who delivered 3 of 4 milestones and went late on the
    ///         last loses a quarter of the reserve, not all of it.
    function reclaimAfterDeadline(bytes32 jobId, address payee) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        if (!_isParty(e.buyer, msg.sender)) revert NotBuyer();
        if (e.deliveryDeadline == 0) revert NoDeadline();
        if (e.deliveredAt != 0) revert DeliveryPending();
        if (block.timestamp <= uint256(e.deliveryDeadline) + e.reclaimGrace) revert DeadlineNotPassed();

        address to = _validPayee(e.buyer, payee);
        uint256 remainingSellerNet = e.sellerNet - e.released;
        uint256 remaining = remainingSellerNet + (e.feeTotal - e.feeReleased);
        uint256 priorReleased = e.released;
        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.state = EscrowState.Refunded;
        _ensureLiquid(remaining);
        escrowedTotal -= remaining;
        if (remaining > 0) {
            usdc.safeTransfer(to, remaining);
        }
        emit DeadlineReclaimed(jobId, remaining, priorReleased, to);

        if (e.reservedAmount > 0) {
            uint256 slashShare = (e.reservedAmount * remainingSellerNet) / e.sellerNet;
            address seller = e.seller;
            e.reservedAmount = 0;
            try vault.slashTo(jobId, slashShare) {
            } catch Error(string memory reason) {
                emit SlashFailed(jobId, seller, reason);
            } catch (bytes memory) {
                emit SlashFailed(jobId, seller, "low-level revert");
            }
        }
        // A blown deadline is on-chain-provable lateness, so it records
        // Failed even on casual (no-stake) deals.
        _recordReputation(jobId, e.buyer, e.seller, IKarwanReputation.Outcome.Failed, e.dealAmount);
    }

    /// @notice Buyer-only deadline extension. Extensions favour the seller,
    ///         so buyer consent is the only gate; mirrors the off-chain
    ///         extension-approve flow.
    function extendDeadline(bytes32 jobId, uint64 newDeadline) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        if (!_isParty(e.buyer, msg.sender)) revert NotBuyer();
        if (e.deliveryDeadline == 0) revert NoDeadline();
        if (newDeadline <= e.deliveryDeadline) revert InvalidTiming();
        if (newDeadline > block.timestamp + maxDeadlineHorizon) revert InvalidTiming();
        e.deliveryDeadline = newDeadline;
        emit DeadlineExtended(jobId, newDeadline);
    }

    /// @notice After the dispute timeout with no arbiter ruling, either party
    ///         lapses the dispute back to Accepted. Clock-pause rule: the
    ///         delivery deadline extends by the frozen time, so a freeze
    ///         delays settlement but never changes who wins. Review clocks
    ///         reset; a pending delivery must be re-marked. A dispute can
    ///         therefore delay but never trap: a dead arbiter degrades to the
    ///         normal timed paths, not a freeze.
    function lapseDispute(bytes32 jobId) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Disputed) revert InvalidState();
        if (!e.wasAccepted) revert InvalidState();
        if (!_isParty(e.buyer, msg.sender) && !_isParty(e.seller, msg.sender)) revert NotParty();
        if (block.timestamp < uint256(e.disputedAt) + disputeTimeoutSecs) revert DisputeStillFresh();

        uint64 frozen = uint64(block.timestamp) - e.disputedAt;
        if (e.deliveryDeadline != 0) {
            e.deliveryDeadline += frozen;
        }
        e.disputedAt = 0;
        e.deliveredAt = 0;
        e.claimDeadline = 0;
        e.state = EscrowState.Accepted;
        emit DisputeLapsed(jobId, frozen);
    }

    /// @notice Propose a mutual cancel: sellerBps of the unreleased funds to
    ///         the seller, the rest back to the buyer. Either side proposes,
    ///         the other accepts (two-tx consent). Available from Accepted or
    ///         Disputed, so the parties can settle a dispute themselves
    ///         without the arbiter.
    function proposeCancel(bytes32 jobId, uint16 sellerBps, address payee) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted && e.state != EscrowState.Disputed) revert InvalidState();
        if (!e.wasAccepted) revert InvalidState();
        if (sellerBps > BPS_DENOMINATOR) revert InvalidBps();
        bool isBuyerSide = _isParty(e.buyer, msg.sender);
        if (!isBuyerSide && !_isParty(e.seller, msg.sender)) revert NotParty();
        address own = isBuyerSide ? e.buyer : e.seller;
        cancelProposals[jobId] = CancelProposal({
            proposer: msg.sender,
            sellerBps: sellerBps,
            proposerIsBuyer: isBuyerSide,
            proposerPayee: _validPayee(own, payee),
            active: true
        });
        emit CancelProposed(jobId, msg.sender, isBuyerSide, sellerBps);
    }

    function withdrawCancel(bytes32 jobId) external {
        CancelProposal storage p = cancelProposals[jobId];
        if (!p.active || p.proposer != msg.sender) revert NoCancelProposal();
        delete cancelProposals[jobId];
        emit CancelWithdrawn(jobId);
    }

    /// @notice Counterparty accepts the proposed split. sellerBps must match
    ///         the proposal so a re-proposal can't front-run the acceptance.
    ///         Consented no-fault exit: the reservation releases in full and
    ///         no on-chain reputation outcome is recorded either way.
    function acceptCancel(bytes32 jobId, uint16 sellerBps, address payee) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted && e.state != EscrowState.Disputed) revert InvalidState();
        CancelProposal memory p = cancelProposals[jobId];
        if (!p.active) revert NoCancelProposal();
        if (p.sellerBps != sellerBps) revert CancelMismatch();
        if (p.proposerIsBuyer) {
            if (!_isParty(e.seller, msg.sender)) revert NotParty();
        } else {
            if (!_isParty(e.buyer, msg.sender)) revert NotParty();
        }
        address acceptorPayee = _validPayee(p.proposerIsBuyer ? e.seller : e.buyer, payee);
        address sellerTo = p.proposerIsBuyer ? acceptorPayee : p.proposerPayee;
        address buyerTo = p.proposerIsBuyer ? p.proposerPayee : acceptorPayee;
        delete cancelProposals[jobId];

        (uint256 sellerCut, uint256 buyerCut) = _splitRemaining(jobId, e, sellerBps, sellerTo, buyerTo);

        if (e.reservedAmount > 0) {
            e.reservedAmount = 0;
            vault.release(jobId);
        }
        emit MutualCancelled(jobId, sellerBps, sellerCut, buyerCut);
    }

    /// @notice Arbiter resolves a POST-ACCEPT dispute. Splits the unreleased
    ///         funds `sellerBps` to the seller and the remainder to the buyer,
    ///         and settles the reservation proportionally to fault: the buyer's
    ///         share ((10000-sellerBps) of the reserve) slashes to the buyer,
    ///         the rest returns to the seller's free stake. Reputation:
    ///         sellerBps >= 8000 -> Success, <= 2000 -> Failed, else
    ///         DisputeResolved.
    function resolve(bytes32 jobId, uint16 sellerBps, bytes32 rulingHash) external nonReentrant {
        if (arbiter == address(0)) revert ArbiterNotSet();
        if (msg.sender != arbiter) revert NotArbiter();
        if (sellerBps > BPS_DENOMINATOR) revert InvalidBps();
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Disputed) revert InvalidState();
        // Pre-accept disputes cancel via refund, not the arbiter.
        if (!e.wasAccepted) revert InvalidState();

        (uint256 sellerCut, uint256 buyerCut) = _splitRemaining(jobId, e, sellerBps, e.seller, e.buyer);
        emit DisputeResolved(jobId, sellerBps, sellerCut, buyerCut, rulingHash);

        // Settle the reservation proportionally. slashTo pays the buyer's fault
        // share and returns the rest to the seller. Wrapped so a vault revert
        // can't strand a settled deal (operator can adminRelease afterward).
        if (e.reservedAmount > 0) {
            uint256 slashShare = (e.reservedAmount * (BPS_DENOMINATOR - sellerBps)) / BPS_DENOMINATOR;
            address seller = e.seller;
            e.reservedAmount = 0;
            try vault.slashTo(jobId, slashShare) {
            } catch Error(string memory reason) {
                emit SlashFailed(jobId, seller, reason);
            } catch (bytes memory) {
                emit SlashFailed(jobId, seller, "low-level revert");
            }
        }

        // Arbiter resolution: hand the raw split to the reputation contract,
        // which bands it and value-weights it (v2 recordResolution).
        _recordResolution(jobId, e.buyer, e.seller, sellerBps, e.dealAmount);
    }

    // Internals

    /// @dev Shared terminal split used by the arbiter's resolve and the
    ///      mutual-cancel handshake: sellerBps of the unreleased seller net
    ///      and fee go to the seller side / treasury, the rest returns to the
    ///      buyer side. Flips the account to Settled.
    function _splitRemaining(
        bytes32 jobId,
        EscrowAccount storage e,
        uint16 sellerBps,
        address sellerTo,
        address buyerTo
    ) private returns (uint256 sellerCut, uint256 buyerCut) {
        uint256 remainingSellerNet = e.sellerNet - e.released;
        uint256 remainingFee = e.feeTotal - e.feeReleased;
        sellerCut = (remainingSellerNet * sellerBps) / BPS_DENOMINATOR;
        uint256 feeCut = (remainingFee * sellerBps) / BPS_DENOMINATOR;
        buyerCut = (remainingSellerNet - sellerCut) + (remainingFee - feeCut);

        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.milestonesReleased = uint8(e.milestonePcts.length);
        e.state = EscrowState.Settled;

        uint256 out = remainingSellerNet + remainingFee;
        _ensureLiquid(out);
        escrowedTotal -= out;
        if (sellerCut > 0) {
            usdc.safeTransfer(sellerTo, sellerCut);
        }
        if (feeCut > 0) {
            usdc.safeTransfer(treasury, feeCut);
            emit FeeCollected(jobId, e.milestonesReleased, feeCut, treasury);
        }
        if (buyerCut > 0) {
            usdc.safeTransfer(buyerTo, buyerCut);
        }
    }

    function _finalizeSuccess(bytes32 jobId, EscrowAccount storage e) internal {
        emit EscrowSettled(jobId, e.released, e.feeReleased);
        if (e.reservedAmount > 0) {
            vault.release(jobId);
            e.reservedAmount = 0;
        }
        _recordReputation(jobId, e.buyer, e.seller, IKarwanReputation.Outcome.Success, e.dealAmount);
    }

    /// @dev Resolves agent addresses to their identity wallets via the vault
    ///      before crediting reputation. Stake lives on identity wallets, so
    ///      reputation should too, otherwise the off-chain composite engine
    ///      has to do an agent-summing dance per deal. Falls back to the
    ///      passed address when the vault returns address(0), but that's a
    ///      degenerate case (vault.resolveOwner is a pure mapping read with
    ///      a pass-through default).
    function _recordReputation(
        bytes32 jobId,
        address buyer,
        address seller,
        IKarwanReputation.Outcome outcome,
        uint256 dealAmount
    ) internal {
        address buyerIdentity = vault.resolveOwner(buyer);
        address sellerIdentity = vault.resolveOwner(seller);
        // Audit I-3: reputation is a non-critical side effect of a settled
        // deal. A revert here (bad rep wiring, paused rep contract) must never
        // block the seller's payout, so we swallow it and emit for retry.
        try reputation.recordCompletion(jobId, buyerIdentity, sellerIdentity, outcome, dealAmount) {
        } catch Error(string memory reason) {
            emit ReputationRecordFailed(jobId, reason);
        } catch (bytes memory) {
            emit ReputationRecordFailed(jobId, "low-level revert");
        }
    }

    /// @dev Arbiter resolution -> reputation, non-blocking (audit I-3). Routes
    ///      through recordResolution so the reputation contract bands sellerBps
    ///      into an outcome and value-weights it.
    function _recordResolution(
        bytes32 jobId,
        address buyer,
        address seller,
        uint16 sellerBps,
        uint256 dealAmount
    ) internal {
        address buyerIdentity = vault.resolveOwner(buyer);
        address sellerIdentity = vault.resolveOwner(seller);
        try reputation.recordResolution(jobId, buyerIdentity, sellerIdentity, sellerBps, dealAmount) {
        } catch Error(string memory reason) {
            emit ReputationRecordFailed(jobId, reason);
        } catch (bytes memory) {
            emit ReputationRecordFailed(jobId, "low-level revert");
        }
    }
}
