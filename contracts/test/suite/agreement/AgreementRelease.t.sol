// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementDeliveryLib} from "../../../src/suite/agreement/AgreementDeliveryLib.sol";
import {Wallet1271} from "../mocks/Wallet1271.sol";

/// @notice The buyer taps "Received": their wallet signs a release for one
///         tranche, and anyone carries it on chain.
contract AgreementReleaseTest is AgreementFixture {
    function setUp() public {
        _deployAgreement();
    }

    function _signed(uint256 key, bytes32 id, uint8 tranche, uint256 deadline) internal view returns (bytes memory) {
        return _sig(key, escrow.releaseDigest(id, tranche, deadline));
    }

    function test_a_signed_release_pays_the_seller_and_anyone_submits_it() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signed(buyerKey, id, 0, deadline);
        vm.prank(stranger);
        escrow.releaseBySig(id, 0, deadline, sig);
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
    }

    function test_a_signature_from_anyone_but_the_buyer_is_refused() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        uint256 deadline = block.timestamp + 1 hours;
        (, uint256 strangerKey) = makeAddrAndKey("forger");
        bytes memory forged = _signed(strangerKey, id, 0, deadline);
        vm.expectRevert(AgreementLib.BadSignature.selector);
        escrow.releaseBySig(id, 0, deadline, forged);
        bytes memory bySeller = _signed(sellerKey, id, 0, deadline);
        vm.expectRevert(AgreementLib.BadSignature.selector);
        escrow.releaseBySig(id, 0, deadline, bySeller);
    }

    function test_a_signed_release_pays_one_tranche_once() public {
        AgreementTerms memory t = _terms();
        t.trancheBps[0] = 5_000;
        t.trancheBps[1] = 5_000;
        bytes32 id = _fundAccepted(t, bytes32("r"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signed(buyerKey, id, 0, deadline);
        escrow.releaseBySig(id, 0, deadline, sig);
        vm.expectRevert(AgreementLib.HashMismatch.selector);
        escrow.releaseBySig(id, 0, deadline, sig);
        vm.expectRevert(AgreementLib.BadSignature.selector);
        escrow.releaseBySig(id, 1, deadline, sig);
        assertEq(usdc.balanceOf(seller), (PRICE - 0.5e6) / 2);
    }

    function test_a_signature_for_another_deal_is_refused() public {
        bytes32 first = _fundAccepted(_terms(), bytes32("r1"));
        bytes32 second = _fundAccepted(_terms(), bytes32("r2"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signed(buyerKey, first, 0, deadline);
        vm.expectRevert(AgreementLib.BadSignature.selector);
        escrow.releaseBySig(second, 0, deadline, sig);
    }

    function test_a_signature_from_another_chain_is_refused() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signed(buyerKey, id, 0, deadline);
        vm.chainId(block.chainid + 1);
        vm.expectRevert(AgreementLib.BadSignature.selector);
        escrow.releaseBySig(id, 0, deadline, sig);
    }

    function test_an_expired_signature_is_refused() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signed(buyerKey, id, 0, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(AgreementLib.Late.selector);
        escrow.releaseBySig(id, 0, deadline, sig);
    }

    function test_a_compact_signature_works() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        uint256 deadline = block.timestamp + 1 hours;
        (bytes32 r, bytes32 vs) = vm.signCompact(buyerKey, escrow.releaseDigest(id, 0, deadline));
        escrow.releaseBySig(id, 0, deadline, abi.encodePacked(r, vs));
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
    }

    function test_a_smart_wallet_buyer_signs_through_erc1271() public {
        (address owner, uint256 ownerKey) = makeAddrAndKey("walletOwner");
        Wallet1271 wallet = new Wallet1271(owner);
        usdc.mint(address(wallet), 1_000e6);
        AgreementTerms memory t = _terms();
        vm.startPrank(owner);
        wallet.execute(address(usdc), abi.encodeCall(usdc.approve, (address(escrow), type(uint256).max)));
        bytes memory out = wallet.execute(address(escrow), abi.encodeCall(escrow.fund, (bytes32("w"), t)));
        vm.stopPrank();
        bytes32 id = abi.decode(out, (bytes32));
        bytes32 h = escrow.termsHashOf(t);
        vm.prank(seller);
        escrow.accept(id, h);
        uint256 deadline = block.timestamp + 1 hours;
        escrow.releaseBySig(id, 0, deadline, _signed(ownerKey, id, 0, deadline));
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
    }

    function test_a_hold_does_not_stop_the_buyers_signed_release() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        vm.prank(guardian);
        escrow.hold(id, bytes32("check"));
        uint256 deadline = block.timestamp + 1 hours;
        escrow.releaseBySig(id, 0, deadline, _signed(buyerKey, id, 0, deadline));
        assertEq(usdc.balanceOf(seller), PRICE - 0.5e6);
    }

    function test_a_signed_release_before_acceptance_is_refused() public {
        bytes32 id = _fund(_terms(), bytes32("r"));
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signed(buyerKey, id, 0, deadline);
        vm.expectRevert(AgreementDeliveryLib.BadState.selector);
        escrow.releaseBySig(id, 0, deadline, sig);
    }
}
