// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreFixture} from "./CreFixture.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";
import {IKarwanCreAdapter} from "../../../src/suite/interfaces/IKarwanCreAdapter.sol";

contract CreAdapterFactTest is CreFixture {
    bytes32 internal constant SEAL = keccak256("seal");
    bytes32 internal constant ACCOUNT = keccak256("github account 4242");

    function setUp() public {
        _deployCre();
    }

    function _write(address wallet, bytes32 kind) internal {
        _writeAs(wallet, kind, SEAL, ACCOUNT);
    }

    function _writeAs(address wallet, bytes32 kind, bytes32 seal, bytes32 account) internal {
        _send(2, abi.encode(uint8(1), wallet, kind, uint8(1), seal, uint64(block.timestamp + 365 days), uint256(0), account));
    }

    function _revoke(address wallet, uint256 id) internal {
        _send(2, abi.encode(uint8(2), wallet, bytes32(0), uint8(0), bytes32(0), uint64(0), id, bytes32(0)));
    }

    function _secondWalletOfSeller() internal returns (address w) {
        uint256 k;
        (w, k) = makeAddrAndKey("sellerSecond");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = identity.bindDigest(sellerId, w, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory sig = _sig(k, d);
        vm.prank(seller);
        identity.bind(w, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, sig);
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

    function test_one_account_backs_one_person_while_its_fact_lives() public {
        uint256 first = record.factCount();
        _write(seller, WORK_FACT);
        assertTrue(forwarder.lastOk());

        vm.warp(block.timestamp + 1);
        _write(buyer, WORK_FACT);
        assertFalse(forwarder.lastOk());
        assertEq(record.factCount(), first + 1);

        vm.warp(block.timestamp + 1);
        _write(seller, WORK_FACT);
        assertTrue(forwarder.lastOk());
    }

    function test_a_renewal_revokes_the_previous_fact_so_one_stays_live() public {
        uint256 first = record.factCount();
        _write(seller, WORK_FACT);
        vm.warp(block.timestamp + 1);
        _write(seller, WORK_FACT);
        assertTrue(forwarder.lastOk());
        assertTrue(record.getFact(first).revoked);
        assertFalse(record.getFact(first + 1).revoked);
        (,, uint256 held) = adapter.sealHold(keccak256(abi.encode(WORK_FACT, ACCOUNT)));
        assertEq(held, first + 1);
    }

    function test_another_wallet_of_the_same_person_takes_the_account_over() public {
        uint256 first = record.factCount();
        _write(seller, WORK_FACT);
        address second = _secondWalletOfSeller();
        vm.warp(block.timestamp + 1);
        _write(second, WORK_FACT);
        assertTrue(forwarder.lastOk());
        assertTrue(record.getFact(first).revoked);
        assertEq(adapter.issuedTo(first + 1), second);
    }

    function test_the_hold_follows_the_account_key_not_the_seal() public {
        _writeAs(seller, WORK_FACT, SEAL, ACCOUNT);
        vm.warp(block.timestamp + 1);
        _writeAs(buyer, WORK_FACT, SEAL, keccak256("another account"));
        assertTrue(forwarder.lastOk());
        vm.warp(block.timestamp + 1);
        _writeAs(buyer, WORK_FACT, keccak256("other numbers"), ACCOUNT);
        assertFalse(forwarder.lastOk());
    }

    function test_a_fact_needs_an_account_key() public {
        uint256 before = record.factCount();
        _writeAs(seller, WORK_FACT, SEAL, bytes32(0));
        assertFalse(forwarder.lastOk());
        assertEq(record.factCount(), before);
    }

    function test_a_revoke_frees_the_account_seal_for_another_wallet() public {
        uint256 id = record.factCount();
        _write(seller, WORK_FACT);
        vm.warp(block.timestamp + 1);
        _revoke(seller, id);
        assertTrue(forwarder.lastOk());
        vm.warp(block.timestamp + 1);
        _write(buyer, WORK_FACT);
        assertTrue(forwarder.lastOk());
    }

    function test_an_expired_fact_frees_the_account_seal() public {
        _write(seller, WORK_FACT);
        vm.warp(block.timestamp + 366 days);
        _write(buyer, WORK_FACT);
        assertTrue(forwarder.lastOk());
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
