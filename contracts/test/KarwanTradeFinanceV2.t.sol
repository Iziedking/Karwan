// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

/// @title Trade finance v2 — exploit-first acceptance suite
/// @notice Encodes the settled design in audit/TRADE_FINANCE_V2_DESIGN.md as
///         executable tests. The core v2 move is TRUE RECEIVABLE ASSIGNMENT:
///         when a financing line is drawn on a deal, the escrow pays the
///         financier directly at settlement (capped at the repay amount) and
///         the residual to the seller. No pull, no default on the happy path.
///
///         Two things live here:
///           1. RefEscrowV2 + RefVault — faithful reference implementations of
///              the intended v2 semantics. They make the suite green, which
///              PROVES the design closes: every §6 failure branch resolves and
///              every §7 invariant holds under a correct implementation. This
///              is what a deploy-once process needs before writing the real
///              300-line contract.
///           2. The adversarial tests. The real KarwanEscrowV2 / KarwanVault
///              must pass this exact suite. Swap the harness for the real
///              contracts and the tests become the acceptance gate.
///
///         Chosen model for §6.7 (partial milestones): the financier cut is
///         taken GREEDILY from each milestone release up to the remaining repay
///         cap (front-loaded), so the financier is repaid as early as the
///         escrow pays out. Tested in test_06_partialMilestones_frontLoaded.

// ============================ Mocks ============================

/// @notice 6-decimal USDC stand-in, matching the other Karwan suites.
contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @notice Reference vault modelling only the reservation surface the design
///         relies on, faithful to the real KarwanVault external semantics:
///         consumer-namespaced reservations, a locked beneficiary, full slash,
///         partial slashTo with the remainder returning to free stake, and a
///         free-stake floor that reservations sit under. Stake is real USDC
///         deposited by owners; reserved stake cannot be withdrawn.
contract RefVault {
    MockUSDC public immutable usdc;

    struct Reservation {
        address owner;
        uint256 amount;
        address beneficiary;
        bool active;
    }

    mapping(address => uint256) public stakeOf; // owner => deposited principal
    mapping(address => uint256) public reservedOf; // owner => currently reserved
    mapping(address => bool) public isConsumer;
    mapping(bytes32 => Reservation) private reservations;

    error NotConsumer();
    error AlreadyReserved();
    error InsufficientFreeStake();
    error NotReserved();
    error WouldUnderflowFreeStake();

    constructor(MockUSDC _usdc) {
        usdc = _usdc;
    }

    function setConsumer(address c, bool ok) external {
        isConsumer[c] = ok;
    }

    function deposit(uint256 amount) external {
        usdc.transferFrom(msg.sender, address(this), amount);
        stakeOf[msg.sender] += amount;
    }

    /// @notice Free stake = deposited minus reserved. This is the floor a
    ///         withdrawal cannot breach and the amount a reserve() draws from.
    function freeStakeOf(address owner) public view returns (uint256) {
        return stakeOf[owner] - reservedOf[owner];
    }

    /// @notice A staker can only withdraw down to their reserved floor. This is
    ///         the on-chain lock the v1 qualification check never had.
    function withdraw(uint256 amount) external {
        if (freeStakeOf(msg.sender) < amount) revert WouldUnderflowFreeStake();
        stakeOf[msg.sender] -= amount;
        usdc.transfer(msg.sender, amount);
    }

    function _key(address consumer, bytes32 id) internal pure returns (bytes32) {
        return keccak256(abi.encode(consumer, id));
    }

    function reserve(bytes32 id, address owner, uint256 amount, address beneficiary) external {
        if (!isConsumer[msg.sender]) revert NotConsumer();
        bytes32 k = _key(msg.sender, id);
        if (reservations[k].active) revert AlreadyReserved();
        if (freeStakeOf(owner) < amount) revert InsufficientFreeStake();
        reservations[k] = Reservation(owner, amount, beneficiary, true);
        reservedOf[owner] += amount;
    }

    function release(bytes32 id) external {
        bytes32 k = _key(msg.sender, id);
        Reservation storage r = reservations[k];
        if (!r.active) return; // idempotent
        r.active = false;
        reservedOf[r.owner] -= r.amount;
    }

    function slash(bytes32 id) external {
        _settle(msg.sender, id, type(uint256).max);
    }

    function slashTo(bytes32 id, uint256 amount) external {
        _settle(msg.sender, id, amount);
    }

    function _settle(address consumer, bytes32 id, uint256 cap) private {
        bytes32 k = _key(consumer, id);
        Reservation storage r = reservations[k];
        if (!r.active) revert NotReserved();
        uint256 reserved = r.amount;
        uint256 slashAmount = cap < reserved ? cap : reserved;
        r.active = false;
        reservedOf[r.owner] -= reserved;
        if (slashAmount > 0) {
            stakeOf[r.owner] -= slashAmount; // slashed principal leaves the owner
            usdc.transfer(r.beneficiary, slashAmount);
        }
    }

    function reservationActive(address consumer, bytes32 id) external view returns (bool) {
        return reservations[_key(consumer, id)].active;
    }
}

