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

    function test_unbinding_the_recovery_wallet_ends_recovery() public {
        _bindWallet(phone, phoneKey);
        vm.prank(alice);
        reg.setRecovery(phone);
        vm.prank(phone);
        reg.startRecovery();
        vm.prank(alice);
        reg.unbind(phone);
        assertEq(reg.recoveryOf(id), address(0));
        (address w,) = reg.recoveryRequestOf(id);
        assertEq(w, address(0));
    }

    function test_unbinding_a_proposed_controller_withdraws_the_proposal() public {
        _bindWallet(phone, phoneKey);
        vm.prank(alice);
        reg.proposeController(phone);
        vm.prank(phone);
        reg.unbind(phone);
        assertEq(reg.pendingControllerOf(id), address(0));
    }

    function test_an_agent_is_never_recovery_or_controller() public {
        _bindAgent(100e6, 500e6);
        vm.startPrank(alice);
        vm.expectRevert(KarwanIdentityRegistry.NotBound.selector);
        reg.setRecovery(agent);
        vm.expectRevert(KarwanIdentityRegistry.NotBound.selector);
        reg.proposeController(agent);
        vm.stopPrank();
    }

    function test_recovery_wallet_must_belong_to_the_person() public {
        address other = makeAddr("other");
        vm.prank(other);
        reg.register();
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.NotBound.selector);
        reg.setRecovery(other);
    }

    /// Another person's wallet stays theirs even when it signs the binding.
    function test_a_wallet_bound_elsewhere_cannot_be_bound() public {
        (address bob, uint256 bobKey) = makeAddrAndKey("bob");
        vm.prank(bob);
        uint64 bobId = reg.register();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = reg.bindDigest(id, bob, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory s = _sig(bobKey, d);
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.AlreadyBound.selector);
        reg.bind(bob, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
        assertEq(reg.identityOf(bob), bobId);
    }

    function test_an_agent_needs_a_future_expiry_and_limits_that_fit() public {
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint64 nowTs = uint64(block.timestamp);
        uint256 deadline = block.timestamp + 1 hours;
        vm.startPrank(alice);
        vm.expectRevert(KarwanIdentityRegistry.BadBinding.selector);
        reg.bind(agent, KarwanIdentityRegistry.Kind.Agent, nowTs, 100e6, 500e6, deadline, "");
        vm.expectRevert(KarwanIdentityRegistry.BadBinding.selector);
        reg.bind(agent, KarwanIdentityRegistry.Kind.Agent, expiry, 0, 500e6, deadline, "");
        vm.expectRevert(KarwanIdentityRegistry.BadBinding.selector);
        reg.bind(agent, KarwanIdentityRegistry.Kind.Agent, expiry, 100e6, 99e6, deadline, "");
        vm.stopPrank();
        assertFalse(reg.isAgent(agent));
    }

    function test_a_wallet_carries_no_expiry_or_limits() public {
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        vm.startPrank(alice);
        vm.expectRevert(KarwanIdentityRegistry.BadBinding.selector);
        reg.bind(phone, KarwanIdentityRegistry.Kind.Wallet, expiry, 0, 0, deadline, "");
        vm.expectRevert(KarwanIdentityRegistry.BadBinding.selector);
        reg.bind(phone, KarwanIdentityRegistry.Kind.Wallet, 0, 1, 0, deadline, "");
        vm.expectRevert(KarwanIdentityRegistry.BadBinding.selector);
        reg.bind(phone, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 1, deadline, "");
        vm.stopPrank();
        assertEq(reg.identityOf(phone), 0);
    }

    function test_a_binding_is_a_wallet_or_an_agent() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = reg.bindDigest(id, phone, KarwanIdentityRegistry.Kind.None, 0, 0, 0, deadline);
        bytes memory s = _sig(phoneKey, d);
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.BadBinding.selector);
        reg.bind(phone, KarwanIdentityRegistry.Kind.None, 0, 0, 0, deadline, s);
        assertEq(reg.identityOf(phone), 0);
    }

    function test_an_unbound_wallet_cannot_be_unbound() public {
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.NotBound.selector);
        reg.unbind(phone);
    }

    function test_another_identity_cannot_unbind_a_wallet() public {
        _bindWallet(phone, phoneKey);
        address bob = makeAddr("bob");
        vm.prank(bob);
        reg.register();
        vm.prank(bob);
        vm.expectRevert(KarwanIdentityRegistry.NotController.selector);
        reg.unbind(phone);
        assertEq(reg.identityOf(phone), id);
    }

    function test_only_the_proposed_wallet_accepts_control() public {
        _bindWallet(phone, phoneKey);
        address outsider = makeAddr("outsider");
        vm.prank(phone);
        vm.expectRevert(KarwanIdentityRegistry.NotController.selector);
        reg.acceptController();
        vm.prank(outsider);
        vm.expectRevert(KarwanIdentityRegistry.NotController.selector);
        reg.acceptController();
        assertEq(reg.controllerOf(id), alice);
    }

    function test_the_controller_is_not_its_own_recovery() public {
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.IsController.selector);
        reg.setRecovery(alice);
        assertEq(reg.recoveryOf(id), address(0));
    }

    function test_only_the_named_recovery_wallet_starts_recovery() public {
        _bindWallet(phone, phoneKey);
        address outsider = makeAddr("outsider");
        vm.prank(phone);
        vm.expectRevert(KarwanIdentityRegistry.NotController.selector);
        reg.startRecovery();
        vm.prank(outsider);
        vm.expectRevert(KarwanIdentityRegistry.NotController.selector);
        reg.startRecovery();
        (address w,) = reg.recoveryRequestOf(id);
        assertEq(w, address(0));
    }

    // ------------------------------- Events -------------------------------
    // The caller is relayed, so msg.sender is not tx.origin.

    address internal relayer = makeAddr("relayer");

    function test_register_announces_the_identity_and_its_first_wallet() public {
        address carol = makeAddr("carol");
        vm.expectEmit(true, true, true, true, address(reg));
        emit KarwanIdentityRegistry.Registered(id + 1, carol);
        vm.expectEmit(true, true, true, true, address(reg));
        emit KarwanIdentityRegistry.Bound(id + 1, carol, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0);
        vm.prank(carol, relayer);
        reg.register();
    }

    function test_binding_an_agent_announces_its_expiry_and_limits() public {
        uint64 expiry = uint64(vm.getBlockTimestamp() + 30 days);
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes32 d = reg.bindDigest(id, agent, KarwanIdentityRegistry.Kind.Agent, expiry, 100e6, 500e6, deadline);
        bytes memory s = _sig(agentKey, d);
        vm.expectEmit(true, true, true, true, address(reg));
        emit KarwanIdentityRegistry.Bound(id, agent, KarwanIdentityRegistry.Kind.Agent, expiry, 100e6, 500e6);
        vm.prank(alice, relayer);
        reg.bind(agent, KarwanIdentityRegistry.Kind.Agent, expiry, 100e6, 500e6, deadline, s);
    }

    function test_handing_over_control_and_leaving_are_announced() public {
        _bindWallet(phone, phoneKey);
        vm.expectEmit(true, true, true, true, address(reg));
        emit KarwanIdentityRegistry.ControllerProposed(id, phone);
        vm.prank(alice, relayer);
        reg.proposeController(phone);
        vm.expectEmit(true, true, true, true, address(reg));
        emit KarwanIdentityRegistry.ControllerChanged(id, phone);
        vm.prank(phone, relayer);
        reg.acceptController();
        vm.expectEmit(true, true, true, true, address(reg));
        emit KarwanIdentityRegistry.Unbound(id, alice);
        vm.prank(alice, relayer);
        reg.unbind(alice);
    }

    function test_each_recovery_step_is_announced() public {
        _bindWallet(phone, phoneKey);
        vm.expectEmit(true, true, true, true, address(reg));
        emit KarwanIdentityRegistry.RecoverySet(id, phone);
        vm.prank(alice, relayer);
        reg.setRecovery(phone);
        uint64 readyAt = uint64(vm.getBlockTimestamp()) + 7 days;
        vm.expectEmit(true, true, true, true, address(reg));
        emit KarwanIdentityRegistry.RecoveryStarted(id, phone, readyAt);
        vm.prank(phone, relayer);
        reg.startRecovery();
        vm.expectEmit(true, true, true, true, address(reg));
        emit KarwanIdentityRegistry.RecoveryCancelled(id);
        vm.prank(alice, relayer);
        reg.cancelRecovery();
    }

    function test_an_agent_payment_is_announced_with_the_family_and_the_running_total() public {
        _bindAgent(100e6, 500e6);
        vm.startPrank(family, relayer);
        reg.useAgentAllowance(agent, 30e6);
        vm.expectEmit(true, true, true, true, address(reg));
        emit KarwanIdentityRegistry.AgentAllowanceUsed(agent, family, 40e6, 70e6);
        reg.useAgentAllowance(agent, 40e6);
        vm.stopPrank();
    }

    // ------------------------------ Signatures ----------------------------

    /// The digest a wallet signs is EIP-712 over the published Bind type, so a
    /// wallet or a backend can build it without asking the contract.
    function test_the_bind_digest_is_eip712_over_the_published_type() public view {
        bytes32 typehash = keccak256(
            "Bind(uint64 id,address wallet,uint8 kind,uint64 expiry,uint128 perPayment,uint128 total,uint256 nonce,uint256 deadline)"
        );
        assertEq(reg.BIND_TYPEHASH(), typehash);
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("KarwanIdentity"),
                keccak256("1"),
                block.chainid,
                address(reg)
            )
        );
        uint64 expiry = 2_000_000_000;
        bytes32 structHash = keccak256(
            abi.encode(
                typehash, id, agent, uint8(2), expiry, uint128(100e6), uint128(500e6), reg.nonces(agent), 1_900_000_000
            )
        );
        assertEq(
            reg.bindDigest(id, agent, KarwanIdentityRegistry.Kind.Agent, expiry, 100e6, 500e6, 1_900_000_000),
            keccak256(abi.encodePacked("\x19\x01", domain, structHash))
        );
    }

    // ------------------------- Leaving an identity ------------------------

    function test_an_agent_that_leaves_keeps_no_limits() public {
        _bindAgent(100e6, 500e6);
        vm.prank(family);
        reg.useAgentAllowance(agent, 60e6);
        vm.prank(alice);
        reg.unbind(agent);
        (uint128 perPayment, uint128 total, uint128 used) = reg.agentLimitOf(agent);
        assertEq(perPayment, 0);
        assertEq(total, 0);
        assertEq(used, 0);
    }

    function test_another_wallet_leaving_keeps_the_proposal_and_the_recovery() public {
        (address laptop, uint256 laptopKey) = makeAddrAndKey("laptop");
        (address tablet, uint256 tabletKey) = makeAddrAndKey("tablet");
        _bindWallet(phone, phoneKey);
        _bindWallet(laptop, laptopKey);
        _bindWallet(tablet, tabletKey);
        vm.startPrank(alice);
        reg.setRecovery(phone);
        reg.proposeController(laptop);
        vm.stopPrank();
        vm.prank(phone);
        reg.startRecovery();
        vm.prank(tablet);
        reg.unbind(tablet);
        assertEq(reg.pendingControllerOf(id), laptop);
        assertEq(reg.recoveryOf(id), phone);
        (address w, uint64 readyAt) = reg.recoveryRequestOf(id);
        assertEq(w, phone);
        assertEq(readyAt, uint64(vm.getBlockTimestamp()) + 7 days);
    }

    // ------------------------------- Recovery -----------------------------

    function test_recovery_is_cleared_with_zero_and_its_request_goes_with_it() public {
        _bindWallet(phone, phoneKey);
        vm.prank(alice);
        reg.setRecovery(phone);
        vm.prank(phone);
        reg.startRecovery();
        vm.prank(alice);
        reg.setRecovery(address(0));
        assertEq(reg.recoveryOf(id), address(0));
        (address w,) = reg.recoveryRequestOf(id);
        assertEq(w, address(0));
        vm.warp(vm.getBlockTimestamp() + 7 days);
        vm.prank(phone);
        vm.expectRevert(KarwanIdentityRegistry.NoRequest.selector);
        reg.finishRecovery();
    }

    function test_naming_another_recovery_wallet_ends_the_old_request() public {
        (address laptop, uint256 laptopKey) = makeAddrAndKey("laptop");
        _bindWallet(phone, phoneKey);
        _bindWallet(laptop, laptopKey);
        vm.prank(alice);
        reg.setRecovery(phone);
        vm.prank(phone);
        reg.startRecovery();
        vm.prank(alice);
        reg.setRecovery(laptop);
        assertEq(reg.recoveryOf(id), laptop);
        vm.warp(vm.getBlockTimestamp() + 7 days);
        vm.prank(phone);
        vm.expectRevert(KarwanIdentityRegistry.NoRequest.selector);
        reg.finishRecovery();
        assertEq(reg.controllerOf(id), alice);
    }

    /// A hand-over ends a pending recovery and the accepted proposal, and keeps
    /// the recovery wallet, which is not the new controller.
    function test_a_hand_over_ends_pending_recovery_but_keeps_the_recovery_wallet() public {
        (address laptop, uint256 laptopKey) = makeAddrAndKey("laptop");
        _bindWallet(phone, phoneKey);
        _bindWallet(laptop, laptopKey);
        vm.startPrank(alice);
        reg.setRecovery(phone);
        reg.proposeController(laptop);
        vm.stopPrank();
        vm.prank(phone);
        reg.startRecovery();
        vm.prank(laptop);
        reg.acceptController();
        assertEq(reg.controllerOf(id), laptop);
        assertEq(reg.pendingControllerOf(id), address(0));
        assertEq(reg.recoveryOf(id), phone);
        (address w,) = reg.recoveryRequestOf(id);
        assertEq(w, address(0));
        vm.warp(vm.getBlockTimestamp() + 7 days);
        vm.prank(phone);
        vm.expectRevert(KarwanIdentityRegistry.NoRequest.selector);
        reg.finishRecovery();
    }

    /// The recovery wallet that takes control is no longer the recovery wallet,
    /// and a proposal made before the takeover is gone.
    function test_recovery_that_takes_control_ends_itself_and_any_proposal() public {
        (address laptop, uint256 laptopKey) = makeAddrAndKey("laptop");
        _bindWallet(phone, phoneKey);
        _bindWallet(laptop, laptopKey);
        vm.startPrank(alice);
        reg.setRecovery(phone);
        reg.proposeController(laptop);
        vm.stopPrank();
        vm.prank(phone);
        reg.startRecovery();
        vm.warp(vm.getBlockTimestamp() + 7 days);
        vm.prank(phone);
        reg.finishRecovery();
        assertEq(reg.controllerOf(id), phone);
        assertEq(reg.recoveryOf(id), address(0));
        assertEq(reg.pendingControllerOf(id), address(0));
        vm.prank(laptop);
        vm.expectRevert(KarwanIdentityRegistry.NotController.selector);
        reg.acceptController();
    }

    // ------------------------------- Limits -------------------------------

    function test_an_agent_payment_above_64_bits_is_counted_in_full() public {
        uint128 big = uint128(type(uint64).max) + 5;
        _bindAgent(big, big * 2);
        vm.prank(family);
        reg.useAgentAllowance(agent, big);
        (,, uint128 used) = reg.agentLimitOf(agent);
        assertEq(used, big);
    }

    // ------------------------------ Outcomes ------------------------------

    function test_an_agent_binding_whose_expiry_has_passed_is_refused() public {
        vm.warp(1_800_000_000);
        uint64 expiry = uint64(block.timestamp - 1);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 d = reg.bindDigest(id, agent, KarwanIdentityRegistry.Kind.Agent, expiry, 1e6, 1e6, deadline);
        bytes memory s = _sig(agentKey, d);
        vm.prank(alice);
        vm.expectRevert(KarwanIdentityRegistry.BadBinding.selector);
        reg.bind(agent, KarwanIdentityRegistry.Kind.Agent, expiry, 1e6, 1e6, deadline, s);
    }

    function test_a_binding_is_accepted_up_to_its_deadline_second() public {
        uint256 deadline = block.timestamp;
        bytes32 d = reg.bindDigest(id, phone, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline);
        bytes memory s = _sig(phoneKey, d);
        vm.prank(alice);
        reg.bind(phone, KarwanIdentityRegistry.Kind.Wallet, 0, 0, 0, deadline, s);
        assertEq(reg.identityOf(phone), id);
    }

    function test_recovery_finishes_any_time_after_the_wait() public {
        _bindWallet(phone, phoneKey);
        vm.prank(alice);
        reg.setRecovery(phone);
        vm.prank(phone);
        reg.startRecovery();
        vm.warp(block.timestamp + 8 days);
        vm.prank(phone);
        reg.finishRecovery();
        assertEq(reg.controllerOf(id), phone);
    }

    function test_an_agent_long_past_its_expiry_spends_nothing_and_belongs_to_no_one() public {
        _bindAgent(10e6, 100e6);
        vm.warp(block.timestamp + 31 days);
        vm.prank(family);
        vm.expectRevert(KarwanIdentityRegistry.Expired.selector);
        reg.useAgentAllowance(agent, 1e6);
        assertEq(reg.identityOf(agent), 0);
        assertFalse(reg.isAgent(agent));
    }

    function test_an_agent_pays_up_to_exactly_its_total() public {
        _bindAgent(10e6, 20e6);
        vm.startPrank(family);
        reg.useAgentAllowance(agent, 10e6);
        reg.useAgentAllowance(agent, 10e6);
        vm.expectRevert(KarwanIdentityRegistry.OverLimit.selector);
        reg.useAgentAllowance(agent, 1);
        vm.stopPrank();
    }

    function test_an_agent_pays_exactly_its_per_payment_limit() public {
        _bindAgent(10e6, 100e6);
        vm.prank(family);
        reg.useAgentAllowance(agent, 10e6);
        (,, uint128 used) = reg.agentLimitOf(agent);
        assertEq(used, 10e6);
    }

    /// A later identity cannot name an earlier identity's wallet as its
    /// recovery wallet.
    function test_a_wallet_of_an_earlier_identity_cannot_be_named_recovery() public {
        _bindWallet(phone, phoneKey);
        address bob = makeAddr("bob");
        vm.prank(bob);
        uint64 bobId = reg.register();
        assertGt(bobId, id);
        vm.prank(bob);
        vm.expectRevert(KarwanIdentityRegistry.NotBound.selector);
        reg.setRecovery(phone);
    }
}
