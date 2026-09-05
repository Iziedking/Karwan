// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IReceiver} from "../src/interfaces/IReceiver.sol";
import {KarwanEvidenceRegistry} from "../src/KarwanEvidenceRegistry.sol";

contract KarwanEvidenceRegistryTest is Test {
    address private constant FORWARDER = address(0xF0A);
    address private constant WORKFLOW_OWNER = address(0xB0B);
    bytes32 private constant WORKFLOW_ID = keccak256("karwan-cre-github-delivery-v1");
    bytes10 private constant WORKFLOW_NAME = bytes10("karwan-git");
    bytes32 private constant REPORT_DOMAIN = keccak256("karwan.evidence.github.v1");
    bytes32 private constant DEAL_ID = keccak256("demo-deal-1");
    bytes32 private constant EVIDENCE = keccak256("evidence-1");
    bytes32 private constant VERDICT = keccak256("verdict-pass");

    KarwanEvidenceRegistry private registry;

    function setUp() public {
        registry = new KarwanEvidenceRegistry(
            FORWARDER, WORKFLOW_OWNER, WORKFLOW_ID, WORKFLOW_NAME, block.chainid
        );
    }

    function testSupportsReceiverAnd165() public view {
        assertTrue(registry.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(registry.supportsInterface(0x01ffc9a7));
        assertFalse(registry.supportsInterface(0xffffffff));
    }

    function testAcceptsCorrectReportAndStoresOnlyCommitments() public {
        bytes32 reportId = keccak256("report-1");
        vm.prank(FORWARDER);
        registry.onReport(_metadata(false), _report(DEAL_ID, 1, 2, EVIDENCE, VERDICT, reportId));

        KarwanEvidenceRegistry.EvidenceReceipt memory receipt = registry.receiptOf(DEAL_ID);
        assertEq(receipt.termsVersion, 1);
        assertEq(receipt.evidenceRevision, 1);
        assertEq(receipt.decisionCode, registry.DECISION_PASS());
        assertEq(receipt.evidenceCommitment, EVIDENCE);
        assertEq(receipt.verdictCommitment, VERDICT);
        assertEq(receipt.reportId, reportId);
        assertTrue(registry.reportUsed(reportId));
    }

    function testAcceptsProductionEnvelopeMetadataLength() public {
        vm.prank(FORWARDER);
        registry.onReport(
            _metadata(true), _report(DEAL_ID, 1, 2, EVIDENCE, VERDICT, keccak256("report-envelope"))
        );
        assertEq(registry.latestTermsVersion(DEAL_ID), 1);
    }

    function testRejectsWrongCaller() public {
        vm.expectRevert(
            abi.encodeWithSelector(KarwanEvidenceRegistry.InvalidForwarder.selector, address(this))
        );
        registry.onReport(
            _metadata(false), _report(DEAL_ID, 1, 2, EVIDENCE, VERDICT, keccak256("caller"))
        );
    }

    function testRejectsForgedWorkflowMetadata() public {
        bytes memory forged =
            abi.encodePacked(keccak256("wrong-workflow"), WORKFLOW_NAME, WORKFLOW_OWNER);
        vm.prank(FORWARDER);
        vm.expectRevert(KarwanEvidenceRegistry.InvalidWorkflowMetadata.selector);
        registry.onReport(forged, _report(DEAL_ID, 1, 2, EVIDENCE, VERDICT, keccak256("metadata")));
    }

    function testRejectsMalformedMetadataAndInvalidReportLength() public {
        bytes memory malformedMetadata = new bytes(61);
        vm.prank(FORWARDER);
        vm.expectRevert(
            abi.encodeWithSelector(KarwanEvidenceRegistry.InvalidMetadataLength.selector, 61)
        );
        registry.onReport(
            malformedMetadata, _report(DEAL_ID, 1, 2, EVIDENCE, VERDICT, keccak256("length"))
        );

        vm.prank(FORWARDER);
        vm.expectRevert(
            abi.encodeWithSelector(KarwanEvidenceRegistry.InvalidReportLength.selector, 32)
        );
        registry.onReport(_metadata(false), new bytes(32));
    }

    function testRejectsWrongDomainChainAndExpiredReports() public {
        vm.startPrank(FORWARDER);
        vm.expectRevert(KarwanEvidenceRegistry.InvalidDomain.selector);
        registry.onReport(
            _metadata(false),
            abi.encode(
                keccak256("wrong-domain"),
                block.chainid,
                DEAL_ID,
                uint64(1),
                uint64(1),
                uint64(2),
                EVIDENCE,
                VERDICT,
                uint8(1),
                keccak256("domain")
            )
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                KarwanEvidenceRegistry.InvalidChain.selector, uint256(1), block.chainid
            )
        );
        registry.onReport(
            _metadata(false),
            abi.encode(
                REPORT_DOMAIN,
                uint256(1),
                DEAL_ID,
                uint64(1),
                uint64(1),
                uint64(2),
                EVIDENCE,
                VERDICT,
                uint8(1),
                keccak256("chain")
            )
        );

        vm.warp(3);
        vm.expectRevert(KarwanEvidenceRegistry.InvalidExpiry.selector);
        registry.onReport(
            _metadata(false), _report(DEAL_ID, 1, 2, EVIDENCE, VERDICT, keccak256("expired"))
        );
        vm.stopPrank();
    }

    function testRejectsReplayAndSameEvidenceRevision() public {
        bytes32 reportId = keccak256("replay");
        bytes memory report = _report(DEAL_ID, 1, 100, EVIDENCE, VERDICT, reportId);
        vm.startPrank(FORWARDER);
        registry.onReport(_metadata(false), report);
        vm.expectRevert(
            abi.encodeWithSelector(KarwanEvidenceRegistry.ReportAlreadyUsed.selector, reportId)
        );
        registry.onReport(_metadata(false), report);
        vm.expectRevert(
            abi.encodeWithSelector(
                KarwanEvidenceRegistry.EvidenceRevisionAlreadyRecorded.selector,
                DEAL_ID,
                uint64(1),
                uint64(1)
            )
        );
        registry.onReport(
            _metadata(false),
            _report(DEAL_ID, 1, 100, keccak256("new-evidence"), VERDICT, keccak256("new-report"))
        );
        vm.stopPrank();
    }

    function testCorrectedEvidenceUsesNewRevisionUnderAcceptedTerms() public {
        vm.startPrank(FORWARDER);
        registry.onReport(
            _metadata(false),
            _report(
                DEAL_ID,
                1,
                1,
                100,
                EVIDENCE,
                keccak256("verdict-mismatch"),
                keccak256("mismatch"),
                registry.DECISION_MISMATCH()
            )
        );
        registry.onReport(
            _metadata(false),
            _report(
                DEAL_ID,
                1,
                2,
                100,
                keccak256("evidence-corrected"),
                VERDICT,
                keccak256("corrected"),
                registry.DECISION_PASS()
            )
        );
        vm.stopPrank();

        KarwanEvidenceRegistry.EvidenceReceipt memory receipt = registry.receiptOf(DEAL_ID);
        assertEq(receipt.termsVersion, 1);
        assertEq(receipt.evidenceRevision, 2);
        assertEq(receipt.decisionCode, registry.DECISION_PASS());
    }

    function testReceiverCannotCustodyNativeCurrency() public {
        vm.deal(address(this), 1 ether);
        (bool success,) = address(registry).call{value: 1 wei}("");
        assertFalse(success);
        assertEq(address(registry).balance, 0);
    }

    function _metadata(bool includeEnvelope) private pure returns (bytes memory) {
        bytes memory base = abi.encodePacked(WORKFLOW_ID, WORKFLOW_NAME, WORKFLOW_OWNER);
        return includeEnvelope ? bytes.concat(base, bytes2(0x0001)) : base;
    }

    function _report(
        bytes32 dealId,
        uint64 termsVersion,
        uint64 expiresAt,
        bytes32 evidenceCommitment,
        bytes32 verdictCommitment,
        bytes32 reportId
    ) private view returns (bytes memory) {
        return _report(
            dealId, termsVersion, 1, expiresAt, evidenceCommitment, verdictCommitment, reportId, 1
        );
    }

    function _report(
        bytes32 dealId,
        uint64 termsVersion,
        uint64 evidenceRevision,
        uint64 expiresAt,
        bytes32 evidenceCommitment,
        bytes32 verdictCommitment,
        bytes32 reportId,
        uint8 decisionCode
    ) private view returns (bytes memory) {
        return abi.encode(
            REPORT_DOMAIN,
            block.chainid,
            dealId,
            termsVersion,
            evidenceRevision,
            expiresAt,
            evidenceCommitment,
            verdictCommitment,
            decisionCode,
            reportId
        );
    }
}
