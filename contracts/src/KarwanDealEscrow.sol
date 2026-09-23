// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Guardable} from "./Guardable.sol";
import {DealTerms, DealTermsCodes as C, DealTermsLib, Deal, DealState, DealDisputeLib, DealDeliveryLib} from "./KarwanDealTypes.sol";

interface IDealStakeVault {
    function reserve(bytes32 id, address party, uint256 amount, address beneficiary) external;
    function release(bytes32 id) external;
    function slashTo(bytes32 id, uint256 amount) external;
    function resolveOwner(address addr) external view returns (address);
}

interface IDealReputation {
    function recordCompletion(bytes32 jobId, address buyer, address seller, uint8 outcome, uint256 dealAmount) external;
    function recordResolution(bytes32 jobId, address buyer, address seller, uint16 sellerBps, uint256 dealAmount) external;
}

interface IDealYieldPool {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
}

/// @title KarwanDealEscrow
/// @notice Terms-driven escrow. The buyer funds a deal with its full terms, the
///         seller accepts the exact terms hash, and every clock and payout then
///         follows those terms. See docs/escrow-design.md.
///
///         Guarantees, each covered by tests:
///           - deal money only ever goes to the deal's parties (or their
///             identity wallets), a financier the seller assigned, or the fee
///             treasury;
///           - every deal can reach a final state with party actions and time
///             alone;
///           - admin power over deal money is limited to a ruling on a dispute
///             that was escalated to review;
///           - a pause stops new deals and never an exit;
///           - a payout that cannot be delivered is credited, never lost, and
///             never blocks the rest of the settlement.
contract KarwanDealEscrow is Ownable2Step, ReentrancyGuard, Guardable {
    using SafeERC20 for IERC20;

    // ------------------------------- Types -------------------------------

    struct Assignment {
        address assignee;
        uint128 amount;
        uint128 paid;
    }

    struct Split {
        address proposer;
        uint16 sellerBps;
        bool byBuyer;
        bool active;
    }

    // ---------------------------- Constants -------------------------------

    uint16 internal constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 1_000;
    uint8 internal constant OUTCOME_SUCCESS = 1;
    uint8 internal constant OUTCOME_FAILED = 3;

    // ----------------------------- Wiring ---------------------------------

    IERC20 public immutable usdc;
    IDealStakeVault public immutable vault;
    uint16 public immutable maxReservationBps;
    uint64 public immutable minReview;
    uint64 public immutable maxReview;
    uint64 public immutable maxHorizon;
    uint64 public immutable disputeTimeout;
    uint64 public immutable appealWindow;
    uint64 public immutable autoRulingSla;

    IDealReputation public reputation;
    IDealYieldPool public pool;
    address public treasury;
    address public autoArbiter;
    address public reviewSafe;
    address public seniorSafe;

    uint16 public feeBps;
    uint128 public dealCap;
    uint128 public totalCap;
    uint128 public highValue;
    uint128 public minYieldSize = 500e6;
    uint64 public minYieldAge = 3 days;
    bool public newDealsPaused;

    // ------------------------------ Books ---------------------------------

    mapping(bytes32 => Deal) internal _deals;
    mapping(bytes32 => DealTerms) internal _terms;
    mapping(bytes32 => Assignment) public assignmentOf;
    mapping(bytes32 => Split) public splitOf;
    mapping(address => bool) public authorizedAssigners;
    mapping(address => uint256) public owed;

    /// @notice Unreleased money owed to deals (principal plus unreleased fee).
    uint256 public outstanding;
    /// @notice Payouts that could not be delivered, withdrawable by their owner.
    uint256 public owedTotal;
    /// @notice Outstanding principal of deals long and large enough to park.
    uint256 public eligibleOutstanding;
    /// @notice Principal currently parked in the yield pool.
    uint256 public parked;

    // ------------------------------ Events --------------------------------

    event DealFunded(bytes32 indexed jobId, address indexed buyer, address indexed seller, uint256 amount, uint256 funded, bytes32 termsHash);
    event DealAccepted(bytes32 indexed jobId, uint256 reserved);
    event DealCancelled(bytes32 indexed jobId, uint256 refunded);
    event Delivered(bytes32 indexed jobId, uint8 milestone, uint32 revision, bytes32 proofHash);
    event ReviewStarted(bytes32 indexed jobId, uint8 milestone, uint64 reviewEnd);
    event CheckAttested(bytes32 indexed jobId, uint32 revision, bool pass, bytes32 evidenceHash);
    event ReviewExtended(bytes32 indexed jobId, uint8 used, uint64 reviewEnd);
    event MilestonePaid(bytes32 indexed jobId, uint8 milestone, uint256 sellerAmount, uint256 fee, bool claimedBySeller);
    event DealSettled(bytes32 indexed jobId);
    event DealReclaimed(bytes32 indexed jobId, uint256 refunded, bool deposit);
    event DeadlineMoved(bytes32 indexed jobId, uint64 deadline);
    event Disputed(bytes32 indexed jobId, bool byBuyer, bytes32 reasonHash);
    event RulingProposed(bytes32 indexed jobId, uint16 sellerBps, bytes32 rulingHash, uint64 appealEnds);
    event Escalated(bytes32 indexed jobId, address by);
    event Ruled(bytes32 indexed jobId, uint16 sellerBps, bytes32 rulingHash, bool byReview);
    event DisputeLapsed(bytes32 indexed jobId, uint64 frozenSecs);
    event SplitProposed(bytes32 indexed jobId, address proposer, uint16 sellerBps);
    event SplitSettled(bytes32 indexed jobId, uint16 sellerBps, uint256 toSeller, uint256 toBuyer);
    event PayoutCredited(address indexed to, uint256 amount);
    event OwedWithdrawn(address indexed to, uint256 amount);
    event PayoutAssigned(bytes32 indexed jobId, address indexed assignee, uint128 amount);
    event SideEffectFailed(bytes32 indexed jobId, uint8 which);
    event ConfigChanged(bytes32 indexed what);

    // ------------------------------ Errors --------------------------------

    error Paused();
    error BadState();
    error BadTerms();
    error BadCaller();
    error BadAmount();
    error CapReached();
    error HashMismatch();
    error Early();
    error Late();
    error Exhausted();
    error NotAllowed();
    error Zero();

    // ---------------------------- Construction ----------------------------

    struct Bounds {
        uint16 maxReservationBps;
        uint64 minReview;
        uint64 maxReview;
        uint64 maxHorizon;
        uint64 disputeTimeout;
        uint64 appealWindow;
        uint64 autoRulingSla;
    }

    constructor(address _usdc, address _vault, address _owner, Bounds memory b) Ownable(_owner) {
        if (_usdc == address(0) || _vault == address(0)) revert Zero();
        if (
            b.maxReservationBps < 5_000 || b.maxReservationBps > BPS || b.minReview == 0
                || b.minReview >= b.maxReview || b.maxHorizon == 0 || b.disputeTimeout == 0
                || b.appealWindow == 0 || b.appealWindow >= b.disputeTimeout || b.autoRulingSla >= b.disputeTimeout
        ) revert BadTerms();
        usdc = IERC20(_usdc);
        vault = IDealStakeVault(_vault);
        maxReservationBps = b.maxReservationBps;
        minReview = b.minReview;
        maxReview = b.maxReview;
        maxHorizon = b.maxHorizon;
        disputeTimeout = b.disputeTimeout;
        appealWindow = b.appealWindow;
        autoRulingSla = b.autoRulingSla;
    }

    function _guardianAdmin() internal view override returns (address) {
        return owner();
    }

    /// @dev A guardian hold on a delivered milestone pushes the seller's claim
    ///      out by the hold, never the buyer's exits.
    function _afterHold(bytes32 id, uint64 secs) internal override {
        _deals[id].holdExtra += secs;
    }

    // ---------------------------- Configuration ---------------------------
    // The owner is a timelock behind the owner Safe. None of these touch a
    // funded deal: fees, caps and yield policy are read at funding.

    function setFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert BadAmount();
        feeBps = bps;
        emit ConfigChanged("fee");
    }

    function setCaps(uint128 _dealCap, uint128 _totalCap, uint128 _highValue) external onlyOwner {
        dealCap = _dealCap;
        totalCap = _totalCap;
        highValue = _highValue;
        emit ConfigChanged("caps");
    }

    function setRoles(address _treasury, address _autoArbiter, address _reviewSafe, address _seniorSafe)
        external
        onlyOwner
    {
        if (_treasury == address(0) || _reviewSafe == address(0) || _seniorSafe == address(0)) revert Zero();
        treasury = _treasury;
        autoArbiter = _autoArbiter;
        reviewSafe = _reviewSafe;
        seniorSafe = _seniorSafe;
        emit ConfigChanged("roles");
    }

    function setReputation(address _reputation) external onlyOwner {
        reputation = IDealReputation(_reputation);
        emit ConfigChanged("reputation");
    }

    /// @notice Point at the yield pool. Only while nothing is parked.
    function setPool(address _pool) external onlyOwner {
        if (parked != 0) revert NotAllowed();
        pool = IDealYieldPool(_pool);
        emit ConfigChanged("pool");
    }

    function setYieldPolicy(uint128 _minSize, uint64 _minAge) external onlyOwner {
        minYieldSize = _minSize;
        minYieldAge = _minAge;
        emit ConfigChanged("yield");
    }

    function setAssigner(address who, bool ok) external onlyOwner {
        if (who == address(0)) revert Zero();
        authorizedAssigners[who] = ok;
        emit ConfigChanged("assigner");
    }

    /// @notice Stop new deals. The guardian or the owner can pause; only the
    ///         owner can resume. Exits are never paused.
    function pauseNewDeals() external {
        if (msg.sender != guardian && msg.sender != owner()) revert BadCaller();
        newDealsPaused = true;
        emit ConfigChanged("paused");
    }

    function resumeNewDeals() external onlyOwner {
        newDealsPaused = false;
        emit ConfigChanged("resumed");
    }

    // ------------------------------- Views --------------------------------

    function dealIdFor(address buyer, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(buyer, salt));
    }

    function termsHashOf(DealTerms memory t) public pure returns (bytes32) {
        return keccak256(abi.encode(t));
    }

    function getDeal(bytes32 jobId) external view returns (Deal memory) {
        return _deals[jobId];
    }

    function getTerms(bytes32 jobId) external view returns (DealTerms memory) {
        return _terms[jobId];
    }

    /// @notice Compatibility for financing contracts.
    function sellerOf(bytes32 jobId) external view returns (address) {
        return _deals[jobId].seller;
    }

    /// @notice True once the deal can move no more money: settled, refunded,
    ///         reclaimed or split. Financing defaults wait for this.
    function isFinal(bytes32 jobId) external view returns (bool) {
        return _deals[jobId].state >= DealState.Settled;
    }

    function partiesOf(bytes32 jobId) external view returns (address, address) {
        Deal storage d = _deals[jobId];
        return (d.buyer, d.seller);
    }

    /// @notice When the seller may claim the current milestone on the review
    ///         clock, ignoring check and final-release rules. 0 = not delivered.
    function reviewEndOf(bytes32 jobId) external view returns (uint64) {
        return DealDeliveryLib.reviewEnd(_deals[jobId], _terms[jobId]);
    }

    // ------------------------------ Funding -------------------------------

    /// @notice Fund a deal with its full terms. The deal id is derived from the
    ///         buyer and a salt, so nobody can take it first.
    function fund(bytes32 salt, DealTerms calldata t) external nonReentrant returns (bytes32 jobId) {
        if (newDealsPaused) revert Paused();
        if (treasury == address(0)) revert Zero();
        jobId = dealIdFor(msg.sender, salt);
        Deal storage d = _deals[jobId];
        if (d.state != DealState.None) revert BadState();
        if (t.seller == address(0) || t.seller == msg.sender) revert BadTerms();
        address buyerId = vault.resolveOwner(msg.sender);
        address sellerId = vault.resolveOwner(t.seller);
        if (buyerId == sellerId) revert BadTerms();
        uint8 count = DealTermsLib.validate(
            t, DealTermsLib.Limits(maxReservationBps, minReview, maxReview, maxHorizon, highValue)
        );
        if (t.amount == 0 || (dealCap != 0 && t.amount > dealCap)) revert BadAmount();

        uint256 fee = (uint256(t.amount) * feeBps) / BPS;
        uint256 buyerFee = fee / 2;
        uint256 funded = uint256(t.amount) + buyerFee;
        if (totalCap != 0 && outstanding + funded > totalCap) revert CapReached();

        _terms[jobId] = t;
        d.buyer = msg.sender;
        d.seller = t.seller;
        d.buyerId = buyerId;
        d.sellerId = sellerId;
        d.count = count;
        d.senior = highValue != 0 && t.amount >= highValue;
        d.deadline = t.deliveryDeadline;
        d.sellerNet = uint128(uint256(t.amount) - (fee - buyerFee));
        d.feeTotal = uint128(fee);
        d.state = DealState.Funded;
        d.termsHash = keccak256(abi.encode(t));

        outstanding += funded;
        usdc.safeTransferFrom(msg.sender, address(this), funded);
        emit DealFunded(jobId, msg.sender, t.seller, t.amount, funded, d.termsHash);
    }

    /// @notice The seller accepts the exact terms the buyer funded.
    function accept(bytes32 jobId, bytes32 termsHash) external nonReentrant {
        Deal storage d = _deals[jobId];
        if (d.state != DealState.Funded) revert BadState();
        if (!_isSeller(d, msg.sender)) revert BadCaller();
        if (termsHash != d.termsHash) revert HashMismatch();
        d.sellerId = vault.resolveOwner(d.seller);
        DealTerms storage t = _terms[jobId];
        if (t.reservationBps != 0) {
            uint256 r = (uint256(t.amount) * t.reservationBps) / BPS;
            vault.reserve(jobId, msg.sender, r, d.buyer);
            d.reserved = uint128(r);
        }
        if (t.amount >= minYieldSize && (d.deadline == 0 || d.deadline >= block.timestamp + minYieldAge)) {
            d.eligible = true;
            d.eligibleAmount = t.amount;
            eligibleOutstanding += t.amount;
        }
        d.state = DealState.Accepted;
        emit DealAccepted(jobId, d.reserved);
    }

    /// @notice The buyer takes back a deal the seller never accepted.
    function cancelUnaccepted(bytes32 jobId) external nonReentrant {
        Deal storage d = _deals[jobId];
        if (d.state != DealState.Funded) revert BadState();
        if (!_isBuyer(d, msg.sender)) revert BadCaller();
        uint256 amount = _remaining(d);
        _closeBooks(d);
        d.state = DealState.Refunded;
        _payOut(d.buyer, amount);
        emit DealCancelled(jobId, amount);
    }

    // ------------------------------ Delivery ------------------------------

    function markDelivered(bytes32 jobId, bytes32 proofHash) external {
        Deal storage d = _deals[jobId];
        bool started = DealDeliveryLib.mark(d, _terms[jobId], msg.sender);
        _stopParking(d);
        emit Delivered(jobId, d.paid, d.revision, proofHash);
        if (started) emit ReviewStarted(jobId, d.paid, d.reviewEnd);
    }

    /// @notice The buyer starts their own review: for goods, by confirming
    ///         arrival; for a checked deal, by reviewing it themselves instead
    ///         of waiting for the check, which waives the check.
    function startReview(bytes32 jobId) external {
        Deal storage d = _deals[jobId];
        DealDeliveryLib.buyerStart(d, _terms[jobId], msg.sender);
        emit ReviewStarted(jobId, d.paid, d.reviewEnd);
    }

    /// @notice The delivery check's result for the current delivery revision.
    ///         A pass starts the review; a mismatch only records the result so
    ///         the seller can deliver again. It never moves money.
    function attestCheck(bytes32 jobId, uint32 revision, bool pass, bytes32 evidenceHash) external onlyGuardian {
        Deal storage d = _deals[jobId];
        bool started = DealDeliveryLib.attest(d, _terms[jobId], revision, pass);
        emit CheckAttested(jobId, revision, pass, evidenceHash);
        if (started) emit ReviewStarted(jobId, d.paid, d.reviewEnd);
    }

    function requestMoreTime(bytes32 jobId) external {
        Deal storage d = _deals[jobId];
        DealDeliveryLib.moreTime(d, _terms[jobId], msg.sender);
        emit ReviewExtended(jobId, d.extUsed, d.reviewEnd);
    }

    // ------------------------------ Payment -------------------------------

    /// @notice The buyer pays the next milestone. Always open while the deal
    ///         runs: it is the buyer's money to give.
    function release(bytes32 jobId) external nonReentrant {
        Deal storage d = _deals[jobId];
        if (d.state != DealState.Accepted) revert BadState();
        if (!_isBuyer(d, msg.sender)) revert BadCaller();
        _payMilestone(jobId, d, d.seller, false);
    }

    /// @notice The seller claims the next delivered milestone when the terms
    ///         allow it. `payee` may be the seller wallet or its identity.
    function claim(bytes32 jobId, address payee) external nonReentrant {
        Deal storage d = _deals[jobId];
        _requireNotHeld(jobId);
        DealDeliveryLib.checkClaim(d, _terms[jobId], msg.sender);
        _payMilestone(jobId, d, _payee(d.seller, d.sellerId, payee), true);
    }

    function _payMilestone(bytes32 jobId, Deal storage d, address sellerTo, bool byClaim) internal {
        uint8 i = d.paid;
        if (i >= d.count) revert BadState();
        bool last = i + 1 == d.count;
        uint256 sellerCut;
        uint256 feeCut;
        if (last) {
            sellerCut = d.sellerNet - d.released;
            feeCut = d.feeTotal - d.feeReleased;
        } else {
            uint8 pct = _terms[jobId].pcts[i];
            sellerCut = (uint256(d.sellerNet) * pct) / 100;
            feeCut = (uint256(d.feeTotal) * pct) / 100;
        }
        d.released += uint128(sellerCut);
        d.feeReleased += uint128(feeCut);
        d.paid = i + 1;
        d.deliveredAt = 0;
        d.reviewStartAt = 0;
        d.reviewEnd = 0;
        d.checkPassed = false;
        d.extUsed = 0;
        d.holdExtra = 0;
        _stopParking(d);
        outstanding -= sellerCut + feeCut;
        if (last) d.state = DealState.Settled;

        _paySellerSide(jobId, sellerTo, sellerCut);
        _payOut(treasury, feeCut);
        emit MilestonePaid(jobId, i, sellerCut, feeCut, byClaim);
        if (last) {
            if (d.reserved != 0) _releaseStake(jobId, d);
            _record(jobId, d, OUTCOME_SUCCESS);
            emit DealSettled(jobId);
        }
    }

    // ------------------------------ Deadlines -----------------------------

    /// @notice After the deadline and grace, with nothing waiting for review,
    ///         the buyer takes back the unreleased money. For a refundable
    ///         deposit this is the normal ending and carries no penalty.
    function reclaim(bytes32 jobId, address payee) external nonReentrant {
        Deal storage d = _deals[jobId];
        if (d.state != DealState.Accepted) revert BadState();
        if (!_isBuyer(d, msg.sender)) revert BadCaller();
        DealTerms storage t = _terms[jobId];
        if (d.deadline == 0 || d.deliveredAt != 0) revert NotAllowed();
        if (block.timestamp <= uint256(d.deadline) + t.reclaimGrace) revert Early();
        bool deposit = t.silenceOutcome == C.SILENCE_REFUNDS_BUYER;
        uint256 sellerLeft = d.sellerNet - d.released;
        uint256 amount = _remaining(d);
        _closeBooks(d);
        d.state = DealState.Reclaimed;
        _payOut(_payee(d.buyer, d.buyerId, payee), amount);
        if (d.reserved != 0) {
            if (deposit) {
                _releaseStake(jobId, d);
            } else {
                uint256 slash = (uint256(d.reserved) * sellerLeft) / d.sellerNet;
                d.reserved = 0;
                try vault.slashTo(jobId, slash) {} catch { emit SideEffectFailed(jobId, 1); }
            }
        }
        if (!deposit) _record(jobId, d, OUTCOME_FAILED);
        emit DealReclaimed(jobId, amount, deposit);
    }

    function extendDeadline(bytes32 jobId, uint64 newDeadline) external {
        Deal storage d = _deals[jobId];
        if (!_isBuyer(d, msg.sender)) revert BadCaller();
        _moveDeadline(jobId, d, newDeadline);
    }

    function _moveDeadline(bytes32 jobId, Deal storage d, uint64 newDeadline) internal {
        if (d.state != DealState.Accepted || d.deadline == 0) revert BadState();
        if (newDeadline <= d.deadline || newDeadline > block.timestamp + maxHorizon) revert BadTerms();
        d.deadline = newDeadline;
        emit DeadlineMoved(jobId, newDeadline);
    }

    // ------------------------------ Disputes ------------------------------

    /// @notice Either side opens a dispute on the current milestone. Each side
    ///         can do this once per milestone. The clocks stop.
    function dispute(bytes32 jobId, bytes32 reasonHash) external {
        Deal storage d = _deals[jobId];
        bool byBuyer = DealDisputeLib.open(d, msg.sender);
        _stopParking(d);
        emit Disputed(jobId, byBuyer, reasonHash);
    }

    /// @notice The dispute engine proposes a split from the terms and evidence.
    ///         It only takes effect after the appeal window.
    function proposeRuling(bytes32 jobId, uint16 sellerBps, bytes32 rulingHash) external {
        if (msg.sender != autoArbiter) revert BadCaller();
        Deal storage d = _deals[jobId];
        if (d.state != DealState.Disputed || d.escalated) revert BadState();
        if (sellerBps > BPS) revert BadAmount();
        d.proposal = true;
        d.proposedBps = sellerBps;
        d.proposedAt = uint64(block.timestamp);
        emit RulingProposed(jobId, sellerBps, rulingHash, uint64(block.timestamp) + appealWindow);
    }

    /// @notice Send the dispute to admin review: a side appealing a proposal in
    ///         time, a side whose dispute got no proposal within the SLA, or
    ///         the engine itself when it cannot decide.
    function escalate(bytes32 jobId) external {
        DealDisputeLib.escalate(_deals[jobId], msg.sender, autoArbiter, appealWindow, autoRulingSla);
        emit Escalated(jobId, msg.sender);
    }

    /// @notice Apply an unappealed proposal. Anyone can call it.
    function executeRuling(bytes32 jobId) external nonReentrant {
        Deal storage d = _deals[jobId];
        if (d.state != DealState.Disputed || d.escalated || !d.proposal) revert BadState();
        if (block.timestamp < uint256(d.proposedAt) + appealWindow) revert Early();
        uint16 bps = d.proposedBps;
        _split(jobId, d, bps, d.seller, d.buyer);
        _recordRuling(jobId, d, bps);
        emit Ruled(jobId, bps, bytes32(0), false);
    }

    /// @notice Admin review rules an escalated dispute: 1 of 4 reviewers below
    ///         highValue, 2 of 4 at or above it (two Safes, same owners).
    function rule(bytes32 jobId, uint16 sellerBps, bytes32 rulingHash) external nonReentrant {
        Deal storage d = _deals[jobId];
        if (d.state != DealState.Disputed || !d.escalated) revert BadState();
        address required = d.senior ? seniorSafe : reviewSafe;
        if (msg.sender != required) revert BadCaller();
        if (sellerBps > BPS) revert BadAmount();
        _split(jobId, d, sellerBps, d.seller, d.buyer);
        _recordRuling(jobId, d, sellerBps);
        emit Ruled(jobId, sellerBps, rulingHash, true);
    }

    /// @notice After the dispute timeout, either side resumes the deal. The
    ///         delivery deadline moves by the frozen time unless the seller was
    ///         already late. An on-time delivery survives with a fresh review;
    ///         a late one is wiped, so lateness cannot be turned into a stall.
    function lapseDispute(bytes32 jobId) external {
        uint64 frozen = DealDisputeLib.lapse(_deals[jobId], msg.sender, disputeTimeout, _terms[jobId].reviewWindow);
        emit DisputeLapsed(jobId, frozen);
    }

    /// @notice Either side proposes a split of the unpaid amount; the other
    ///         accepts with the same number.
    function proposeSplit(bytes32 jobId, uint16 sellerBps) external {
        Deal storage d = _deals[jobId];
        if (d.state != DealState.Accepted && d.state != DealState.Disputed) revert BadState();
        if (sellerBps > BPS) revert BadAmount();
        bool byBuyer = _isBuyer(d, msg.sender);
        if (!byBuyer && !_isSeller(d, msg.sender)) revert BadCaller();
        splitOf[jobId] = Split({proposer: msg.sender, sellerBps: sellerBps, byBuyer: byBuyer, active: true});
        emit SplitProposed(jobId, msg.sender, sellerBps);
    }

    function acceptSplit(bytes32 jobId, uint16 sellerBps) external nonReentrant {
        Deal storage d = _deals[jobId];
        if (d.state != DealState.Accepted && d.state != DealState.Disputed) revert BadState();
        Split memory s = splitOf[jobId];
        if (!s.active || s.sellerBps != sellerBps) revert HashMismatch();
        if (s.byBuyer ? !_isSeller(d, msg.sender) : !_isBuyer(d, msg.sender)) revert BadCaller();
        delete splitOf[jobId];
        _split(jobId, d, sellerBps, d.seller, d.buyer);
        if (d.reserved != 0) _releaseStake(jobId, d);
    }

    function _split(bytes32 jobId, Deal storage d, uint16 sellerBps, address sellerTo, address buyerTo) internal {
        uint256 net = d.sellerNet - d.released;
        uint256 fee = d.feeTotal - d.feeReleased;
        uint256 toSeller = (net * sellerBps) / BPS;
        uint256 feeCut = (fee * sellerBps) / BPS;
        uint256 toBuyer = (net - toSeller) + (fee - feeCut);
        _closeBooks(d);
        d.state = DealState.Split;
        _paySellerSide(jobId, sellerTo, toSeller);
        _payOut(treasury, feeCut);
        _payOut(buyerTo, toBuyer);
        emit SplitSettled(jobId, sellerBps, toSeller, toBuyer);
    }

    function _recordRuling(bytes32 jobId, Deal storage d, uint16 sellerBps) internal {
        if (d.reserved != 0) {
            uint256 slash = (uint256(d.reserved) * (BPS - sellerBps)) / BPS;
            d.reserved = 0;
            try vault.slashTo(jobId, slash) {} catch { emit SideEffectFailed(jobId, 1); }
        }
        if (address(reputation) != address(0)) {
            try reputation.recordResolution(jobId, d.buyerId, d.sellerId, sellerBps, _terms[jobId].amount) {}
            catch { emit SideEffectFailed(jobId, 2); }
        }
    }

    // ------------------------------ Financing -----------------------------

    function assignPayout(bytes32 jobId, address assignee, uint128 amount) external {
        if (!authorizedAssigners[msg.sender]) revert BadCaller();
        if (assignee == address(0) || amount == 0) revert Zero();
        Deal storage d = _deals[jobId];
        if (d.state != DealState.Funded && d.state != DealState.Accepted) revert BadState();
        if (assignmentOf[jobId].assignee != address(0)) revert NotAllowed();
        assignmentOf[jobId] = Assignment({assignee: assignee, amount: amount, paid: 0});
        emit PayoutAssigned(jobId, assignee, amount);
    }

    // ------------------------------- Owed ---------------------------------

    /// @notice Collect payouts that could not be delivered earlier. Only to
    ///         the address they were owed to: a frozen address stays frozen.
    function withdrawOwed() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert Zero();
        owed[msg.sender] = 0;
        owedTotal -= amount;
        if (!_ensureLiquid(amount)) revert NotAllowed();
        usdc.safeTransfer(msg.sender, amount);
        emit OwedWithdrawn(msg.sender, amount);
    }

    // ------------------------------- Yield --------------------------------

    /// @notice Park the principal of long, large deals in the yield pool.
    ///         Anyone can call it.
    function parkIdle() external nonReentrant {
        if (address(pool) == address(0) || eligibleOutstanding <= parked) return;
        uint256 want = eligibleOutstanding - parked;
        uint256 liquid = usdc.balanceOf(address(this));
        if (liquid <= owedTotal) return;
        uint256 spare = liquid - owedTotal;
        if (want > spare) want = spare;
        parked += want;
        usdc.forceApprove(address(pool), want);
        pool.deposit(want);
    }

    // ------------------------------ Internals -----------------------------

    function _isBuyer(Deal storage d, address a) internal view returns (bool) {
        return a == d.buyer || (d.buyerId != address(0) && a == d.buyerId);
    }

    function _isSeller(Deal storage d, address a) internal view returns (bool) {
        return a == d.seller || (d.sellerId != address(0) && a == d.sellerId);
    }

    function _payee(address stored, address identity, address requested) internal pure returns (address) {
        if (requested == address(0) || requested == stored) return stored;
        if (identity != address(0) && requested == identity) return requested;
        revert BadCaller();
    }

    function _remaining(Deal storage d) internal view returns (uint256) {
        return (d.sellerNet - d.released) + (d.feeTotal - d.feeReleased);
    }

    /// @dev Marks everything released and takes the rest off the books.
    function _closeBooks(Deal storage d) internal {
        outstanding -= _remaining(d);
        d.released = d.sellerNet;
        d.feeReleased = d.feeTotal;
        d.paid = d.count;
        _stopParking(d);
    }

    function _stopParking(Deal storage d) internal {
        if (!d.eligible) return;
        d.eligible = false;
        eligibleOutstanding -= d.eligibleAmount;
    }

    function _releaseStake(bytes32 jobId, Deal storage d) internal {
        d.reserved = 0;
        try vault.release(jobId) {} catch { emit SideEffectFailed(jobId, 1); }
    }

    function _record(bytes32 jobId, Deal storage d, uint8 outcome) internal {
        if (address(reputation) == address(0)) return;
        try reputation.recordCompletion(jobId, d.buyerId, d.sellerId, outcome, _terms[jobId].amount) {}
        catch { emit SideEffectFailed(jobId, 2); }
    }

    /// @dev Seller-side payout, financier first up to its assignment.
    function _paySellerSide(bytes32 jobId, address sellerTo, uint256 amount) internal {
        if (amount == 0) return;
        Assignment storage a = assignmentOf[jobId];
        uint256 cut;
        if (a.assignee != address(0) && a.paid < a.amount) {
            uint256 left = uint256(a.amount) - a.paid;
            cut = amount < left ? amount : left;
            a.paid += uint128(cut);
            _payOut(a.assignee, cut);
        }
        _payOut(sellerTo, amount - cut);
    }

    /// @dev Deliver `amount` to `to`, or credit it if liquidity or the transfer
    ///      fails. Never reverts, so one bad recipient cannot freeze a deal.
    function _payOut(address to, uint256 amount) internal {
        if (amount == 0) return;
        if (_ensureLiquid(amount) && usdc.trySafeTransfer(to, amount)) return;
        owed[to] += amount;
        owedTotal += amount;
        emit PayoutCredited(to, amount);
    }

    function _ensureLiquid(uint256 need) internal returns (bool) {
        uint256 liquid = usdc.balanceOf(address(this));
        if (liquid >= need) return true;
        uint256 gap = need - liquid;
        if (gap > parked) return false;
        try pool.withdraw(gap) {
            parked -= gap;
            return true;
        } catch {
            return false;
        }
    }
}
