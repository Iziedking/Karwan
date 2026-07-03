// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanTreasury} from "../src/KarwanTreasury.sol";

contract MockUSDC {
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
        require(balanceOf[msg.sender] >= amount, "INSUFFICIENT");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "ALLOWANCE");
        require(balanceOf[from] >= amount, "INSUFFICIENT");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @notice Configurable oracle double: 18-decimal price, tunable roundId /
///         answeredInRound / updatedAt so the staleness + round guards can be
///         exercised directly.
contract MockOracle {
    int256 public answer = 1e18;
    uint80 public roundId = 1;
    uint80 public answeredInRound = 1;
    uint256 public updatedAt;

    constructor() {
        updatedAt = block.timestamp;
    }

    function set(int256 _answer, uint80 _roundId, uint80 _answeredInRound, uint256 _updatedAt) external {
        answer = _answer;
        roundId = _roundId;
        answeredInRound = _answeredInRound;
        updatedAt = _updatedAt;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }
}

/// @notice USYC/teller double with a linearly ramping NAV, so the float can be
///         shown to earn yield and still be recovered exactly via unwrap.
contract YieldUSYC {
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    MockUSDC public immutable usdc;
    uint256 public constant SCALE = 1e6;
    uint256 public immutable apyBps;
    uint64 public immutable startedAt;

    constructor(address _usdc, uint256 _apyBps) {
        usdc = MockUSDC(_usdc);
        apyBps = _apyBps;
        startedAt = uint64(block.timestamp);
    }

    function price() public view returns (uint256) {
        uint256 elapsed = block.timestamp - startedAt;
        return SCALE + (SCALE * apyBps * elapsed) / (10_000 * 365 days);
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        if (allowance[f][msg.sender] != type(uint256).max) allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        usdc.transferFrom(msg.sender, address(this), assets);
        shares = (assets * SCALE) / price();
        totalSupply += shares;
        balanceOf[receiver] += shares;
    }

    function redeem(uint256 shares, address receiver, address account) external returns (uint256 assets) {
        if (account != msg.sender && allowance[account][msg.sender] != type(uint256).max) {
            allowance[account][msg.sender] -= shares;
        }
        balanceOf[account] -= shares;
        totalSupply -= shares;
        assets = (shares * price()) / SCALE;
        uint256 held = usdc.balanceOf(address(this));
        if (assets > held) assets = held;
        usdc.transfer(receiver, assets);
    }
}

