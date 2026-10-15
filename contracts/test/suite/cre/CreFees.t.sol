// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KarwanCreFees} from "../../../src/suite/KarwanCreFees.sol";
import {Mock3009} from "./mocks/Mock3009.sol";

contract CreFeesTest is Test {
    uint256 internal constant PRICE = 250_000;
    bytes32 internal constant RESULT = keccak256("result");

    Mock3009 internal usdc;
    KarwanCreFees internal fees;
    address internal adapter = makeAddr("adapter");
    address internal payee = makeAddr("karwanFees");
    address internal stranger = makeAddr("stranger");
    address internal payer;
    uint256 internal payerKey;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new Mock3009();
        fees = new KarwanCreFees(address(usdc), adapter, payee, PRICE);
        (payer, payerKey) = makeAddrAndKey("agent");
        usdc.mint(payer, 10 * PRICE);
    }

    function _signed(address to, uint256 value, bytes32 nonce) internal view returns (bytes memory) {
        bytes32 d = usdc.receiveDigest(payer, to, value, 0, block.timestamp + 1 hours, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, d);
        return abi.encodePacked(r, s, v);
    }

    function _open(bytes32 nonce) internal returns (bytes32) {
        return fees.open(payer, PRICE, 0, block.timestamp + 1 hours, nonce, _signed(address(fees), PRICE, nonce));
    }

    function test_open_takes_the_signed_payment_and_records_who_paid() public {
        vm.prank(stranger);
        bytes32 runId = _open("n1");
        assertEq(runId, fees.runIdOf(payer, "n1"));
        (address p, uint64 openedAt, KarwanCreFees.State state, uint256 amount) = fees.runs(runId);
        assertEq(p, payer);
        assertEq(openedAt, block.timestamp);
        assertEq(uint8(state), uint8(KarwanCreFees.State.Open));
        assertEq(amount, PRICE);
        assertEq(usdc.balanceOf(address(fees)), PRICE);
        assertEq(fees.held(), PRICE);
    }

    function test_open_refuses_another_amount_a_reused_run_and_a_payment_signed_for_someone_else() public {
        bytes memory more = _signed(address(fees), PRICE + 1, "n1");
        vm.expectRevert(KarwanCreFees.BadAmount.selector);
        fees.open(payer, PRICE + 1, 0, block.timestamp + 1 hours, "n1", more);

        _open("n2");
        bytes memory again = _signed(address(fees), PRICE, "n2");
        vm.expectRevert(KarwanCreFees.RunExists.selector);
        fees.open(payer, PRICE, 0, block.timestamp + 1 hours, "n2", again);

        bytes memory forOther = _signed(stranger, PRICE, "n3");
        vm.expectRevert("FiatTokenV2: invalid signature");
        fees.open(payer, PRICE, 0, block.timestamp + 1 hours, "n3", forOther);
    }

    function test_only_the_adapter_releases_and_only_once() public {
        bytes32 runId = _open("n1");
        vm.prank(stranger);
        vm.expectRevert(KarwanCreFees.NotAdapter.selector);
        fees.release(runId, RESULT);

        vm.expectEmit(true, false, false, true, address(fees));
        emit KarwanCreFees.Released(runId, RESULT);
        vm.prank(adapter);
        fees.release(runId, RESULT);
        assertEq(usdc.balanceOf(payee), PRICE);
        assertEq(fees.held(), 0);

        vm.prank(adapter);
        vm.expectRevert(KarwanCreFees.NotOpen.selector);
        fees.release(runId, RESULT);
    }

    function test_with_no_answer_anyone_refunds_the_payer_after_an_hour() public {
        bytes32 runId = _open("n1");
        vm.warp(block.timestamp + 1 hours - 1);
        vm.expectRevert(KarwanCreFees.TooEarly.selector);
        fees.refund(runId);

        vm.warp(block.timestamp + 1);
        vm.prank(stranger);
        fees.refund(runId);
        assertEq(usdc.balanceOf(payer), 10 * PRICE);
        assertEq(usdc.balanceOf(stranger), 0);

        vm.prank(adapter);
        vm.expectRevert(KarwanCreFees.NotOpen.selector);
        fees.release(runId, RESULT);
        vm.expectRevert(KarwanCreFees.NotOpen.selector);
        fees.refund(runId);
    }

    function test_an_answer_after_the_hour_is_refused_so_the_refund_is_certain() public {
        bytes32 runId = _open("n1");
        vm.warp(block.timestamp + 1 hours);
        vm.prank(adapter);
        vm.expectRevert(KarwanCreFees.TooLate.selector);
        fees.release(runId, RESULT);
        fees.refund(runId);
        assertEq(usdc.balanceOf(payer), 10 * PRICE);
    }

    function test_a_refund_to_a_blocked_payer_is_owed_and_only_the_payer_withdraws_it() public {
        bytes32 runId = _open("n1");
        usdc.setBlocked(payer, true);
        vm.warp(block.timestamp + 1 hours);
        fees.refund(runId);
        assertEq(fees.owed(payer), PRICE);
        assertEq(fees.held(), 0);
        assertEq(usdc.balanceOf(address(fees)), PRICE);

        vm.prank(stranger);
        vm.expectRevert(KarwanCreFees.NothingOwed.selector);
        fees.withdrawOwed();
        vm.prank(payer);
        vm.expectRevert("Blacklistable: account is blacklisted");
        fees.withdrawOwed();

        usdc.setBlocked(payer, false);
        vm.prank(payer);
        fees.withdrawOwed();
        assertEq(usdc.balanceOf(payer), 10 * PRICE);
        assertEq(fees.owed(payer), 0);
        assertEq(fees.owedTotal(), 0);
    }

    function test_a_release_to_a_blocked_payee_is_owed_to_the_payee() public {
        bytes32 runId = _open("n1");
        usdc.setBlocked(payee, true);
        vm.prank(adapter);
        fees.release(runId, RESULT);
        assertEq(fees.owed(payee), PRICE);
        assertEq(fees.owedTotal(), PRICE);
    }

    function test_an_unknown_run_cannot_be_released_or_refunded() public {
        vm.prank(adapter);
        vm.expectRevert(KarwanCreFees.NotOpen.selector);
        fees.release(keccak256("nothing"), RESULT);
        vm.expectRevert(KarwanCreFees.NotOpen.selector);
        fees.refund(keccak256("nothing"));
    }

    function test_construction_needs_every_address_and_a_price() public {
        vm.expectRevert(KarwanCreFees.BadConfig.selector);
        new KarwanCreFees(address(0), adapter, payee, PRICE);
        vm.expectRevert(KarwanCreFees.BadConfig.selector);
        new KarwanCreFees(address(usdc), address(0), payee, PRICE);
        vm.expectRevert(KarwanCreFees.BadConfig.selector);
        new KarwanCreFees(address(usdc), adapter, address(0), PRICE);
        vm.expectRevert(KarwanCreFees.BadConfig.selector);
        new KarwanCreFees(address(usdc), adapter, payee, 0);
    }
}

