// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {KarwanInvoiceRegistry} from "../src/KarwanInvoiceRegistry.sol";
import {KarwanPOFinancing} from "../src/KarwanPOFinancing.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract POAttackUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
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

/// @notice Internal audit R1b, finding PO-01, against the real contracts. The
///         live testnet PO financing contract is an authorised assigner on the
///         live escrow. fund() never asks the seller: anyone can "finance" any
///         funded deal with a 1-unit advance and a repayment equal to the deal,
///         and the escrow irrevocably pays them ahead of the seller.
contract KarwanPOUnconsentedAttackTest is Test {
    POAttackUSDC usdc;
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    KarwanInvoiceRegistry registry;
    KarwanPOFinancing po;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address attacker = makeAddr("attacker");
    address treasury = makeAddr("treasury");
    bytes32 constant JOB = keccak256("victim-deal");
    uint256 constant DEAL = 1_000e6;

    function setUp() public {
        usdc = new POAttackUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(
            address(usdc), 150, treasury, address(vault), address(rep), 10000,
            KarwanEscrow.YieldConfig({backstop: address(0), operator: address(0), coverageFloor: 0, maxYieldBps: 8000}),
            KarwanEscrow.TimingConfig({
                minReviewWindow: 60,
                maxReviewWindow: 180 days,
                disputeTimeoutSecs: 14 days,
                attestedWindowSecs: 1 days,
                maxDeadlineHorizon: 730 days
            })
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        registry = new KarwanInvoiceRegistry(address(this));
        registry.setEscrow(address(escrow));
        po = new KarwanPOFinancing(address(usdc), address(registry), address(escrow), address(vault));
        escrow.setAssigner(address(po), true);

        usdc.mint(buyer, 10_000e6);
        usdc.mint(attacker, 1);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(attacker);
        usdc.approve(address(po), type(uint256).max);

        uint8[] memory pcts = new uint8[](1);
        pcts[0] = 100;
        vm.prank(buyer);
        escrow.fundEscrow(JOB, seller, DEAL, pcts, 0);
        vm.prank(seller);
        escrow.acceptEscrow(JOB);
    }

    function test_PO01_StrangerCannotFinanceADealTheSellerNeverOffered() public {
        vm.prank(attacker);
        vm.expectRevert();
        po.fund(JOB, 1, uint128(DEAL), 7 days, 0);
    }

    function test_PO01_OnlyTheSellerCanOffer() public {
        bytes32 h = po.offerHash(JOB, 1, uint128(DEAL), 7 days, 0, address(0));
        vm.prank(attacker);
        vm.expectRevert(KarwanPOFinancing.NotParty.selector);
        po.offerFinancing(JOB, h);
    }

    function test_PO01_AnOfferNamedForOneFinancierRefusesAnother() public {
        address chosen = makeAddr("chosen-financier");
        bytes32 h = po.offerHash(JOB, 100e6, 110e6, 7 days, 0, chosen);
        vm.prank(seller);
        po.offerFinancing(JOB, h);

        usdc.mint(attacker, 100e6);
        vm.prank(attacker);
        vm.expectRevert(KarwanPOFinancing.NoMatchingOffer.selector);
        po.fund(JOB, 100e6, 110e6, 7 days, 0);
    }

    function test_PO01_TheOfferedLineFundsAndIsSpent() public {
        address chosen = makeAddr("chosen-financier");
        usdc.mint(chosen, 100e6);
        vm.prank(chosen);
        usdc.approve(address(po), type(uint256).max);
        bytes32 h = po.offerHash(JOB, 100e6, 110e6, 7 days, 0, chosen);
        vm.prank(seller);
        po.offerFinancing(JOB, h);

        vm.prank(chosen);
        po.fund(JOB, 100e6, 110e6, 7 days, 0);
        assertEq(usdc.balanceOf(seller), 100e6, "the seller got the advance they asked for");
        assertEq(po.offerOf(JOB), bytes32(0), "the offer is spent");
    }

    function test_PO01_AWithdrawnOfferCannotBeFunded() public {
        bytes32 h = po.offerHash(JOB, 100e6, 110e6, 7 days, 0, address(0));
        vm.startPrank(seller);
        po.offerFinancing(JOB, h);
        po.withdrawOffer(JOB);
        vm.stopPrank();

        usdc.mint(attacker, 100e6);
        vm.prank(attacker);
        vm.expectRevert(KarwanPOFinancing.NoMatchingOffer.selector);
        po.fund(JOB, 100e6, 110e6, 7 days, 0);
    }

    function test_PO01_SellerIsPaidTheirOwnDeal() public {
        vm.prank(attacker);
        try po.fund(JOB, 1, uint128(DEAL), 7 days, 0) {} catch {}

        vm.prank(buyer);
        escrow.releaseFinal(JOB);
        assertGt(usdc.balanceOf(seller), DEAL / 2, "the seller receives their payout");
        assertLe(usdc.balanceOf(attacker), 1, "a stranger receives nothing");
    }
}
