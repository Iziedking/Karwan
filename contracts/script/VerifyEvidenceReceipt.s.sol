// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanEvidenceRegistry} from "../src/KarwanEvidenceRegistry.sol";

/// @notice Read-only proof that an accepted CRE report changed receiver state.
/// @dev This script never starts a broadcast and is intended as the Upgrade
/// category evidence artifact for a real Arc Testnet transaction.
contract VerifyEvidenceReceipt is Script {
    function run() external view returns (bool) {
        KarwanEvidenceRegistry registry =
            KarwanEvidenceRegistry(payable(vm.envAddress("KARWAN_EVIDENCE_REGISTRY_ADDR")));
        bytes32 dealId = vm.envBytes32("EVIDENCE_DEAL_ID");
        uint64 expectedTermsVersion = uint64(vm.envUint("EVIDENCE_TERMS_VERSION"));
        uint64 expectedEvidenceRevision = uint64(vm.envUint("EVIDENCE_REVISION"));
        uint8 expectedDecisionCode = uint8(vm.envUint("EVIDENCE_DECISION_CODE"));
        bytes32 expectedEvidenceCommitment = vm.envBytes32("EVIDENCE_COMMITMENT");
        bytes32 expectedVerdictCommitment = vm.envBytes32("EVIDENCE_VERDICT_COMMITMENT");
        bytes32 expectedReportId = vm.envBytes32("EVIDENCE_REPORT_ID");

        require(address(registry).code.length > 0, "registry has no bytecode");
        KarwanEvidenceRegistry.EvidenceReceipt memory receipt = registry.receiptOf(dealId);
        require(receipt.termsVersion == expectedTermsVersion, "terms version mismatch");
        require(receipt.evidenceRevision == expectedEvidenceRevision, "evidence revision mismatch");
        require(receipt.decisionCode == expectedDecisionCode, "decision mismatch");
        require(receipt.evidenceCommitment == expectedEvidenceCommitment, "evidence commitment mismatch");
        require(receipt.verdictCommitment == expectedVerdictCommitment, "verdict commitment mismatch");
        require(receipt.reportId == expectedReportId, "report ID mismatch");
        require(receipt.recordedAt > 0, "receipt was not recorded");
        require(registry.reportUsed(expectedReportId), "report replay key not consumed");

        console.log("Accepted CRE receipt for deal:");
        console.logBytes32(dealId);
        console.log("Decision code:", uint256(receipt.decisionCode));
        console.log("Recorded at:", uint256(receipt.recordedAt));
        console.log("Verification mode: read-only");
        return true;
    }
}

