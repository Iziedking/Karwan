// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "./AgreementFixture.sol";
import {AgreementTerms, AgreementDeal, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../../src/suite/agreement/AgreementLib.sol";
import {AgreementDeliveryLib} from "../../../src/suite/agreement/AgreementDeliveryLib.sol";

/// @notice The Agreement family's money arithmetic under fuzzed amounts, fees,
///         shares, tranches, plans and times: every unit funded ends with a
///         party or the fee, the fee stays within the rate fixed at opening,
///         and no split creates or loses a unit.
contract AgreementFuzzTest is AgreementFixture {
    uint256 internal constant BPS = 10_000;

    function setUp() public {
        _deployAgreement();
    }

    // ------------------------------ Helpers -------------------------------

    function _setFee(uint256 seed) internal returns (uint16 fee) {
        fee = uint16(bound(seed, 0, 1_000));
        hub.setFamilyFee(address(escrow), fee);
    }

    /// The largest price whose funding, price plus half the fee, fits the per-deal cap.
    function _maxAmount(uint16 fee) internal pure returns (uint256) {
        return (uint256(PER_DEAL) * 20_000) / (20_000 + fee);
    }

    /// `n` positive tranche shares summing to the whole.
    function _fillTranches(AgreementTerms memory t, uint256 n, uint256 seed) internal pure {
        uint256 left = BPS;
        for (uint256 i; i + 1 < n; ++i) {
            uint256 b = bound(uint256(keccak256(abi.encode(seed, i))), 1, left - (n - 1 - i));
            t.trancheBps[i] = uint16(b);
            left -= b;
        }
        t.trancheBps[n - 1] = uint16(left);
    }

    function _twoTranches(AgreementTerms memory t, uint256 seed) internal pure returns (uint16 first) {
        first = uint16(bound(seed, 1, BPS - 1));
        t.trancheBps[0] = first;
        t.trancheBps[1] = uint16(BPS - first);
    }

    function _plan(uint256 parts, uint256 every, uint256 t0) internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.parts = uint8(parts);
        t.partEvery = uint32(every);
        t.deliveryDeadline = uint64(t0 + (parts - 1) * every + t.reclaimGrace + 10 days);
    }

    function _acceptWithStake(bytes32 id, AgreementTerms memory t) internal {
        uint256 deadline = block.timestamp + 1 hours;
        uint64 expiresAt = escrow.accountOf(id).horizon + 180 days + 30 days;
        bytes32 digest =
            vault.reserveDigest(address(escrow), id, address(usdc), t.sellerStake, buyer, expiresAt, deadline);
        bytes32 h = escrow.termsHashOf(t);
        bytes memory sig = _sig(sellerKey, digest);
        vm.prank(seller);
        escrow.acceptWithStake(id, h, deadline, sig);
    }

    /// What a running deal holds is exactly what it still owes, and it is the
    /// escrow's whole balance.
    function _assertHolds(bytes32 id) internal view {
        AgreementDeal memory d = _deal(id);
        uint256 bal = escrow.accountOf(id).balance;
        assertEq(bal, uint256(d.sellerNet - d.released) + uint256(d.feeTotal - d.feeReleased));
        assertEq(usdc.balanceOf(address(escrow)), bal);
        assertEq(escrow.held(address(usdc)), bal);
    }

    function _assertEmpty(bytes32 id) internal view {
        assertEq(uint256(escrow.accountOf(id).balance), 0);
        assertTrue(escrow.accountOf(id).closed);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.held(address(usdc)), 0);
        assertEq(escrow.promisedTotal(address(usdc)), 0);
    }

    /// The fee paid is the fee safe's whole balance, at the rate fixed at
    /// opening, and never above that rate on the price or on what was funded.
    function _assertFeeWithinTerms(bytes32 id, uint16 fee, uint256 amount) internal view {
        uint256 feePaid = escrow.accountOf(id).feePaid;
        assertEq(uint256(escrow.accountOf(id).feeBps), uint256(fee));
        assertLe(feePaid, (amount * fee) / BPS);
        assertLe(feePaid, (uint256(escrow.accountOf(id).funded) * fee) / BPS);
        assertEq(usdc.balanceOf(feeSafe), feePaid);
    }

    function _assertOutsidersUnpaid() internal view {
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(usdc.balanceOf(arbiter), 0);
        assertEq(usdc.balanceOf(reviewSafe), 0);
        assertEq(usdc.balanceOf(seniorSafe), 0);
        assertEq(usdc.balanceOf(guardian), 0);
        assertEq(escrow.owedTotal(address(usdc)), 0);
    }

    // ------------------------------ Tranches ------------------------------

    function testFuzz_each_tranche_pays_its_share_and_the_last_takes_the_rest(
        uint256 amountSeed,
        uint256 feeSeed,
        uint256 laterFeeSeed,
        uint256 countSeed,
        uint256 bpsSeed,
        uint256 claimMask
    ) public {
        uint256 t0 = vm.getBlockTimestamp();
        uint16 fee = _setFee(feeSeed);
        AgreementTerms memory t = _terms();
        t.amount = uint128(bound(amountSeed, 1, _maxAmount(fee)));
        t.deliveryDeadline = uint64(t0 + 60 days);
        uint256 n = bound(countSeed, 1, 12);
        _fillTranches(t, n, bpsSeed);
        uint256 b0 = usdc.balanceOf(buyer);
        bytes32 id = _fundAccepted(t, bytes32("tranches"));
        hub.setFamilyFee(address(escrow), uint16(bound(laterFeeSeed, 0, 1_000)));

        AgreementDeal memory d = _deal(id);
        uint256 feeTotal = (uint256(t.amount) * fee) / BPS;
        assertEq(uint256(d.feeTotal), feeTotal);
        assertEq(b0 - usdc.balanceOf(buyer), uint256(t.amount) + feeTotal / 2);
        assertEq(uint256(d.sellerNet) + d.feeTotal, b0 - usdc.balanceOf(buyer));

        uint256 sellerSum;
        uint256 feeSum;
        uint256 at = t0;
        for (uint256 i; i < n; ++i) {
            bool last = i + 1 == n;
            uint256 wantSeller = last ? uint256(d.sellerNet) - sellerSum : (uint256(d.sellerNet) * t.trancheBps[i]) / BPS;
            uint256 wantFee = last ? uint256(d.feeTotal) - feeSum : (uint256(d.feeTotal) * t.trancheBps[i]) / BPS;
            if (((claimMask >> i) & 1) == 1) {
                _deliver(id);
                at += 3 days;
                vm.warp(at);
                vm.prank(stranger);
                escrow.claim(id);
            } else {
                vm.prank(buyer);
                escrow.release(id);
            }
            sellerSum += wantSeller;
            feeSum += wantFee;
            assertEq(usdc.balanceOf(seller), sellerSum);
            assertEq(usdc.balanceOf(feeSafe), feeSum);
            assertEq(uint256(_deal(id).released), sellerSum);
            assertEq(uint256(_deal(id).feeReleased), feeSum);
            if (!last) _assertHolds(id);
        }

        assertEq(sellerSum, uint256(d.sellerNet));
        assertEq(feeSum, feeTotal);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
        assertEq(usdc.balanceOf(buyer) + sellerSum + feeSum, b0);
        _assertEmpty(id);
        _assertFeeWithinTerms(id, fee, t.amount);
        _assertOutsidersUnpaid();
    }

    // ------------------------------- Splits -------------------------------

    function testFuzz_an_agreed_split_divides_exactly_what_is_left(
        uint256 amountSeed,
        uint256 feeSeed,
        uint256 bpsSeed,
        uint256 firstSeed,
        bool payFirst,
        bool disputed,
        bool sellerProposes
    ) public {
        uint16 fee = _setFee(feeSeed);
        uint16 sellerBps = uint16(bound(bpsSeed, 0, BPS));
        AgreementTerms memory t = _terms();
        t.amount = uint128(bound(amountSeed, 1, _maxAmount(fee)));
        _twoTranches(t, firstSeed);
        uint256 b0 = usdc.balanceOf(buyer);
        bytes32 id = _fundAccepted(t, bytes32("split"));
        if (payFirst) {
            vm.prank(buyer);
            escrow.release(id);
        }
        if (disputed) {
            _deliver(id);
            vm.prank(buyer);
            escrow.dispute(id, keccak256("clause"));
        }

        AgreementDeal memory d = _deal(id);
        uint256 left = escrow.accountOf(id).balance;
        uint256 net = d.sellerNet - d.released;
        uint256 feeLeft = d.feeTotal - d.feeReleased;
        assertEq(left, net + feeLeft);
        uint256 toSeller = (net * sellerBps) / BPS;
        uint256 feeCut = (feeLeft * sellerBps) / BPS;
        uint256 b1 = usdc.balanceOf(buyer);
        uint256 s1 = usdc.balanceOf(seller);
        uint256 f1 = usdc.balanceOf(feeSafe);

        address proposer = sellerProposes ? seller : buyer;
        address taker = sellerProposes ? buyer : seller;
        vm.prank(proposer);
        escrow.proposeSplit(id, sellerBps);
        vm.prank(taker);
        escrow.acceptSplit(id, sellerBps);

        uint256 toBuyer = usdc.balanceOf(buyer) - b1;
        assertEq(usdc.balanceOf(seller) - s1, toSeller);
        assertEq(usdc.balanceOf(feeSafe) - f1, feeCut);
        assertEq(toBuyer, (net - toSeller) + (feeLeft - feeCut));
        assertEq(toSeller + feeCut + toBuyer, left);
        assertEq(uint8(_state(id)), uint8(AgreementState.Split));
        assertEq(uint256(escrow.disputeOf(id).openedAt), 0);
        assertLe(usdc.balanceOf(feeSafe), uint256(d.feeTotal));
        assertEq(usdc.balanceOf(buyer) + usdc.balanceOf(seller) + usdc.balanceOf(feeSafe), b0);
        _assertEmpty(id);
        _assertFeeWithinTerms(id, fee, t.amount);
        _assertOutsidersUnpaid();
    }

    // ------------------------------ Rulings -------------------------------

    /// `how`: 0 = the reviewer rules, 1 = the fallback applies, 2 = the
    /// arbiter's unappealed proposal applies.
    function testFuzz_a_ruling_pays_the_disputed_tranche_by_its_share_and_the_rest_carries_on(
        uint256 amountSeed,
        uint256 feeSeed,
        uint256 bpsSeed,
        uint256 firstSeed,
        bool two,
        uint8 how
    ) public {
        uint256 t0 = vm.getBlockTimestamp();
        uint16 fee = _setFee(feeSeed);
        uint16 sellerBps = uint16(bound(bpsSeed, 0, BPS));
        how = how % 3;
        AgreementTerms memory t = _terms();
        t.amount = uint128(bound(amountSeed, 1, _maxAmount(fee)));
        uint16 first = two ? _twoTranches(t, firstSeed) : uint16(BPS);
        if (how == 1) t.fallbackBps = sellerBps;
        if (how == 2 && sellerBps < BPS) t.partialBps = sellerBps;
        uint256 b0 = usdc.balanceOf(buyer);
        bytes32 id = _fundAccepted(t, bytes32("ruling"));
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));

        AgreementDeal memory d = _deal(id);
        uint256 net = two ? (uint256(d.sellerNet) * first) / BPS : uint256(d.sellerNet);
        uint256 trancheFee = two ? (uint256(d.feeTotal) * first) / BPS : uint256(d.feeTotal);
        uint256 toSeller = (net * sellerBps) / BPS;
        uint256 feeCut = (trancheFee * sellerBps) / BPS;
        uint256 b1 = usdc.balanceOf(buyer);

        uint256 disputeTime;
        if (how == 0) {
            vm.prank(arbiter);
            escrow.escalate(id);
            vm.prank(reviewSafe);
            escrow.rule(id, sellerBps, keccak256("ruling"));
        } else if (how == 1) {
            vm.prank(arbiter);
            escrow.escalate(id);
            disputeTime = 5 days;
            vm.warp(t0 + disputeTime);
            vm.prank(stranger);
            escrow.applyFallback(id);
        } else {
            vm.prank(arbiter);
            escrow.proposeRuling(id, sellerBps, keccak256("proposal"));
            disputeTime = 72 hours;
            vm.warp(t0 + disputeTime);
            vm.prank(stranger);
            escrow.executeRuling(id);
        }

        assertEq(usdc.balanceOf(seller), toSeller);
        assertEq(usdc.balanceOf(feeSafe), feeCut);
        assertEq(usdc.balanceOf(buyer) - b1, (net - toSeller) + (trancheFee - feeCut));
        assertEq(uint256(_deal(id).released), net);
        assertEq(uint256(_deal(id).feeReleased), trancheFee);

        if (two) {
            assertEq(uint8(_state(id)), uint8(AgreementState.Accepted));
            assertEq(uint256(_deal(id).paid), 1);
            assertEq(uint256(_deal(id).deadline), uint256(t.deliveryDeadline) + disputeTime);
            _assertHolds(id);
            vm.prank(buyer);
            escrow.release(id);
            assertEq(usdc.balanceOf(seller), toSeller + (d.sellerNet - net));
            assertEq(usdc.balanceOf(feeSafe), feeCut + (d.feeTotal - trancheFee));
            assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
        } else {
            assertEq(uint8(_state(id)), uint8(AgreementState.Ruled));
        }
        assertEq(usdc.balanceOf(buyer) + usdc.balanceOf(seller) + usdc.balanceOf(feeSafe), b0);
        _assertEmpty(id);
        _assertFeeWithinTerms(id, fee, t.amount);
        _assertOutsidersUnpaid();
    }

    function testFuzz_a_ruling_slashes_the_buyers_share_of_the_stake_and_frees_the_rest(
        uint256 amountSeed,
        uint256 feeSeed,
        uint256 stakeSeed,
        uint256 bpsSeed,
        uint256 firstSeed,
        bool two
    ) public {
        uint16 fee = _setFee(feeSeed);
        uint16 sellerBps = uint16(bound(bpsSeed, 0, BPS));
        AgreementTerms memory t = _terms();
        t.amount = uint128(bound(amountSeed, 1, _maxAmount(fee)));
        t.sellerStake = uint128(bound(stakeSeed, 1, t.amount));
        uint256 stake = t.sellerStake;
        uint16 first = two ? _twoTranches(t, firstSeed) : uint16(BPS);
        usdc.mint(seller, stake);
        vm.startPrank(seller);
        usdc.approve(address(vault), stake);
        vault.stake(address(usdc), stake);
        vm.stopPrank();

        uint256 b0 = usdc.balanceOf(buyer);
        bytes32 id = _fund(t, bytes32("stake"));
        _acceptWithStake(id, t);
        assertEq(uint256(vault.reservationOf(address(escrow), id).amount), stake);
        _deliver(id);
        vm.prank(buyer);
        escrow.dispute(id, keccak256("clause"));
        vm.prank(arbiter);
        escrow.escalate(id);

        AgreementDeal memory d = _deal(id);
        uint256 net = two ? (uint256(d.sellerNet) * first) / BPS : uint256(d.sellerNet);
        uint256 trancheFee = two ? (uint256(d.feeTotal) * first) / BPS : uint256(d.feeTotal);
        uint256 toSeller = (net * sellerBps) / BPS;
        uint256 feeCut = (trancheFee * sellerBps) / BPS;
        uint256 slash = (stake * (BPS - sellerBps) * net) / (BPS * d.sellerNet);
        assertLe(slash, (stake * (BPS - sellerBps)) / BPS);
        uint256 b1 = usdc.balanceOf(buyer);

        vm.prank(reviewSafe);
        escrow.rule(id, sellerBps, keccak256("ruling"));

        assertEq(usdc.balanceOf(buyer) - b1, (net - toSeller) + (trancheFee - feeCut) + slash);
        assertEq(usdc.balanceOf(seller), toSeller);
        assertEq(uint256(vault.stakeOf(sellerId, address(usdc)).active), stake - slash);
        assertEq(usdc.balanceOf(address(vault)), stake - slash);
        if (two) {
            assertEq(uint256(vault.reservationOf(address(escrow), id).amount), stake - slash);
            assertEq(vault.reservationOf(address(escrow), id).active, stake > slash);
            vm.prank(buyer);
            escrow.release(id);
            assertEq(usdc.balanceOf(seller), toSeller + (d.sellerNet - net));
        }
        assertFalse(vault.reservationOf(address(escrow), id).active);
        assertEq(vault.freeOf(sellerId, address(usdc)), stake - slash);
        assertEq(usdc.balanceOf(buyer) + usdc.balanceOf(seller) + usdc.balanceOf(feeSafe), b0 + slash);
        _assertEmpty(id);
        _assertFeeWithinTerms(id, fee, t.amount);
        _assertOutsidersUnpaid();
    }

    // ------------------------------ Reclaims ------------------------------

    function testFuzz_a_reclaim_after_the_deadline_returns_exactly_what_is_left(
        uint256 amountSeed,
        uint256 feeSeed,
        uint256 firstSeed,
        uint256 lateSeed,
        bool payFirst,
        bool deposit,
        bool delivered
    ) public {
        uint16 fee = _setFee(feeSeed);
        AgreementTerms memory t = _terms();
        t.amount = uint128(bound(amountSeed, 1, _maxAmount(fee)));
        _twoTranches(t, firstSeed);
        if (deposit) t.silenceOutcome = 1;
        uint256 late = bound(lateSeed, 1, 365 days);
        uint256 b0 = usdc.balanceOf(buyer);
        bytes32 id = _fundAccepted(t, bytes32("reclaim"));
        if (payFirst) {
            vm.prank(buyer);
            escrow.release(id);
        }
        if (deposit && delivered) _deliver(id);

        AgreementDeal memory d = _deal(id);
        uint256 left = escrow.accountOf(id).balance;
        assertEq(left, uint256(d.sellerNet - d.released) + uint256(d.feeTotal - d.feeReleased));
        uint256 s1 = usdc.balanceOf(seller);
        uint256 f1 = usdc.balanceOf(feeSafe);
        uint256 b1 = usdc.balanceOf(buyer);

        uint256 due = uint256(t.deliveryDeadline) + t.reclaimGrace;
        vm.warp(due);
        vm.expectRevert(AgreementDeliveryLib.Early.selector);
        escrow.reclaim(id);
        vm.warp(due + late);
        vm.prank(stranger);
        escrow.reclaim(id);

        assertEq(usdc.balanceOf(buyer) - b1, left);
        assertEq(usdc.balanceOf(seller), s1);
        assertEq(usdc.balanceOf(feeSafe), f1);
        assertEq(s1, uint256(d.released));
        assertEq(f1, uint256(d.feeReleased));
        assertEq(uint8(_state(id)), uint8(AgreementState.Reclaimed));
        assertEq(usdc.balanceOf(buyer) + usdc.balanceOf(seller) + usdc.balanceOf(feeSafe), b0);
        _assertEmpty(id);
        _assertFeeWithinTerms(id, fee, t.amount);
        _assertOutsidersUnpaid();
    }

    // ----------------------------- Instalments ----------------------------

    function testFuzz_instalments_take_equal_parts_and_the_last_part_takes_the_rest(
        uint256 amountSeed,
        uint256 feeSeed,
        uint256 partsSeed,
        uint256 everySeed,
        uint256 lateSeed
    ) public {
        uint256 t0 = vm.getBlockTimestamp();
        uint16 fee = _setFee(feeSeed);
        uint256 parts = bound(partsSeed, 2, 12);
        uint256 every = bound(everySeed, 1 hours, 30 days);
        uint256 late = bound(lateSeed, 0, 30 days);
        AgreementTerms memory t = _plan(parts, every, t0);
        t.amount = uint128(bound(amountSeed, parts, _maxAmount(fee)));
        uint256 total = uint256(t.amount) + ((uint256(t.amount) * fee) / BPS) / 2;
        uint256 part = total / parts;
        uint256 b0 = usdc.balanceOf(buyer);
        bytes32 id = _fundAccepted(t, bytes32("plan"));

        assertEq(b0 - usdc.balanceOf(buyer), part);
        assertEq(uint256(escrow.accountOf(id).promised), total - part);
        assertEq(escrow.promisedTotal(address(usdc)), total - part);
        assertEq(uint256(_deal(id).sellerNet) + _deal(id).feeTotal, total);

        for (uint256 k = 1; k < parts; ++k) {
            bool last = k + 1 == parts;
            vm.warp(t0 + k * every + (last ? late : 0));
            uint256 before = usdc.balanceOf(buyer);
            vm.prank(buyer);
            escrow.payPart(id);
            assertEq(before - usdc.balanceOf(buyer), last ? total - (parts - 1) * part : part);
            assertEq(uint256(escrow.accountOf(id).funded), last ? total : (k + 1) * part);
            assertEq(usdc.balanceOf(address(escrow)), escrow.accountOf(id).funded);
            assertEq(uint256(escrow.accountOf(id).promised) + escrow.accountOf(id).funded, total);
        }

        assertEq(b0 - usdc.balanceOf(buyer), total);
        assertEq(escrow.promisedTotal(address(usdc)), 0);
        assertEq(uint256(_deal(id).deadline), uint256(t.deliveryDeadline) + late);
        _assertHolds(id);

        _deliver(id);
        vm.warp(t0 + (parts - 1) * every + late + 3 days);
        vm.prank(stranger);
        escrow.claim(id);
        assertEq(usdc.balanceOf(seller), uint256(_deal(id).sellerNet));
        assertEq(usdc.balanceOf(feeSafe), (uint256(t.amount) * fee) / BPS);
        assertEq(uint8(_state(id)), uint8(AgreementState.Settled));
        assertEq(usdc.balanceOf(buyer) + usdc.balanceOf(seller) + usdc.balanceOf(feeSafe), b0);
        _assertEmpty(id);
        _assertFeeWithinTerms(id, fee, t.amount);
        _assertOutsidersUnpaid();
    }

    function testFuzz_a_missed_part_leaves_the_seller_the_cancel_fee_and_never_more_than_was_paid(
        uint256 amountSeed,
        uint256 feeSeed,
        uint256 partsSeed,
        uint256 paidSeed,
        uint256 cancelSeed,
        uint256 lateSeed,
        bool accepted
    ) public {
        uint256 t0 = vm.getBlockTimestamp();
        uint16 fee = _setFee(feeSeed);
        uint256 parts = bound(partsSeed, 2, 12);
        uint256 paid = bound(paidSeed, 1, parts - 1);
        uint256 late = bound(lateSeed, 1, 30 days);
        AgreementTerms memory t = _plan(parts, 7 days, t0);
        t.amount = uint128(bound(amountSeed, parts, _maxAmount(fee)));
        t.cancelFeeBps = uint16(bound(cancelSeed, 0, 2_000));
        uint256 total = uint256(t.amount) + ((uint256(t.amount) * fee) / BPS) / 2;
        uint256 b0 = usdc.balanceOf(buyer);
        bytes32 id = accepted ? _fundAccepted(t, bytes32("missed")) : _fund(t, bytes32("missed"));
        for (uint256 k = 1; k < paid; ++k) {
            vm.prank(buyer);
            escrow.payPart(id);
        }

        uint256 balance = escrow.accountOf(id).balance;
        assertEq(balance, paid * (total / parts));
        assertEq(uint256(escrow.accountOf(id).promised), total - balance);
        uint256 toSeller = accepted ? (uint256(t.amount) * t.cancelFeeBps) / BPS : 0;
        if (toSeller > balance) toSeller = balance;

        uint256 due = t0 + paid * 7 days + t.reclaimGrace;
        vm.warp(due);
        vm.expectRevert(AgreementLib.Early.selector);
        escrow.cancelMissed(id);
        vm.warp(due + late);
        vm.prank(stranger);
        escrow.cancelMissed(id);

        assertEq(usdc.balanceOf(seller), toSeller);
        assertLe(usdc.balanceOf(seller), balance);
        assertEq(usdc.balanceOf(buyer), b0 - toSeller);
        assertEq(usdc.balanceOf(feeSafe), 0);
        assertEq(uint8(_state(id)), uint8(AgreementState.Refunded));
        _assertEmpty(id);
        _assertFeeWithinTerms(id, fee, t.amount);
        _assertOutsidersUnpaid();
    }
}
