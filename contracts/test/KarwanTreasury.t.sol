// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanTreasury} from "../src/KarwanTreasury.sol";

/// @notice Minimal ERC-20 mock standing in for USDC (6 decimals).
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

/// @notice Test-only USYC double: a single contract playing the Teller,
///         the USYC token, and the price oracle, with a price that ramps
///         linearly by `apyBps` since deploy. Mirrors the real Hashnote /
///         Circle USYC surface (deposit / redeem / latestRoundData) so the
///         treasury exercises the same code path it runs against real USYC.
contract TestUSYC {
    string public constant name = "Test US Yield Coin";
    string public constant symbol = "USYC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    MockUSDC public immutable usdc;
    uint256 public constant PRICE_SCALE = 1e8;
    uint256 public immutable apyBps;
    uint64 public immutable startedAt;

    error TransferFailed();
    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAmount();
    error ZeroAddress();

    constructor(address _usdc, uint256 _apyBps) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = MockUSDC(_usdc);
        apyBps = _apyBps;
        startedAt = uint64(block.timestamp);
    }

    function price() public view returns (uint256) {
        uint256 elapsed = block.timestamp - startedAt;
        uint256 growth = (PRICE_SCALE * apyBps * elapsed) / (10_000 * 365 days);
        return PRICE_SCALE + growth;
    }

    function latestAnswer() external view returns (int256) {
        return int256(price());
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (uint80(1), int256(price() * 1e10), block.timestamp, block.timestamp, uint80(1));
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        if (!usdc.transferFrom(msg.sender, address(this), assets)) revert TransferFailed();
        shares = (assets * PRICE_SCALE) / price();
        _mint(receiver, shares);
    }

    function redeem(uint256 shares, address receiver, address account)
        external
        returns (uint256 assets)
    {
        if (shares == 0) revert ZeroAmount();
        if (receiver == address(0) || account == address(0)) revert ZeroAddress();
        if (account != msg.sender) {
            uint256 a = allowance[account][msg.sender];
            if (a < shares) revert InsufficientAllowance();
            if (a != type(uint256).max) allowance[account][msg.sender] = a - shares;
        }
        if (balanceOf[account] < shares) revert InsufficientBalance();
        assets = (shares * price()) / PRICE_SCALE;
        _burn(account, shares);
        uint256 held = usdc.balanceOf(address(this));
        if (assets > held) assets = held;
        if (!usdc.transfer(receiver, assets)) revert TransferFailed();
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a < amount) revert InsufficientAllowance();
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function _burn(address from, uint256 amount) internal {
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }
}

contract KarwanTreasuryTest is Test {
    MockUSDC usdc;
    TestUSYC usyc;
    KarwanTreasury treasury;

    address owner = address(this);
    address keeper = makeAddr("keeper");
    address eve = makeAddr("eve");
    uint256 constant ONE_USDC = 1e6;
    uint256 constant APY_BPS = 500;

    function setUp() public {
        usdc = new MockUSDC();
        usyc = new TestUSYC(address(usdc), APY_BPS);
        // Test wiring: teller, token, and oracle are all the TestUSYC address.
        treasury = new KarwanTreasury(
            address(usdc),
            address(usyc),
            address(usyc),
            address(usyc),
            keeper,
            100 * ONE_USDC // idle threshold
        );
    }

    function _fundTreasury(uint256 amount) internal {
        usdc.mint(address(this), amount);
        usdc.approve(address(treasury), amount);
        treasury.deposit(amount);
    }

    function test_Deposit_PullsUsdc() public {
        _fundTreasury(500 * ONE_USDC);
        assertEq(usdc.balanceOf(address(treasury)), 500 * ONE_USDC);
    }

    function test_Sweep_LeavesIdle_BuysUsyc() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(keeper);
        uint256 usycOut = treasury.sweepToUSYC();
        // 500 held, 100 idle threshold -> sweep 400 into USYC at $1.00.
        assertEq(usycOut, 400 * ONE_USDC);
        assertEq(usdc.balanceOf(address(treasury)), 100 * ONE_USDC);
        assertEq(usyc.balanceOf(address(treasury)), 400 * ONE_USDC);
    }

    function test_TotalReserves_AtPar() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(keeper);
        treasury.sweepToUSYC();
        // 100 idle USDC + 400 USYC marked at $1.00 = 500.
        assertEq(treasury.totalReserves(), 500 * ONE_USDC);
    }

    function test_TotalReserves_GrowsWithYield() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(keeper);
        treasury.sweepToUSYC();
        vm.warp(block.timestamp + 365 days); // USYC +5%
        // 100 idle + 400 * 1.05 = 100 + 420 = 520.
        assertEq(treasury.totalReserves(), 520 * ONE_USDC);
    }

    function test_Redeem_ReturnsUsdcToTreasury() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(keeper);
        treasury.sweepToUSYC(); // 400 USYC held, 100 USDC idle
        treasury.redeemFromUSYC(400 * ONE_USDC); // owner is address(this)
        // Back to 500 USDC at par, 0 USYC.
        assertEq(usdc.balanceOf(address(treasury)), 500 * ONE_USDC);
        assertEq(usyc.balanceOf(address(treasury)), 0);
    }

    function test_Sweep_OnlyKeeperOrOwner() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotKeeper.selector);
        treasury.sweepToUSYC();
        // owner may also sweep.
        treasury.sweepToUSYC();
        assertEq(usyc.balanceOf(address(treasury)), 400 * ONE_USDC);
    }

    function test_Sweep_RevertsWhenNothingAboveThreshold() public {
        _fundTreasury(80 * ONE_USDC); // below the 100 idle threshold
        vm.prank(keeper);
        vm.expectRevert(KarwanTreasury.NothingToSweep.selector);
        treasury.sweepToUSYC();
    }

    function test_Redeem_OnlyOwner() public {
        _fundTreasury(500 * ONE_USDC);
        vm.prank(keeper);
        treasury.sweepToUSYC();
        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotOwner.selector);
        treasury.redeemFromUSYC(100 * ONE_USDC);
    }

    function test_Payout_OnlyOwner_SendsUsdc() public {
        _fundTreasury(500 * ONE_USDC);
        treasury.payout(eve, 50 * ONE_USDC);
        assertEq(usdc.balanceOf(eve), 50 * ONE_USDC);

        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotOwner.selector);
        treasury.payout(eve, 1 * ONE_USDC);
    }

    function test_Constructor_RejectsZeroAddress() public {
        vm.expectRevert(KarwanTreasury.ZeroAddress.selector);
        new KarwanTreasury(address(0), address(usyc), address(usyc), address(usyc), keeper, 0);
    }

    function test_Admin_SetKeeperAndThreshold() public {
        treasury.setKeeper(eve);
        assertEq(treasury.keeper(), eve);
        treasury.setIdleThreshold(42);
        assertEq(treasury.idleThreshold(), 42);
        vm.prank(eve);
        vm.expectRevert(KarwanTreasury.NotOwner.selector);
        treasury.setIdleThreshold(0);
    }
}
