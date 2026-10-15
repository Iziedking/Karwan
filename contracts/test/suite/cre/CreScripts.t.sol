// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreFixture} from "./CreFixture.sol";
import {KarwanCreAdapter} from "../../../src/suite/KarwanCreAdapter.sol";
import {KarwanCheckVerifier} from "../../../src/suite/KarwanCheckVerifier.sol";
import {KarwanHub} from "../../../src/suite/KarwanHub.sol";
import {DeployCreAdapter} from "../../../script/DeployCreAdapter.s.sol";
import {DeployCheckVerifiers} from "../../../script/DeployCheckVerifiers.s.sol";
import {BindCreWorkflow} from "../../../script/BindCreWorkflow.s.sol";
import {EvidenceRegistryDeploymentConfig} from "../../../script/EvidenceRegistryDeploymentConfig.sol";

/// Scripts are exercised through their parameter functions: environment
/// variables are process-wide, and parallel tests would read each other's.
contract CreScriptsTest is CreFixture {
    address internal constant KEYSTONE = 0x76c9cf548b4179F8901cda1f8623568b58215E62;
    address internal constant MOCK = 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1;

    function setUp() public {
        _deployCre();
        vm.chainId(5_042_002);
    }

    function test_deploys_against_the_production_forwarder() public {
        KarwanCreAdapter a = new DeployCreAdapter().deploy(KEYSTONE, creOwner, address(hub), address(this), false);
        assertEq(a.forwarder(), KEYSTONE);
        assertEq(a.workflowOwner(), creOwner);
        assertEq(address(a.hub()), address(hub));
        assertEq(a.binder(), address(this));
        assertTrue(a.isFactKind(WORK_FACT));
    }

    function test_refuses_the_simulation_forwarder_outside_a_rehearsal() public {
        DeployCreAdapter s = new DeployCreAdapter();
        vm.expectRevert(abi.encodeWithSelector(DeployCreAdapter.SimulationForwarderOutsideRehearsal.selector, MOCK));
        s.deploy(MOCK, creOwner, address(hub), address(this), false);
        assertEq(s.deploy(MOCK, creOwner, address(hub), address(this), true).forwarder(), MOCK);
    }

    function test_refuses_an_unknown_forwarder_and_another_chain() public {
        DeployCreAdapter s = new DeployCreAdapter();
        vm.expectRevert(abi.encodeWithSelector(DeployCreAdapter.UnknownForwarder.selector, stranger));
        s.deploy(stranger, creOwner, address(hub), address(this), false);
        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployCreAdapter.WrongChain.selector, 1));
        s.deploy(KEYSTONE, creOwner, address(hub), address(this), false);
    }

    function test_the_script_allows_the_same_timeouts_as_the_tests() public {
        bytes4[] memory fromScript = new DeployCreAdapter().keepSelectors();
        bytes4[] memory fromFixture = _selectors();
        assertEq(fromScript.length, fromFixture.length);
        for (uint256 i; i < fromScript.length; ++i) {
            assertEq(fromScript[i], fromFixture[i]);
        }
    }

    function test_deploys_both_verifiers_sorted_and_prints_the_timelock_calls() public {
        (KarwanCheckVerifier vK, KarwanCheckVerifier vCK, bytes[3] memory calls) =
            new DeployCheckVerifiers().deploy(address(adapter), checker, address(hub));
        assertEq(vK.threshold(), 1);
        assertEq(vK.signerCount(), 1);
        assertTrue(vK.isSigner(checker));
        assertFalse(vK.isSigner(address(adapter)));
        assertEq(vCK.threshold(), 1);
        assertEq(vCK.signerCount(), 2);
        assertTrue(vCK.isSigner(checker));
        assertTrue(vCK.isSigner(address(adapter)));
        assertEq(calls[0], abi.encodeCall(KarwanHub.setVerifier, (address(vK), true)));
        assertEq(calls[1], abi.encodeCall(KarwanHub.setVerifier, (address(vCK), true)));
        assertEq(calls[2], abi.encodeCall(KarwanHub.setIssuer, (address(adapter), true)));
    }

    function test_refuses_verifiers_for_an_adapter_wired_to_another_hub() public {
        DeployCheckVerifiers s = new DeployCheckVerifiers();
        vm.expectRevert("adapter is wired to another hub");
        s.deploy(address(adapter), checker, stranger);
    }

    function test_binding_is_a_timelock_call_and_binds_directly_only_in_a_rehearsal() public {
        KarwanCreAdapter fresh = _freshAdapter();
        BindCreWorkflow s = new BindCreWorkflow();
        bytes memory call = s.bindCall(1, CHECK_ID, "karwan-check");
        assertEq(call, abi.encodeCall(KarwanCreAdapter.bindWorkflow, (1, CHECK_ID, EvidenceRegistryDeploymentConfig.encodeWorkflowName("karwan-check"))));
        s.rehearse(fresh, 1, CHECK_ID, "karwan-check", address(this));
        (bytes32 id, bytes10 name) = fresh.bindingOf(1);
        assertEq(id, CHECK_ID);
        assertEq(name, EvidenceRegistryDeploymentConfig.encodeWorkflowName("karwan-check"));
    }

    function test_an_eoa_binder_is_refused_outside_a_rehearsal() public {
        DeployCreAdapter s = new DeployCreAdapter();
        address eoa = makeAddr("eoaBinder");
        vm.expectRevert(abi.encodeWithSelector(DeployCreAdapter.BinderMustBeTheTimelock.selector, eoa));
        s.deploy(KEYSTONE, creOwner, address(hub), eoa, false);
        assertEq(s.deploy(MOCK, creOwner, address(hub), eoa, true).binder(), eoa);
    }
}
