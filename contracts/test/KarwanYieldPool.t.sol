// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanYieldPool} from "../src/KarwanYieldPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PoolToken is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function burn(address from, uint256 amount) external {
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        if (allowance[from][msg.sender] < type(uint256).max) allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// Teller with a settable NAV (8 decimals) and failure switches.
contract PoolTeller {
    PoolToken public usdc;
    PoolToken public usyc;
    uint256 public price = 1e8;
    bool public refuseDeposit;
    bool public refuseRedeem;

    constructor(PoolToken _usdc, PoolToken _usyc) {
        usdc = _usdc;
        usyc = _usyc;
    }

    function setPrice(uint256 p) external { price = p; }
    function setRefuse(bool d, bool r) external { refuseDeposit = d; refuseRedeem = r; }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        require(!refuseDeposit, "NotPermissioned");
        usdc.transferFrom(msg.sender, address(this), assets);
        shares = (assets * 1e8) / price;
        usyc.mint(receiver, shares);
    }

    function redeem(uint256 shares, address receiver, address owner_) external returns (uint256 assets) {
        require(!refuseRedeem, "Paused");
        usyc.burn(owner_, shares);
        assets = (shares * price) / 1e8;
        usdc.mint(receiver, assets);
    }
}

contract PoolOracle {
    int256 public answer = 1e8;
    uint256 public updatedAt;

    constructor() { updatedAt = block.timestamp; }

    function set(int256 a, uint256 t) external { answer = a; updatedAt = t; }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract KarwanYieldPoolTest is Test {
    PoolToken usdc;
    PoolToken usyc;
    PoolTeller teller;
    PoolOracle oracle;
    KarwanYieldPool pool;

    address owner = makeAddr("timelock");
    address escrow = makeAddr("escrow");
    address vault = makeAddr("vault");
    address treasury = makeAddr("fee-treasury");
    address stranger = makeAddr("stranger");

    function setUp() public {
        usdc = new PoolToken();
        usyc = new PoolToken();
        teller = new PoolTeller(usdc, usyc);
        oracle = new PoolOracle();
        pool = new KarwanYieldPool(address(usdc), 8, owner);
        vm.startPrank(owner);
        pool.setClient(escrow, true);
        pool.setClient(vault, true);
        pool.setTreasury(treasury);
        pool.setTeller(address(teller), address(usyc), address(oracle));
        pool.setBuffer(1_000, 1_000e6);
        pool.setYieldMargin(1e6);
        vm.stopPrank();
        _fund(escrow, 1_000_000e6);
        _fund(vault, 1_000_000e6);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(pool), type(uint256).max);
    }

    function _deposit(address who, uint256 amount) internal {
        vm.prank(who);
        pool.deposit(amount);
    }

    // ----------------------------- clients -----------------------------

    function test_OnlyClientsDeposit() public {
        _fund(stranger, 100e6);
        vm.prank(stranger);
        vm.expectRevert(KarwanYieldPool.NotClient.selector);
        pool.deposit(100e6);
    }

    function test_Y2_ClientCannotTakeMoreThanItsOwnPrincipal() public {
        _deposit(escrow, 10_000e6);
        _deposit(vault, 5_000e6);
        vm.prank(vault);
        vm.expectRevert(KarwanYieldPool.ExceedsPrincipal.selector);
        pool.withdraw(5_000e6 + 1);
    }

    function test_RemovedClientStillWithdrawsButCannotDeposit() public {
        _deposit(escrow, 10_000e6);
        vm.prank(owner);
        pool.setClient(escrow, false);
        vm.prank(escrow);
        vm.expectRevert(KarwanYieldPool.NotClient.selector);
        pool.deposit(1e6);
        vm.prank(escrow);
        pool.withdraw(10_000e6);
        assertEq(pool.principalOf(escrow), 0);
    }

    function test_WithdrawGoesOnlyToTheClient() public {
        _deposit(escrow, 10_000e6);
        uint256 before = usdc.balanceOf(escrow);
        vm.prank(escrow);
        pool.withdraw(4_000e6);
        assertEq(usdc.balanceOf(escrow) - before, 4_000e6);
    }

    // ------------------------------ yield ------------------------------

    function test_RebalanceKeepsTheBufferAndSubscribesTheRest() public {
        _deposit(escrow, 100_000e6);
        vm.prank(stranger);
        pool.rebalance();
        assertEq(usdc.balanceOf(address(pool)), 10_000e6, "10% buffer stays liquid");
        assertEq(usyc.balanceOf(address(pool)), 90_000e6);
    }

    function test_WithdrawBeyondTheBufferRedeemsExactly() public {
        _deposit(escrow, 100_000e6);
        pool.rebalance();
        uint256 before = usdc.balanceOf(escrow);
        vm.prank(escrow);
        pool.withdraw(60_000e6);
        assertEq(usdc.balanceOf(escrow) - before, 60_000e6, "exact principal back");
    }

    function test_TellerRefusingNeverBreaksRebalance() public {
        teller.setRefuse(true, false);
        _deposit(escrow, 100_000e6);
        pool.rebalance();
        assertEq(usdc.balanceOf(address(pool)), 100_000e6, "stays USDC, no revert");
    }

    function test_Y5_TellerPausedWithdrawRevertsWholeAndNothingMoves() public {
        _deposit(escrow, 100_000e6);
        pool.rebalance();
        teller.setRefuse(false, true);
        vm.prank(escrow);
        vm.expectRevert();
        pool.withdraw(60_000e6);
        assertEq(pool.principalOf(escrow), 100_000e6, "principal untouched on failure");
    }

    function test_YieldGoesOnlyToTheTreasury() public {
        _deposit(escrow, 100_000e6);
        pool.rebalance();
        teller.setPrice(1.05e8);
        oracle.set(1.05e8, block.timestamp);
        // conservative value caps USYC at par, so a NAV gain is swept only once realised
        vm.expectRevert(KarwanYieldPool.NoYield.selector);
        pool.sweepYield();
        usdc.mint(address(pool), 500e6);
        vm.prank(stranger);
        pool.sweepYield();
        assertEq(usdc.balanceOf(treasury), 499e6, "above principal plus margin, to treasury only");
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_Y6_DonationDoesNotChangePrincipal() public {
        _deposit(escrow, 1_000e6);
        usdc.mint(address(pool), 50_000e6);
        assertEq(pool.totalPrincipal(), 1_000e6);
        assertEq(pool.principalOf(escrow), 1_000e6);
    }

    function test_Y3_NoSweepInDeficitAndBackstopRestores() public {
        _deposit(escrow, 100_000e6);
        pool.rebalance();
        oracle.set(0.9e8, block.timestamp);
        teller.setPrice(0.9e8);
        assertEq(pool.deficit(), 9_001e6, "NAV drop plus the margin shows as deficit");
        vm.expectRevert(KarwanYieldPool.NoYield.selector);
        pool.sweepYield();
        _fund(treasury, 9_001e6);
        vm.prank(treasury);
        pool.backstop(9_001e6);
        assertEq(pool.deficit(), 0);
        vm.prank(escrow);
        pool.withdraw(100_000e6);
        assertEq(pool.principalOf(escrow), 0, "full principal returned after backstop");
    }

    function test_Y4_StaleOracleCannotInflateYield() public {
        _deposit(escrow, 100_000e6);
        pool.rebalance();
        oracle.set(2e8, block.timestamp);
        vm.warp(block.timestamp + 2 days);
        assertEq(pool.conservativeValue(), 10_000e6, "stale price values USYC at zero");
        vm.expectRevert(KarwanYieldPool.NoYield.selector);
        pool.sweepYield();
    }

    function test_TellerSwapRefusedWhileHoldingUsyc() public {
        _deposit(escrow, 100_000e6);
        pool.rebalance();
        vm.prank(owner);
        vm.expectRevert(KarwanYieldPool.TellerHoldsUsyc.selector);
        pool.setTeller(address(0), address(0), address(0));
    }

    function test_OnlyOwnerConfigures() public {
        vm.startPrank(stranger);
        vm.expectRevert();
        pool.setClient(stranger, true);
        vm.expectRevert();
        pool.setTreasury(stranger);
        vm.expectRevert();
        pool.setTeller(address(1), address(2), address(3));
        vm.stopPrank();
    }
}

/// Random sequences of deposits, withdrawals, rebalances, NAV moves, Teller
/// failures, donations, sweeps and backstops.
contract YieldPoolHandler is Test {
    KarwanYieldPool public pool;
    PoolToken public usdc;
    PoolTeller public teller;
    PoolOracle public oracle;
    address[2] public clients;
    address public treasury;
    uint256 public sweptTotal;

    constructor(KarwanYieldPool _pool, PoolToken _usdc, PoolTeller _teller, PoolOracle _oracle, address a, address b, address t) {
        pool = _pool;
        usdc = _usdc;
        teller = _teller;
        oracle = _oracle;
        clients = [a, b];
        treasury = t;
    }

    function deposit(uint256 who, uint256 amount) external {
        address c = clients[who % 2];
        amount = bound(amount, 1, 200_000e6);
        usdc.mint(c, amount);
        vm.startPrank(c);
        usdc.approve(address(pool), amount);
        pool.deposit(amount);
        vm.stopPrank();
    }

    function withdraw(uint256 who, uint256 amount) external {
        address c = clients[who % 2];
        uint256 p = pool.principalOf(c);
        if (p == 0) return;
        amount = bound(amount, 1, p);
        vm.prank(c);
        try pool.withdraw(amount) {} catch {}
    }

    function rebalance() external { pool.rebalance(); }

    function moveNav(uint256 p) external {
        p = bound(p, 0.95e8, 1.1e8);
        teller.setPrice(p);
        oracle.set(int256(p), block.timestamp);
    }

    function toggleTeller(bool d, bool r) external { teller.setRefuse(d, r); }

    function donate(uint256 amount) external {
        amount = bound(amount, 0, 10_000e6);
        usdc.mint(address(pool), amount);
    }

    bool public sweepBrokePrincipal;

    function sweep() external {
        uint256 before = usdc.balanceOf(treasury);
        try pool.sweepYield() {
            if (pool.conservativeValue() < pool.totalPrincipal() + pool.yieldMargin()) sweepBrokePrincipal = true;
        } catch {}
        sweptTotal += usdc.balanceOf(treasury) - before;
    }

    function backstop(uint256 amount) external {
        uint256 d = pool.deficit();
        if (d == 0) return;
        amount = bound(amount, 1, d);
        usdc.mint(treasury, amount);
        vm.startPrank(treasury);
        usdc.approve(address(pool), amount);
        pool.backstop(amount);
        vm.stopPrank();
    }

    function warp(uint256 secs) external { vm.warp(block.timestamp + bound(secs, 0, 2 days)); }
}

contract KarwanYieldPoolInvariantTest is Test {
    KarwanYieldPool pool;
    PoolToken usdc;
    PoolToken usyc;
    PoolTeller teller;
    PoolOracle oracle;
    YieldPoolHandler handler;
    address a = makeAddr("client-a");
    address b = makeAddr("client-b");
    address treasury = makeAddr("treasury");

    function setUp() public {
        usdc = new PoolToken();
        usyc = new PoolToken();
        teller = new PoolTeller(usdc, usyc);
        oracle = new PoolOracle();
        pool = new KarwanYieldPool(address(usdc), 8, address(this));
        pool.setClient(a, true);
        pool.setClient(b, true);
        pool.setTreasury(treasury);
        pool.setTeller(address(teller), address(usyc), address(oracle));
        handler = new YieldPoolHandler(pool, usdc, teller, oracle, a, b, treasury);
        targetContract(address(handler));
    }

    /// Principal bookkeeping is exact.
    function invariant_PrincipalSumsExactly() public view {
        assertEq(pool.principalOf(a) + pool.principalOf(b), pool.totalPrincipal());
    }

    /// The only USDC that ever reaches the treasury is swept yield, and the
    /// handler (standing in for any stranger) never receives anything.
    function invariant_TreasuryGetsOnlySweptYield() public view {
        assertEq(usdc.balanceOf(address(handler)), 0);
        assertEq(usdc.balanceOf(treasury), handler.sweptTotal());
    }

    /// A successful sweep always leaves principal plus margin covered.
    function invariant_SweepNeverTouchesPrincipal() public view {
        assertFalse(handler.sweepBrokePrincipal());
    }

    /// Liveness: with a working Teller and no deficit, every client can take
    /// back its whole principal right now.
    function invariant_FullWithdrawalAlwaysPossibleWhenHealthy() public {
        if (teller.refuseRedeem() || pool.deficit() > 0) return;
        uint256 snap = vm.snapshotState();
        address[2] memory cs = [a, b];
        for (uint256 i = 0; i < 2; i++) {
            uint256 p = pool.principalOf(cs[i]);
            if (p == 0) continue;
            uint256 before = usdc.balanceOf(cs[i]);
            vm.prank(cs[i]);
            pool.withdraw(p);
            assertEq(usdc.balanceOf(cs[i]) - before, p, "full principal back");
        }
        vm.revertToState(snap);
    }
}
