// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgreementFixture} from "./AgreementFixture.sol";
import {KarwanAgreementEscrow} from "../../../src/suite/KarwanAgreementEscrow.sol";
import {AgreementTerms, AgreementDeal, AgreementState} from "../../../src/suite/agreement/AgreementTypes.sol";
import {BlocklistToken} from "../mocks/BlocklistToken.sol";

contract AgreementHandler is Test {
    KarwanAgreementEscrow internal escrow;
    BlocklistToken internal usdc;
    address[3] public buyers;
    address[3] public sellers;
    address public stranger = makeAddr("stranger");
    bytes32[] public deals;
    mapping(bytes32 => AgreementTerms) internal termsOf;
    bool public releaseFailed;
    uint256 public fundedTotal;

    constructor(KarwanAgreementEscrow escrow_, BlocklistToken usdc_) {
        escrow = escrow_;
        usdc = usdc_;
        for (uint256 i; i < 3; ++i) {
            buyers[i] = makeAddr(string(abi.encodePacked("buyer", vm.toString(i))));
            sellers[i] = makeAddr(string(abi.encodePacked("seller", vm.toString(i))));
            usdc.mint(buyers[i], 10_000_000e6);
            vm.prank(buyers[i]);
            usdc.approve(address(escrow), type(uint256).max);
        }
    }

    function dealCount() external view returns (uint256) {
        return deals.length;
    }

    function fund(uint256 who, uint256 amount, uint8 tranches, bool byBuyer, bool deposit) external {
        AgreementTerms memory t;
        t.asset = address(usdc);
        t.seller = sellers[who % 3];
        t.amount = uint128(bound(amount, 1e6, 500e6));
        tranches = uint8(bound(tranches, 1, 3));
        for (uint8 i; i < tranches; ++i) t.trancheBps[i] = uint16(10_000 / tranches);
        t.trancheBps[tranches - 1] += uint16(10_000 - (10_000 / tranches) * tranches);
        t.acceptBy = uint64(block.timestamp + 1 days);
        t.deliveryDeadline = uint64(block.timestamp + 10 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = 2 days;
        t.silentLongstop = 5 days;
        t.finalRelease = byBuyer ? 1 : 0;
        t.silenceOutcome = deposit ? 1 : 0;
        t.agreementHash = keccak256("a");
        bytes32 salt = keccak256(abi.encode(deals.length));
        vm.prank(buyers[who % 3]);
        try escrow.fund(salt, t) returns (bytes32 id) {
            deals.push(id);
            termsOf[id] = t;
            fundedTotal += escrow.accountOf(id).funded;
        } catch {}
    }

    function _pick(uint256 seed) internal view returns (bytes32 id, AgreementDeal memory d) {
        id = deals[seed % deals.length];
        d = escrow.getDeal(id);
    }

    function accept(uint256 seed) external {
        if (deals.length == 0) return;
        (bytes32 id,) = _pick(seed);
        bytes32 h = escrow.termsHashOf(termsOf[id]);
        vm.prank(termsOf[id].seller);
        try escrow.accept(id, h) {} catch {}
    }

    function deliver(uint256 seed) external {
        if (deals.length == 0) return;
        (bytes32 id,) = _pick(seed);
        vm.prank(termsOf[id].seller);
        try escrow.markDelivered(id, bytes32(0)) {} catch {}
    }

    function release(uint256 seed) external {
        if (deals.length == 0) return;
        (bytes32 id, AgreementDeal memory d) = _pick(seed);
        if (d.state != AgreementState.Accepted) return;
        vm.prank(escrow.accountOf(id).payer);
        try escrow.release(id) {} catch {
            releaseFailed = true;
        }
    }

    function claim(uint256 seed) external {
        if (deals.length == 0) return;
        (bytes32 id,) = _pick(seed);
        vm.prank(termsOf[id].seller);
        try escrow.claim(id) {} catch {}
    }

    function reclaim(uint256 seed) external {
        if (deals.length == 0) return;
        (bytes32 id,) = _pick(seed);
        vm.prank(escrow.accountOf(id).payer);
        try escrow.reclaim(id) {} catch {}
    }

    function split(uint256 seed, uint16 bps) external {
        if (deals.length == 0) return;
        (bytes32 id,) = _pick(seed);
        bps = uint16(bound(bps, 0, 10_000));
        vm.prank(escrow.accountOf(id).payer);
        try escrow.proposeSplit(id, bps) {} catch {
            return;
        }
        vm.prank(termsOf[id].seller);
        try escrow.acceptSplit(id, bps) {} catch {}
    }

    function cancel(uint256 seed) external {
        if (deals.length == 0) return;
        (bytes32 id,) = _pick(seed);
        vm.prank(escrow.accountOf(id).payer);
        try escrow.cancelUnaccepted(id) {} catch {}
    }

    function strangerTries(uint256 seed) external {
        if (deals.length == 0) return;
        (bytes32 id,) = _pick(seed);
        vm.startPrank(stranger);
        try escrow.release(id) {} catch {}
        try escrow.claim(id) {} catch {}
        try escrow.reclaim(id) {} catch {}
        vm.stopPrank();
    }

    function wait(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1 hours, 6 days));
    }
}

contract AgreementInvariantTest is AgreementFixture {
    AgreementHandler internal handler;

    function setUp() public {
        _deployAgreement();
        hub.setCaps(address(escrow), address(usdc), PER_DEAL, 100_000_000e6);
        handler = new AgreementHandler(escrow, usdc);
        targetContract(address(handler));
    }

    function invariant_books_balance() public view {
        assertEq(usdc.balanceOf(address(escrow)), escrow.held(address(usdc)) + escrow.owedTotal(address(usdc)));
    }

    function invariant_ended_deals_hold_nothing_and_open_deals_hold_their_books() public view {
        uint256 sum;
        for (uint256 i; i < handler.dealCount(); ++i) {
            bytes32 id = handler.deals(i);
            AgreementDeal memory d = escrow.getDeal(id);
            uint256 balance = escrow.accountOf(id).balance;
            if (uint8(d.state) >= uint8(AgreementState.Settled)) {
                assertEq(balance, 0);
            } else {
                assertEq(balance, (d.sellerNet - d.released) + (d.feeTotal - d.feeReleased));
            }
            sum += balance;
        }
        assertEq(sum, escrow.held(address(usdc)));
    }

    function invariant_no_stranger_is_paid() public view {
        assertEq(usdc.balanceOf(handler.stranger()), 0);
    }

    function invariant_fee_never_above_one_percent_of_funding() public view {
        assertLe(usdc.balanceOf(feeSafe), handler.fundedTotal() / 100);
    }

    function invariant_buyer_release_always_works_on_a_live_deal() public view {
        assertFalse(handler.releaseFailed());
    }
}
