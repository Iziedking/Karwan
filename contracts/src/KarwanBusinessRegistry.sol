// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KarwanBusinessRegistry
/// @notice On-chain record of Karwan business verification. A wallet that wants
///         to trade as a verified business submits a registration that anchors
///         the hash of its registration or tax document. Karwan's reviewer
///         signer then approves or rejects. The verified status gates the
///         SME/B2B finance lane off-chain; this contract is the tamper-evident
///         record of who applied, what document they anchored, and who reviewed
///         it.
///
///         The registry holds no funds and needs no Circle whitelist. Status:
///           0 = None       never applied, or reset
///           1 = Submitted  applicant anchored a doc, awaiting review
///           2 = Verified   reviewer approved
///           3 = Rejected   reviewer declined; the applicant may resubmit
contract KarwanBusinessRegistry {
    uint8 internal constant STATUS_NONE = 0;
    uint8 internal constant STATUS_SUBMITTED = 1;
    uint8 internal constant STATUS_VERIFIED = 2;
    uint8 internal constant STATUS_REJECTED = 3;

    /// @notice Owner of the reviewer slot. Starts as the constructor's _owner;
    ///         transferable via the two-step pattern used across Karwan
    ///         registries so a multisig handover is explicit on-chain.
    address public owner;
    address public pendingOwner;

    /// @notice The reviewer signer authorised to approve or reject. A dedicated
    ///         Karwan operator wallet, never the deployer. Owner can rotate it.
    address public reviewer;

    struct Registration {
        uint8 status;
        bytes32 docHash;
        uint64 submittedAt;
        uint64 reviewedAt;
        /// @dev The reviewer that approved or rejected this applicant.
        address reviewedBy;
        /// @dev sha256 of the human-readable rejection reason; zero otherwise.
        bytes32 reasonHash;
    }

    mapping(address => Registration) private _registrations;

    // Events

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ReviewerChanged(address indexed previousReviewer, address indexed newReviewer);

    event BusinessRegistrationSubmitted(address indexed applicant, bytes32 docHash, uint64 ts);
    event BusinessVerified(address indexed applicant, address indexed reviewer, uint64 ts);
    event BusinessRejected(
        address indexed applicant, address indexed reviewer, bytes32 reasonHash, uint64 ts
    );
    event BusinessRevoked(
        address indexed applicant, address indexed reviewer, bytes32 reasonHash, uint64 ts
    );

    // Errors

    error NotOwner();
    error NotPendingOwner();
    error NotReviewer();
    error ZeroAddress();
    error EmptyHash();
    error NotSubmitted();
    error AlreadyVerified();
    error NotVerified();

    // Constructor

    constructor(address _owner, address _reviewer) {
        if (_owner == address(0) || _reviewer == address(0)) revert ZeroAddress();
        owner = _owner;
        reviewer = _reviewer;
        emit OwnershipTransferred(address(0), _owner);
        emit ReviewerChanged(address(0), _reviewer);
    }

    // Ownership handover (two-step, mirrors KarwanInvoiceRegistry)

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    /// @notice Rotate the reviewer signer. Owner-only.
    function setReviewer(address newReviewer) external {
        if (msg.sender != owner) revert NotOwner();
        if (newReviewer == address(0)) revert ZeroAddress();
        address previousReviewer = reviewer;
        reviewer = newReviewer;
        emit ReviewerChanged(previousReviewer, newReviewer);
    }

    // Registration

    /// @notice Submit or resubmit a business registration. msg.sender is the
    ///         applicant. Anchors the document hash and moves status to
    ///         Submitted, clearing any prior review. A verified business cannot
    ///         resubmit; a new or rejected applicant can. The hash is opaque to
    ///         the contract.
    function submitRegistration(bytes32 docHash) external {
        if (docHash == bytes32(0)) revert EmptyHash();
        Registration storage reg = _registrations[msg.sender];
        if (reg.status == STATUS_VERIFIED) revert AlreadyVerified();
        reg.status = STATUS_SUBMITTED;
        reg.docHash = docHash;
        reg.submittedAt = uint64(block.timestamp);
        reg.reviewedAt = 0;
        reg.reviewedBy = address(0);
        reg.reasonHash = bytes32(0);
        emit BusinessRegistrationSubmitted(msg.sender, docHash, uint64(block.timestamp));
    }

    /// @notice Approve a submitted registration. Reviewer-only; the applicant
    ///         must be in Submitted state.
    function approve(address applicant) external {
        if (msg.sender != reviewer) revert NotReviewer();
        Registration storage reg = _registrations[applicant];
        if (reg.status != STATUS_SUBMITTED) revert NotSubmitted();
        reg.status = STATUS_VERIFIED;
        reg.reviewedAt = uint64(block.timestamp);
        reg.reviewedBy = msg.sender;
        emit BusinessVerified(applicant, msg.sender, uint64(block.timestamp));
    }

    /// @notice Reject a submitted registration. Reviewer-only. reasonHash is
    ///         the sha256 of the human-readable reason, kept off chain.
    function reject(address applicant, bytes32 reasonHash) external {
        if (msg.sender != reviewer) revert NotReviewer();
        Registration storage reg = _registrations[applicant];
        if (reg.status != STATUS_SUBMITTED) revert NotSubmitted();
        reg.status = STATUS_REJECTED;
        reg.reviewedAt = uint64(block.timestamp);
        reg.reviewedBy = msg.sender;
        reg.reasonHash = reasonHash;
        emit BusinessRejected(applicant, msg.sender, reasonHash, uint64(block.timestamp));
    }

    /// @notice Revoke a VERIFIED business. Reviewer-only. Moves Verified ->
    ///         Rejected so a business that later turns fraudulent, loses its
    ///         license, or was approved in error can be pulled out of the
    ///         finance lane (which gates on isVerified) WITHOUT a redeploy. The
    ///         applicant may resubmit afterwards. reasonHash is the sha256 of
    ///         the human-readable reason, kept off chain.
    function revoke(address applicant, bytes32 reasonHash) external {
        if (msg.sender != reviewer) revert NotReviewer();
        Registration storage reg = _registrations[applicant];
        if (reg.status != STATUS_VERIFIED) revert NotVerified();
        reg.status = STATUS_REJECTED;
        reg.reviewedAt = uint64(block.timestamp);
        reg.reviewedBy = msg.sender;
        reg.reasonHash = reasonHash;
        emit BusinessRevoked(applicant, msg.sender, reasonHash, uint64(block.timestamp));
    }

    // Views

    /// @notice Compact status read for the backend mirror. verifiedAt is the
    ///         review timestamp when status is Verified, else 0.
    function statusOf(address applicant)
        external
        view
        returns (uint8 status, bytes32 docHash, uint64 verifiedAt)
    {
        Registration storage reg = _registrations[applicant];
        uint64 vAt = reg.status == STATUS_VERIFIED ? reg.reviewedAt : 0;
        return (reg.status, reg.docHash, vAt);
    }

    /// @notice Convenience boolean for finance-lane eligibility checks.
    function isVerified(address applicant) external view returns (bool) {
        return _registrations[applicant].status == STATUS_VERIFIED;
    }

    /// @notice Full registration record for audit and the backend mirror.
    function registrationOf(address applicant) external view returns (Registration memory) {
        return _registrations[applicant];
    }
}
