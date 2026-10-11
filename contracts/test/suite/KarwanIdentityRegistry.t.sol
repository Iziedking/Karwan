// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KarwanHub} from "../../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../../src/suite/KarwanIdentityRegistry.sol";
import {Wallet1271} from "./mocks/Wallet1271.sol";

contract KarwanIdentityRegistryTest is Test {
    KarwanHub internal hub;
    KarwanIdentityRegistry internal reg;
    address internal family = makeAddr("family");
    address internal alice;
    uint256 internal aliceKey;
    address internal phone;
    uint256 internal phoneKey;
    address internal agent;
    uint256 internal agentKey;
    uint64 internal id;

    function setUp() public {
        hub = new KarwanHub(address(this));
        reg = new KarwanIdentityRegistry(address(hub));
        hub.registerFamily(family, 0);
        (alice, aliceKey) = makeAddrAndKey("alice");
        (phone, phoneKey) = makeAddrAndKey("phone");
        (agent, agentKey) = makeAddrAndKey("agent");
        vm.prank(alice);
        id = reg.register();
    }

    function _sig(uint256 key, bytes32 d) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, d);
        return abi.encodePacked(r, s, v);
    }

    function _bindWallet(address w, uint256 k) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = reg.bindDigest(id, w, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory s = _sig(k, d);
        vm.prank(alice);
        reg.bind(w, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
    }

    function _bindAgent(uint128 perPayment, uint128 total) internal {
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = reg.bindDigest(id, agent, KarwanIdentityRegistry.Kind.Agent, expiry, perPayment, total, deadline);
        bytes memory s = _sig(agentKey, d);
        vm.prank(alice);
        reg.bind(agent, KarwanIdentityRegistry.Kind.Agent, expiry, perPayment, total, deadline, s);
    }

    function test_register_makes_the_caller_controller() public view {
        assertEq(id, 1);
        assertEq(reg.controllerOf(id), alice);
        assertEq(reg.identityOf(alice), id);
    }

    function test_a_wallet_registers_once() public {
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.AlreadyBound.selector);
        reg.register();
    }

    function test_bind_needs_the_wallets_own_signature() public {
        _bindWallet(phone, phoneKey);
        assertEq(reg.identityOf(phone), id);
    }

    function test_bind_refuses_someone_elses_signature() public {
        (address victim,) = makeAddrAndKey("victim");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = reg.bindDigest(id, victim, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory s = _sig(aliceKey, d);
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.BadSignature.selector);
        reg.bind(victim, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
    }

    function test_bind_signature_cannot_be_replayed() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = reg.bindDigest(id, phone, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory s = _sig(phoneKey, d);
        vm.prank(alice);
        reg.bind(phone, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
        vm.prank(phone);
        reg.unbind(phone);
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.BadSignature.selector);
        reg.bind(phone, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
    }

    function test_bind_refuses_an_expired_request() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = reg.bindDigest(id, phone, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory s = _sig(phoneKey, d);
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.Expired.selector);
        reg.bind(phone, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
    }

    function test_only_the_controller_binds() public {
        _bindWallet(phone, phoneKey);
        (address w2, uint256 k2) = makeAddrAndKey("w2");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = reg.bindDigest(id, w2, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory s = _sig(k2, d);
        vm.prank(phone);
        vm.expectRevert(KarwanIdentityRegistry.NotController.selector);
        reg.bind(w2, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
    }

    function test_a_smart_wallet_binds_through_1271() public {
        (address owner, uint256 ownerKey) = makeAddrAndKey("passkeyOwner");
        Wallet1271 w = new Wallet1271(owner);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = reg.bindDigest(id, address(w), KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory s = _sig(ownerKey, d);
        vm.prank(alice);
        reg.bind(address(w), KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
        assertEq(reg.identityOf(address(w)), id);
    }

    function test_agent_counts_until_it_expires() public {
        _bindAgent(100e6, 500e6);
        assertTrue(reg.isAgent(agent));
        assertEq(reg.identityOf(agent), id);
        vm.warp(block.timestamp + 30 days);
        assertEq(reg.identityOf(agent), 0);
        assertFalse(reg.isAgent(agent));
    }

    function test_agent_allowance_is_enforced_for_families_only() public {
        _bindAgent(100e6, 150e6);
        vm.expectRevert(KarwanIdentityRegistry.NotFamily.selector);
        reg.useAgentAllowance(agent, 1);
        vm.startPrank(family);
        vm.expectRevert(KarwanIdentityRegistry.OverLimit.selector);
        reg.useAgentAllowance(agent, 101e6);
        reg.useAgentAllowance(agent, 100e6);
        vm.expectRevert(KarwanIdentityRegistry.OverLimit.selector);
        reg.useAgentAllowance(agent, 51e6);
        reg.useAgentAllowance(alice, 1_000_000e6);
        vm.stopPrank();
    }

    function test_revoked_family_cannot_spend_agent_allowance() public {
        _bindAgent(100e6, 500e6);
        hub.revokeFamily(family);
        vm.prank(family);
        vm.expectRevert(KarwanIdentityRegistry.NotFamily.selector);
        reg.useAgentAllowance(agent, 1);
    }

    function test_expired_agent_cannot_spend() public {
        _bindAgent(100e6, 500e6);
        vm.warp(block.timestamp + 30 days);
        vm.prank(family);
        vm.expectRevert(KarwanIdentityRegistry.Expired.selector);
        reg.useAgentAllowance(agent, 1);
    }

    function test_a_wallet_can_leave_the_controller_cannot() public {
        _bindWallet(phone, phoneKey);
        vm.prank(phone);
        reg.unbind(phone);
        assertEq(reg.identityOf(phone), 0);
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.IsController.selector);
        reg.unbind(alice);
    }

    function test_controller_hands_over_to_a_bound_wallet() public {
        _bindWallet(phone, phoneKey);
        vm.prank(alice);
        reg.proposeController(phone);
        vm.prank(phone);
        reg.acceptController();
        assertEq(reg.controllerOf(id), phone);
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.NotController.selector);
        reg.proposeController(alice);
    }

    function test_recovery_takes_seven_days_and_can_be_cancelled() public {
        _bindWallet(phone, phoneKey);
        vm.prank(alice);
        reg.setRecovery(phone);
        vm.prank(phone);
        reg.startRecovery();
        vm.prank(alice);
        reg.cancelRecovery();
        vm.prank(phone);
        vm.expectRevert(KarwanIdentityRegistry.NoRequest.selector);
        reg.finishRecovery();

        vm.prank(phone);
        reg.startRecovery();
        vm.warp(block.timestamp + 7 days - 1);
        vm.prank(phone);
        vm.expectRevert(KarwanIdentityRegistry.NotReady.selector);
        reg.finishRecovery();
        vm.warp(block.timestamp + 1);
        vm.prank(phone);
        reg.finishRecovery();
        assertEq(reg.controllerOf(id), phone);
    }

    function test_recovery_wallet_must_belong_to_the_person() public {
        address other = makeAddr("other");
        vm.prank(other);
        reg.register();
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.NotBound.selector);
        reg.setRecovery(other);
    }
}
