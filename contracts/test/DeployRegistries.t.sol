// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {DeployRegistries} from "../script/DeployRegistries.s.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {KarwanBusinessRegistry} from "../src/KarwanBusinessRegistry.sol";

/// @notice Runs the Stage A deployment in-process and checks what each party
///         can still do once the Safe has accepted.
contract DeployRegistriesTest is Test {
    DeployRegistries script;
    address safe = makeAddr("safe");
    address reviewer = makeAddr("reviewer");
    address council = makeAddr("council");
    address guardian = makeAddr("guardian");
    address financeSigner = makeAddr("finance-signer");
    address stranger = makeAddr("stranger");

    function setUp() public {
        script = new DeployRegistries();
    }

    function _config(bool withSigners) internal view returns (DeployRegistries.Config memory) {
        return DeployRegistries.Config({
            owner: safe,
            reviewer: reviewer,
            securityCouncil: council,
            securityAgentSigner: withSigners ? guardian : address(0),
            financeSigner: withSigners ? financeSigner : address(0)
        });
    }

    function test_RegistriesStartLockedAndOwnedByTheSafe() public {
        DeployRegistries.Registries memory r = script.deploy(_config(true));
        KarwanReputation rep = r.reputation;
        assertTrue(rep.backfillLocked(), "no direct score writes on a fresh network");
        assertEq(rep.pendingOwner(), safe);
        assertEq(rep.escrow(), address(0), "no escrow until Stage B");
        assertEq(rep.securityCouncil(), council);
        assertEq(rep.securityAgentSigner(), guardian);
        assertEq(rep.financeSigner(), financeSigner);
        assertEq(rep.penaltyAdmin(), address(0), "penalty slot burned");
        assertEq(rep.financeAdmin(), address(0), "finance slot burned");
        assertEq(r.businessRegistry.owner(), safe);
        assertEq(r.businessRegistry.reviewer(), reviewer);
    }

    function test_DeployerLosesReputationPowersWhenTheSafeAccepts() public {
        KarwanReputation rep = script.deploy(_config(true)).reputation;
        vm.prank(safe);
        rep.acceptOwnership();
        assertEq(rep.owner(), safe);

        vm.startPrank(address(script));
        vm.expectRevert(KarwanReputation.NotOwner.selector);
        rep.setRecorder(stranger, true);
        vm.expectRevert(KarwanReputation.NotOwner.selector);
        rep.setEscrow(stranger);
        vm.expectRevert(KarwanReputation.NotPenaltyAdmin.selector);
        rep.setSecurityAgentSigner(stranger);
        vm.stopPrank();
    }

    function test_EvenTheSafeCannotWriteScoresDirectly() public {
        KarwanReputation rep = script.deploy(_config(true)).reputation;
        vm.startPrank(safe);
        rep.acceptOwnership();
        vm.expectRevert(KarwanReputation.BackfillLockedError.selector);
        rep.backfill(stranger, 10, 0, 0, 1_000e6);
        vm.stopPrank();
    }

    function test_NobodyRecordsOutcomesBeforeAnEscrowIsWired() public {
        KarwanReputation rep = script.deploy(_config(true)).reputation;
        vm.prank(stranger);
        vm.expectRevert(KarwanReputation.NotEscrow.selector);
        rep.recordCompletion(keccak256("deal"), stranger, guardian, KarwanReputation.Outcome.Success, 100e6);
    }

    function test_EmptySignerSlotsStayWithTheDeployerForOneUse() public {
        KarwanReputation rep = script.deploy(_config(false)).reputation;
        assertEq(rep.penaltyAdmin(), address(script));
        assertEq(rep.financeAdmin(), address(script));

        vm.startPrank(address(script));
        rep.setSecurityAgentSigner(guardian);
        vm.expectRevert(KarwanReputation.NotPenaltyAdmin.selector);
        rep.setSecurityAgentSigner(stranger);
        vm.stopPrank();
    }

    function test_ReviewerApprovesOnlyTheDocumentItReviewed() public {
        KarwanBusinessRegistry registry = script.deploy(_config(true)).businessRegistry;
        address applicant = makeAddr("applicant");
        bytes32 doc = keccak256("registration.pdf");

        vm.prank(applicant);
        registry.submitRegistration(doc);
        vm.prank(reviewer);
        vm.expectRevert(KarwanBusinessRegistry.DocHashMismatch.selector);
        registry.approve(applicant, keccak256("another.pdf"));
        vm.prank(reviewer);
        registry.approve(applicant, doc);
        assertTrue(registry.isVerified(applicant));
    }

    /// One test on purpose: the environment is process-wide and tests run in
    /// parallel, so both guards are exercised in sequence here.
    function test_RunRefusesTheWrongChainThenAnOwnerThatIsNotAContract() public {
        vm.setEnv("EXPECTED_CHAIN_ID", "5042");
        vm.expectRevert(abi.encodeWithSelector(DeployRegistries.WrongChain.selector, 5042, block.chainid));
        script.run();

        vm.setEnv("EXPECTED_CHAIN_ID", vm.toString(block.chainid));
        vm.setEnv("REGISTRY_OWNER", vm.toString(stranger));
        vm.setEnv("BUSINESS_REVIEWER_ADDR", vm.toString(reviewer));
        vm.setEnv("ALLOW_EOA_OWNER", "false");
        vm.expectRevert(abi.encodeWithSelector(DeployRegistries.OwnerNotAContract.selector, stranger));
        script.run();
    }
}
