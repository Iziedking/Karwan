// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
    }

    uint8 internal constant MAX_MILESTONES = 4;
    uint8 internal constant PCT_TOTAL = 100;
    uint16 internal constant BPS_DENOMINATOR = 10000;
    /// @notice Minimum reservation when Trusted Match is on. Anything below
    ///         this (other than 0 = casual) is rejected at fund time so a
    ///         buyer can't pick a meaningless 1% gate that looks like
    ///         insurance but slashes nothing useful.
    uint16 public constant MIN_TRUSTED_BPS = 5000;

    IERC20 public immutable usdc;
    /// @notice Platform fee in basis points applied to the deal amount.
    uint16 public immutable feeBps;
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

    /// @notice Buyer review window after a seller marks a milestone delivered.
    ///         The buyer must release or dispute within it; afterward the
    ///         seller can claim. Owner-settable within [MIN,MAX] bounds so it
    ///         can't be griefed to 0 (instant seller claim) or infinity
    ///         (permanent lock). Snapshotted per milestone at markDelivered.
    uint64 public reviewWindowSecs = 5 days;
    uint64 public constant MIN_REVIEW_WINDOW = 1 days;
    uint64 public constant MAX_REVIEW_WINDOW = 30 days;

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
        if (_feeBps > 1000) revert FeeTooHigh();
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

    /// @notice Set the buyer review window, clamped to sane bounds so it can
    ///         be neither griefed to an instant seller claim nor an infinite
    ///         lock. Applies to milestones marked delivered AFTER this call;
    ///         in-flight windows keep their snapshotted deadline.
    function setReviewWindow(uint64 secs) external onlyOwner {
        if (secs < MIN_REVIEW_WINDOW || secs > MAX_REVIEW_WINDOW) revert InvalidWindow();
        reviewWindowSecs = secs;
        emit ReviewWindowSet(secs);
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
        if (escrows[jobId].state != EscrowState.None) revert AlreadyFunded();
        if (seller == address(0) || seller == msg.sender) revert InvalidSeller();
        if (dealAmount == 0) revert InvalidAmount();
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
                claimDeadline: 0
            });
        }

        usdc.safeTransferFrom(msg.sender, address(this), fundedAmount);

        emit EscrowFunded(
            jobId, msg.sender, seller, dealAmount, fundedAmount, feeTotal, milestonePcts, _reservationBps
        );
    }

    /// @notice Seller-only acceptance. On trusted-match deals, triggers the
    ///         vault reservation. On casual deals (reservationBps==0), skips
    ///         the vault entirely. State: Funded -> Accepted either way.
    function acceptEscrow(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.seller) revert NotSeller();

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

    // ============================ H-1 lifecycle ============================

    /// @notice Seller marks the current milestone delivered, opening the buyer
    ///         review window. Callable only on the milestone next in line.
    ///         Re-callable (e.g. after re-delivery) which resets the window.
    function markDelivered(bytes32 jobId, bytes32 proofHash) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        if (msg.sender != e.seller) revert NotSeller();
        e.deliveredAt = uint64(block.timestamp);
        e.claimDeadline = uint64(block.timestamp) + reviewWindowSecs;
        emit Delivered(jobId, e.milestonesReleased, proofHash, e.claimDeadline);
    }

    /// @notice After the review window elapses with no buyer release and no
    ///         dispute, the seller claims the current milestone. Same payout
    ///         and fee math as a buyer release. Closes the "buyer vanished ->
    ///         funds stuck" liveness hole.
    function claimMilestone(bytes32 jobId, uint8 milestoneIndex) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Accepted) revert InvalidState();
        if (msg.sender != e.seller) revert NotSeller();
        if (milestoneIndex != e.milestonesReleased) revert TooManyReleases();
        if (milestoneIndex >= e.milestonePcts.length) revert TooManyReleases();
        if (e.deliveredAt == 0) revert NotDelivered();
        if (block.timestamp < e.claimDeadline) revert ReviewWindowOpen();

        uint256 sellerCut = _payMilestone(jobId, e, milestoneIndex);
        emit MilestoneClaimed(jobId, milestoneIndex, sellerCut, e.seller);
        if (e.state == EscrowState.Settled) {
            _finalizeSuccess(jobId, e);
        }
    }

    /// @dev Shared milestone payout used by both buyer release and seller
    ///      claim. Advances released/fee/milestone counters, transfers the
    ///      seller + treasury cuts, resets the delivery window for the next
    ///      milestone, and flips to Settled on the final milestone. Returns
    ///      the seller cut for the caller's event.
    function _payMilestone(bytes32 jobId, EscrowAccount storage e, uint8 milestoneIndex)
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

        if (sellerCut > 0) {
            usdc.safeTransfer(e.seller, sellerCut);
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
        if (msg.sender != e.buyer) revert NotBuyer();
        if (milestoneIndex != e.milestonesReleased) revert TooManyReleases();
        if (milestoneIndex >= e.milestonePcts.length) revert TooManyReleases();

        uint256 sellerCut = _payMilestone(jobId, e, milestoneIndex);
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

    /// @notice Buyer-only path from Disputed to Settled. Pays the seller and
    ///         (when a reservation existed) releases the vault reservation
    ///         and records DisputeResolved on both identities.
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
            _recordReputation(
                jobId, e.buyer, e.seller, IKarwanReputation.Outcome.DisputeResolved
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
        if (msg.sender != e.buyer) revert NotBuyer();
        if (e.wasAccepted) revert RefundAfterAccept();

        // Pre-accept => nothing released yet and no reservation exists, so this
        // simply returns the funded amount and there is nothing to slash.
        uint256 remaining = (e.sellerNet - e.released) + (e.feeTotal - e.feeReleased);
        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.state = EscrowState.Refunded;
        if (remaining > 0) {
            usdc.safeTransfer(e.buyer, remaining);
        }
        emit EscrowRefunded(jobId, remaining, 0);
    }

    /// @notice Arbiter resolves a POST-ACCEPT dispute. Splits the unreleased
    ///         funds `sellerBps` to the seller and the remainder to the buyer,
    ///         and settles the reservation proportionally to fault: the buyer's
    ///         share ((10000-sellerBps) of the reserve) slashes to the buyer,
    ///         the rest returns to the seller's free stake. Reputation:
    ///         sellerBps >= 8000 -> Success, <= 2000 -> Failed, else
    ///         DisputeResolved. This is the ONLY post-accept exit besides a
    ///         buyer release or a seller claim; nobody has unilateral clawback.
    function resolve(bytes32 jobId, uint16 sellerBps, bytes32 rulingHash) external nonReentrant {
        if (arbiter == address(0)) revert ArbiterNotSet();
        if (msg.sender != arbiter) revert NotArbiter();
        if (sellerBps > BPS_DENOMINATOR) revert InvalidBps();
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Disputed) revert InvalidState();
        // Pre-accept disputes cancel via refund, not the arbiter.
        if (!e.wasAccepted) revert InvalidState();

        uint256 remainingSellerNet = e.sellerNet - e.released;
        uint256 remainingFee = e.feeTotal - e.feeReleased;
        uint256 sellerCut = (remainingSellerNet * sellerBps) / BPS_DENOMINATOR;
        uint256 feeCut = (remainingFee * sellerBps) / BPS_DENOMINATOR;
        uint256 buyerCut = (remainingSellerNet - sellerCut) + (remainingFee - feeCut);

        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.milestonesReleased = uint8(e.milestonePcts.length);
        e.state = EscrowState.Settled;

        if (sellerCut > 0) {
            usdc.safeTransfer(e.seller, sellerCut);
        }
        if (feeCut > 0) {
            usdc.safeTransfer(treasury, feeCut);
            emit FeeCollected(jobId, e.milestonesReleased, feeCut, treasury);
        }
        if (buyerCut > 0) {
            usdc.safeTransfer(e.buyer, buyerCut);
        }
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

        IKarwanReputation.Outcome outcome = sellerBps >= 8000
            ? IKarwanReputation.Outcome.Success
            : (sellerBps <= 2000
                ? IKarwanReputation.Outcome.Failed
                : IKarwanReputation.Outcome.DisputeResolved);
        _recordReputation(jobId, e.buyer, e.seller, outcome);
    }

    // Internals

    function _finalizeSuccess(bytes32 jobId, EscrowAccount storage e) internal {
        emit EscrowSettled(jobId, e.released, e.feeReleased);
        if (e.reservedAmount > 0) {
            vault.release(jobId);
            e.reservedAmount = 0;
        }
        _recordReputation(jobId, e.buyer, e.seller, IKarwanReputation.Outcome.Success);
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
        IKarwanReputation.Outcome outcome
    ) internal {
        address buyerIdentity = vault.resolveOwner(buyer);
        address sellerIdentity = vault.resolveOwner(seller);
        // Audit I-3: reputation is a non-critical side effect of a settled
        // deal. A revert here (bad rep wiring, paused rep contract) must never
        // block the seller's payout, so we swallow it and emit for retry.
        try reputation.recordCompletion(jobId, buyerIdentity, sellerIdentity, outcome) {
        } catch Error(string memory reason) {
            emit ReputationRecordFailed(jobId, reason);
        } catch (bytes memory) {
            emit ReputationRecordFailed(jobId, "low-level revert");
        }
    }
}
