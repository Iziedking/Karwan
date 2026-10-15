// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreFixture} from "./CreFixture.sol";
import {KarwanCheckVerifier} from "../../../src/suite/KarwanCheckVerifier.sol";
import {IKarwanCreAdapter} from "../../../src/suite/interfaces/IKarwanCreAdapter.sol";

contract CreAdapterCheckTest is CreFixture {
    function setUp() public {
        _deployCre();
    }

    function _deliveredDeal(address verifier) internal returns (bytes32 id) {
        id = _fundAccepted(_checkedTerms(verifier), "s1");
        _deliver(id);
    }

    function _report(address verifier, bytes32 id, uint32 revision, bool pass) internal {
        _send(1, abi.encode(verifier, address(escrow), id, revision, pass, EVIDENCE));
    }

    function _reportAsChecker(KarwanCheckVerifier v, bytes32 id, uint32 revision, bool pass) internal {
        bytes32 d = v.reportDigest(address(escrow), id, revision, pass, EVIDENCE);
        address[] memory s = new address[](1);
        s[0] = checker;
        bytes[] memory sig = new bytes[](1);
        sig[0] = _sig(checkerKey, d);
        v.report(address(escrow), id, revision, pass, EVIDENCE, s, sig);
    }

    function test_digest_matches_the_verifier() public view {
        assertEq(
            adapter.checkDigest(address(verifierCK), address(escrow), DEAL, 3, true, EVIDENCE),
            verifierCK.reportDigest(address(escrow), DEAL, 3, true, EVIDENCE)
        );
        assertEq(
            adapter.checkDigest(address(verifierK), address(family), DEAL, 7, false, EVIDENCE),
            verifierK.reportDigest(address(family), DEAL, 7, false, EVIDENCE)
        );
    }

    function test_a_pass_through_cre_attests_and_starts_review() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        _report(address(verifierCK), id, 1, true);
        assertTrue(forwarder.lastOk());
        assertTrue(_deal(id).checkPassed);
        assertGt(_deal(id).reviewEnd, 0);
        (bool set, bool pass, bytes32 evidence) = adapter.verdictOf(adapter.verdictKey(address(verifierCK), address(escrow), id, 1));
        assertTrue(set);
        assertTrue(pass);
        assertEq(evidence, EVIDENCE);
    }

    function test_a_fail_through_cre_keeps_the_claim_closed_and_lets_the_buyer_reclaim() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        _report(address(verifierCK), id, 1, false);
        assertTrue(_deal(id).checkFailed);
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert();
        escrow.claim(id);
        uint256 before = usdc.balanceOf(buyer);
        escrow.reclaim(id);
        assertGt(usdc.balanceOf(buyer), before);
    }

    function test_a_second_different_result_for_one_delivery_is_refused() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        _report(address(verifierCK), id, 1, false);
        vm.expectEmit(true, true, true, true, address(adapter));
        emit IKarwanCreAdapter.CheckRefused(address(verifierCK), address(escrow), id, 1);
        _report(address(verifierCK), id, 1, true);
        assertTrue(_deal(id).checkFailed);
        assertFalse(_deal(id).checkPassed);
        assertFalse(adapter.approved(adapter.checkDigest(address(verifierCK), address(escrow), id, 1, true, EVIDENCE)));
    }

    function test_nobody_can_replay_an_approval_over_a_later_result() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        _report(address(verifierCK), id, 1, false);
        address[] memory s = new address[](1);
        s[0] = address(adapter);
        bytes[] memory sig = new bytes[](1);
        vm.prank(stranger);
        vm.expectRevert(KarwanCheckVerifier.BadSigners.selector);
        verifierCK.report(address(escrow), id, 1, true, EVIDENCE, s, sig);
    }

    function test_a_stranger_resubmitting_the_approved_result_is_refused() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        _report(address(verifierCK), id, 1, false);
        address[] memory s = new address[](1);
        s[0] = address(adapter);
        bytes[] memory sig = new bytes[](1);
        vm.prank(stranger);
        vm.expectRevert(KarwanCheckVerifier.AlreadyReported.selector);
        verifierCK.report(address(escrow), id, 1, false, EVIDENCE, s, sig);
        assertTrue(_deal(id).checkFailed);
        assertFalse(_deal(id).checkPassed);
    }

    function test_an_approval_never_validates_for_another_verifier_or_family() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        _report(address(verifierCK), id, 1, true);
        bytes32 d = adapter.checkDigest(address(verifierCK), address(escrow), id, 1, true, EVIDENCE);
        assertEq(adapter.isValidSignature(d, ""), bytes4(0x1626ba7e));
        bytes32 otherVerifier = adapter.checkDigest(address(verifierK), address(escrow), id, 1, true, EVIDENCE);
        assertEq(adapter.isValidSignature(otherVerifier, ""), bytes4(0xffffffff));
        bytes32 otherFamily = adapter.checkDigest(address(verifierCK), address(family), id, 1, true, EVIDENCE);
        assertEq(adapter.isValidSignature(otherFamily, ""), bytes4(0xffffffff));
    }

    function test_karwan_checker_cannot_turn_a_cre_fail_into_a_pass() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        _report(address(verifierCK), id, 1, false);
        assertTrue(_deal(id).checkFailed);
        vm.expectRevert(KarwanCheckVerifier.AlreadyReported.selector);
        this.reportAsCheckerExternal(id, true);
        assertFalse(_deal(id).checkPassed);
    }

    function reportAsCheckerExternal(bytes32 id, bool pass) external {
        _reportAsChecker(verifierCK, id, 1, pass);
    }

    function test_karwan_checker_alone_attests_through_v_cre_k() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        _reportAsChecker(verifierCK, id, 1, true);
        assertTrue(_deal(id).checkPassed);
    }

    function test_karwan_checker_attests_through_v_k() public {
        bytes32 id = _deliveredDeal(address(verifierK));
        _reportAsChecker(verifierK, id, 1, false);
        assertTrue(_deal(id).checkFailed);
    }

    function test_v_k_ignores_the_adapter() public {
        bytes32 id = _deliveredDeal(address(verifierK));
        _report(address(verifierK), id, 1, true);
        assertTrue(forwarder.lastOk());
        assertFalse(_deal(id).checkPassed);
    }

    function test_a_result_during_a_dispute_is_approved_but_not_attested() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        vm.expectEmit(true, true, false, false, address(adapter));
        emit IKarwanCreAdapter.CheckSubmitFailed(address(verifierCK), id, 1, "");
        _report(address(verifierCK), id, 1, true);
        assertTrue(forwarder.lastOk());
        assertFalse(_deal(id).checkPassed);
        assertTrue(adapter.approved(adapter.checkDigest(address(verifierCK), address(escrow), id, 1, true, EVIDENCE)));
    }

    function test_a_stale_revision_is_refused_by_the_escrow_not_the_adapter() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        _deliver(id);
        _report(address(verifierCK), id, 1, true);
        assertTrue(forwarder.lastOk());
        assertFalse(_deal(id).checkPassed);
        _report(address(verifierCK), id, 2, true);
        assertTrue(_deal(id).checkPassed);
    }

    function test_a_cre_pass_cannot_overturn_a_result_already_on_chain() public {
        bytes32 id = _deliveredDeal(address(verifierCK));
        _reportAsChecker(verifierCK, id, 1, false);
        _report(address(verifierCK), id, 1, true);
        assertTrue(_deal(id).checkFailed);
        assertFalse(_deal(id).checkPassed);
        assertFalse(adapter.approved(adapter.checkDigest(address(verifierCK), address(escrow), id, 1, true, EVIDENCE)));
        address[] memory s = new address[](1);
        s[0] = address(adapter);
        bytes[] memory sig = new bytes[](1);
        vm.expectRevert(KarwanCheckVerifier.BadSigners.selector);
        verifierCK.report(address(escrow), id, 1, true, EVIDENCE, s, sig);
    }
}