/// @notice Reference escrow implementing v2 receivable assignment. Principal is
///         split into `milestoneCount` equal parts (no fee, to keep the spec
///         legible; the real escrow's fee split is orthogonal and already
///         tested). The design's split rule lives in _payOne().
contract RefEscrowV2 {
    MockUSDC public immutable usdc;
    address public consumer; // the finance contract authorised to assign

    enum State {
        None,
        Accepted,
        Settled,
        Refunded
    }

    struct Esc {
        address buyer;
        address seller;
        uint256 principal;
        uint256 released; // paid out so far (financier + seller)
        uint8 milestoneCount;
        uint8 releasedCount;
        State state;
    }

    struct Assignment {
        address financier;
        uint256 repayRemaining; // cap not yet drawn by the financier
        bool active;
    }

    mapping(bytes32 => Esc) public escrows;
    mapping(bytes32 => Assignment) public assignments;

    // Accounting witnesses for the invariant tests.
    mapping(bytes32 => uint256) public paidToFinancier;
    mapping(bytes32 => uint256) public paidToSeller;
    mapping(bytes32 => uint256) public refundedToBuyer;

    error BadState();
    error NotBuyer();
    error NotConsumer();
    error AlreadyAssigned();
    error NoMilestones();

    constructor(MockUSDC _usdc) {
        usdc = _usdc;
    }

    function setConsumer(address c) external {
        consumer = c;
    }

    function sellerOf(bytes32 jobId) external view returns (address) {
        return escrows[jobId].seller;
    }

    function fund(bytes32 jobId, address buyer, address seller, uint256 principal, uint8 milestoneCount)
        external
    {
        if (escrows[jobId].state != State.None) revert BadState();
        if (milestoneCount == 0) revert NoMilestones();
        usdc.transferFrom(buyer, address(this), principal);
        escrows[jobId] =
            Esc(buyer, seller, principal, 0, milestoneCount, 0, State.Accepted);
    }

    /// @notice Draw a financing line against a deal: the financier will be paid
    ///         from the escrow at settlement, up to repayAmount, ahead of the
    ///         seller. Only a live (Accepted, not settled/refunded) deal can be
    ///         assigned, and only once. Consumer-gated (the finance contract).
    function assignPayout(bytes32 jobId, address financier, uint256 repayAmount) external {
        if (msg.sender != consumer) revert NotConsumer();
        Esc storage e = escrows[jobId];
        if (e.state != State.Accepted) revert BadState();
        if (assignments[jobId].active) revert AlreadyAssigned();
        assignments[jobId] = Assignment(financier, repayAmount, true);
    }

    /// @notice Release one milestone. The seller's cut for this milestone is
    ///         split: the financier takes min(cut, repayRemaining) first, the
    ///         residual goes to the seller. Front-loaded (§6.7).
    function releaseOne(bytes32 jobId) external {
        Esc storage e = escrows[jobId];
        if (e.state != State.Accepted) revert BadState();
        if (msg.sender != e.buyer) revert NotBuyer();

        bool isFinal = (e.releasedCount + 1) == e.milestoneCount;
        uint256 cut = isFinal ? (e.principal - e.released) : (e.principal / e.milestoneCount);

        e.released += cut;
        e.releasedCount += 1;
        if (isFinal) e.state = State.Settled;

        _payOne(jobId, e.seller, cut);
    }

    /// @dev The assignment split. financierCut is capped at both the milestone
    ///      cut and the remaining repay amount, so it never exceeds what is due
    ///      (invariant §7). The residual is the seller's.
    function _payOne(bytes32 jobId, address seller, uint256 cut) private {
        Assignment storage a = assignments[jobId];
        uint256 financierCut = 0;
        if (a.active && a.repayRemaining > 0) {
            financierCut = cut < a.repayRemaining ? cut : a.repayRemaining;
            a.repayRemaining -= financierCut;
        }
        uint256 sellerCut = cut - financierCut;
        if (financierCut > 0) {
            paidToFinancier[jobId] += financierCut;
            usdc.transfer(a.financier, financierCut);
        }
        if (sellerCut > 0) {
            paidToSeller[jobId] += sellerCut;
            usdc.transfer(seller, sellerCut);
        }
    }

    /// @notice Buyer reclaims / mutual-cancel: unreleased principal returns to
    ///         the buyer, the assignment is voided (nothing left to pay the
    ///         financier from the escrow). The financier's recovery in this
    ///         branch is the seller's slashed stake, handled by the caller.
    function refund(bytes32 jobId) external {
        Esc storage e = escrows[jobId];
        if (e.state != State.Accepted) revert BadState();
        uint256 remaining = e.principal - e.released;
        e.state = State.Refunded;
        assignments[jobId].active = false;
        refundedToBuyer[jobId] += remaining;
        if (remaining > 0) usdc.transfer(e.buyer, remaining);
    }

    function assignmentActive(bytes32 jobId) external view returns (bool) {
        return assignments[jobId].active;
    }

    function repayRemaining(bytes32 jobId) external view returns (uint256) {
        return assignments[jobId].repayRemaining;
    }
}

