// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "./SuiteFixture.sol";
import {AgreementFixture} from "./agreement/AgreementFixture.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";
import {DealAccount} from "../../src/suite/settlement/SettlementLib.sol";
import {KarwanStakeVault} from "../../src/suite/KarwanStakeVault.sol";
import {KarwanTradeFinance} from "../../src/suite/KarwanTradeFinance.sol";

/// @notice The settlement base's money arithmetic under fuzzed amounts, on the
///         test family: payouts, fees, owed balances, pledges, assignments,
///         the long-stop split, holds, the yield pool and the stake vault.
contract SettlementFuzzTest is SuiteFixture {
    address internal buyer;
    address internal seller;
    uint256 internal sellerKey;
    uint64 internal sellerId;
    address internal financier = makeAddr("financier");
    address internal stranger = makeAddr("stranger");
    address internal beneficiary = makeAddr("beneficiary");
    bytes32 internal constant DEAL = bytes32("fuzz-deal");
    bytes32 internal constant REF = bytes32("fuzz-stake");
    uint256 internal constant BUYER_CASH = 1_000_000e6;
    uint256 internal constant YIELD_DEAL_CAP = 100_000e6;

    function setUp() public {
        _deploySuite();
        (buyer,,) = _person("buyer");
        (seller, sellerKey, sellerId) = _person("seller");
        _funded(buyer, BUYER_CASH);
    }

    function _openDeal(address[] memory payees, uint64 term) internal {
        vm.prank(buyer);
        family.open(DEAL, address(usdc), payees, uint64(block.timestamp) + term);
    }

    function _fundDeal(uint256 amount) internal {
        vm.prank(buyer);
        family.fund(DEAL, amount);
    }

    /// What an address got from the family, delivered or owed.
    function _received(address who) internal view returns (uint256) {
        return usdc.balanceOf(who) + family.owed(address(usdc), who);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _books() internal view {
        assertEq(
            usdc.balanceOf(address(family)) + family.parked(address(usdc)),
            family.held(address(usdc)) + family.owedTotal(address(usdc))
        );
    }

    // ------------------------------- Payouts ------------------------------

    function testFuzz_payouts_and_the_fee_add_up_to_what_was_funded(
        uint16 feeBps,
        uint256 amount,
        uint256 toSeller,
        uint256 fee,
        bool sellerBlocked
    ) public {
        feeBps = uint16(bound(feeBps, 0, 1_000));
        amount = bound(amount, 1, PER_DEAL);
        hub.setFamilyFee(address(family), feeBps);
        _openDeal(_one(seller), 30 days);
        _fundDeal(amount);
        uint256 cap = (amount * feeBps) / 10_000;
        assertEq(family.feeLeft(DEAL), cap);

        toSeller = bound(toSeller, 0, amount);
        fee = bound(fee, 0, _min(cap, amount - toSeller));
        if (sellerBlocked) usdc.setBlocked(seller, true);
        family.pay(DEAL, seller, toSeller);
        family.payFee(DEAL, fee);
        uint256 left = family.feeLeft(DEAL);
        assertEq(left, cap - fee);
        vm.expectRevert(KarwanSettlementBase.FeeTooHigh.selector);
        family.payFee(DEAL, left + 1);
        uint256 toBuyer = amount - toSeller - fee;
        family.pay(DEAL, buyer, toBuyer);

        DealAccount memory a = family.accountOf(DEAL);
        assertEq(a.balance, 0);
        assertEq(a.feePaid, fee);
        assertEq(family.held(address(usdc)), 0);
        assertEq(usdc.balanceOf(feeSafe), fee);
        assertEq(_received(seller), toSeller);
        assertEq(family.owed(address(usdc), seller), sellerBlocked ? toSeller : 0);
        assertEq(usdc.balanceOf(buyer), BUYER_CASH - amount + toBuyer);
        assertEq(_received(seller) + usdc.balanceOf(feeSafe) + usdc.balanceOf(buyer) - (BUYER_CASH - amount), amount);
        assertEq(usdc.balanceOf(address(family)), family.owedTotal(address(usdc)));
        assertEq(_received(stranger), 0);

        family.close(DEAL);
        if (sellerBlocked && toSeller != 0) {
            usdc.setBlocked(seller, false);
            vm.prank(seller);
            family.withdrawOwed(address(usdc));
            assertEq(usdc.balanceOf(seller), toSeller);
            assertEq(family.owedTotal(address(usdc)), 0);
            assertEq(usdc.balanceOf(address(family)), 0);
        }
    }

    function testFuzz_the_fee_room_is_the_rate_on_everything_funded_less_fees_paid(
        uint16 feeBps,
        uint256 first,
        uint256 paidOut,
        uint256 fee1,
        uint256 second
    ) public {
        feeBps = uint16(bound(feeBps, 0, 1_000));
        first = bound(first, 1, PER_DEAL);
        hub.setFamilyFee(address(family), feeBps);
        _openDeal(_one(seller), 30 days);
        _fundDeal(first);
        paidOut = bound(paidOut, 0, first);
        family.pay(DEAL, seller, paidOut);
        fee1 = bound(fee1, 0, _min((first * feeBps) / 10_000, first - paidOut));
        family.payFee(DEAL, fee1);

        uint256 balance = first - paidOut - fee1;
        second = bound(second, 0, PER_DEAL - balance);
        if (second != 0) _fundDeal(second);
        uint256 funded = first + second;
        uint256 cap = (funded * feeBps) / 10_000;
        assertEq(family.feeLeft(DEAL), cap - fee1);

        uint256 fee2 = _min(cap - fee1, balance + second);
        family.payFee(DEAL, fee2);
        uint256 left = family.feeLeft(DEAL);
        assertEq(left, cap - fee1 - fee2);
        vm.expectRevert(KarwanSettlementBase.FeeTooHigh.selector);
        family.payFee(DEAL, left + 1);
        assertLe(fee1 + fee2, cap);
        assertEq(family.accountOf(DEAL).feePaid, fee1 + fee2);
        assertEq(usdc.balanceOf(feeSafe), fee1 + fee2);

        uint256 rest = balance + second - fee2;
        family.pay(DEAL, buyer, rest);
        assertEq(family.accountOf(DEAL).balance, 0);
        assertEq(usdc.balanceOf(address(family)), 0);
        assertEq(
            usdc.balanceOf(seller) + usdc.balanceOf(feeSafe) + usdc.balanceOf(buyer) - (BUYER_CASH - funded), funded
        );
        assertEq(_received(stranger), 0);
    }

    // ------------------------------- Pledges ------------------------------

    function testFuzz_a_pledge_is_taken_in_parts_and_closing_frees_the_rest(
        uint256 first,
        uint256 pledgedAmount,
        uint256 part,
        uint256 toSeller
    ) public {
        first = bound(first, 1, PER_DEAL - 1);
        pledgedAmount = bound(pledgedAmount, 1, PER_DEAL - first);
        _openDeal(_one(seller), 30 days);
        vm.startPrank(buyer);
        family.fund(DEAL, first);
        family.pledge(DEAL, pledgedAmount);
        vm.stopPrank();
        assertEq(family.accountOf(DEAL).promised, pledgedAmount);
        assertEq(family.promisedTotal(address(usdc)), pledgedAmount);

        part = bound(part, 1, pledgedAmount);
        _fundDeal(part);
        uint256 rest = pledgedAmount - part;
        assertEq(family.accountOf(DEAL).promised, rest);
        assertEq(family.promisedTotal(address(usdc)), rest);
        if (rest != 0) {
            vm.prank(buyer);
            vm.expectRevert(KarwanSettlementBase.OverCap.selector);
            family.fund(DEAL, rest + 1);
        }
        uint256 inDeal = first + part;
        DealAccount memory a = family.accountOf(DEAL);
        assertEq(a.funded, inDeal);
        assertEq(a.balance, inDeal);
        assertEq(family.held(address(usdc)), inDeal);
        assertEq(usdc.balanceOf(address(family)), inDeal);

        toSeller = bound(toSeller, 0, inDeal);
        family.pay(DEAL, seller, toSeller);
        family.pay(DEAL, buyer, inDeal - toSeller);
        family.close(DEAL);
        assertEq(family.accountOf(DEAL).promised, 0);
        assertEq(family.promisedTotal(address(usdc)), 0);
        assertEq(family.held(address(usdc)), 0);
        assertEq(usdc.balanceOf(address(family)), 0);
        assertEq(usdc.balanceOf(seller), toSeller);
        assertEq(usdc.balanceOf(buyer), BUYER_CASH - toSeller);
    }

    // ----------------------------- Assignment -----------------------------

    function testFuzz_an_assignee_is_paid_first_and_never_beyond_the_signed_amount(
        uint256 amount,
        uint128 assigned,
        uint256 firstPay,
        uint256 nonce,
        bool bySignature,
        bool assigneeBlocked
    ) public {
        amount = bound(amount, 1, PER_DEAL);
        assigned = uint128(bound(assigned, 1, 2 * uint256(PER_DEAL)));
        _openDeal(_one(seller), 30 days);
        _fundDeal(amount);
        _assignToFinancier(assigned, nonce, bySignature);
        if (assigneeBlocked) usdc.setBlocked(financier, true);

        firstPay = bound(firstPay, 0, amount);
        family.pay(DEAL, seller, firstPay);
        uint256 firstCut = _min(assigned, firstPay);
        assertEq(_received(financier), firstCut);
        assertEq(usdc.balanceOf(seller), firstPay - firstCut);

        family.pay(DEAL, seller, amount - firstPay);
        uint256 cut = _min(assigned, amount);
        (address assignee, uint128 signedFor, uint128 paid) = family.assignmentOf(DEAL, seller);
        assertEq(assignee, financier);
        assertEq(signedFor, assigned);
        assertEq(paid, cut);
        assertEq(_received(financier), cut);
        assertEq(family.owed(address(usdc), financier), assigneeBlocked ? cut : 0);
        assertEq(usdc.balanceOf(seller), amount - cut);
        assertEq(_received(financier) + _received(seller), amount);
        assertEq(usdc.balanceOf(address(family)), family.owedTotal(address(usdc)));
        assertEq(usdc.balanceOf(buyer), BUYER_CASH - amount);
        assertEq(_received(stranger), 0);
    }

    /// The seller assigns directly, or signs and the financier submits.
    function _assignToFinancier(uint128 assigned, uint256 nonce, bool bySignature) internal {
        if (!bySignature) {
            vm.prank(seller);
            family.assignPayout(DEAL, seller, financier, assigned, 0, 0, "");
            return;
        }
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = family.assignDigest(DEAL, seller, financier, assigned, financier, nonce, deadline);
        bytes memory s = _sig(sellerKey, d);
        vm.prank(financier);
        family.assignPayout(DEAL, seller, financier, assigned, nonce, deadline, s);
        assertTrue(family.nonceUsed(seller, nonce));
    }

    // ------------------------------ Long-stop -----------------------------

    function testFuzz_a_longstop_split_pays_exactly_the_balance_and_only_to_the_parties(
        uint8 count,
        uint256 amount,
        uint256 paidBefore,
        uint256[8] memory shares,
        uint128 assigned,
        bool payerBlocked,
        uint256 late
    ) public {
        address[] memory payees = _payees(bound(count, 1, 8));
        amount = bound(amount, 1, PER_DEAL);
        uint64 horizon = uint64(vm.getBlockTimestamp()) + 30 days;
        vm.startPrank(buyer);
        family.open(DEAL, address(usdc), payees, horizon);
        family.fund(DEAL, amount);
        vm.stopPrank();
        paidBefore = bound(paidBefore, 0, amount - 1);
        family.pay(DEAL, payees[0], paidBefore);
        assigned = uint128(bound(assigned, 0, amount - paidBefore));
        if (assigned != 0) {
            vm.prank(payees[0]);
            family.assignPayout(DEAL, payees[0], financier, assigned, 0, 0, "");
        }
        (uint256[] memory toPayees, uint256 toPayer) = _shares(shares, payees.length, amount - paidBefore);
        if (payerBlocked) usdc.setBlocked(buyer, true);
        vm.warp(uint256(horizon) + 180 days + bound(late, 0, 365 days));
        vm.startPrank(seniorSafe);
        vm.expectRevert(KarwanSettlementBase.BadAmount.selector);
        family.longstopSplit(DEAL, toPayer + 1, toPayees);
        family.longstopSplit(DEAL, toPayer, toPayees);
        vm.stopPrank();
        _checkLongstop(payees, toPayees, toPayer, paidBefore, assigned, payerBlocked, amount);
    }

    function _payees(uint256 n) internal returns (address[] memory payees) {
        payees = new address[](n);
        for (uint256 i; i < n; ++i) {
            payees[i] = makeAddr(string.concat("payee", _digit(i)));
        }
    }

    /// Splits `balance` between `n` payees from the fuzzed shares; the payer
    /// takes what is left, so the parts always sum to the balance.
    function _shares(uint256[8] memory shares, uint256 n, uint256 balance)
        internal
        pure
        returns (uint256[] memory toPayees, uint256 toPayer)
    {
        toPayees = new uint256[](n);
        toPayer = balance;
        for (uint256 i; i < n; ++i) {
            toPayees[i] = bound(shares[i], 0, toPayer);
            toPayer -= toPayees[i];
        }
    }

    function _checkLongstop(
        address[] memory payees,
        uint256[] memory toPayees,
        uint256 toPayer,
        uint256 paidBefore,
        uint256 assigned,
        bool payerBlocked,
        uint256 amount
    ) internal view {
        uint256 cut = _min(assigned, toPayees[0]);
        assertEq(_received(financier), cut);
        assertEq(_received(payees[0]), paidBefore + toPayees[0] - cut);
        uint256 total = _received(financier) + _received(payees[0]);
        for (uint256 i = 1; i < payees.length; ++i) {
            assertEq(_received(payees[i]), toPayees[i]);
            total += _received(payees[i]);
        }
        assertEq(family.owed(address(usdc), buyer), payerBlocked ? toPayer : 0);
        assertEq(_received(buyer), BUYER_CASH - amount + toPayer);
        total += _received(buyer) - (BUYER_CASH - amount);
        assertEq(total, amount);

        DealAccount memory a = family.accountOf(DEAL);
        assertEq(a.balance, 0);
        assertTrue(a.closed);
        assertTrue(family.longstopped(DEAL));
        assertEq(family.held(address(usdc)), 0);
        assertEq(usdc.balanceOf(address(family)), family.owedTotal(address(usdc)));
        assertEq(_received(stranger), 0);
        assertEq(_received(feeSafe), 0);
    }

    // -------------------------------- Holds -------------------------------

    function testFuzz_a_hold_delays_claims_and_moves_no_money(
        uint256 amount,
        uint256 refund,
        uint256 claimed,
        uint256 wait
    ) public {
        amount = bound(amount, 1, PER_DEAL);
        _openDeal(_one(seller), 30 days);
        _fundDeal(amount);
        uint256 t0 = vm.getBlockTimestamp();
        DealAccount memory before = family.accountOf(DEAL);
        uint256 feeRoom = family.feeLeft(DEAL);

        vm.prank(guardian);
        family.hold(DEAL, bytes32("scan"));
        DealAccount memory onHold = family.accountOf(DEAL);
        assertEq(onHold.funded, before.funded);
        assertEq(onHold.balance, before.balance);
        assertEq(onHold.feePaid, before.feePaid);
        assertEq(onHold.holdUntil, uint64(t0 + 7 days));
        assertEq(onHold.holdUsed, 7 days);
        assertEq(family.feeLeft(DEAL), feeRoom);
        assertEq(family.held(address(usdc)), amount);
        assertEq(usdc.balanceOf(address(family)), amount);

        refund = bound(refund, 0, amount);
        family.pay(DEAL, buyer, refund);
        assertEq(usdc.balanceOf(buyer), BUYER_CASH - amount + refund);
        claimed = bound(claimed, 0, amount - refund);
        wait = bound(wait, 0, 14 days);
        vm.warp(t0 + wait);
        if (wait < 7 days) {
            vm.expectRevert(KarwanSettlementBase.OnHold.selector);
            family.claim(DEAL, seller, claimed);
            assertEq(usdc.balanceOf(seller), 0);
            vm.warp(t0 + 7 days);
        }
        family.claim(DEAL, seller, claimed);
        assertEq(usdc.balanceOf(seller), claimed);
        assertEq(family.accountOf(DEAL).balance, amount - refund - claimed);
        assertEq(family.held(address(usdc)), amount - refund - claimed);
        assertEq(usdc.balanceOf(address(family)), amount - refund - claimed);
        assertEq(family.feeLeft(DEAL), feeRoom);
    }

    // -------------------------------- Yield -------------------------------

    function testFuzz_parked_money_comes_back_in_full_at_any_teller_price(
        uint16 share,
        uint256 amount,
        uint256 price,
        uint256 spread
    ) public {
        share = uint16(bound(share, 1, 9_000));
        amount = bound(amount, 1, YIELD_DEAL_CAP);
        price = bound(price, 0.5e18, 3e18);
        spread = bound(spread, 0, 100);
        hub.setCaps(address(family), address(usdc), uint128(YIELD_DEAL_CAP), uint128(BUYER_CASH));
        _deployYield(address(family), share);
        teller.setSpread(spread);
        _openDeal(_one(seller), 30 days);
        _fundDeal(amount);

        family.rebalanceYield(address(usdc));
        uint256 parked = (amount * share) / 10_000;
        assertEq(family.parked(address(usdc)), parked);
        assertEq(pool.principalOf(address(family)), parked);
        assertEq(usdc.balanceOf(address(family)), amount - parked);
        pool.rebalance();
        assertGe(pool.value(), pool.totalPrincipal());

        teller.setPrice(price);
        uint256 hole = pool.deficit();
        if (hole != 0) {
            usdc.mint(feeSafe, hole);
            vm.startPrank(feeSafe);
            usdc.approve(address(pool), hole);
            pool.backstop(hole);
            vm.stopPrank();
            assertEq(pool.deficit(), 0);
        }
        uint256 line = pool.totalPrincipal() + pool.cushion();
        uint256 worth = pool.value();
        (bool swept,) = address(pool).call(abi.encodeCall(pool.sweepYield, ()));
        uint256 yieldPaid = usdc.balanceOf(feeSafe);
        if (swept) {
            assertGt(yieldPaid, 0);
            assertLe(yieldPaid, worth - line);
            assertGe(pool.value(), line);
        } else {
            assertEq(yieldPaid, 0);
        }
        _books();

        family.pay(DEAL, seller, amount);
        assertEq(usdc.balanceOf(seller), amount);
        assertEq(family.owed(address(usdc), seller), 0);
        assertEq(family.parked(address(usdc)), 0);
        assertEq(family.held(address(usdc)), 0);
        assertEq(usdc.balanceOf(address(family)), 0);
        assertEq(pool.principalOf(address(family)), 0);
        assertEq(pool.totalPrincipal(), 0);
        assertEq(usdc.balanceOf(feeSafe), yieldPaid);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function testFuzz_parked_money_follows_the_eligible_share_of_what_the_deal_holds(
        uint16 share,
        uint256 amount,
        uint256 toSeller,
        uint256 fee
    ) public {
        share = uint16(bound(share, 1, 9_000));
        amount = bound(amount, 1, YIELD_DEAL_CAP);
        hub.setCaps(address(family), address(usdc), uint128(YIELD_DEAL_CAP), uint128(BUYER_CASH));
        _deployYield(address(family), share);
        _openDeal(_one(seller), 30 days);
        _fundDeal(amount);
        uint256 parkable = (amount * share) / 10_000;
        assertEq(family.parkable(address(usdc)), parkable);
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), parkable);
        assertEq(usdc.balanceOf(address(family)), amount - parkable);
        _books();

        toSeller = bound(toSeller, 0, amount);
        family.pay(DEAL, seller, toSeller);
        parkable = _less(parkable, (toSeller * share) / 10_000);
        uint256 holding = amount - toSeller;
        assertEq(family.parkable(address(usdc)), parkable);
        assertEq(family.parked(address(usdc)), _min(parkable, holding));
        assertEq(pool.principalOf(address(family)), family.parked(address(usdc)));
        assertEq(usdc.balanceOf(seller), toSeller);
        _books();

        fee = bound(fee, 0, _min(family.feeLeft(DEAL), holding));
        uint256 parkedBefore = family.parked(address(usdc));
        family.payFee(DEAL, fee);
        if (fee != 0) {
            parkable = _less(parkable, (fee * share) / 10_000);
            holding -= fee;
        }
        assertEq(family.parkable(address(usdc)), parkable);
        assertEq(family.parked(address(usdc)), _min(parkedBefore, _min(parkable, holding)));
        assertEq(usdc.balanceOf(feeSafe), fee);
        _books();

        family.pay(DEAL, buyer, holding);
        family.rebalanceYield(address(usdc));
        assertEq(family.parked(address(usdc)), 0);
        assertEq(pool.principalOf(address(family)), 0);
        assertEq(family.held(address(usdc)), 0);
        assertEq(usdc.balanceOf(address(family)), 0);
        assertEq(usdc.balanceOf(seller) + usdc.balanceOf(feeSafe) + usdc.balanceOf(buyer), BUYER_CASH);
        _books();
    }

    function _less(uint256 left, uint256 share) internal pure returns (uint256) {
        return left > share ? left - share : 0;
    }

    // ----------------------------- Stake vault ----------------------------

    function testFuzz_a_slash_pays_only_the_beneficiary_and_never_more_than_was_reserved(
        uint256 staked,
        uint256 reserved,
        uint256 cooling,
        uint256 first,
        uint256 second,
        bool blocked
    ) public {
        staked = bound(staked, 1, 1_000_000e6);
        reserved = bound(reserved, 1, staked);
        cooling = bound(cooling, 0, staked - reserved);
        uint256 t0 = vm.getBlockTimestamp();
        _stakeAndReserve(staked, reserved, cooling);
        assertEq(vault.freeOf(sellerId, address(usdc)), staked - reserved - cooling);
        _refuseMoreThanFree(staked - reserved - cooling);

        if (blocked) usdc.setBlocked(beneficiary, true);
        uint256 paid = _slashTwice(reserved, first, second);
        _checkSlashed(staked, reserved, cooling, paid, blocked);

        vm.prank(address(family));
        vault.release(REF);
        assertEq(vault.stakeOf(sellerId, address(usdc)).reserved, 0);
        assertEq(vault.freeOf(sellerId, address(usdc)), staked - paid - cooling);
        if (cooling != 0) {
            vm.warp(t0 + 7 days);
            vm.prank(seller);
            vault.withdraw(address(usdc));
            assertEq(usdc.balanceOf(seller), cooling);
            assertEq(vault.stakeOf(sellerId, address(usdc)).active, staked - paid - cooling);
        }
        if (blocked && paid != 0) {
            usdc.setBlocked(beneficiary, false);
            vm.prank(beneficiary);
            vault.withdrawOwed(address(usdc));
            assertEq(usdc.balanceOf(beneficiary), paid);
        }
        assertEq(
            usdc.balanceOf(address(vault)),
            uint256(vault.stakeOf(sellerId, address(usdc)).active) + vault.owedTotal(address(usdc))
        );
    }

    function _reserveSig(bytes32 ref, uint128 amount) internal view returns (bytes memory) {
        bytes32 d = vault.reserveDigest(
            address(family), ref, address(usdc), amount, beneficiary, uint64(block.timestamp + 90 days), block.timestamp + 1 hours
        );
        return _sig(sellerKey, d);
    }

    function _stakeAndReserve(uint256 staked, uint256 reserved, uint256 cooling) internal {
        usdc.mint(seller, staked);
        vm.startPrank(seller);
        usdc.approve(address(vault), staked);
        vault.stake(address(usdc), staked);
        if (cooling != 0) vault.requestWithdraw(address(usdc), cooling);
        vm.stopPrank();
        bytes memory sig = _reserveSig(REF, uint128(reserved));
        vm.prank(address(family));
        vault.reserve(
            REF,
            seller,
            address(usdc),
            uint128(reserved),
            beneficiary,
            uint64(block.timestamp + 90 days),
            block.timestamp + 1 hours,
            sig
        );
    }

    function _refuseMoreThanFree(uint256 free) internal {
        bytes32 more = bytes32("one-more");
        uint128 over = uint128(free + 1);
        bytes memory sig = _reserveSig(more, over);
        uint64 expiresAt = uint64(block.timestamp + 90 days);
        uint256 deadline = block.timestamp + 1 hours;
        vm.prank(address(family));
        vm.expectRevert(KarwanStakeVault.NotEnoughStake.selector);
        vault.reserve(more, seller, address(usdc), over, beneficiary, expiresAt, deadline, sig);
    }

    /// Two slashes of fuzzed size; each pays what was asked, capped at what
    /// is still reserved, and a spent reservation takes no more.
    function _slashTwice(uint256 reserved, uint256 first, uint256 second) internal returns (uint256 paid) {
        first = bound(first, 0, 2 * reserved);
        vm.prank(address(family));
        paid = vault.slash(REF, first);
        assertEq(paid, _min(first, reserved));
        uint256 left = reserved - paid;
        second = bound(second, 0, 2 * reserved);
        if (left == 0) {
            assertFalse(vault.reservationOf(address(family), REF).active);
            vm.prank(address(family));
            vm.expectRevert(KarwanStakeVault.NotActive.selector);
            vault.slash(REF, second);
            return paid;
        }
        vm.prank(address(family));
        uint256 again = vault.slash(REF, second);
        assertEq(again, _min(second, left));
        paid += again;
        assertLe(paid, reserved);
    }

    function _checkSlashed(uint256 staked, uint256 reserved, uint256 cooling, uint256 paid, bool blocked)
        internal
        view
    {
        KarwanStakeVault.Stake memory k = vault.stakeOf(sellerId, address(usdc));
        assertEq(k.active, staked - paid);
        assertEq(k.reserved, reserved - paid);
        assertEq(k.cooling, cooling);
        assertEq(vault.reservationOf(address(family), REF).amount, reserved - paid);
        assertEq(usdc.balanceOf(beneficiary) + vault.owed(address(usdc), beneficiary), paid);
        assertEq(vault.owed(address(usdc), beneficiary), blocked ? paid : 0);
        assertEq(usdc.balanceOf(address(vault)), uint256(k.active) + vault.owedTotal(address(usdc)));
        assertEq(usdc.balanceOf(stranger), 0);
        assertEq(usdc.balanceOf(seller), 0);
    }
}

