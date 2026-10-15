// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KarwanHub} from "../../../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {KarwanAgreementEscrow} from "../../../src/suite/KarwanAgreementEscrow.sol";
import {AgreementTerms, AgreementBounds} from "../../../src/suite/agreement/AgreementTypes.sol";

/// @notice An Agreement deal end to end on Arc's own USDC, against Arc
///         Foundry forking Arc testnet (`forge-remote.sh --arc`).
contract ArcAgreementTest is Test {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    address internal constant BLOCKED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    KarwanHub internal hub;
    KarwanAgreementEscrow internal escrow;
    address internal buyer;
    uint256 internal buyerKey;
    address internal seller = makeAddr("arcSeller");

    function setUp() public {
        if (!vm.envOr("ARC_FORK", false)) vm.skip(true);
        (buyer, buyerKey) = makeAddrAndKey("arcBuyer");
        hub = new KarwanHub(address(this));
        KarwanIdentityRegistry identity = new KarwanIdentityRegistry(address(hub));
        KarwanRecord record = new KarwanRecord(address(hub));
        hub.wire(address(identity), address(record), makeAddr("stakeVault"));
        escrow = new KarwanAgreementEscrow(address(hub), AgreementBounds(1 hours, 30 days, 365 days));
        hub.setFeeRecipient(makeAddr("fee"));
        hub.setGuardian(makeAddr("guardian"));
        hub.setReviewers(makeAddr("review"), makeAddr("senior"));
        hub.setAsset(address(USDC), true, 5_000e6);
        hub.registerFamily(address(escrow), 100);
        hub.setCaps(address(escrow), address(USDC), 1_000e6, 10_000e6);
        vm.deal(buyer, 1_000 ether);
        vm.prank(buyer);
        USDC.approve(address(escrow), type(uint256).max);
    }

    function _terms(address to) internal view returns (AgreementTerms memory t) {
        t.asset = address(USDC);
        t.seller = to;
        t.amount = 100e6;
        t.trancheBps[0] = 10_000;
        t.acceptBy = uint64(block.timestamp + 1 days);
        t.deliveryDeadline = uint64(block.timestamp + 10 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = 2 days;
        t.silentLongstop = 5 days;
        t.agreementHash = keccak256("arc");
    }

    function test_fund_accept_release_on_arc_usdc() public {
        AgreementTerms memory t = _terms(seller);
        vm.prank(buyer);
        bytes32 id = escrow.fund(bytes32("arc"), t);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(USDC.balanceOf(seller), 99.5e6);
        assertEq(USDC.balanceOf(address(escrow)), 0);
    }

    function test_signed_release_on_arc_chain_id() public {
        AgreementTerms memory t = _terms(seller);
        vm.prank(buyer);
        bytes32 id = escrow.fund(bytes32("arc-signed"), t);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(buyerKey, escrow.releaseDigest(id, 0, deadline));
        escrow.releaseBySig(id, 0, deadline, abi.encodePacked(r, s, v));
        assertEq(USDC.balanceOf(seller), 99.5e6);
    }

    function test_release_to_a_blocklisted_seller_becomes_owed_on_arc() public {
        AgreementTerms memory t = _terms(BLOCKED);
        vm.prank(buyer);
        bytes32 id = escrow.fund(bytes32("arc-blocked"), t);
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(BLOCKED);
        escrow.accept(id, h);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(escrow.owed(address(USDC), BLOCKED), 99.5e6);
        assertEq(USDC.balanceOf(address(escrow)), 99.5e6);
    }
}
