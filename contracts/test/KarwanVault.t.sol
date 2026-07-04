// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal ERC-20 mock to exercise the vault without depending on
///         the real USDC interface or a fork.
contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        require(balanceOf[msg.sender] >= amount, "INSUFFICIENT");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(allowance[from][msg.sender] >= amount, "ALLOWANCE");
        require(balanceOf[from] >= amount, "INSUFFICIENT");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract KarwanVaultTest is Test {
    KarwanVault vault;
    MockUSDC usdc;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address escrow = makeAddr("escrow");
    address buyer = makeAddr("buyer");
    uint256 constant ONE_USDC = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        // Wire escrow exactly as the production deploy does.
        vault.setEscrow(escrow);
        usdc.mint(alice, 1_000 * ONE_USDC);
        usdc.mint(bob, 1_000 * ONE_USDC);
    }

    function _deposit(address from, uint256 amount) internal returns (uint256) {
        vm.startPrank(from);
        usdc.approve(address(vault), amount);
        uint256 id = vault.deposit(amount);
        vm.stopPrank();
        return id;
    }

    /* ============================== STAKING ============================== */

    function test_Deposit_OpensActivePosition() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        (
            address owner,
            uint256 principal,
            uint64 depositedAt,
            uint64 cooldownStartedAt,
            uint64 claimableAt,
            KarwanVault.PositionState state
        ) = vault.positions(id);
        assertEq(owner, alice);
        assertEq(principal, 100 * ONE_USDC);
        assertEq(depositedAt, uint64(vm.getBlockTimestamp()));
        assertEq(cooldownStartedAt, 0);
        assertEq(claimableAt, 0);
        assertEq(uint8(state), uint8(KarwanVault.PositionState.Active));
        assertEq(usdc.balanceOf(address(vault)), 100 * ONE_USDC);
        assertEq(usdc.balanceOf(alice), 900 * ONE_USDC);
    }

    function test_Deposit_RevertsBelowMinPrincipal() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), ONE_USDC - 1);
        vm.expectRevert(KarwanVault.InvalidPrincipal.selector);
        vault.deposit(ONE_USDC - 1);
        vm.stopPrank();
    }

    function test_RequestWithdraw_StartsThreeDayCooldown() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        uint64 now64 = uint64(vm.getBlockTimestamp());
        vm.prank(alice);
        vault.requestWithdraw(id);

        (, , , uint64 cooldownStartedAt, uint64 claimableAt, KarwanVault.PositionState state) =
            vault.positions(id);
        assertEq(cooldownStartedAt, now64);
        assertEq(claimableAt, now64 + 3 days, "cooldown must be 3 days");
        assertEq(uint8(state), uint8(KarwanVault.PositionState.Cooling));
        // Stake signal goes to 0 during cooling.
        assertEq(vault.activePrincipal(id), 0);
        assertFalse(vault.isActive(id));
    }

    function test_Claim_BeforeCooldown_Reverts() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.prank(alice);
        vault.requestWithdraw(id);
        vm.warp(vm.getBlockTimestamp() + 2 days);
        vm.prank(alice);
        vm.expectRevert(KarwanVault.StillCooling.selector);
        vault.claim(id);
    }

    function test_Claim_AfterThreeDays_ReturnsPrincipal() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        vm.prank(alice);
        vault.requestWithdraw(id);
        vm.warp(vm.getBlockTimestamp() + 3 days + 1);
        vm.prank(alice);
        vault.claim(id);
        assertEq(usdc.balanceOf(alice), 1_000 * ONE_USDC);
    }

    function test_CancelWithdraw_RestoresActive_AndKeepsTenure() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);
        uint64 originalDeposit = uint64(vm.getBlockTimestamp());
        vm.warp(vm.getBlockTimestamp() + 2 days);
        vm.prank(alice);
        vault.requestWithdraw(id);
        vm.warp(vm.getBlockTimestamp() + 1 days);
        vm.prank(alice);
        vault.cancelWithdraw(id);

        (, , uint64 depositedAt, , , KarwanVault.PositionState state) = vault.positions(id);
        assertEq(depositedAt, originalDeposit);
        assertEq(uint8(state), uint8(KarwanVault.PositionState.Active));
        assertEq(vault.tenureSeconds(id), 3 days);
    }

    /* ============================ INSURANCE ============================== */

    function test_Reserve_LocksAgainstFreeStake() public {
        _deposit(alice, 100 * ONE_USDC);
        assertEq(vault.freeStakeOf(alice), 100 * ONE_USDC);

        vm.prank(escrow);
        vault.reserve(keccak256("job1"), alice, 30 * ONE_USDC, buyer);

        assertEq(vault.activeStakeOf(alice), 100 * ONE_USDC, "active stake unchanged");
        assertEq(vault.reservedTotal(alice), 30 * ONE_USDC);
        assertEq(vault.freeStakeOf(alice), 70 * ONE_USDC);
    }

    function test_Reserve_OnlyEscrow() public {
        _deposit(alice, 100 * ONE_USDC);
        vm.prank(makeAddr("eve"));
        vm.expectRevert(KarwanVault.NotConsumer.selector);
        vault.reserve(keccak256("job1"), alice, 30 * ONE_USDC, buyer);
    }

    function test_Reserve_RevertsOnInsufficientFree() public {
        _deposit(alice, 100 * ONE_USDC);
        vm.prank(escrow);
        vm.expectRevert(KarwanVault.InsufficientFreeStake.selector);
        vault.reserve(keccak256("job1"), alice, 200 * ONE_USDC, buyer);
    }

    function test_Reserve_RevertsOnDuplicate() public {
        _deposit(alice, 100 * ONE_USDC);
        vm.startPrank(escrow);
        vault.reserve(keccak256("job1"), alice, 30 * ONE_USDC, buyer);
        vm.expectRevert(KarwanVault.AlreadyReserved.selector);
        vault.reserve(keccak256("job1"), alice, 10 * ONE_USDC, buyer);
        vm.stopPrank();
    }

    function test_Release_ReturnsToFree() public {
        _deposit(alice, 100 * ONE_USDC);
        vm.startPrank(escrow);
        vault.reserve(keccak256("job1"), alice, 30 * ONE_USDC, buyer);
        vault.release(keccak256("job1"));
        vm.stopPrank();
        assertEq(vault.reservedTotal(alice), 0);
        assertEq(vault.freeStakeOf(alice), 100 * ONE_USDC);
    }

    function test_Release_IsIdempotent() public {
        _deposit(alice, 100 * ONE_USDC);
        vm.startPrank(escrow);
        vault.reserve(keccak256("job1"), alice, 30 * ONE_USDC, buyer);
        vault.release(keccak256("job1"));
        // Second release is a no-op, not a revert.
        vault.release(keccak256("job1"));
        vm.stopPrank();
    }

    function test_Slash_PaysBeneficiary_AndReducesPrincipal() public {
        uint256 id = _deposit(alice, 100 * ONE_USDC);

        vm.startPrank(escrow);
        vault.reserve(keccak256("job1"), alice, 30 * ONE_USDC, buyer);
        vault.slash(keccak256("job1"));
        vm.stopPrank();

        assertEq(usdc.balanceOf(buyer), 30 * ONE_USDC, "buyer received slash");
        assertEq(vault.reservedTotal(alice), 0);
        // Slashed amount comes out of the position's principal.
        (, uint256 principal, , , , ) = vault.positions(id);
        assertEq(principal, 70 * ONE_USDC);
        assertEq(vault.activeStakeOf(alice), 70 * ONE_USDC);
    }

    function test_Slash_WalksOldestFirst() public {
        uint256 first = _deposit(alice, 40 * ONE_USDC); // oldest
        vm.warp(vm.getBlockTimestamp() + 1 days);
        uint256 second = _deposit(alice, 60 * ONE_USDC);

        vm.startPrank(escrow);
        vault.reserve(keccak256("job1"), alice, 50 * ONE_USDC, buyer);
        vault.slash(keccak256("job1"));
        vm.stopPrank();

        // 50 USDC came out of the older position first (40), then 10 from the newer.
        (, uint256 firstPrincipal, , , , ) = vault.positions(first);
        (, uint256 secondPrincipal, , , , ) = vault.positions(second);
        assertEq(firstPrincipal, 0);
        assertEq(secondPrincipal, 50 * ONE_USDC);
    }

    /// v2: reservations are namespaced by keccak256(consumer, id), so a
    /// non-creating caller can't reach escrow's reservation at all — its own
    /// namespaced key is empty, so slash reverts NotReserved. This is the
    /// access control for release/slash (and it lets a de-authorized consumer
    /// still wind down its own existing reservations).
    function test_Slash_OnlyCreatingConsumerCanReach() public {
        _deposit(alice, 100 * ONE_USDC);
        vm.prank(escrow);
        vault.reserve(keccak256("job1"), alice, 30 * ONE_USDC, buyer);
        vm.prank(makeAddr("eve"));
        vm.expectRevert(KarwanVault.NotReserved.selector);
        vault.slash(keccak256("job1"));
        // Escrow's reservation is untouched.
        assertEq(vault.reservedTotal(alice), 30 * ONE_USDC);
    }

    function test_RequestWithdraw_BlockedIfWouldLeaveReservationUncovered() public {
        // Alice has 100 staked, 60 reserved. Active free = 40.
        _deposit(alice, 100 * ONE_USDC);
        vm.prank(escrow);
        vault.reserve(keccak256("job1"), alice, 60 * ONE_USDC, buyer);

        // Trying to cool the only position would leave 0 active, but 60 reserved.
        vm.prank(alice);
        vm.expectRevert(KarwanVault.ReservationLocked.selector);
        vault.requestWithdraw(1);
    }

    function test_RequestWithdraw_AllowedIfReservationStillCovered() public {
        // Alice has two positions of 100 each = 200 total, 60 reserved.
        // Cooling one position leaves 100 active, which still covers 60 reserved.
        uint256 first = _deposit(alice, 100 * ONE_USDC);
        _deposit(alice, 100 * ONE_USDC);
        vm.prank(escrow);
        vault.reserve(keccak256("job1"), alice, 60 * ONE_USDC, buyer);

        vm.prank(alice);
        vault.requestWithdraw(first);
        // Reservation still covered, no revert.
        assertEq(vault.activeStakeOf(alice), 100 * ONE_USDC);
        assertEq(vault.freeStakeOf(alice), 40 * ONE_USDC);
    }

    /* ============================ ADMIN ================================== */

    function test_SetEscrow_OnlyOnce() public {
        // setUp already called setEscrow(escrow). Second call must revert.
        vm.expectRevert(KarwanVault.NotDeployer.selector);
        vault.setEscrow(makeAddr("other-escrow"));
    }

    function test_SetEscrow_OnlyDeployer() public {
        // Build a fresh vault to test pre-setEscrow state.
        KarwanVault fresh = new KarwanVault(address(usdc));
        vm.prank(makeAddr("not-deployer"));
        vm.expectRevert(KarwanVault.NotDeployer.selector);
        fresh.setEscrow(escrow);
    }

    function test_Reserve_RevertsBeforeEscrowBound() public {
        KarwanVault fresh = new KarwanVault(address(usdc));
        vm.expectRevert(KarwanVault.NotConsumer.selector);
        fresh.reserve(keccak256("job1"), alice, 10 * ONE_USDC, buyer);
    }

    /* ====================== AUDIT FIX REGRESSIONS ======================= */

    /// H-1: setTeller must remain callable after setEscrow, via the
    /// operator role. Without the audit fix the deployer slot was zeroed
    /// on setEscrow and no caller could rotate the Teller.
    function test_AuditH1_SetTellerCallableAfterSetEscrow() public {
        address mockTeller = makeAddr("mockTeller");
        address mockUsyc = makeAddr("mockUsyc");
        // setUp already called setEscrow. Operator (still the deployer
        // address at construction) calls setTeller successfully.
        vault.setTeller(mockTeller, mockUsyc);
        assertEq(vault.teller(), mockTeller);
        assertEq(address(vault.usyc()), mockUsyc);
    }

    /// H-1: operator role can be rotated, e.g. to a multisig before
    /// mainnet exposure.
    function test_AuditH1_TransferOperator() public {
        address multisig = makeAddr("multisig");
        vault.transferOperator(multisig);
        assertEq(vault.operator(), multisig);

        // The original operator address can no longer call setTeller.
        vm.expectRevert(KarwanVault.NotOperator.selector);
        vault.setTeller(makeAddr("t"), makeAddr("u"));

        // The new operator can.
        vm.prank(multisig);
        vault.setTeller(makeAddr("t"), makeAddr("u"));
    }

    /// H-1: only the current operator can rotate. Random addresses bounce
    /// with NotOperator.
    function test_AuditH1_TransferOperator_OnlyOperator() public {
        vm.prank(makeAddr("not-operator"));
        vm.expectRevert(KarwanVault.NotOperator.selector);
        vault.transferOperator(makeAddr("eve-multisig"));
    }

    /// H-2 / M-1: slash walks only the seller's positions, not the global
    /// position table. We can't easily prove "O(seller)" with a unit test
    /// but we can prove that other owners' positions are untouched and
    /// gas stays sane with cross-owner depositors.
    function test_AuditH2_SlashIgnoresOtherOwnersPositions() public {
        // Mint carol first so the loop below doesn't bounce on insufficient
        // balance. 30 positions distributed across 3 owners.
        address carol = makeAddr("carol");
        usdc.mint(carol, 1_000 * ONE_USDC);
        for (uint256 i = 0; i < 10; i++) {
            _deposit(alice, 5 * ONE_USDC);
            _deposit(bob, 5 * ONE_USDC);
            _deposit(carol, 5 * ONE_USDC);
        }

        // Reserve and slash on alice — bob and carol must be untouched.
        vm.startPrank(escrow);
        vault.reserve(keccak256("job-alice"), alice, 30 * ONE_USDC, buyer);
        vault.slash(keccak256("job-alice"));
        vm.stopPrank();

        assertEq(vault.activeStakeOf(bob), 50 * ONE_USDC);
        assertEq(vault.activeStakeOf(carol), 50 * ONE_USDC);
        // Alice lost 30 USDC across her 10 positions.
        assertEq(vault.activeStakeOf(alice), 20 * ONE_USDC);
    }

    /// L-5: a position fully slashed to zero transitions to Withdrawn so
    /// the iteration stops counting it. Verifies the new state machine
    /// closes the slot.
    function test_AuditL5_FullySlashedPositionBecomesWithdrawn() public {
        uint256 first = _deposit(alice, 30 * ONE_USDC);
        _deposit(alice, 70 * ONE_USDC);

        vm.startPrank(escrow);
        vault.reserve(keccak256("job1"), alice, 30 * ONE_USDC, buyer);
        vault.slash(keccak256("job1"));
        vm.stopPrank();

        // The first (oldest) position took the full 30 USDC and is now
        // Withdrawn, not Active.
        (, uint256 principal, , , , KarwanVault.PositionState state) = vault.positions(first);
        assertEq(principal, 0);
        assertEq(uint8(state), uint8(KarwanVault.PositionState.Withdrawn));
    }

    /// positionCountOf returns the length of the owner's positionId array.
    /// Useful for off-chain enumeration.
    function test_PositionCountOf() public {
        assertEq(vault.positionCountOf(alice), 0);
        _deposit(alice, 10 * ONE_USDC);
        _deposit(alice, 10 * ONE_USDC);
        assertEq(vault.positionCountOf(alice), 2);
    }

    /// Audit M-1: adminRelease lets the operator unstick a stranded
    /// reservation that escrow couldn't release because slash reverted.
    /// We can't easily reproduce the slash-failure path in unit tests
    /// without a custom malicious USDC mock, but we can verify the
    /// adminRelease itself works against an active reservation.
    function test_AuditM1_AdminReleaseUnsticksReservation() public {
        _deposit(alice, 100 * ONE_USDC);
        vm.prank(escrow);
        vault.reserve(keccak256("stranded"), alice, 30 * ONE_USDC, buyer);
        assertEq(vault.reservedTotal(alice), 30 * ONE_USDC);

        // Operator unsticks it. v2: adminRelease targets the creating
        // consumer + id (reservations are namespaced by consumer internally).
        vault.adminRelease(escrow, keccak256("stranded"));
        assertEq(vault.reservedTotal(alice), 0);
        // Reservation marked inactive. Read via the internal namespaced key.
        bytes32 k = keccak256(abi.encode(escrow, keccak256("stranded")));
        (, , , bool active) = vault.reservations(k);
        assertFalse(active);
    }

    function test_AuditM1_AdminRelease_OnlyOperator() public {
        _deposit(alice, 100 * ONE_USDC);
        vm.prank(escrow);
        vault.reserve(keccak256("stranded"), alice, 30 * ONE_USDC, buyer);

        vm.prank(makeAddr("eve"));
        vm.expectRevert(KarwanVault.NotOperator.selector);
        vault.adminRelease(escrow, keccak256("stranded"));
    }

    function test_AuditM1_AdminRelease_IdempotentOnInactive() public {
        // Calling adminRelease on a jobId that was never reserved is a
        // no-op rather than a revert — matches release() semantics so
        // operators can call it speculatively without risk.
        vault.adminRelease(escrow, keccak256("never-reserved"));
    }

    /* ====================== v2.E resolveOwner view ===================== */

    function test_v2E_ResolveOwner_PassThroughDefault() public {
        address rando = makeAddr("rando");
        assertEq(vault.resolveOwner(rando), rando, "unmapped passes through");
    }

    function test_v2E_ResolveOwner_ReturnsRegisteredIdentity() public {
        address agent = makeAddr("agent");
        address identity = makeAddr("identity");
        // C-1 fix: the identity must approve the agent before it can bind.
        vm.prank(identity);
        vault.approveAgent(agent);
        vm.prank(agent);
        vault.registerOwner(identity);
        assertEq(vault.resolveOwner(agent), identity);
    }

    /* =================== v2.E entitlement-agnostic yield ================ */

    function test_v2E_WithdrawForYield_OnlyOperator() public {
        _deposit(alice, 100 * ONE_USDC);
        address rando = makeAddr("rando");
        vm.prank(rando);
        vm.expectRevert(KarwanVault.NotOperator.selector);
        vault.withdrawForYield(10 * ONE_USDC);
    }

    function test_v2E_WithdrawForYield_TracksOutstanding() public {
        _deposit(alice, 100 * ONE_USDC);
        uint256 balBefore = usdc.balanceOf(address(vault));
        // Operator is `address(this)` per the v2.D constructor default.
        vault.withdrawForYield(40 * ONE_USDC);
        assertEq(vault.outForYield(), 40 * ONE_USDC);
        assertEq(usdc.balanceOf(address(vault)), balBefore - 40 * ONE_USDC);
        assertEq(usdc.balanceOf(address(this)), 40 * ONE_USDC);
    }

    function test_v2E_WithdrawForYield_RevertsOnInsufficientLiquidity() public {
        // Only 10 USDC held; trying to pull 100 reverts.
        _deposit(alice, 10 * ONE_USDC);
        vm.expectRevert(KarwanVault.InsufficientLiquidUsdc.selector);
        vault.withdrawForYield(100 * ONE_USDC);
    }

    function test_v2E_DepositFromYield_ClearsOutForYield() public {
        _deposit(alice, 100 * ONE_USDC);
        vault.withdrawForYield(40 * ONE_USDC);
        assertEq(vault.outForYield(), 40 * ONE_USDC);

        // Operator returns the 40 USDC.
        usdc.approve(address(vault), 40 * ONE_USDC);
        vault.depositFromYield(40 * ONE_USDC);
        assertEq(vault.outForYield(), 0);
        // No surplus; total stays at original 100 USDC.
        assertEq(usdc.balanceOf(address(vault)), 100 * ONE_USDC);
    }

    function test_v2E_DepositFromYield_BooksSurplusAsYield() public {
        _deposit(alice, 100 * ONE_USDC);
        vault.withdrawForYield(40 * ONE_USDC);

        // Operator returns 45 USDC (5 USDC of simulated yield earned).
        // We need to top up the test contract first since it only has the
        // 40 USDC pulled from the vault.
        usdc.mint(address(this), 5 * ONE_USDC);
        usdc.approve(address(vault), 45 * ONE_USDC);
        vault.depositFromYield(45 * ONE_USDC);

        assertEq(vault.outForYield(), 0);
        // Vault now holds 60 (untouched) + 45 (returned + yield) = 105 USDC.
        assertEq(usdc.balanceOf(address(vault)), 105 * ONE_USDC);
    }

    function test_v2E_TotalReserves_IncludesOutForYield() public {
        _deposit(alice, 100 * ONE_USDC);
        vault.withdrawForYield(40 * ONE_USDC);
        // totalReserves: 60 held + 40 outstanding = 100. (No USYC wired.)
        assertEq(vault.totalReserves(), 100 * ONE_USDC);
    }
}
