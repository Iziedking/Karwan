// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanEscrow, IERC20} from "../src/KarwanEscrow.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        override
        returns (bool)
    {
        if (allowance[from][msg.sender] < type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract KarwanEscrowTest is Test {
    KarwanEscrow escrow;
    MockUSDC usdc;
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    bytes32 constant JOB_ID = keccak256("job-1");

    // 1.5% fee, split evenly: buyer funds dealAmount + 0.75%, seller nets dealAmount - 0.75%.
    uint16 constant FEE_BPS = 150;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new KarwanEscrow(address(usdc), FEE_BPS, treasury);
        usdc.mint(buyer, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _twoMilestones(uint8 a, uint8 b) internal pure returns (uint8[] memory pcts) {
        pcts = new uint8[](2);
        pcts[0] = a;
        pcts[1] = b;
    }

    function test_FundEscrow_PullsDealAmountPlusBuyerFeeHalf() public {
        // 500e18 deal, 1.5% fee => feeTotal 7.5e18, buyer half 3.75e18.
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50));
        assertEq(usdc.balanceOf(address(escrow)), 503.75e18);
    }

    function test_ReleaseProgress_SplitsSellerAndTreasury() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(40, 60));

        // sellerNet = 496.25e18, feeTotal = 7.5e18.
        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 0); // 40%
        assertEq(usdc.balanceOf(seller), 198.5e18); // 496.25e18 * 40%
        assertEq(usdc.balanceOf(treasury), 3e18); // 7.5e18 * 40%

        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 1); // final, sweeps remainder
        assertEq(usdc.balanceOf(seller), 496.25e18);
        assertEq(usdc.balanceOf(treasury), 7.5e18);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_ReleaseFinal_SweepsEverything() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(20, 80));

        vm.prank(buyer);
        escrow.releaseFinal(JOB_ID);
        assertEq(usdc.balanceOf(seller), 496.25e18);
        assertEq(usdc.balanceOf(treasury), 7.5e18);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Refund_ReturnsUnreleasedToBuyer() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(20, 80));

        vm.prank(buyer);
        escrow.releaseProgress(JOB_ID, 0); // seller gets 20% of sellerNet, treasury 20% of fee

        vm.prank(seller);
        escrow.dispute(JOB_ID, "ipfs://reason");

        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.refund(JOB_ID);
        // Escrow drains fully: buyer recovers everything not yet released.
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertGt(usdc.balanceOf(buyer), buyerBefore);
    }

    function test_Refund_RevertsForNonBuyer() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(20, 80));
        vm.prank(seller);
        escrow.dispute(JOB_ID, "ipfs://reason");

        // The seller raised the dispute, but they can't refund — only the
        // buyer can pull funds back to themselves, so a third party can't
        // grief by pre-empting an off-chain resolution.
        vm.expectRevert();
        vm.prank(seller);
        escrow.refund(JOB_ID);
    }

    function test_ZeroFeeDeployment_BehavesLikeNoFee() public {
        KarwanEscrow noFee = new KarwanEscrow(address(usdc), 0, treasury);
        vm.prank(buyer);
        usdc.approve(address(noFee), type(uint256).max);

        vm.prank(buyer);
        noFee.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50));
        assertEq(usdc.balanceOf(address(noFee)), 500e18);

        vm.prank(buyer);
        noFee.releaseProgress(JOB_ID, 0);
        vm.prank(buyer);
        noFee.releaseProgress(JOB_ID, 1);
        assertEq(usdc.balanceOf(seller), 500e18);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_FundEscrow_RevertsOnInvalidMilestones() public {
        vm.prank(buyer);
        vm.expectRevert(KarwanEscrow.InvalidMilestones.selector);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(30, 50));
    }

    function test_Constructor_RevertsOnZeroTreasury() public {
        vm.expectRevert(KarwanEscrow.InvalidTreasury.selector);
        new KarwanEscrow(address(usdc), FEE_BPS, address(0));
    }

    function test_Constructor_RevertsOnFeeTooHigh() public {
        vm.expectRevert(KarwanEscrow.FeeTooHigh.selector);
        new KarwanEscrow(address(usdc), 1001, treasury);
    }

    function test_ReleaseProgress_RevertsForNonBuyer() public {
        vm.prank(buyer);
        escrow.fundEscrow(JOB_ID, seller, 500e18, _twoMilestones(50, 50));
        vm.prank(seller);
        vm.expectRevert(KarwanEscrow.NotBuyer.selector);
        escrow.releaseProgress(JOB_ID, 0);
    }
}
