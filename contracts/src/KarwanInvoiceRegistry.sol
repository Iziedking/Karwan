// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice KarwanEscrow subset used by the registry for caller authorisation.
///         v2: reads the decoupled partiesOf() view instead of the full struct,
///         so adding fields to the escrow's EscrowAccount never breaks the
///         registry's ABI decode. Returns (address(0), address(0)) for an
///         unknown jobId.
interface IKarwanEscrow {
    function partiesOf(bytes32 jobId) external view returns (address buyer, address seller);
}

/// @title KarwanInvoiceRegistry
/// @notice Single source of truth for trade-document anchors, payee
///         redirection on factoring, attester allowlist, and proof-of-delivery
///         acceptance. Companion to KarwanEscrow.
///
///         The registry never touches USDC. Auth is enforced by reading the
///         escrow's existing getEscrow(jobId) view, no escrow redeploy is
///         needed. The on-chain payee is the redirect target for factoring:
///         after the seller accepts a financier's offer, setPayee swaps the
///         payee to the financier; the off-chain settlement router reads
///         payeeOf at settlement time and submits cascading EIP-3009
///         authorisations to Circle Gateway for the waterfall.
///
///         Document kinds covered out of the box:
///           1 = Invoice            (the receivable)
///           2 = Purchase Order     (the buyer's commitment)
///           3 = Bill of Lading     (carrier receipt + title)
///           4 = Certificate of Origin
///           5 = Proof of Delivery
///           6 = Other              (open slot)
///         Adding a new kind never requires a redeploy: backend interprets
///         the uint8, the contract just stores + emits it.
///
///         Forward compatibility:
///         The contract is intentionally minimal. It exposes the primitive
///         (anchor / setPayee / acceptPoD / attester allowlist) and lets the
///         off-chain settlement router compose richer flows (waterfalls,
///         multi-party routing, batched settlement). Pool primitives, CCTP V2
///         hooks, and CPN-OFI registration all plug in without touching this
///         contract.
contract KarwanInvoiceRegistry {
    // Storage

    /// @notice The KarwanEscrow contract whose view we trust for buyer/seller
    ///         lookups. v2 (D1): owner-settable and repointable so an escrow
    ///         redeploy is a repoint, not a one-shot cascade.
    address public escrow;

    /// @notice Owner of the attester allowlist + payee emergency reset.
    ///         Starts as deployer. Transferable via a two-step pattern so a
    ///         multisig handover is explicit on-chain.
    address public owner;
    address public pendingOwner;

    /// @notice Document anchors keyed by invoice ID (which equals the deal's
    ///         jobId in the escrow). Append-only; an anchor never mutates.
    struct DocAnchor {
        bytes32 hash;
        uint8 kind;
        uint64 anchoredAt;
        address anchorer;
    }

    mapping(bytes32 => DocAnchor[]) private _docs;

    /// @notice Initial payee defaults to the seller (resolved on first read).
    ///         setPayee mutates pre-PoD only; post-PoD the payee is locked.
    ///         Reading payeeOf returns address(0) if no override has been
    ///         set; resolvePayee() in this contract resolves to the seller
    ///         via the escrow view in that case.
    mapping(bytes32 => address) public payeeOf;

    /// @notice True once a PoD has been accepted for this invoice. Locks
    ///         setPayee and gates KarwanPOFinancing.releaseToSeller.
    mapping(bytes32 => bool) public podAccepted;

    /// @notice The PoD document hash accepted by the buyer or attester.
    ///         Persisted alongside `podAccepted` so downstream consumers can
    ///         cross-check against the document the financier received.
    mapping(bytes32 => bytes32) public podHashOf;

    /// @notice Approved attesters who can sign PoD on the buyer's behalf
    ///         (customs brokers, freight forwarders, third-party verifiers).
    mapping(address => bool) public approvedAttester;

    // Events

    event EscrowSet(address indexed escrow);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    event DocumentAnchored(
        bytes32 indexed invoiceId, bytes32 docHash, uint8 kind, address indexed anchorer
    );
    event PayeeChanged(
        bytes32 indexed invoiceId, address indexed previousPayee, address indexed newPayee
    );
    event PoDAccepted(
        bytes32 indexed invoiceId, bytes32 podHash, address indexed attester, uint64 ts
    );
    event PoDReset(bytes32 indexed invoiceId);

    event AttesterAdded(address indexed attester);
    event AttesterRemoved(address indexed attester);

    // Errors

    error EscrowNotSet();
    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();

    error InvalidKind();
    error InvalidInvoiceId();
    error NotParty();
    error PoDLocked();
    error PoDAlreadyAccepted();
    error PoDNotAccepted();
    error NotPayee();
    error NotPodAuthorised();
    error EmptyHash();

    // Constructor

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
        emit OwnershipTransferred(address(0), _owner);
    }

    // Escrow binding

    /// @notice Set (or repoint) the KarwanEscrow the registry consults for
    ///         caller authorisation. v2 (D1): owner-only and repointable so a
    ///         future escrow redeploy doesn't force a registry redeploy.
    function setEscrow(address _escrow) external {
        if (msg.sender != owner) revert NotOwner();
        if (_escrow == address(0)) revert ZeroAddress();
        escrow = _escrow;
        emit EscrowSet(_escrow);
    }

    // Ownership handover

    /// @notice Start an ownership transfer. The new owner must accept via
    ///         acceptOwnership(). This two-step prevents accidental
    ///         transfers to an unrecoverable address.
    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Accept a pending ownership transfer. Owner-handover completes.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    // Attester allowlist

    /// @notice Add an address to the PoD attester allowlist. Owner-only.
    function addAttester(address attester) external {
        if (msg.sender != owner) revert NotOwner();
        if (attester == address(0)) revert ZeroAddress();
        approvedAttester[attester] = true;
        emit AttesterAdded(attester);
    }

    /// @notice Remove an address from the PoD attester allowlist. Owner-only.
    ///         Already-anchored PoDs by this attester remain valid; future
    ///         calls revert.
    function removeAttester(address attester) external {
        if (msg.sender != owner) revert NotOwner();
        approvedAttester[attester] = false;
        emit AttesterRemoved(attester);
    }

    // Document anchoring

    /// @notice Anchor a trade document hash against an invoice. Callable by
    ///         the deal's buyer or seller (looked up via the escrow). The
    ///         hash is opaque to the contract; the kind is one of the
    ///         documented enums or `6 = Other`. Anchors are append-only.
    ///
    /// @param invoiceId  the deal's jobId in the escrow
    /// @param docHash    sha256 of the document; must be non-zero
    /// @param kind       1..6 per the kind table in the header
    function anchor(bytes32 invoiceId, bytes32 docHash, uint8 kind) external {
        if (escrow == address(0)) revert EscrowNotSet();
        if (invoiceId == bytes32(0)) revert InvalidInvoiceId();
        if (docHash == bytes32(0)) revert EmptyHash();
        if (kind == 0 || kind > 6) revert InvalidKind();
        _requireDealParty(invoiceId, msg.sender);

        _docs[invoiceId].push(
            DocAnchor({
                hash: docHash,
                kind: kind,
                anchoredAt: uint64(block.timestamp),
                anchorer: msg.sender
            })
        );

        emit DocumentAnchored(invoiceId, docHash, kind, msg.sender);
    }

    // Payee

    /// @notice Override the on-settlement payee for an invoice. Used by
    ///         factoring: seller initially is the payee; on acceptance of a
    ///         financier's offer, setPayee swaps to the financier; the
    ///         off-chain settlement router reads payeeOf at settlement time
    ///         and routes via Circle Gateway accordingly.
    ///
    ///         Auth: if no override exists, only the deal's seller (per
    ///         escrow) can set the first payee. Once an override exists, only
    ///         the current `payeeOf[invoiceId]` can mutate it. Locked once
    ///         PoD is accepted. After delivery is confirmed, settlement is
    ///         imminent and payee mutations would invite race conditions.
    ///
    /// @param invoiceId  the deal's jobId
    /// @param newPayee   non-zero address; allowed to be the same address as
    ///                   current payee (no-op refresh, still emits)
    function setPayee(bytes32 invoiceId, address newPayee) external {
        if (escrow == address(0)) revert EscrowNotSet();
        if (newPayee == address(0)) revert ZeroAddress();
        if (podAccepted[invoiceId]) revert PoDLocked();

        address current = payeeOf[invoiceId];
        if (current == address(0)) {
            // First-time setPayee: only the deal's seller can bootstrap.
            address seller = _sellerOf(invoiceId);
            if (msg.sender != seller) revert NotPayee();
            current = seller;
        } else {
            if (msg.sender != current) revert NotPayee();
        }

        payeeOf[invoiceId] = newPayee;
        emit PayeeChanged(invoiceId, current, newPayee);
    }

    // PoD acceptance

    /// @notice Mark the proof-of-delivery accepted. Callable by the deal's
    ///         buyer OR by any address in `approvedAttester`. Latches once:
    ///         a second call reverts. Locks setPayee.
    ///
    /// @param invoiceId  the deal's jobId
    /// @param podHash    sha256 of the PoD document; must be non-zero
    function acceptPoD(bytes32 invoiceId, bytes32 podHash) external {
        if (escrow == address(0)) revert EscrowNotSet();
        if (podHash == bytes32(0)) revert EmptyHash();
        if (podAccepted[invoiceId]) revert PoDAlreadyAccepted();

        // The invoice must exist (deal funded) on BOTH paths. Without this, an
        // approved attester could pre-accept a PoD on an unfunded jobId, and
        // when that jobId later funds it would already be latched accepted,
        // locking setPayee and enabling release. Validate existence first.
        (address dealBuyer, ) = IKarwanEscrow(escrow).partiesOf(invoiceId);
        if (dealBuyer == address(0)) revert InvalidInvoiceId();
        // Caller must be the buyer of the deal OR an approved attester.
        if (!approvedAttester[msg.sender] && msg.sender != dealBuyer) revert NotPodAuthorised();

        podAccepted[invoiceId] = true;
        podHashOf[invoiceId] = podHash;
        emit PoDAccepted(invoiceId, podHash, msg.sender, uint64(block.timestamp));
    }

    /// @notice Owner emergency: clear a PoD acceptance so a mistaken or rogue
    ///         attest can be undone (unlocks setPayee). Owner is a multisig on
    ///         mainnet. Use only before settlement — the PO-financing release
    ///         path already state-guards against a double release.
    function resetPoD(bytes32 invoiceId) external {
        if (msg.sender != owner) revert NotOwner();
        if (!podAccepted[invoiceId]) revert PoDNotAccepted();
        podAccepted[invoiceId] = false;
        podHashOf[invoiceId] = bytes32(0);
        emit PoDReset(invoiceId);
    }

    /// @notice Owner emergency payee reset (the header's promised lever).
    ///         Clears the override back to the default (the deal's seller,
    ///         resolved via resolvePayee). Pre-PoD only, so it can't rewrite a
    ///         settlement target after delivery is confirmed.
    function resetPayee(bytes32 invoiceId) external {
        if (msg.sender != owner) revert NotOwner();
        if (podAccepted[invoiceId]) revert PoDLocked();
        address prev = payeeOf[invoiceId];
        payeeOf[invoiceId] = address(0);
        emit PayeeChanged(invoiceId, prev, address(0));
    }

    // Views

    /// @notice Returns the document anchor array for an invoice. Empty array
    ///         when nothing is anchored.
    function docsOf(bytes32 invoiceId) external view returns (DocAnchor[] memory) {
        return _docs[invoiceId];
    }

    /// @notice Returns the count of anchors for an invoice. Cheap for index
    ///         + paginate flows.
    function docCount(bytes32 invoiceId) external view returns (uint256) {
        return _docs[invoiceId].length;
    }

    /// @notice Resolves the effective payee: explicit override if set,
    ///         otherwise the deal's seller from the escrow. Reverts if the
    ///         escrow has no record of this invoice (deal not yet funded).
    function resolvePayee(bytes32 invoiceId) external view returns (address) {
        address override_ = payeeOf[invoiceId];
        if (override_ != address(0)) return override_;
        return _sellerOf(invoiceId);
    }

    /// @notice Convenience: is this PoD finalised?
    function isPoDAccepted(bytes32 invoiceId) external view returns (bool) {
        return podAccepted[invoiceId];
    }

    /// @notice Convenience: is this address an approved attester?
    function isAttester(address who) external view returns (bool) {
        return approvedAttester[who];
    }

    // Internals

    /// @dev Reverts unless `who` is the buyer or seller of `invoiceId` per
    ///      the escrow's record. Reverts if escrow has no record (buyer ==
    ///      address(0)) so anchors against an unfunded jobId are rejected.
    function _requireDealParty(bytes32 invoiceId, address who) internal view {
        (address b, address s) = IKarwanEscrow(escrow).partiesOf(invoiceId);
        if (b == address(0)) revert InvalidInvoiceId();
        if (who != b && who != s) revert NotParty();
    }

    function _sellerOf(bytes32 invoiceId) internal view returns (address) {
        (, address s) = IKarwanEscrow(escrow).partiesOf(invoiceId);
        if (s == address(0)) revert InvalidInvoiceId();
        return s;
    }
}
