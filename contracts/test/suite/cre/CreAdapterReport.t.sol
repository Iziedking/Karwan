// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreFixture} from "./CreFixture.sol";
import {KarwanCreAdapter} from "../../../src/suite/KarwanCreAdapter.sol";
import {IReceiver, IERC165} from "../../../src/interfaces/IReceiver.sol";

contract CreAdapterReportTest is CreFixture {
    function setUp() public {
        _deployCre();
    }

    function _deliverCheck(bytes32 id, bytes10 name, address owner, uint64 issuedAt, bytes32 reportId) internal {
        forwarder.deliver(address(adapter), id, name, owner, _envelope(1, issuedAt, reportId, _checkBody(true)));
    }

    function test_only_the_forwarder_can_report() public {
        bytes memory env = _envelope(1, uint64(block.timestamp), "r1", _checkBody(true));
        vm.prank(stranger);
        vm.expectRevert(KarwanCreAdapter.NotForwarder.selector);
        adapter.onReport(_meta(CHECK_ID, CHECK_NAME, creOwner), env);
    }

    function test_forged_owner_id_or_name_is_refused() public {
        _deliverCheck(CHECK_ID, CHECK_NAME, stranger, uint64(block.timestamp), "r1");
        assertFalse(forwarder.lastOk());
        _deliverCheck(keccak256("other"), CHECK_NAME, creOwner, uint64(block.timestamp), "r2");
        assertFalse(forwarder.lastOk());
        _deliverCheck(CHECK_ID, bytes10("chk0000002"), creOwner, uint64(block.timestamp), "r3");
        assertFalse(forwarder.lastOk());
    }

    function test_metadata_must_be_62_or_64_bytes() public {
        bytes memory body = _checkBody(true);
        forwarder.deliverRaw(
            address(adapter),
            abi.encodePacked(CHECK_ID, bytes9(0), creOwner),
            _envelope(1, uint64(block.timestamp), "r1", body)
        );
        assertFalse(forwarder.lastOk());
        forwarder.deliverRaw(
            address(adapter),
            abi.encodePacked(CHECK_ID, CHECK_NAME, creOwner, bytes1(0x01)),
            _envelope(1, uint64(block.timestamp), "r2", body)
        );
        assertFalse(forwarder.lastOk());
        forwarder.deliverRaw(
            address(adapter), abi.encodePacked(CHECK_ID, CHECK_NAME, creOwner), _envelope(1, uint64(block.timestamp), "r3", body)
        );
        assertTrue(forwarder.lastOk());
    }

    function test_a_workflow_bound_for_one_kind_cannot_use_another() public {
        _deliverCheck(KEEP_ID, KEEP_NAME, creOwner, uint64(block.timestamp), "r1");
        assertFalse(forwarder.lastOk());
    }

    function test_wrong_chain_or_adapter_is_refused() public {
        bytes memory body = _checkBody(true);
        forwarder.deliver(
            address(adapter),
            CHECK_ID,
            CHECK_NAME,
            creOwner,
            abi.encode(uint8(1), uint256(1), address(adapter), uint64(block.timestamp), bytes32("r1"), body)
        );
        assertFalse(forwarder.lastOk());
        forwarder.deliver(
            address(adapter),
            CHECK_ID,
            CHECK_NAME,
            creOwner,
            abi.encode(uint8(1), block.chainid, stranger, uint64(block.timestamp), bytes32("r2"), body)
        );
        assertFalse(forwarder.lastOk());
    }

    function test_a_report_older_than_an_hour_or_too_far_ahead_is_refused() public {
        vm.warp(10 days);
        _deliverCheck(CHECK_ID, CHECK_NAME, creOwner, uint64(block.timestamp - 1 hours - 1), "r1");
        assertFalse(forwarder.lastOk());
        _deliverCheck(CHECK_ID, CHECK_NAME, creOwner, uint64(block.timestamp + 5 minutes + 1), "r2");
        assertFalse(forwarder.lastOk());
        _deliverCheck(CHECK_ID, CHECK_NAME, creOwner, uint64(block.timestamp + 5 minutes), "r3");
        assertTrue(forwarder.lastOk());
        _deliverCheck(CHECK_ID, CHECK_NAME, creOwner, uint64(block.timestamp - 1 hours), "r4");
        assertTrue(forwarder.lastOk());
    }

    function test_a_failed_transmission_retried_after_an_hour_is_refused() public {
        bytes memory env = _envelope(1, uint64(block.timestamp), "r1", _checkBody(true));
        vm.warp(block.timestamp + 1 hours + 1);
        forwarder.deliver(address(adapter), CHECK_ID, CHECK_NAME, creOwner, env);
        assertFalse(forwarder.lastOk());
    }

    function test_a_report_id_is_used_once() public {
        bytes memory env = _envelope(1, uint64(block.timestamp), "r1", _checkBody(true));
        forwarder.deliver(address(adapter), CHECK_ID, CHECK_NAME, creOwner, env);
        assertTrue(forwarder.lastOk());
        forwarder.deliver(address(adapter), CHECK_ID, CHECK_NAME, creOwner, env);
        assertFalse(forwarder.lastOk());
        assertTrue(adapter.reportUsed("r1"));
    }

    function test_a_zero_report_id_is_refused() public {
        _deliverCheck(CHECK_ID, CHECK_NAME, creOwner, uint64(block.timestamp), bytes32(0));
        assertFalse(forwarder.lastOk());
    }

    function test_only_the_binder_binds_and_a_rebind_replaces_the_workflow() public {
        KarwanCreAdapter fresh = _freshAdapter();
        vm.prank(stranger);
        vm.expectRevert(KarwanCreAdapter.NotBinder.selector);
        fresh.bindWorkflow(1, CHECK_ID, CHECK_NAME);
        vm.expectRevert(KarwanCreAdapter.BadBinding.selector);
        fresh.bindWorkflow(5, CHECK_ID, CHECK_NAME);

        bytes32 nextId = keccak256("karwan-check-v2");
        adapter.bindWorkflow(1, nextId, CHECK_NAME);
        _deliverCheck(CHECK_ID, CHECK_NAME, creOwner, uint64(block.timestamp), "r1");
        assertFalse(forwarder.lastOk());
        _deliverCheck(nextId, CHECK_NAME, creOwner, uint64(block.timestamp), "r2");
        assertTrue(forwarder.lastOk());
    }

    function test_an_unbound_kind_fails_closed() public {
        KarwanCreAdapter fresh = _freshAdapter();
        forwarder.deliver(
            address(fresh),
            CHECK_ID,
            CHECK_NAME,
            creOwner,
            abi.encode(uint8(1), block.chainid, address(fresh), uint64(block.timestamp), bytes32("r1"), _checkBody(true))
        );
        assertFalse(forwarder.lastOk());
    }

    function test_supports_receiver_and_erc165() public view {
        assertTrue(adapter.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(adapter.supportsInterface(type(IERC165).interfaceId));
        assertFalse(adapter.supportsInterface(0xdeadbeef));
    }

    function test_the_constructor_refuses_attest_and_record_selectors() public {
        bytes4[3] memory banned = [
            bytes4(keccak256("attestCheck(bytes32,uint32,bool,bytes32)")),
            bytes4(keccak256("recordFact(address,bytes32,uint8,bytes32,uint64)")),
            bytes4(keccak256("revoke(uint256)"))
        ];
        for (uint256 i; i < 3; ++i) {
            bytes4[] memory bad = new bytes4[](1);
            bad[0] = banned[i];
            vm.expectRevert(KarwanCreAdapter.BadSelector.selector);
            new KarwanCreAdapter(address(forwarder), creOwner, address(hub), address(this), _kinds(), bad);
        }
    }

    function test_the_constructor_refuses_zero_addresses() public {
        vm.expectRevert(KarwanCreAdapter.BadBinding.selector);
        new KarwanCreAdapter(address(0), creOwner, address(hub), address(this), _kinds(), _selectors());
        vm.expectRevert(KarwanCreAdapter.BadBinding.selector);
        new KarwanCreAdapter(address(forwarder), address(0), address(hub), address(this), _kinds(), _selectors());
    }
}
