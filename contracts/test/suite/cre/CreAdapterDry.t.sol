// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreFixture} from "./CreFixture.sol";
import {KarwanCreFees} from "../../../src/suite/KarwanCreFees.sol";
import {IKarwanCreAdapter} from "../../../src/suite/interfaces/IKarwanCreAdapter.sol";
import {Mock3009} from "./mocks/Mock3009.sol";

contract CreAdapterDryTest is CreFixture {
    uint256 internal constant DRY_PRICE = 250_000;
    bytes32 internal constant RESULT = keccak256("dry result");

    Mock3009 internal token;
    KarwanCreFees internal fees;
    address internal karwanFees = makeAddr("karwanFees");
    address internal agent;
    uint256 internal agentKey;
    bytes32 internal runId;

    function setUp() public {
        _deployCre();
        token = new Mock3009();
        fees = new KarwanCreFees(address(token), address(adapter), karwanFees, DRY_PRICE);
        (agent, agentKey) = makeAddrAndKey("agent");
        token.mint(agent, DRY_PRICE);
        bytes32 d = token.receiveDigest(agent, address(fees), DRY_PRICE, 0, block.timestamp + 1 hours, "run");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, d);
        runId = fees.open(agent, DRY_PRICE, 0, block.timestamp + 1 hours, "run", abi.encodePacked(r, s, v));
    }

    function test_a_signed_answer_releases_the_fee_to_karwan() public {
        vm.expectEmit(true, true, false, true, address(adapter));
        emit IKarwanCreAdapter.DryRunAnswered(address(fees), runId, RESULT);
        _send(4, abi.encode(address(fees), runId, RESULT));
        assertTrue(forwarder.lastOk());
        assertEq(token.balanceOf(karwanFees), DRY_PRICE);
        assertEq(fees.held(), 0);
    }

    function test_an_answer_after_the_payer_refunded_changes_nothing() public {
        vm.warp(block.timestamp + 1 hours);
        fees.refund(runId);
        _send(4, abi.encode(address(fees), runId, RESULT));
        assertFalse(forwarder.lastOk());
        assertEq(token.balanceOf(agent), DRY_PRICE);
        assertEq(token.balanceOf(karwanFees), 0);
    }

    function test_an_answer_from_another_workflow_is_refused() public {
        bytes memory body = abi.encode(address(fees), runId, RESULT);
        forwarder.deliver(
            address(adapter), KEEP_ID, KEEP_NAME, creOwner, _envelope(4, uint64(block.timestamp), keccak256("r"), body)
        );
        assertFalse(forwarder.lastOk());
        assertEq(fees.held(), DRY_PRICE);
    }

    function test_a_fee_contract_for_another_adapter_pays_nothing() public {
        KarwanCreFees other = new KarwanCreFees(address(token), makeAddr("otherAdapter"), karwanFees, DRY_PRICE);
        _send(4, abi.encode(address(other), runId, RESULT));
        assertFalse(forwarder.lastOk());
        assertEq(fees.held(), DRY_PRICE);
    }
}
