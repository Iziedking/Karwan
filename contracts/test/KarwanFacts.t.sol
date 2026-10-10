// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanFacts} from "../src/KarwanFacts.sol";

/// Stand-in for KarwanStakeVault.resolveOwner: a bound agent resolves to its
/// person, everything else to itself.
contract FactsVaultStub {
    mapping(address => address) public ownerOf;

    function bind(address agent, address person) external {
        ownerOf[agent] = person;
    }

    function resolveOwner(address a) external view returns (address) {
        address o = ownerOf[a];
        return o == address(0) ? a : o;
    }
}

/// @title KarwanFacts, exploit first
/// @notice Facts belong to people. Every test here is a way someone could try
///         to put a fact on the wrong subject, rewrite one, or pose as an
///         issuer or the escrow.
contract KarwanFactsTest is Test {
    KarwanFacts facts;
    FactsVaultStub vault;

    address owner = makeAddr("owner");
    address issuer = makeAddr("issuer");
    address otherIssuer = makeAddr("otherIssuer");
    address escrow = makeAddr("escrow");
    address ada = makeAddr("ada");
    address adaAgent = makeAddr("adaAgent");
    address tunde = makeAddr("tunde");
    address stranger = makeAddr("stranger");

    bytes32 constant CLIENT = "client_confirmation";
    bytes32 constant EVIDENCE = keccak256("evidence");

    function setUp() public {
        vault = new FactsVaultStub();
        facts = new KarwanFacts(address(vault), owner);
        vault.bind(adaAgent, ada);
        vm.startPrank(owner);
        facts.setIssuer(issuer, true);
        facts.setIssuer(otherIssuer, true);
        facts.setEscrow(escrow, true);
        vm.stopPrank();
        vm.warp(1_760_000_000);
    }

    function _record(address subject) internal returns (uint256) {
        vm.prank(issuer);
        return facts.record(subject, CLIENT, 3, EVIDENCE, uint64(block.timestamp + 365 days));
    }

    function test_RevertWhen_CallerIsNotAnIssuer() public {
        vm.prank(stranger);
        vm.expectRevert(KarwanFacts.NotIssuer.selector);
        facts.record(ada, CLIENT, 3, EVIDENCE, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_SubjectIsABoundAgent() public {
        vm.prank(issuer);
        vm.expectRevert(KarwanFacts.NotAnIdentity.selector);
        facts.record(adaAgent, CLIENT, 3, EVIDENCE, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_SubjectIsZero() public {
        vm.prank(issuer);
        vm.expectRevert(KarwanFacts.NotAnIdentity.selector);
        facts.record(address(0), CLIENT, 3, EVIDENCE, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_ExpiryInThePast() public {
        vm.prank(issuer);
        vm.expectRevert(KarwanFacts.BadExpiry.selector);
        facts.record(ada, CLIENT, 3, EVIDENCE, uint64(block.timestamp));
    }

    function test_RevertWhen_RevokedByAnotherIssuer() public {
        uint256 id = _record(ada);
        vm.prank(otherIssuer);
        vm.expectRevert(KarwanFacts.NotYours.selector);
        facts.revoke(id);
    }

    function test_RevertWhen_RevokingAFactThatDoesNotExist() public {
        vm.prank(issuer);
        vm.expectRevert(KarwanFacts.UnknownFact.selector);
        facts.revoke(42);
    }

    function test_RevertWhen_IssuerWasRemoved() public {
        vm.prank(owner);
        facts.setIssuer(issuer, false);
        vm.prank(issuer);
        vm.expectRevert(KarwanFacts.NotIssuer.selector);
        facts.record(ada, CLIENT, 3, EVIDENCE, uint64(block.timestamp + 1 days));
    }

    function test_RevertWhen_NonOwnerSetsRoles() public {
        vm.prank(stranger);
        vm.expectRevert();
        facts.setIssuer(stranger, true);
        vm.prank(stranger);
        vm.expectRevert();
        facts.setEscrow(stranger, true);
    }

    function test_RevertWhen_NonEscrowRecordsADeal() public {
        vm.prank(stranger);
        vm.expectRevert(KarwanFacts.NotEscrow.selector);
        facts.recordCompletion(bytes32("job"), ada, tunde, 1, 100e6);
        vm.prank(issuer);
        vm.expectRevert(KarwanFacts.NotEscrow.selector);
        facts.recordResolution(bytes32("job"), ada, tunde, 5000, 100e6);
    }

    function test_RevertWhen_DealNamesAnAgentInsteadOfAPerson() public {
        vm.prank(escrow);
        vm.expectRevert(KarwanFacts.NotAnIdentity.selector);
        facts.recordCompletion(bytes32("job"), adaAgent, tunde, 1, 100e6);
    }

    function test_DealRecordedAgainstPeople() public {
        vm.expectEmit(true, true, true, true);
        emit KarwanFacts.DealRecorded(bytes32("job"), ada, tunde, 1, 0, 100e6);
        vm.prank(escrow);
        facts.recordCompletion(bytes32("job"), ada, tunde, 1, 100e6);

        vm.expectEmit(true, true, true, true);
        emit KarwanFacts.DealRecorded(bytes32("job2"), ada, tunde, 0, 2500, 100e6);
        vm.prank(escrow);
        facts.recordResolution(bytes32("job2"), ada, tunde, 2500, 100e6);
    }

    function test_FactsAreNeverOverwritten() public {
        uint256 first = _record(ada);
        uint256 second = _record(ada);
        assertEq(second, first + 1);
        KarwanFacts.Fact memory f = facts.getFact(first);
        assertEq(f.subject, ada);
        assertEq(f.issuer, issuer);
        assertEq(f.evidenceHash, EVIDENCE);
        assertEq(facts.factsOf(ada).length, 2);
    }

    function test_RevokeKeepsTheFactAndMarksIt() public {
        uint256 id = _record(ada);
        vm.prank(issuer);
        facts.revoke(id);
        KarwanFacts.Fact memory f = facts.getFact(id);
        assertTrue(f.revoked);
        assertEq(f.subject, ada);
        assertEq(facts.factsOf(ada).length, 1);
    }

    function test_ValidAtIgnoresExpiredAndRevoked() public {
        uint256 kept = _record(ada);
        uint256 revoked = _record(ada);
        vm.prank(issuer);
        facts.record(ada, CLIENT, 3, EVIDENCE, uint64(block.timestamp + 1 hours));
        vm.prank(issuer);
        facts.revoke(revoked);

        uint256[] memory now_ = facts.validFactsOf(ada, uint64(block.timestamp));
        assertEq(now_.length, 2);
        uint256[] memory later = facts.validFactsOf(ada, uint64(block.timestamp + 2 hours));
        assertEq(later.length, 1);
        assertEq(later[0], kept);
    }

    function testFuzz_RecordThenRead(bytes32 kind, uint8 level, uint64 ttl) public {
        ttl = uint64(bound(ttl, 1, 10 * 365 days));
        vm.prank(issuer);
        uint256 id = facts.record(tunde, kind, level, EVIDENCE, uint64(block.timestamp) + ttl);
        KarwanFacts.Fact memory f = facts.getFact(id);
        assertEq(f.kind, kind);
        assertEq(f.level, level);
        assertEq(f.expiresAt, uint64(block.timestamp) + ttl);
        assertEq(f.issuedAt, uint64(block.timestamp));
        assertFalse(f.revoked);
    }
}
