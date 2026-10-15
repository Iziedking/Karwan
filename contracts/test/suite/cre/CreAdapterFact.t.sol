// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreFixture} from "./CreFixture.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {IKarwanCreAdapter} from "../../../src/suite/interfaces/IKarwanCreAdapter.sol";

contract CreAdapterFactTest is CreFixture {
    bytes32 internal constant SEAL = keccak256("seal");

    function setUp() public {
        _deployCre();
    }

    function _write(address wallet, bytes32 kind) internal {
        _send(2, abi.encode(uint8(1), wallet, kind, uint8(1), SEAL, uint64(block.timestamp + 365 days), uint256(0)));
    }

    function _revoke(address wallet, uint256 id) internal {
        _send(2, abi.encode(uint8(2), wallet, bytes32(0), uint8(0), bytes32(0), uint64(0), id));
    }

    function test_writes_an_allowed_kind_for_a_bound_wallet() public {
        uint256 id = record.factCount();
        vm.expectEmit(true, true, true, true, address(adapter));
        emit IKarwanCreAdapter.FactWritten(id, seller, WORK_FACT, 1);
        _write(seller, WORK_FACT);
        assertTrue(forwarder.lastOk());
        KarwanRecord.Fact memory f = record.getFact(id);
        assertEq(f.issuer, address(adapter));
        assertEq(f.subject, sellerId);
        assertEq(f.kind, WORK_FACT);
        assertEq(adapter.issuedTo(id), seller);
    }

    function test_refuses_a_kind_outside_the_list() public {
        uint256 before = record.factCount();
        _write(seller, keccak256("karwan.fact.person.v1"));
        assertFalse(forwarder.lastOk());
        assertEq(record.factCount(), before);
    }

    function test_refuses_an_unbound_wallet() public {
        _write(stranger, WORK_FACT);
        assertFalse(forwarder.lastOk());
    }

    function test_revokes_only_its_own_facts() public {
        uint256 own = record.factCount();
        _write(seller, WORK_FACT);
        vm.warp(block.timestamp + 1);
        _revoke(seller, own);
        assertTrue(forwarder.lastOk());
        assertTrue(record.getFact(own).revoked);

        vm.prank(issuer);
        uint256 other = record.recordFact(buyer, WORK_FACT, 1, SEAL, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 1);
        _revoke(buyer, other);
        assertFalse(forwarder.lastOk());
        assertFalse(record.getFact(other).revoked);
    }

    function test_a_revoke_names_the_wallet_the_fact_was_written_for() public {
        uint256 id = record.factCount();
        _write(seller, WORK_FACT);
        vm.warp(block.timestamp + 1);
        _revoke(buyer, id);
        assertFalse(forwarder.lastOk());
        assertFalse(record.getFact(id).revoked);
    }

    function test_an_unknown_op_is_refused() public {
        _send(2, abi.encode(uint8(3), seller, WORK_FACT, uint8(1), SEAL, uint64(block.timestamp + 1 days), uint256(0)));
        assertFalse(forwarder.lastOk());
    }

    function test_needs_the_issuer_role() public {
        hub.setIssuer(address(adapter), false);
        _write(seller, WORK_FACT);
        assertFalse(forwarder.lastOk());
    }
}
