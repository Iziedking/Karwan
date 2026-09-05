// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReceiver, IERC165} from "./interfaces/IReceiver.sol";

/// @title KarwanEvidenceRegistry
/// @notice Non-custodial receipt registry for one CRE GitHub delivery predicate.
///
/// The contract has exactly one state-changing surface: `onReport`, called by
/// the configured CRE forwarder. It records an opaque delivery verdict for a
/// deal and terms version. It never receives, transfers, releases, refunds,
/// stakes, or otherwise controls USDC, native currency, escrow, or wallets.
/// There is no owner, admin rescue, upgrade path, or arbitrary caller path.
///
/// The report is deliberately a commitment boundary. GitHub credentials,
/// private repository content, human identifiers, and the accepted terms never
/// leave the confidential workflow. The registry stores only the deal/version
/// binding, evidence and verdict commitments, policy domain, and expiry.
contract KarwanEvidenceRegistry is IReceiver {
    bytes32 public constant REPORT_DOMAIN = keccak256("karwan.evidence.github.v1");
    uint8 public constant DECISION_PASS = 1;
    uint8 public constant DECISION_MISMATCH = 2;
    uint8 public constant DECISION_UNAVAILABLE = 3;

    /// @notice Chainlink's packed identity metadata is 62 bytes in the
    /// documented workflow shape. Production metadata may include a two-byte
    /// report envelope, so 64 bytes is also accepted. The first 62 bytes are
    /// always validated and the report ID below remains the replay key.
    uint256 private constant METADATA_IDENTITY_BYTES = 62;
    uint256 private constant METADATA_WITH_ENVELOPE_BYTES = 64;

    address public immutable forwarder;
    address public immutable workflowOwner;
    bytes32 public immutable expectedWorkflowId;
    bytes10 public immutable expectedWorkflowName;
    uint256 public immutable expectedChainId;

    mapping(bytes32 reportId => bool used) public reportUsed;
    mapping(bytes32 dealId => uint64 termsVersion) public latestTermsVersion;
    mapping(bytes32 dealId => uint64 evidenceRevision) public latestEvidenceRevision;

    struct EvidenceReceipt {
        uint64 termsVersion;
        uint64 evidenceRevision;
        uint64 expiresAt;
        uint8 decisionCode;
        bytes32 evidenceCommitment;
        bytes32 verdictCommitment;
        bytes32 reportId;
        uint64 recordedAt;
    }

    mapping(bytes32 dealId => EvidenceReceipt receipt) private _receipts;

    event EvidenceReceiptRecorded(
        bytes32 indexed dealId,
        uint64 indexed termsVersion,
        uint64 evidenceRevision,
        uint8 decisionCode,
        bytes32 evidenceCommitment,
        bytes32 verdictCommitment,
        bytes32 indexed reportId,
        uint64 expiresAt
    );

    error ZeroAddress();
    error ZeroWorkflowId();
    error ZeroChainId();
    error InvalidForwarder(address caller);
    error InvalidMetadataLength(uint256 actualLength);
    error InvalidWorkflowMetadata();
    error InvalidReportLength(uint256 actualLength);
    error InvalidDomain();
    error InvalidChain(uint256 received, uint256 expected);
    error InvalidDealId();
    error InvalidTermsVersion();
    error InvalidEvidenceRevision();
    error InvalidExpiry();
    error InvalidDecisionCode();
    error EmptyCommitment();
    error EmptyReportId();
    error ReportAlreadyUsed(bytes32 reportId);
    error StaleTermsVersion(bytes32 dealId, uint64 termsVersion);
    error EvidenceRevisionAlreadyRecorded(bytes32 dealId, uint64 termsVersion, uint64 evidenceRevision);
    error NoCustody();

    constructor(
        address forwarder_,
        address workflowOwner_,
        bytes32 workflowId_,
        bytes10 workflowName_,
        uint256 chainId_
    ) {
        if (forwarder_ == address(0) || workflowOwner_ == address(0)) {
            revert ZeroAddress();
        }
        if (workflowId_ == bytes32(0)) revert ZeroWorkflowId();
        if (chainId_ == 0) revert ZeroChainId();
        forwarder = forwarder_;
        workflowOwner = workflowOwner_;
        expectedWorkflowId = workflowId_;
        expectedWorkflowName = workflowName_;
        expectedChainId = chainId_;
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert InvalidForwarder(msg.sender);
        _validateMetadata(metadata);
        if (report.length != 10 * 32) revert InvalidReportLength(report.length);

        (
            bytes32 domain,
            uint256 chainId,
            bytes32 dealId,
            uint64 termsVersion,
            uint64 evidenceRevision,
            uint64 expiresAt,
            bytes32 evidenceCommitment,
            bytes32 verdictCommitment,
            uint8 decisionCode,
            bytes32 reportId
        ) = abi.decode(
            report, (bytes32, uint256, bytes32, uint64, uint64, uint64, bytes32, bytes32, uint8, bytes32)
        );

        if (domain != REPORT_DOMAIN) revert InvalidDomain();
        if (chainId != expectedChainId || chainId != block.chainid) {
            revert InvalidChain(chainId, expectedChainId);
        }
        if (dealId == bytes32(0)) revert InvalidDealId();
        if (termsVersion == 0) revert InvalidTermsVersion();
        if (evidenceRevision == 0) revert InvalidEvidenceRevision();
        if (expiresAt < block.timestamp) revert InvalidExpiry();
        if (decisionCode < DECISION_PASS || decisionCode > DECISION_UNAVAILABLE) {
            revert InvalidDecisionCode();
        }
        if (evidenceCommitment == bytes32(0) || verdictCommitment == bytes32(0)) {
            revert EmptyCommitment();
        }
        if (reportId == bytes32(0)) revert EmptyReportId();
        if (reportUsed[reportId]) revert ReportAlreadyUsed(reportId);
        uint64 recordedTermsVersion = latestTermsVersion[dealId];
        if (termsVersion < recordedTermsVersion) {
            revert StaleTermsVersion(dealId, termsVersion);
        }
        if (
            termsVersion == recordedTermsVersion
                && evidenceRevision <= latestEvidenceRevision[dealId]
        ) {
            revert EvidenceRevisionAlreadyRecorded(dealId, termsVersion, evidenceRevision);
        }

        reportUsed[reportId] = true;
        latestTermsVersion[dealId] = termsVersion;
        latestEvidenceRevision[dealId] = evidenceRevision;
        _receipts[dealId] = EvidenceReceipt({
            termsVersion: termsVersion,
            evidenceRevision: evidenceRevision,
            expiresAt: expiresAt,
            decisionCode: decisionCode,
            evidenceCommitment: evidenceCommitment,
            verdictCommitment: verdictCommitment,
            reportId: reportId,
            recordedAt: uint64(block.timestamp)
        });

        emit EvidenceReceiptRecorded(
            dealId,
            termsVersion,
            evidenceRevision,
            decisionCode,
            evidenceCommitment,
            verdictCommitment,
            reportId,
            expiresAt
        );
    }

    /// @notice Return the latest receipt for a deal. A zero termsVersion means
    /// that no CRE report has been recorded for the deal.
    function receiptOf(bytes32 dealId) external view returns (EvidenceReceipt memory) {
        return _receipts[dealId];
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    receive() external payable {
        revert NoCustody();
    }

    fallback() external payable {
        revert NoCustody();
    }

    function _validateMetadata(bytes calldata metadata) internal view {
        if (
            metadata.length != METADATA_IDENTITY_BYTES
                && metadata.length != METADATA_WITH_ENVELOPE_BYTES
        ) {
            revert InvalidMetadataLength(metadata.length);
        }

        bytes32 workflowId;
        bytes10 workflowName;
        address owner;
        assembly {
            workflowId := calldataload(metadata.offset)
            workflowName := calldataload(add(metadata.offset, 32))
            owner := shr(96, calldataload(add(metadata.offset, 42)))
        }
        if (
            workflowId != expectedWorkflowId || workflowName != expectedWorkflowName
                || owner != workflowOwner
        ) {
            revert InvalidWorkflowMetadata();
        }
    }
}
