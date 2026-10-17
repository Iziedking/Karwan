// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanRecord} from "../../src/suite/KarwanRecord.sol";
import {KarwanIdentityRegistry} from "../../src/suite/KarwanIdentityRegistry.sol";
import {Outcome} from "../../src/suite/interfaces/IKarwanSuite.sol";

contract KarwanRecordTest is SuiteFixture {
    address internal writer = makeAddr("writer");
    address internal alice;
    uint256 internal aliceKey;
    uint64 internal aliceId;
    bytes32 internal constant KIND = keccak256("work.verified");
    bytes32 internal constant SEAL = keccak256("seal");

    function setUp() public {
        _deploySuite();
        hub.registerFamily(writer, 0);
        (alice, aliceKey, aliceId) = _person("alice");
    }

    function _fact() internal returns (uint256) {
        vm.prank(issuer);
        return record.recordFact(alice, KIND, 2, SEAL, uint64(block.timestamp + 365 days));
    }

    function test_issuer_records_a_fact_to_the_person() public {
        uint256 fid = _fact();
        KarwanRecord.Fact memory f = record.getFact(fid);
        assertEq(f.subject, aliceId);
        assertEq(f.issuer, issuer);
        assertEq(f.level, 2);
        assertEq(record.factsOf(aliceId).length, 1);
    }

    function test_only_issuers_record_facts() public {
        vm.prank(alice);
        vm.expectRevert(KarwanRecord.NotIssuer.selector);
        record.recordFact(alice, KIND, 1, SEAL, uint64(block.timestamp + 1 days));
    }

    function test_unbound_wallet_gets_no_fact() public {
        vm.prank(issuer);
        vm.expectRevert(KarwanRecord.NotAnIdentity.selector);
        record.recordFact(makeAddr("nobody"), KIND, 1, SEAL, uint64(block.timestamp + 1 days));
    }

    function test_agent_wallet_gets_no_fact() public {
        (address agent, uint256 agentKey) = makeAddrAndKey("agent");
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = identity.bindDigest(aliceId, agent, KarwanIdentityRegistry.Kind.Agent, expiry, 1e6, 1e6, deadline);
        bytes memory s = _sig(agentKey, d);
        vm.prank(alice);
        identity.bind(agent, KarwanIdentityRegistry.Kind.Agent, expiry, 1e6, 1e6, deadline, s);
        vm.prank(issuer);
        vm.expectRevert(KarwanRecord.NotAnIdentity.selector);
        record.recordFact(agent, KIND, 1, SEAL, uint64(block.timestamp + 1 days));
    }

    function test_fact_needs_a_future_expiry_a_kind_and_a_seal() public {
        vm.startPrank(issuer);
        vm.expectRevert(KarwanRecord.BadFact.selector);
        record.recordFact(alice, KIND, 1, SEAL, uint64(block.timestamp));
        vm.expectRevert(KarwanRecord.BadFact.selector);
        record.recordFact(alice, bytes32(0), 1, SEAL, uint64(block.timestamp + 1));
        vm.expectRevert(KarwanRecord.BadFact.selector);
        record.recordFact(alice, KIND, 1, bytes32(0), uint64(block.timestamp + 1));
        vm.stopPrank();
    }

    function test_only_the_issuer_revokes_even_after_losing_the_role() public {
        uint256 fid = _fact();
        vm.prank(alice);
        vm.expectRevert(KarwanRecord.NotYours.selector);
        record.revoke(fid);
        hub.setIssuer(issuer, false);
        vm.prank(issuer);
        record.revoke(fid);
        assertTrue(record.getFact(fid).revoked);
        assertEq(record.validFactsOf(aliceId, uint64(block.timestamp)).length, 0);
    }

    function test_an_unknown_fact_cannot_be_revoked() public {
        uint256 fid = _fact();
        vm.prank(issuer);
        vm.expectRevert(KarwanRecord.UnknownFact.selector);
        record.revoke(fid + 1);
        assertEq(record.factCount(), 1);
        assertFalse(record.getFact(fid).revoked);
    }

    function test_an_unknown_fact_cannot_be_read() public {
        uint256 fid = _fact();
        vm.expectRevert(KarwanRecord.UnknownFact.selector);
        record.getFact(fid + 1);
    }

    function test_expired_facts_are_not_valid() public {
        _fact();
        assertEq(record.validFactsOf(aliceId, uint64(block.timestamp)).length, 1);
        assertEq(record.validFactsOf(aliceId, uint64(block.timestamp + 365 days)).length, 0);
    }

    function test_families_record_outcomes_once() public {
        vm.startPrank(writer);
        record.recordOutcome(bytes32("deal"), aliceId, 1, Outcome.COMPLETED, 1, 0);
        assertTrue(record.outcomeRecorded(record.outcomeKey(writer, bytes32("deal"), aliceId, 1)));
        vm.expectRevert(KarwanRecord.AlreadyRecorded.selector);
        record.recordOutcome(bytes32("deal"), aliceId, 1, Outcome.COMPLETED, 1, 0);
        vm.stopPrank();
    }

    function test_outcome_refusals() public {
        vm.prank(alice);
        vm.expectRevert(KarwanRecord.NotFamily.selector);
        record.recordOutcome(bytes32("d"), aliceId, 0, Outcome.COMPLETED, 0, 0);
        vm.startPrank(writer);
        vm.expectRevert(KarwanRecord.NotAnIdentity.selector);
        record.recordOutcome(bytes32("d"), 0, 0, Outcome.COMPLETED, 0, 0);
        vm.expectRevert(KarwanRecord.NotAnIdentity.selector);
        record.recordOutcome(bytes32("d"), 99, 0, Outcome.COMPLETED, 0, 0);
        vm.expectRevert(KarwanRecord.BadOutcome.selector);
        record.recordOutcome(bytes32("d"), aliceId, 0, 0, 0, 0);
        vm.expectRevert(KarwanRecord.BadOutcome.selector);
        record.recordOutcome(bytes32("d"), aliceId, 0, Outcome.MAX + 1, 0, 0);
        vm.expectRevert(KarwanRecord.BadOutcome.selector);
        record.recordOutcome(bytes32("d"), aliceId, 0, Outcome.COMPLETED, 4, 0);
        vm.stopPrank();
    }

    function test_a_retired_family_still_records_its_endings() public {
        hub.retireFamily(writer);
        vm.prank(writer);
        record.recordOutcome(bytes32("late"), aliceId, 0, Outcome.COMPLETED, 0, 0);
    }
}