// ============================ Tests ============================

contract KarwanTradeFinanceV2Test is Test {
    MockUSDC usdc;
    RefVault vault;
    RefEscrowV2 escrow;

    // The v2 finance contract is modelled by this test acting as the consumer:
    // it draws lines (assignPayout + reserve) and resolves defaults (slash).
    address financier = address(0xF1);
    address buyer = address(0xB0B);
    address seller = address(0x5E11E4);

    bytes32 constant JOB = keccak256("job-1");

    function setUp() public {
        usdc = new MockUSDC();
        vault = new RefVault(usdc);
        escrow = new RefEscrowV2(usdc);
        // This test contract is the authorised finance consumer on both.
        escrow.setConsumer(address(this));
        vault.setConsumer(address(this), true);

        usdc.mint(buyer, 1_000_000e6);
        usdc.mint(financier, 1_000_000e6);
        usdc.mint(seller, 1_000_000e6);
    }

    // --- helpers ---

    function _fund(uint256 principal, uint8 milestones) internal {
        vm.prank(buyer);
        usdc.approve(address(escrow), principal);
        vm.prank(buyer);
        escrow.fund(JOB, buyer, seller, principal, milestones);
    }

    function _sellerStakes(uint256 amount) internal {
        vm.prank(seller);
        usdc.approve(address(vault), amount);
        vm.prank(seller);
        vault.deposit(amount);
    }

    /// Draw a financing line: assign the receivable to the financier and reserve
    /// the seller's stake to the financier. This is what KarwanPOFinancing /
    /// KarwanInvoiceRegistry v2 does inside fund()/accept().
    function _drawLine(uint256 repayAmount, uint256 stake) internal {
        escrow.assignPayout(JOB, financier, repayAmount);
        if (stake > 0) vault.reserve(JOB, seller, stake, financier);
    }

    function _releaseAll(uint8 milestones) internal {
        for (uint8 i = 0; i < milestones; i++) {
            vm.prank(buyer);
            escrow.releaseOne(JOB);
        }
    }

    // === §6.1 — assignment defeats the seller-drain race ===

    /// The whole point of v2: the financier is paid from the escrow, so it does
    /// not matter what the seller does with their own wallet. In v1 the seller
    /// could drain and the pull would revert; here there is no pull.
    function test_01_assignment_survivesSellerDrain() public {
        _fund(1000e6, 1);
        _drawLine(900e6, 0);

        // Seller empties their own wallet before settlement. Read the balance
        // first: vm.prank only spoofs the next call, and the balanceOf read
        // would otherwise consume it.
        uint256 sellerBal = usdc.balanceOf(seller);
        vm.prank(seller);
        usdc.transfer(address(0xDEAD), sellerBal);

        _releaseAll(1);

        assertEq(escrow.paidToFinancier(JOB), 900e6, "financier paid from escrow");
        assertEq(escrow.paidToSeller(JOB), 100e6, "seller gets residual");
        assertEq(usdc.balanceOf(financier), 1_000_000e6 + 900e6, "financier made whole");
    }

    // === §6.8 — one deal, one line ===

    function test_08_secondAssignment_reverts() public {
        _fund(1000e6, 1);
        _drawLine(900e6, 0);
        vm.expectRevert(RefEscrowV2.AlreadyAssigned.selector);
        escrow.assignPayout(JOB, address(0xF2), 500e6);
    }

    // === §6.9 — repay cap exceeds escrow due: financier capped, no revert ===

    /// A financier who assigns more than the deal will ever pay out must be
    /// capped at what the escrow pays, and settlement must NOT revert (a revert
    /// would strand the seller's residual and the buyer's deal).
    function test_09_repayExceedsDue_financierCapped_noRevert() public {
        _fund(1000e6, 1);
        _drawLine(5000e6, 0); // absurd repay vs a 1000 deal

        _releaseAll(1);

        assertEq(escrow.paidToFinancier(JOB), 1000e6, "capped at the full deal");
        assertEq(escrow.paidToSeller(JOB), 0, "nothing left for the seller");
        assertEq(escrow.repayRemaining(JOB), 4000e6, "shortfall recorded, not paid");
    }

    // === §6.10 — a line is repaid at most once ===

    /// After the deal settles, the assignment is exhausted; a re-run cannot pay
    /// the financier again. Modelled by the escrow refusing further releases in
    /// Settled state.
    function test_10_noDoubleRepay() public {
        _fund(1000e6, 1);
        _drawLine(900e6, 0);
        _releaseAll(1);
        uint256 before = usdc.balanceOf(financier);

        vm.prank(buyer);
        vm.expectRevert(RefEscrowV2.BadState.selector);
        escrow.releaseOne(JOB);

        assertEq(usdc.balanceOf(financier), before, "financier not paid twice");
    }

    // === §6.11 — reserved stake cannot be withdrawn while the line is open ===

    function test_11_reservedStake_notWithdrawable() public {
        _fund(1000e6, 2);
        _sellerStakes(900e6);
        _drawLine(900e6, 900e6); // reserve the whole stake

        // Seller tries to pull their stake out mid-line.
        vm.prank(seller);
        vm.expectRevert(RefVault.WouldUnderflowFreeStake.selector);
        vault.withdraw(1e6);

        assertEq(vault.freeStakeOf(seller), 0, "all stake reserved");
    }

    // === §6.4 — refund after PoD: financier recovers from the seller's stake ===

    /// Buyer refunds the escrow after a financier advanced. The escrow assignment
    /// is voided (money went back to the buyer), so the financier's recovery is
    /// the seller's slashed stake. Full recovery when stake >= repay.
    function test_04_refundAfterAdvance_slashSellerStake_fullRecovery() public {
        _fund(1000e6, 2);
        _sellerStakes(900e6);
        _drawLine(900e6, 900e6);

        // Buyer refunds; assignment voids.
        escrow.refund(JOB);
        assertFalse(escrow.assignmentActive(JOB), "assignment voided on refund");

        // Finance contract slashes the seller's reservation to the financier.
        vault.slash(JOB);

        assertEq(usdc.balanceOf(financier), 1_000_000e6 + 900e6, "financier made whole from stake");
        assertEq(usdc.balanceOf(buyer), 1_000_000e6, "buyer got their escrow back");
    }

    /// When the seller's stake is smaller than the advance, recovery is a
    /// defined HAIRCUT, never a revert. The financier takes the loss on record.
    function test_04b_refundAfterAdvance_partialStake_haircut() public {
        _fund(1000e6, 2);
        _sellerStakes(300e6); // only a third of the 900 advance
        _drawLine(900e6, 300e6);

        escrow.refund(JOB);
        vault.slash(JOB);

        assertEq(usdc.balanceOf(financier), 1_000_000e6 + 300e6, "recovered only the stake");
        // The 600 shortfall is the financier's loss; the flow did not revert.
    }

    // === §6.3 — buyer bad-faith default slashes the BUYER to the financier ===

    /// §1.3: both sides are slashable. A buyer who disputes in bad faith after a
    /// financier advanced can have THEIR stake slashed to the financier. Modelled
    /// with a buyer reservation whose beneficiary is the financier.
    function test_03_buyerDefault_slashesBuyerToFinancier() public {
        _fund(1000e6, 2);

        // Buyer posts stake; the finance contract reserves it against a
        // buyer-default key, beneficiary = financier.
        vm.prank(buyer);
        usdc.approve(address(vault), 900e6);
        vm.prank(buyer);
        vault.deposit(900e6);
        bytes32 buyerKey = keccak256("job-1:buyer-default");
        vault.reserve(buyerKey, buyer, 900e6, financier);

        _drawLine(900e6, 0);

        // Buyer refunds in bad faith; finance contract slashes the buyer stake.
        escrow.refund(JOB);
        vault.slash(buyerKey);

        assertEq(usdc.balanceOf(financier), 1_000_000e6 + 900e6, "financier made whole from buyer");
        assertEq(vault.freeStakeOf(buyer), 0, "buyer stake gone");
    }

    // === §6.5 — mutual cancel with a line open: reservations released, no stranding ===

    function test_05_mutualCancel_releasesReservation_noStranding() public {
        _fund(1000e6, 2);
        _sellerStakes(900e6);
        _drawLine(900e6, 900e6);

        // Mutual cancel: refund the buyer AND release the seller's stake (no
        // default occurred, so nothing is slashed).
        escrow.refund(JOB);
        vault.release(JOB);

        assertFalse(escrow.assignmentActive(JOB), "assignment cleared");
        assertFalse(vault.reservationActive(address(this), JOB), "reservation cleared");
        assertEq(vault.freeStakeOf(seller), 900e6, "seller stake fully restored");
        assertEq(usdc.balanceOf(buyer), 1_000_000e6, "buyer whole");
    }

    // === §6.7 — partial milestones: financier front-loaded, then the seller ===

    function test_06_partialMilestones_frontLoaded() public {
        _fund(1000e6, 4); // 4 x 250
        _drawLine(600e6, 0);

        // M1: 250 -> all to financier (600 owed). M2: 250 -> financier (350 left
        // after M1... 600-250=350, cut 250 -> financier, 100 left). M3: 250 ->
        // 100 to financier, 150 to seller. M4: 250 -> all to seller.
        vm.prank(buyer);
        escrow.releaseOne(JOB);
        assertEq(escrow.paidToFinancier(JOB), 250e6, "M1 all to financier");

        vm.prank(buyer);
        escrow.releaseOne(JOB);
        assertEq(escrow.paidToFinancier(JOB), 500e6, "M2 all to financier");

        vm.prank(buyer);
        escrow.releaseOne(JOB);
        assertEq(escrow.paidToFinancier(JOB), 600e6, "M3 tops out the cap");
        assertEq(escrow.paidToSeller(JOB), 150e6, "M3 residual to seller");

        vm.prank(buyer);
        escrow.releaseOne(JOB);
        assertEq(escrow.paidToFinancier(JOB), 600e6, "financier capped at repay");
        assertEq(escrow.paidToSeller(JOB), 400e6, "seller gets the rest");
    }

    // === §6.12 — a defaulted line with zero stake terminates cleanly ===

    /// An unsecured line (stake 0) that refunds must still resolve to a defined
    /// end state without reverting or looping; the financier simply takes the
    /// loss on record.
    function test_12_unsecuredDefault_terminatesCleanly() public {
        _fund(1000e6, 1);
        _drawLine(900e6, 0);

        escrow.refund(JOB);

        assertFalse(escrow.assignmentActive(JOB), "assignment cleared, no retry loop");
        assertEq(usdc.balanceOf(buyer), 1_000_000e6, "buyer refunded");
        // No stake to slash: financier's loss is final and on record. No revert.
    }

    // === §7 — invariants over a happy-path settlement ===

    /// Conservation: everything the escrow paid out equals the principal it held,
    /// split between financier and seller, with nothing created or stranded.
    function test_inv_conservation_onSettlement() public {
        _fund(1000e6, 3);
        _drawLine(700e6, 0);
        _releaseAll(3);

        uint256 f = escrow.paidToFinancier(JOB);
        uint256 s = escrow.paidToSeller(JOB);
        assertEq(f + s, 1000e6, "payouts conserve principal");
        assertEq(f, 700e6, "financier got exactly the repay");
        assertEq(s, 300e6, "seller got the residual");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow fully drained");
    }

    /// financierCut <= repayAmount AND the escrow never pays out more than it held.
    function test_inv_financierCut_bounded() public {
        _fund(1000e6, 2);
        _drawLine(9999e6, 0); // repay far exceeds the deal
        _releaseAll(2);

        assertLe(escrow.paidToFinancier(JOB), 1000e6, "cut never exceeds principal");
        assertEq(escrow.paidToFinancier(JOB), 1000e6, "capped at what the escrow paid");
        assertEq(usdc.balanceOf(address(escrow)), 0, "no over-payment");
    }
}
