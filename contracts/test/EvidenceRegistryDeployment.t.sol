// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IReceiver} from "../src/interfaces/IReceiver.sol";
import {KarwanEvidenceRegistry} from "../src/KarwanEvidenceRegistry.sol";
import {DeployEvidenceRegistry} from "../script/DeployEvidenceRegistry.s.sol";
import {VerifyEvidenceRegistry} from "../script/VerifyEvidenceRegistry.s.sol";
import {EvidenceRegistryDeploymentConfig} from "../script/EvidenceRegistryDeploymentConfig.sol";

contract EvidenceRegistryDeploymentConfigHarness {
    function encodeWorkflowName(string calldata name) external pure returns (bytes10) {
        return EvidenceRegistryDeploymentConfig.encodeWorkflowName(name);
    }

    function validateDeployment(EvidenceRegistryDeploymentConfig.Config calldata config)
        external
        pure
    {
        EvidenceRegistryDeploymentConfig.validateDeployment(config);
    }

    function validateBound(EvidenceRegistryDeploymentConfig.Config calldata config) external pure {
        EvidenceRegistryDeploymentConfig.validateBound(config);
    }
}

contract EvidenceRegistryDeploymentTest is Test {
    uint256 private constant ARC_TESTNET_CHAIN_ID = 5_042_002;
    address private constant PRODUCTION_FORWARDER = 0x76c9cf548b4179F8901cda1f8623568b58215E62;
    address private constant MOCK_FORWARDER = 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1;
    address private constant WORKFLOW_OWNER = address(0xB0B);
    bytes32 private constant WORKFLOW_ID = keccak256("deployed-karwan-workflow");

    EvidenceRegistryDeploymentConfigHarness private harness;

    function setUp() public {
        harness = new EvidenceRegistryDeploymentConfigHarness();
    }

    function testEncodesWorkflowNameLikeCreEngine() public view {
        assertEq(harness.encodeWorkflowName("my_workflow"), bytes10(0x62373666336165316465));
    }

    function testRejectsEmptyWorkflowName() public {
        vm.expectRevert(EvidenceRegistryDeploymentConfig.EmptyWorkflowName.selector);
        harness.encodeWorkflowName("");
    }

    function testRejectsSimulationForwarder() public {
        EvidenceRegistryDeploymentConfig.Config memory config = _validConfig();
        config.forwarder = MOCK_FORWARDER;
        vm.expectRevert(
            abi.encodeWithSelector(
                EvidenceRegistryDeploymentConfig.SimulationForwarderForbidden.selector,
                MOCK_FORWARDER
            )
        );
        harness.validateDeployment(config);
    }

    function testRejectsUnknownForwarder() public {
        EvidenceRegistryDeploymentConfig.Config memory config = _validConfig();
        config.forwarder = address(0x1234);
        vm.expectRevert(
            abi.encodeWithSelector(
                EvidenceRegistryDeploymentConfig.InvalidProductionForwarder.selector,
                address(0x1234),
                PRODUCTION_FORWARDER
            )
        );
        harness.validateDeployment(config);
    }

    function testRejectsWrongChain() public {
        EvidenceRegistryDeploymentConfig.Config memory config = _validConfig();
        config.chainId = 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                EvidenceRegistryDeploymentConfig.InvalidDeploymentChain.selector,
                uint256(1),
                ARC_TESTNET_CHAIN_ID
            )
        );
        harness.validateDeployment(config);
    }

    function testRejectsZeroBinder() public {
        EvidenceRegistryDeploymentConfig.Config memory config = _validConfig();
        config.workflowBinder = address(0);
        vm.expectRevert(EvidenceRegistryDeploymentConfig.ZeroWorkflowBinder.selector);
        harness.validateDeployment(config);
    }

    function testBoundValidationRejectsZeroWorkflowId() public {
        EvidenceRegistryDeploymentConfig.Config memory config = _validConfig();
        config.workflowId = bytes32(0);
        vm.expectRevert(EvidenceRegistryDeploymentConfig.ZeroWorkflowId.selector);
        harness.validateBound(config);
    }

    function testDeployScriptRehearsesUnboundConfiguration() public {
        vm.chainId(ARC_TESTNET_CHAIN_ID);
        vm.setEnv("CRE_FORWARDER_ADDR", vm.toString(PRODUCTION_FORWARDER));
        vm.setEnv("CRE_WORKFLOW_OWNER", vm.toString(WORKFLOW_OWNER));
        vm.setEnv("CRE_WORKFLOW_NAME", "karwan-git-prod");
        vm.setEnv("EVIDENCE_REGISTRY_BINDER_ADDR", vm.toString(address(this)));

        KarwanEvidenceRegistry registry = new DeployEvidenceRegistry().run();

        assertEq(registry.forwarder(), PRODUCTION_FORWARDER);
        assertEq(registry.workflowOwner(), WORKFLOW_OWNER);
        assertEq(registry.expectedWorkflowId(), bytes32(0));
        assertEq(registry.expectedWorkflowName(), harness.encodeWorkflowName("karwan-git-prod"));
        assertEq(registry.expectedChainId(), ARC_TESTNET_CHAIN_ID);
        assertEq(registry.workflowBinder(), address(this));
        assertTrue(registry.supportsInterface(type(IReceiver).interfaceId));
    }

    function testBoundRegistryPassesReadOnlyVerifier() public {
        vm.chainId(ARC_TESTNET_CHAIN_ID);
        vm.setEnv("CRE_FORWARDER_ADDR", vm.toString(PRODUCTION_FORWARDER));
        vm.setEnv("CRE_WORKFLOW_OWNER", vm.toString(WORKFLOW_OWNER));
        vm.setEnv("CRE_WORKFLOW_ID", vm.toString(WORKFLOW_ID));
        vm.setEnv("CRE_WORKFLOW_NAME", "karwan-git-prod");
        vm.setEnv("EVIDENCE_REGISTRY_BINDER_ADDR", vm.toString(address(this)));

        KarwanEvidenceRegistry registry = new KarwanEvidenceRegistry(
            PRODUCTION_FORWARDER,
            WORKFLOW_OWNER,
            harness.encodeWorkflowName("karwan-git-prod"),
            ARC_TESTNET_CHAIN_ID,
            address(this)
        );
        registry.bindWorkflowId(WORKFLOW_ID);
        vm.deal(address(registry), 1 wei);
        vm.setEnv("KARWAN_EVIDENCE_REGISTRY_ADDR", vm.toString(address(registry)));

        assertTrue(new VerifyEvidenceRegistry().run());
    }

    function _validConfig() private view returns (EvidenceRegistryDeploymentConfig.Config memory) {
        return EvidenceRegistryDeploymentConfig.Config({
            forwarder: PRODUCTION_FORWARDER,
            workflowOwner: WORKFLOW_OWNER,
            workflowId: WORKFLOW_ID,
            workflowName: harness.encodeWorkflowName("karwan-git-prod"),
            chainId: ARC_TESTNET_CHAIN_ID,
            workflowBinder: address(this)
        });
    }
}