/// @title KarwanTreasury v2 additions
/// @notice Escrow-float backstop, oracle guards, keeper cap, payout timelock,
///         two-step ownership.
contract KarwanTreasuryV2Test is Test {
    MockUSDC usdc;
    MockOracle oracle;
    KarwanTreasury treasury;

    address owner = address(this);
    address keeper = makeAddr("keeper");
    address escrow = makeAddr("escrow");
    address eve = makeAddr("eve");
    uint256 constant U = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        oracle = new MockOracle();
        // No USYC/teller wired for most tests (address(0)); oracle set so the
        // reserves guard can be exercised. escrow wired for the float hooks.
        treasury = new KarwanTreasury(address(usdc), address(0), address(0), address(oracle), keeper, 100 * U);
        treasury.setEscrow(escrow);
    }

    function _fund(uint256 amount) internal {
        usdc.mint(address(this), amount);
        usdc.approve(address(treasury), amount);
        treasury.deposit(amount);
    }

    // ===================== Escrow float integration =====================

    function _escrowPark(uint256 amount) internal {
        // The escrow approves, the treasury pulls.
        usdc.mint(escrow, amount);
        vm.prank(escrow);
        usdc.approve(address(treasury), amount);
        vm.prank(escrow);
        treasury.receiveEscrowFloat(amount);
    }

    function test_EscrowFloat_ReceiveAndReturn() public {
        _escrowPark(300 * U);
        assertEq(treasury.escrowFloat(), 300 * U, "float tracked");
        assertEq(usdc.balanceOf(address(treasury)), 300 * U, "usdc pulled in");

        vm.prank(escrow);
        treasury.returnEscrowLiquidity(120 * U);
        assertEq(treasury.escrowFloat(), 180 * U, "float reduced");
        assertEq(usdc.balanceOf(escrow), 120 * U, "escrow got exactly what it asked");
    }

    function test_EscrowFloat_HooksAreEscrowOnly() public {
        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotEscrow.selector);
        treasury.receiveEscrowFloat(1 * U);

        _escrowPark(100 * U);
        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotEscrow.selector);
        treasury.returnEscrowLiquidity(1 * U);
    }

    function test_EscrowFloat_CannotReturnMoreThanParked() public {
        _escrowPark(100 * U);
        vm.prank(escrow);
        vm.expectRevert(KarwanTreasury.AmountExceedsFloat.selector);
        treasury.returnEscrowLiquidity(150 * U);
    }

    /// The core invariant: no owner/keeper action can push liquid USDC below
    /// the escrow float, so returnEscrowLiquidity can never fail on liquidity.
    function test_EscrowFloat_PayoutCannotDipBelowFloat() public {
        _escrowPark(300 * U); // 300 liquid, all escrow-owed
        _fund(50 * U); // 350 liquid, 50 of it is the treasury's own fees

        // Can pay out the 50 of fees.
        treasury.payout(eve, 50 * U);
        assertEq(usdc.balanceOf(eve), 50 * U);

        // But not a cent of the escrow float.
        vm.expectRevert(KarwanTreasury.InsufficientLiquidUsdc.selector);
        treasury.payout(eve, 1 * U);

        // The escrow can still pull its full float back.
        vm.prank(escrow);
        treasury.returnEscrowLiquidity(300 * U);
        assertEq(usdc.balanceOf(escrow), 300 * U, "float fully recoverable");
    }

    function test_EscrowFloat_WithdrawForYieldRespectsBuffer() public {
        _escrowPark(300 * U);
        _fund(50 * U); // 350 liquid; 50 is fees
        treasury.setEscrowLiquidFloor(300 * U); // keep the float liquid as buffer
        vm.prank(keeper);
        vm.expectRevert(KarwanTreasury.InsufficientLiquidUsdc.selector);
        treasury.withdrawForYield(51 * U); // would leave 299 < 300 buffer
        // Exactly the surplus is withdrawable.
        vm.prank(keeper);
        treasury.withdrawForYield(50 * U);
        assertEq(usdc.balanceOf(keeper), 50 * U);
    }

    /// The whole point: the escrow float is WRAPPED into USYC, earns yield the
    /// treasury keeps, and is still recovered to the escrow exactly via unwrap.
    function test_EscrowFloat_EarnsYieldAndUnwrapsExactlyOnPullback() public {
        YieldUSYC usyc = new YieldUSYC(address(usdc), 1000); // 10% APY
        // The Teller is externally funded so NAV>1 redemptions realise yield,
        // exactly as the real USYC fund is backed by T-bill returns.
        usdc.mint(address(usyc), 1000 * U);
        KarwanTreasury t = new KarwanTreasury(
            address(usdc), address(usyc), address(usyc), address(oracle), keeper, 0
        );
        t.setEscrow(escrow);

        // Escrow parks 300; buffer 0 so it all gets wrapped.
        usdc.mint(escrow, 300 * U);
        vm.prank(escrow);
        usdc.approve(address(t), 300 * U);
        vm.prank(escrow);
        t.receiveEscrowFloat(300 * U);

        vm.prank(keeper);
        t.sweepToUSYC(); // wrap the full 300 into USYC
        assertEq(usdc.balanceOf(address(t)), 0, "all float wrapped");
        assertGt(usyc.balanceOf(address(t)), 0, "holds USYC");

        // A year passes; USYC NAV climbs ~10%.
        vm.warp(block.timestamp + 365 days);

        // Escrow pulls its full principal back: unwraps and pays EXACTLY 300.
        vm.prank(escrow);
        t.returnEscrowLiquidity(300 * U);
        assertEq(usdc.balanceOf(escrow), 300 * U, "escrow principal exact, yield-neutral");
        assertEq(t.escrowFloat(), 0, "float cleared");

        // The yield stayed with the treasury: redeeming the wrapped float at
        // NAV>1 realised ~10% surplus, which remains in the treasury.
        assertGt(usdc.balanceOf(address(t)), 25 * U, "treasury kept ~10% yield surplus");
    }

    function test_EscrowFloat_SetEscrowBlockedWhileParked() public {
        _escrowPark(100 * U);
        vm.expectRevert(KarwanTreasury.AmountExceedsFloat.selector);
        treasury.setEscrow(eve);
        // Once the float is returned, repointing is fine.
        vm.prank(escrow);
        treasury.returnEscrowLiquidity(100 * U);
        treasury.setEscrow(eve);
        assertEq(treasury.escrow(), eve);
    }

    // =========================== Oracle guards ==========================

    function test_Oracle_RevertsOnNonPositive() public {
        // Need USYC held for the price path to be hit; wire a token via a
        // fresh treasury that has a usyc balance is heavy, so instead assert
        // the guard through a direct reserves read with a non-positive answer.
        // With no USYC wired, totalReserves skips the price; wire a mock USYC.
        MockUSDC usyc = new MockUSDC();
        KarwanTreasury t = new KarwanTreasury(address(usdc), address(this), address(usyc), address(oracle), keeper, 0);
        usyc.mint(address(t), 10 * U); // t "holds" USYC

        oracle.set(0, 1, 1, block.timestamp);
        vm.expectRevert(KarwanTreasury.StaleOracle.selector);
        t.totalReserves();

        oracle.set(-5, 1, 1, block.timestamp);
        vm.expectRevert(KarwanTreasury.StaleOracle.selector);
        t.totalReserves();
    }

    function test_Oracle_RevertsOnStaleAndOutOfRound() public {
        MockUSDC usyc = new MockUSDC();
        KarwanTreasury t = new KarwanTreasury(address(usdc), address(this), address(usyc), address(oracle), keeper, 0);
        usyc.mint(address(t), 10 * U);
        vm.warp(100 days);

        // Stale: updatedAt older than maxStaleness (24h default).
        oracle.set(1e18, 5, 5, block.timestamp - 2 days);
        vm.expectRevert(KarwanTreasury.StaleOracle.selector);
        t.totalReserves();

        // Out of round: answeredInRound < roundId.
        oracle.set(1e18, 9, 8, block.timestamp);
        vm.expectRevert(KarwanTreasury.StaleOracle.selector);
        t.totalReserves();

        // Fresh + in round: fine.
        oracle.set(1e18, 9, 9, block.timestamp);
        assertGt(t.totalReserves(), 0);
    }

    function test_Oracle_HealthyProbeAndWidenStaleness() public {
        vm.warp(100 days);
        oracle.set(1e18, 1, 1, block.timestamp - 2 days);
        assertFalse(treasury.oracleHealthy(), "2d stale under 24h bound");
        // Widen the bound to tolerate a frozen testnet oracle.
        treasury.setMaxStaleness(30 days);
        assertTrue(treasury.oracleHealthy(), "healthy once bound widened");
    }

    // ============================ Keeper cap ============================

    function test_KeeperCap_LimitsPerWindow() public {
        _fund(1000 * U);
        treasury.setKeeperCap(100 * U, 1 days);

        vm.startPrank(keeper);
        treasury.withdrawForYield(100 * U); // fills the window
        vm.expectRevert(KarwanTreasury.KeeperCapExceeded.selector);
        treasury.withdrawForYield(1 * U);
        vm.stopPrank();

        // Next window resets the allowance.
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(keeper);
        treasury.withdrawForYield(100 * U);
        assertEq(usdc.balanceOf(keeper), 200 * U);
    }

    // ========================== Payout timelock =========================

    function test_PayoutTimelock_BlocksImmediateAndEnforcesEta() public {
        _fund(500 * U);
        treasury.setPayoutDelay(2 days);

        // Immediate payout is blocked once a delay is set.
        vm.expectRevert(KarwanTreasury.PayoutTimelocked.selector);
        treasury.payout(eve, 10 * U);

        uint256 id = treasury.queuePayout(eve, 10 * U);
        // Too early.
        vm.expectRevert(KarwanTreasury.PayoutNotReady.selector);
        treasury.executePayout(id);

        vm.warp(block.timestamp + 2 days);
        treasury.executePayout(id);
        assertEq(usdc.balanceOf(eve), 10 * U);

        // Can't double-execute.
        vm.expectRevert(KarwanTreasury.PayoutNotReady.selector);
        treasury.executePayout(id);
    }

    function test_PayoutTimelock_MaxBound() public {
        vm.expectRevert(KarwanTreasury.DelayTooLong.selector);
        treasury.setPayoutDelay(8 days);
    }

    // ========================= Two-step owner ==========================

    function test_TwoStepOwnership() public {
        treasury.transferOwnership(eve);
        assertEq(treasury.owner(), address(this), "still old owner until accept");

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(KarwanTreasury.NotOwner.selector);
        treasury.acceptOwnership();

        vm.prank(eve);
        treasury.acceptOwnership();
        assertEq(treasury.owner(), eve, "owner rotated");
    }

    // ===================== Adapter repoint (frozen) =====================

    function test_SetOracle_Repoint() public {
        MockOracle fresh = new MockOracle();
        treasury.setOracle(address(fresh));
        assertEq(address(treasury.oracle()), address(fresh));
        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotOwner.selector);
        treasury.setOracle(address(oracle));
    }
}