contract CreFeesHandler is Test {
    Mock3009 internal usdc;
    KarwanCreFees internal fees;
    address internal adapter;
    uint256 internal payerKey;
    address internal payer;
    bytes32[] public runIds;
    uint256 internal next;

    constructor(Mock3009 usdc_, KarwanCreFees fees_, address adapter_) {
        usdc = usdc_;
        fees = fees_;
        adapter = adapter_;
        (payer, payerKey) = makeAddrAndKey("fuzzAgent");
        usdc.mint(payer, 1_000_000 * fees.price());
    }

    function open() external {
        bytes32 nonce = bytes32(++next);
        uint256 price = fees.price();
        bytes32 d = usdc.receiveDigest(payer, address(fees), price, 0, block.timestamp + 1 hours, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, d);
        runIds.push(fees.open(payer, price, 0, block.timestamp + 1 hours, nonce, abi.encodePacked(r, s, v)));
    }

    function release(uint256 i) external {
        if (runIds.length == 0) return;
        vm.prank(adapter);
        try fees.release(runIds[i % runIds.length], bytes32(i)) {} catch {}
    }

    function refund(uint256 i) external {
        if (runIds.length == 0) return;
        try fees.refund(runIds[i % runIds.length]) {} catch {}
    }

    function block_(uint256 i, bool on) external {
        usdc.setBlocked(i % 2 == 0 ? payer : fees.payee(), on);
    }

    function withdraw(uint256 i) external {
        address who = i % 2 == 0 ? payer : fees.payee();
        vm.prank(who);
        try fees.withdrawOwed() {} catch {}
    }

    function wait(uint16 secs) external {
        vm.warp(block.timestamp + secs);
    }
}

contract CreFeesInvariant is Test {
    Mock3009 internal usdc;
    KarwanCreFees internal fees;
    CreFeesHandler internal handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new Mock3009();
        address adapter = makeAddr("adapter");
        fees = new KarwanCreFees(address(usdc), adapter, makeAddr("karwanFees"), 250_000);
        handler = new CreFeesHandler(usdc, fees, adapter);
        targetContract(address(handler));
    }

    /// The contract holds exactly the open runs and what it owes: nothing
    /// stranded, nothing paid twice. (USDC sent to it directly, outside open,
    /// would only add to the balance.)
    function invariant_balance_is_open_runs_plus_owed() public view {
        assertEq(usdc.balanceOf(address(fees)), fees.held() + fees.owedTotal());
    }
}
