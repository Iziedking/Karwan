// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms} from "../../../src/suite/agreement/AgreementTypes.sol";
import {KarwanSettlementBase} from "../../../src/suite/KarwanSettlementBase.sol";
import {BlocklistToken} from "../mocks/BlocklistToken.sol";
import {ReenteringToken} from "../mocks/ReenteringToken.sol";

/// @notice Every guarded Agreement step that moves money is closed to
///         re-entry: a token that calls back into the escrow in the middle of
///         a payment is refused by the guard, whatever step it calls.
contract AgreementReentrancyTest is AgreementFixture {
    function setUp() public {
        _deployAgreement();
    }

    function _newToken() internal override returns (BlocklistToken) {
        return new ReenteringToken();
    }

    /// The next move of the token calls back into the escrow.
    function _arm() internal {
        ReenteringToken(address(usdc)).arm(
            address(escrow), abi.encodeCall(KarwanSettlementBase.withdrawOwed, (address(usdc)))
        );
    }

    function _assertRefused() internal view {
        ReenteringToken t = ReenteringToken(address(usdc));
        assertTrue(t.attempted());
        assertFalse(t.succeeded());
        assertEq(t.reason(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
    }

    function _plan() internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.parts = 4;
        t.partEvery = 7 days;
        t.cancelFeeBps = 1_000;
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
    }

    function _disputed(AgreementTerms memory t) internal returns (bytes32 id) {
        id = _fundAccepted(t, bytes32("d"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause 2"));
    }

    function test_funding_is_closed_to_reentry() public {
        _arm();
        _fund(_terms(), bytes32("r"));
        _assertRefused();
    }

    function test_paying_a_part_is_closed_to_reentry() public {
        bytes32 id = _fund(_plan(), bytes32("r"));
        _arm();
        vm.prank(buyer);
        escrow.payPart(id);
        _assertRefused();
    }

    function test_cancelling_a_missed_plan_is_closed_to_reentry() public {
        uint256 t0 = vm.getBlockTimestamp();
        AgreementTerms memory t = _plan();
        bytes32 id = _fund(t, bytes32("r"));
        vm.warp(t0 + 7 days + t.reclaimGrace + 1);
        _arm();
        vm.prank(stranger);
        escrow.cancelMissed(id);
        _assertRefused();
    }

    function test_cancelling_before_acceptance_is_closed_to_reentry() public {
        bytes32 id = _fund(_terms(), bytes32("r"));
        _arm();
        vm.prank(buyer);
        escrow.cancelUnaccepted(id);
        _assertRefused();
    }

    function test_releasing_is_closed_to_reentry() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        _arm();
        vm.prank(buyer);
        escrow.release(id);
        _assertRefused();
    }

    function test_a_signed_release_is_closed_to_reentry() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes memory sig = _sig(buyerKey, escrow.releaseDigest(id, 0, deadline));
        _arm();
        vm.prank(stranger);
        escrow.releaseBySig(id, 0, deadline, sig);
        _assertRefused();
    }

    function test_claiming_is_closed_to_reentry() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        _deliver(id);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        _arm();
        vm.prank(stranger);
        escrow.claim(id);
        _assertRefused();
    }

    function test_reclaiming_is_closed_to_reentry() public {
        AgreementTerms memory t = _terms();
        bytes32 id = _fundAccepted(t, bytes32("r"));
        vm.warp(uint256(t.deliveryDeadline) + t.reclaimGrace + 1);
        _arm();
        vm.prank(buyer);
        escrow.reclaim(id);
        _assertRefused();
    }

    function test_accepting_a_split_is_closed_to_reentry() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        vm.prank(buyer);
        escrow.proposeSplit(id, 2_500);
        _arm();
        vm.prank(seller);
        escrow.acceptSplit(id, 2_500);
        _assertRefused();
    }

    function test_executing_a_ruling_is_closed_to_reentry() public {
        bytes32 id = _disputed(_terms());
        vm.prank(arbiter);
        escrow.proposeRuling(id, 0, bytes32(0));
        vm.warp(vm.getBlockTimestamp() + 72 hours);
        _arm();
        vm.prank(stranger);
        escrow.executeRuling(id);
        _assertRefused();
    }

    function test_the_reviewers_ruling_is_closed_to_reentry() public {
        bytes32 id = _disputed(_terms());
        vm.prank(arbiter);
        escrow.escalate(id);
        _arm();
        vm.prank(reviewSafe);
        escrow.rule(id, 10_000, bytes32(0));
        _assertRefused();
    }

    function test_the_fallback_is_closed_to_reentry() public {
        AgreementTerms memory t = _terms();
        t.fallbackBps = 5_000;
        bytes32 id = _disputed(t);
        vm.prank(arbiter);
        escrow.escalate(id);
        vm.warp(vm.getBlockTimestamp() + 5 days);
        _arm();
        vm.prank(stranger);
        escrow.applyFallback(id);
        _assertRefused();
    }

    function test_withdrawing_an_owed_payout_is_closed_to_reentry() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        usdc.setBlocked(seller, true);
        vm.prank(buyer);
        escrow.release(id);
        usdc.setBlocked(seller, false);
        _arm();
        vm.prank(seller);
        escrow.withdrawOwed(address(usdc));
        _assertRefused();
    }

    function test_the_longstop_is_closed_to_reentry() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("r"));
        vm.warp(uint256(escrow.accountOf(id).horizon) + escrow.LONGSTOP());
        uint256[] memory toPayees = new uint256[](1);
        uint256 balance = escrow.accountOf(id).balance;
        _arm();
        vm.prank(seniorSafe);
        escrow.longstopSplit(id, balance, toPayees);
        _assertRefused();
    }
}
