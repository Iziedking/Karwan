// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanTreasury} from "../src/KarwanTreasury.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address s, uint256 a) external override returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external override returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external override returns (bool) {
        if (allowance[f][msg.sender] < type(uint256).max) allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

/// NAV-ramping USYC/teller double, externally funded so yield is realisable.
contract YieldUSYC {
    uint8 public constant decimals = 6;
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
        uint256 e = block.timestamp - startedAt;
        return SCALE + (SCALE * apyBps * e) / (10_000 * 365 days);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, int256(price() * 1e12), block.timestamp, block.timestamp, 1);
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        usdc.transferFrom(msg.sender, address(this), assets);
        shares = (assets * SCALE) / price();
        balanceOf[receiver] += shares;
    }

    function redeem(uint256 shares, address receiver, address account) external returns (uint256 assets) {
        if (account != msg.sender && allowance[account][msg.sender] != type(uint256).max) {
            allowance[account][msg.sender] -= shares;
        }
        balanceOf[account] -= shares;
        assets = (shares * price()) / SCALE;
        uint256 held = usdc.balanceOf(address(this));
        if (assets > held) assets = held;
        usdc.transfer(receiver, assets);
    }
}

/// @title Escrow <-> Treasury yield integration
/// @notice The real KarwanEscrow and KarwanTreasury, wired together, prove the
///         end-to-end path: a deal's escrowed USDC is swept to the Treasury,
///         wrapped into USYC to earn, and every settlement pays each party the
///         exact same amount it would with no yield — the yield staying with
///         the Treasury.
contract KarwanEscrowTreasuryIntegrationTest is Test {
    MockUSDC usdc;
    YieldUSYC usyc;
    KarwanEscrow escrow;
    KarwanTreasury treasury;
    KarwanVault vault;
    KarwanReputation rep;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address keeper = makeAddr("keeper");
    address arbiter = makeAddr("arbiter");
    bytes32 constant JOB = keccak256("integration-job");

    uint16 constant FEE_BPS = 150;
    uint256 constant U = 1e6;
    // 5000 USDC deal at 1.5% fee (75 USDC): sellerNet 4962.5, funded 5037.5.
    uint256 constant DEAL = 5000 * U;
    uint256 constant SELLER_NET = 4962_500000;
    uint256 constant FUNDED = 5037_500000;
    uint256 constant FEE_TOTAL = 75 * U;

    function setUp() public {
        usdc = new MockUSDC();
        usyc = new YieldUSYC(address(usdc), 1000); // 10% APY
        usdc.mint(address(usyc), 100_000 * U); // back the yield

        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        // Treasury is the escrow's fee sink AND yield backstop.
        treasury = new KarwanTreasury(
            address(usdc), address(usyc), address(usyc), address(usyc), keeper, 0
        );
        escrow = new KarwanEscrow(
            address(usdc), FEE_BPS, address(treasury), address(vault), address(rep), 10000
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        escrow.setArbiter(arbiter);

        // Wire the two-way yield relationship.
        treasury.setEscrow(address(escrow));
        escrow.setYieldBackstop(address(treasury));
        escrow.setYieldOperator(keeper);
        escrow.setMaxYieldBps(10000);

        usdc.mint(buyer, FUNDED);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _pcts() internal pure returns (uint8[] memory p) {
        p = new uint8[](2);
        p[0] = 50;
        p[1] = 50;
    }

    /// Full lifecycle with the escrow float earning real USYC yield in the
    /// Treasury: fund -> sweep -> wrap -> (time) -> release both milestones.
    /// The seller is paid exactly SELLER_NET and the Treasury keeps the yield.
    function test_Integration_FloatEarnsYield_SellerPaidExactly() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB, seller, DEAL, _pcts(), 0);
        vm.prank(seller);
        escrow.acceptEscrow(JOB);

        // Keeper sweeps most of the escrow's idle USDC into the Treasury and
        // wraps it into USYC. Leave a small buffer for the first release.
        vm.prank(keeper);
        escrow.sweepIdle(4500 * U);
        assertEq(treasury.escrowFloat(), 4500 * U, "treasury booked the float");
        vm.prank(keeper);
        treasury.sweepToUSYC(); // wrap the float into USYC to earn
        assertGt(usyc.balanceOf(address(treasury)), 0, "float wrapped, earning");

        // Half a year of yield accrues.
        vm.warp(block.timestamp + 182 days);

        // Buyer releases both milestones. The escrow pulls liquidity back from
        // the Treasury (unwrapping as needed) and pays the seller exactly.
        vm.prank(buyer);
        escrow.releaseProgress(JOB, 0);
        vm.prank(buyer);
        escrow.releaseProgress(JOB, 1);

        assertEq(usdc.balanceOf(seller), SELLER_NET, "seller paid exactly, yield-neutral");
        assertEq(escrow.escrowedTotal(), 0, "escrow liability cleared");
        assertEq(treasury.escrowFloat(), 0, "all float returned to the escrow");
        // The Treasury kept the fee (75) plus the realised yield on the float.
        assertGe(
            treasury.totalReserves(),
            FEE_TOTAL,
            "treasury holds at least the fee; yield surplus on top"
        );
    }

    /// A refund path with funds in yield returns the buyer exactly the funded
    /// amount, unwrapping from the Treasury.
    function test_Integration_ReclaimExactAfterYield() public {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB, seller, DEAL, _pcts(), 0,
            KarwanEscrow.Timing({deliveryDeadline: uint64(block.timestamp) + 10 days, reviewWindow: 0, reclaimGrace: 1 days})
        );
        vm.prank(seller);
        escrow.acceptEscrow(JOB);

        vm.prank(keeper);
        escrow.sweepIdle(5000 * U);
        vm.prank(keeper);
        treasury.sweepToUSYC();

        vm.warp(block.timestamp + 11 days + 1);
        vm.prank(buyer);
        escrow.reclaimAfterDeadline(JOB, address(0));

        assertEq(usdc.balanceOf(buyer), FUNDED, "buyer principal exact after yield");
        assertEq(treasury.escrowFloat(), 0, "float cleared");
    }
}
