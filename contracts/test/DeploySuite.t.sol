// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {DeploySuite} from "../script/DeploySuite.s.sol";
import {DealTerms} from "../src/KarwanDealTypes.sol";
import {BlockUSDC} from "./KarwanDealEscrow.t.sol";

/// @notice Runs the real deployment in-process and checks the wiring, the
///         handover to the timelock, and a deal end to end.
contract DeploySuiteTest is Test {
    DeploySuite script;
    DeploySuite.Suite s;
    BlockUSDC usdc;
    address timelock = makeAddr("timelock");
    address feeSafe = makeAddr("fee-safe");
    address reviewSafe = makeAddr("review-safe");
    address seniorSafe = makeAddr("senior-safe");
    address guardian = makeAddr("guardian");
    address engine = makeAddr("engine");
    address financeSigner = makeAddr("finance-signer");
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");

    function setUp() public {
        usdc = new BlockUSDC();
        script = new DeploySuite();
        DeploySuite.Config memory c = DeploySuite.Config({
            usdc: address(usdc),
            owner: timelock,
            feeSafe: feeSafe,
            reviewSafe: reviewSafe,
            seniorSafe: seniorSafe,
            guardian: guardian,
            autoArbiter: engine,
            financeSigner: financeSigner,
            feeBps: 150,
            dealCap: 1_000e6,
            totalCap: 25_000e6,
            highValue: 5_000e6,
            teller: address(0),
            usyc: address(0),
            oracle: address(0),
            priceDecimals: 8,
            bounds: script.defaultBounds()
        });
        s = script.deploy(c, address(script));
    }

    function _accept() internal {
        vm.startPrank(timelock);
        s.pool.acceptOwnership();
        s.vault.acceptOwnership();
        s.escrow.acceptOwnership();
        s.reputation.acceptOwnership();
        vm.stopPrank();
    }

    function test_EverythingIsWired() public view {
        assertTrue(s.pool.isClient(address(s.escrow)));
        assertTrue(s.pool.isClient(address(s.vault)));
        assertEq(s.pool.treasury(), feeSafe);
        assertTrue(s.vault.isConsumer(address(s.escrow)));
        assertEq(address(s.vault.pool()), address(s.pool));
        assertEq(s.vault.guardian(), guardian);
        assertEq(s.reputation.escrow(), address(s.escrow));
        assertTrue(s.reputation.backfillLocked(), "no backfill on a fresh mainnet deploy");
        assertEq(address(s.escrow.reputation()), address(s.reputation));
        assertEq(s.escrow.treasury(), feeSafe);
        assertEq(s.escrow.reviewSafe(), reviewSafe);
        assertEq(s.escrow.seniorSafe(), seniorSafe);
        assertEq(s.escrow.autoArbiter(), engine);
        assertEq(s.escrow.guardian(), guardian);
        assertEq(address(s.escrow.pool()), address(s.pool));
        assertEq(s.escrow.feeBps(), 150);
        assertEq(s.escrow.dealCap(), 1_000e6);
        assertTrue(s.escrow.newDealsPaused(), "starts paused");
    }

    function test_DeployerKeepsNoReputationAdminSlots() public view {
        assertEq(s.reputation.penaltyAdmin(), address(0), "penalty signer slot burned");
        assertEq(s.reputation.financeAdmin(), address(0), "finance signer slot burned");
        assertEq(s.reputation.securityAgentSigner(), guardian);
        assertEq(s.reputation.financeSigner(), financeSigner);
    }

    function test_OwnershipGoesToTheTimelockAndTheDeployerKeepsNothing() public {
        assertEq(s.pool.pendingOwner(), timelock);
        assertEq(s.vault.pendingOwner(), timelock);
        assertEq(s.escrow.pendingOwner(), timelock);
        assertEq(s.reputation.pendingOwner(), timelock);
        _accept();
        assertEq(s.pool.owner(), timelock);
        assertEq(s.escrow.owner(), timelock);
        vm.prank(address(script));
        vm.expectRevert();
        s.escrow.setFeeBps(1_000);
    }

    function test_ADealRunsEndToEndAfterGoLive() public {
        _accept();
        vm.prank(timelock);
        s.escrow.resumeNewDeals();

        DealTerms memory t;
        t.seller = seller;
        t.amount = 1_000e6;
        t.pcts[0] = 100;
        t.deliveryDeadline = uint64(block.timestamp + 10 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = 1 days;
        t.silentLongstop = 5 days;
        t.agreementHash = keccak256("agreement");
        usdc.mint(buyer, 2_000e6);
        vm.startPrank(buyer);
        usdc.approve(address(s.escrow), type(uint256).max);
        bytes32 id = s.escrow.fund(keccak256("first"), t);
        vm.stopPrank();
        bytes32 h = s.escrow.termsHashOf(t);
        vm.prank(seller);
        s.escrow.accept(id, h);
        vm.prank(seller);
        s.escrow.markDelivered(id, keccak256("proof"));
        vm.prank(buyer);
        s.escrow.release(id);
        assertEq(usdc.balanceOf(seller), 992.5e6);
        assertEq(usdc.balanceOf(feeSafe), 15e6);
    }

    function test_GuardedBetaCapHolds() public {
        _accept();
        vm.prank(timelock);
        s.escrow.resumeNewDeals();
        DealTerms memory t;
        t.seller = seller;
        t.amount = 1_000e6 + 1;
        t.pcts[0] = 100;
        t.reviewWindow = 1 days;
        t.silentLongstop = 5 days;
        t.agreementHash = keccak256("a");
        usdc.mint(buyer, 2_000e6);
        vm.startPrank(buyer);
        usdc.approve(address(s.escrow), type(uint256).max);
        vm.expectRevert(abi.encodeWithSignature("BadAmount()"));
        s.escrow.fund(keccak256("big"), t);
        vm.stopPrank();
    }
}