/// @notice Trade finance on an Agreement deal under fuzzed terms and a fuzzed
///         split: the escrow repays the financier first, the stake covers only
///         the shortfall, and the financier never gets more than the repayment.
contract TradeFinanceFuzzTest is AgreementFixture {
    KarwanTradeFinance internal tf;
    address internal financier = makeAddr("financier");
    uint256 internal constant FINANCIER_CASH = 1_000e6;
    uint128 internal constant SELLER_STAKE = 100e6;
    uint8 internal constant REPAID = 2;
    uint8 internal constant DEFAULTED = 3;

    function setUp() public {
        _deployAgreement();
        tf = new KarwanTradeFinance(address(hub));
        hub.registerFamily(address(tf), 0);
        usdc.mint(financier, FINANCIER_CASH);
        vm.prank(financier);
        usdc.approve(address(tf), type(uint256).max);
        usdc.mint(seller, SELLER_STAKE);
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vault.stake(address(usdc), SELLER_STAKE);
        vm.stopPrank();
    }

    function _openLine(bytes32 id, uint128 advance, uint128 repay, uint128 stake) internal returns (bytes32 lineId) {
        uint256 deadline = block.timestamp + 1 hours;
        uint64 expiresAt = escrow.accountOf(id).horizon + 180 days + 30 days;
        bytes32 a = escrow.assignDigest(id, seller, financier, repay, address(tf), 7, deadline);
        KarwanTradeFinance.Signed memory assign = KarwanTradeFinance.Signed(7, deadline, _sig(sellerKey, a));
        lineId = tf.lineIdFor(address(escrow), id, financier, advance, repay, stake);
        bytes32 r = vault.reserveDigest(address(tf), lineId, address(usdc), stake, financier, expiresAt, deadline);
        KarwanTradeFinance.StakeSig memory reservation = KarwanTradeFinance.StakeSig(deadline, _sig(sellerKey, r));
        vm.prank(financier);
        bytes32 opened = tf.open(address(escrow), id, advance, repay, stake, expiresAt, assign, reservation);
        assertEq(opened, lineId);
    }

    function testFuzz_a_line_is_repaid_from_the_deal_first_and_the_stake_covers_only_the_shortfall(
        uint256 advance,
        uint256 repay,
        uint256 stake,
        uint16 sellerBps,
        bool financierBlocked
    ) public {
        bytes32 id = _fundAccepted(_terms(), bytes32("line"));
        uint256 unpaid = escrow.receivableOf(id).unpaid;
        advance = bound(advance, 1, unpaid);
        repay = bound(repay, advance, unpaid);
        stake = bound(stake, (advance + 9) / 10, SELLER_STAKE);
        sellerBps = uint16(bound(sellerBps, 0, 10_000));
        bytes32 lineId = _openLine(id, uint128(advance), uint128(repay), uint128(stake));
        assertEq(usdc.balanceOf(seller), advance);
        assertEq(usdc.balanceOf(financier), FINANCIER_CASH - advance);
        assertEq(usdc.balanceOf(address(tf)), 0);

        if (financierBlocked) usdc.setBlocked(financier, true);
        uint256 held = usdc.balanceOf(address(escrow));
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 feeBefore = usdc.balanceOf(feeSafe);
        vm.prank(buyer);
        escrow.proposeSplit(id, sellerBps);
        vm.prank(seller);
        escrow.acceptSplit(id, sellerBps);
        uint256 toSeller = (unpaid * sellerBps) / 10_000;
        uint256 viaEscrow = toSeller < repay ? toSeller : repay;
        // Everything the deal held leaves it: the seller's share, the fee and the
        // buyer's refund, apart from what is owed to a blocked financier.
        assertEq(
            toSeller + (usdc.balanceOf(feeSafe) - feeBefore) + (usdc.balanceOf(buyer) - buyerBefore),
            held - usdc.balanceOf(address(escrow)) + escrow.owed(address(usdc), financier)
        );
        (,, uint128 paid) = escrow.assignmentOf(id, seller);
        assertEq(paid, viaEscrow);
        assertEq(escrow.owed(address(usdc), financier), financierBlocked ? viaEscrow : 0);
        assertEq(usdc.balanceOf(seller), advance + toSeller - viaEscrow);
        assertEq(usdc.balanceOf(address(escrow)), escrow.owedTotal(address(usdc)));

        vm.prank(stranger);
        tf.settle(lineId);
        _checkSettled(lineId, advance, repay, stake, viaEscrow, financierBlocked);
    }

    function _checkSettled(
        bytes32 lineId,
        uint256 advance,
        uint256 repay,
        uint256 stake,
        uint256 viaEscrow,
        bool financierBlocked
    ) internal view {
        uint256 shortfall = repay - viaEscrow;
        uint256 fromStake = shortfall < stake ? shortfall : stake;
        assertEq(tf.lineOf(lineId).state, shortfall == 0 ? REPAID : DEFAULTED);
        uint256 got =
            usdc.balanceOf(financier) + escrow.owed(address(usdc), financier) + vault.owed(address(usdc), financier);
        assertEq(got, FINANCIER_CASH - advance + viaEscrow + fromStake);
        assertLe(viaEscrow + fromStake, repay);
        assertEq(vault.owed(address(usdc), financier), financierBlocked ? fromStake : 0);
        KarwanStakeVault.Stake memory k = vault.stakeOf(sellerId, address(usdc));
        assertEq(k.active, SELLER_STAKE - fromStake);
        assertEq(k.reserved, 0);
        assertEq(vault.freeOf(sellerId, address(usdc)), SELLER_STAKE - fromStake);
        assertFalse(vault.reservationOf(address(tf), lineId).active);
        assertEq(usdc.balanceOf(address(vault)), uint256(k.active) + vault.owedTotal(address(usdc)));
        assertEq(usdc.balanceOf(address(tf)), 0);
        assertEq(usdc.balanceOf(stranger), 0);
    }
}
