// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms} from "../../../src/suite/agreement/AgreementTypes.sol";

/// @notice An Agreement deal whose money sat in the yield pool settles exactly
///         as one that never left the escrow.
contract AgreementYieldTest is AgreementFixture {
    uint128 internal constant BIG = 50_000e6;

    function setUp() public {
        _deployAgreement();
        hub.setAsset(address(usdc), true, 1_000_000e6);
        hub.setCaps(address(escrow), address(usdc), 100_000e6, 1_000_000e6);
        _deployYield(address(escrow), 9_000);
    }

    function _big() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.amount = BIG;
    }

    /// Parks the deal's eligible share and subscribes the pool; returns what
    /// the deal holds.
    function _parked(bytes32 id) internal returns (uint256 held) {
        held = escrow.accountOf(id).balance;
        escrow.rebalanceYield(address(usdc));
        pool.rebalance();
        assertEq(escrow.accountOf(id).yieldBps, 9_000);
        assertEq(escrow.parked(address(usdc)), (held * 9_000) / 10_000);
        assertGt(teller.share_().balanceOf(address(pool)), 0);
    }

    function _paidOut() internal view returns (uint256) {
        return usdc.balanceOf(seller) + escrow.owed(address(usdc), seller) + usdc.balanceOf(feeSafe)
            + escrow.owed(address(usdc), feeSafe);
    }

    function test_a_release_pays_the_seller_and_the_fee_in_full_from_parked_money() public {
        bytes32 id = _fundAccepted(_big(), bytes32("y"));
        uint256 held = _parked(id);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(usdc.balanceOf(seller) + usdc.balanceOf(feeSafe), held);
        assertGt(usdc.balanceOf(feeSafe), 0);
        assertEq(escrow.parked(address(usdc)), 0);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_a_refund_returns_the_buyer_everything_from_parked_money() public {
        AgreementTerms memory t = _big();
        bytes32 id = _fundAccepted(t, bytes32("y"));
        uint256 held = _parked(id);
        uint256 before = usdc.balanceOf(buyer);
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        escrow.reclaim(id);
        assertEq(usdc.balanceOf(buyer), before + held);
        assertEq(escrow.parked(address(usdc)), 0);
    }

    function test_a_paused_teller_leaves_the_release_owed_and_paid_later() public {
        bytes32 id = _fundAccepted(_big(), bytes32("y"));
        uint256 held = _parked(id);
        teller.setPaused(true);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(_paidOut(), held);
        assertGt(escrow.owed(address(usdc), seller), 0);
        teller.setPaused(false);
        vm.prank(seller);
        escrow.withdrawOwed(address(usdc));
        assertEq(usdc.balanceOf(seller) + usdc.balanceOf(feeSafe), held);
    }
}
