// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";

/// @title KarwanReputation v2 — counterparty-diversity anti-farming
/// @notice Exploit-first gates for the diversity delta: distinctCounterparties
///         and the unordered pairDeals map that the off-chain composite uses to
///         cap self-dealing / buddy-pair / wash farming. Mirrors invariants
///         R1 (diversity dominates) and R4 (diminishing per-pair credit) from
///         audit/REPUTATION_V2.md.
contract KarwanReputationDiversityTest is Test {
    KarwanReputation rep;
    address escrow = makeAddr("escrow");
    address eve = makeAddr("eve");
    uint256 constant U = 1e6;

    function setUp() public {
        rep = new KarwanReputation();
        rep.setEscrow(escrow);
    }

    function _record(bytes32 id, address b, address s) internal {
        vm.prank(escrow);
        rep.recordCompletion(id, b, s, KarwanReputation.Outcome.Success, 100 * U);
    }

    // ===================== R1: diversity dominates ======================

    /// N deals across N distinct sellers => N distinct counterparties.
    function test_Diversity_DistinctCountsPerNewPair() public {
        address buyer = makeAddr("buyer");
        for (uint256 i = 0; i < 5; i++) {
            address seller = makeAddr(string(abi.encodePacked("seller", vm.toString(i))));
            _record(keccak256(abi.encodePacked("j", i)), buyer, seller);
            assertEq(rep.distinctCounterparties(seller), 1, "each fresh seller: 1 distinct");
        }
        assertEq(rep.distinctCounterparties(buyer), 5, "buyer met 5 distinct sellers");
    }

    // ============= R4: self-dealing / buddy pair is capped ==============

    /// The wash case: two accounts trading only with each other N times inflate
    /// the pair count but NEVER distinctCounterparties past 1. This is the hook
    /// the composite uses to floor a buddy pair below ELITE.
    function test_Diversity_RepeatPairNeverBumpsDistinct() public {
        address a = makeAddr("wash-a");
        address b = makeAddr("wash-b");
        for (uint256 i = 0; i < 10; i++) {
            _record(keccak256(abi.encodePacked("w", i)), a, b);
        }
        assertEq(rep.pairDealCount(a, b), 10, "pair deepens");
        assertEq(rep.distinctCounterparties(a), 1, "a still only knows b");
        assertEq(rep.distinctCounterparties(b), 1, "b still only knows a");
    }

    /// Role swaps (a buys from b, then b buys from a) must hit the SAME pair
    /// slot — otherwise a ring could double its diversity by alternating roles.
    function test_Diversity_KeyIsOrderIndependent() public {
        address a = makeAddr("swap-a");
        address b = makeAddr("swap-b");
        _record(keccak256("s1"), a, b); // a=buyer, b=seller
        _record(keccak256("s2"), b, a); // roles swapped
        assertEq(rep.pairDealCount(a, b), 2, "same unordered pair");
        assertEq(rep.pairDealCount(b, a), 2, "symmetric read");
        assertEq(rep.distinctCounterparties(a), 1, "still one distinct partner");
        assertEq(rep.distinctCounterparties(b), 1, "still one distinct partner");
    }

    /// Diversity is credited on failed/disputed outcomes too (a real distinct
    /// interaction happened), and a failed deal can't be farmed for standing
    /// because it still lands as failedCount on the seller.
    function test_Diversity_CountsOnAllOutcomes() public {
        address b = makeAddr("b");
        address s = makeAddr("s");
        vm.prank(escrow);
        rep.recordCompletion(keccak256("f1"), b, s, KarwanReputation.Outcome.Failed, 100 * U);
        assertEq(rep.distinctCounterparties(s), 1, "failed deal still a distinct pair");
        vm.prank(escrow);
        rep.recordCompletion(keccak256("d1"), b, s, KarwanReputation.Outcome.DisputeResolved, 100 * U);
        assertEq(rep.pairDealCount(b, s), 2, "disputed deepens the same pair");
        assertEq(rep.distinctCounterparties(s), 1, "no new distinct on the repeat");
    }

    function test_Diversity_EmitsPairSettled() public {
        address b = makeAddr("b");
        address s = makeAddr("s");
        vm.expectEmit(true, true, false, true);
        emit KarwanReputation.PairSettled(b, s, 1, 1, 1);
        _record(keccak256("e1"), b, s);
    }

    // ======================= Backfill migration =========================

    function test_BackfillDiversity_SeedsBothSidesOnce() public {
        address subject = makeAddr("subject");
        address p1 = makeAddr("p1");
        address p2 = makeAddr("p2");
        address[] memory parties = new address[](2);
        parties[0] = p1;
        parties[1] = p2;
        uint256[] memory counts = new uint256[](2);
        counts[0] = 3;
        counts[1] = 1;
        rep.backfillDiversity(subject, parties, counts);

        assertEq(rep.distinctCounterparties(subject), 2, "subject met 2 partners");
        assertEq(rep.distinctCounterparties(p1), 1, "p1 side seeded");
        assertEq(rep.distinctCounterparties(p2), 1, "p2 side seeded");
        assertEq(rep.pairDealCount(subject, p1), 3, "pair count carried");
    }

    /// A pair seeded by backfill must be recognised at runtime: a subsequent
    /// live deal deepens the existing pair and does NOT re-bump distinct.
    function test_BackfillDiversity_ThenRuntimeDoesNotDoubleCount() public {
        address subject = makeAddr("subject");
        address p1 = makeAddr("p1");
        address[] memory parties = new address[](1);
        parties[0] = p1;
        uint256[] memory counts = new uint256[](1);
        counts[0] = 2;
        rep.backfillDiversity(subject, parties, counts);
        assertEq(rep.distinctCounterparties(subject), 1);

        _record(keccak256("live"), subject, p1);
        assertEq(rep.pairDealCount(subject, p1), 3, "seeded 2 + 1 live");
        assertEq(rep.distinctCounterparties(subject), 1, "no double-count on a known partner");
    }

    function test_BackfillDiversity_LengthMismatchReverts() public {
        address subject = makeAddr("subject");
        address[] memory parties = new address[](2);
        uint256[] memory counts = new uint256[](1);
        vm.expectRevert(KarwanReputation.LengthMismatch.selector);
        rep.backfillDiversity(subject, parties, counts);
    }

    function test_BackfillDiversity_ZeroCountSkipped() public {
        address subject = makeAddr("subject");
        address p1 = makeAddr("p1");
        address[] memory parties = new address[](1);
        parties[0] = p1;
        uint256[] memory counts = new uint256[](1);
        counts[0] = 0;
        rep.backfillDiversity(subject, parties, counts);
        assertEq(rep.distinctCounterparties(subject), 0, "zero-count party is a no-op");
        assertEq(rep.pairDealCount(subject, p1), 0);
    }

    function test_BackfillDiversity_OwnerOnlyAndLocks() public {
        address subject = makeAddr("subject");
        address[] memory parties = new address[](0);
        uint256[] memory counts = new uint256[](0);

        vm.prank(eve);
        vm.expectRevert(KarwanReputation.NotOwner.selector);
        rep.backfillDiversity(subject, parties, counts);

        rep.lockBackfill();
        vm.expectRevert(KarwanReputation.BackfillLockedError.selector);
        rep.backfillDiversity(subject, parties, counts);
    }
}
