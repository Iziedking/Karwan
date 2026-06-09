// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice KarwanEscrow subset used for seller lookup at fund time. The
///         contract reads `getEscrow(invoiceId).seller` so the financier
///         cannot route funds to a wrong address — the underlying deal's
///         seller is the canonical recipient on PoD release.
interface IKarwanEscrow {
    struct EscrowAccount {
        address buyer;
        address seller;
        uint256 dealAmount;
        uint256 sellerNet;
        uint256 feeTotal;
        uint256 released;
        uint256 feeReleased;
        uint256 reservedAmount;
        uint8[] milestonePcts;
        uint8 milestonesReleased;
        uint8 state;
        uint16 reservationBps;
    }

    function getEscrow(bytes32 jobId) external view returns (EscrowAccount memory);
}

/// @notice KarwanInvoiceRegistry subset used for PoD acceptance lookup.
interface IKarwanInvoiceRegistry {
    function isPoDAccepted(bytes32 invoiceId) external view returns (bool);
}

/// @title KarwanPOFinancing
/// @notice Single-funder purchase-order financing. A financier pre-funds the
///         seller's working capital against a PO whose escrow the buyer has
///         already funded. The contract holds the principal until proof of
///         delivery anchors on KarwanInvoiceRegistry, then releases to the
///         seller. The seller repays from their escrow settlement via a
///         pull-based approval — the contract has no claim on the seller's
///         wallet beyond the pre-agreed `repayUsdc` amount.
///
///         Design (per docs/sme-design.md §3.2, refined Day 2):
///
///           1. Financier calls fund(): pays principal into custody. Validated
///              against the underlying deal's seller (escrow lookup) so the
///              financier cannot accidentally fund the wrong PO.
///
///           2. Buyer or registered attester anchors PoD via the registry.
///
///           3. Anyone calls releaseToSeller(): contract verifies PoD is
///              anchored, transfers principal from custody to the seller.
///
///           4. Buyer releases the escrow as usual. Funds land in the
///              seller's wallet (the registry's setPayee mechanism is NOT
///              used here — that path is for factoring).
///
///           5. Anyone (typically the financier or seller's agent) calls
///              claimRepayment(): contract pulls `repayUsdc` from the
///              seller's wallet using a standard ERC20 approval the seller
///              gave at offer-accept time. Pays financier.
///
///         The platform fee already lands in KarwanTreasury via the escrow
///         on release; PO financing adds no extra fee — the financier's
///         repay-vs-principal spread is the financier's return.
///
///         Failure handling:
///           - PoD never lands: financier calls reclaimPrincipal() after
///             releaseTimeoutAt to recover their deposit. State -> Reclaimed.
///           - Repayment never lands: financier calls markDefaulted() after
///             repaymentTimeoutAt. State -> Defaulted. No funds move on
///             chain; off-chain recourse (dispute, stake slash via v2.D,
///             reputation hit, future SecurityAgent tagging) follows.
contract KarwanPOFinancing is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* =============================================================== */
    /*                              TYPES                               */
    /* =============================================================== */

    enum POState {
        None,        // 0 - no line
        Funded,      // 1 - financier deposited, awaiting PoD
        Released,    // 2 - principal sent to seller, awaiting repayment
        Settled,     // 3 - financier repaid
        Reclaimed,   // 4 - financier reclaimed pre-PoD timeout
        Defaulted    // 5 - repayment timeout passed without claim
    }

    struct POLine {
        address financier;
        address seller;
        uint128 principalUsdc;
        uint128 repayUsdc;
        uint64 fundedAt;
        uint64 releaseTimeoutAt;
        uint64 releasedAt;
        uint64 repaymentTimeoutAt;
        uint64 settledAt;
        POState state;
    }

    /* =============================================================== */
    /*                            STORAGE                               */
    /* =============================================================== */

    IERC20 public immutable usdc;
    IKarwanInvoiceRegistry public immutable registry;
    IKarwanEscrow public immutable escrow;

    /// @notice After release, the financier has at least this many seconds
    ///         before they can mark the line defaulted. Gives the seller a
    ///         window to repay from the eventual escrow settlement, which
    ///         depends on the buyer's release timing.
    uint64 public constant MIN_REPAYMENT_WINDOW = 7 days;

    /// @notice Hard ceiling on the release timeout a financier may request.
    ///         A 5-year window is well beyond any legitimate trade and stops
    ///         a financier from accidentally locking principal forever.
    uint64 public constant MAX_RELEASE_WINDOW = 5 * 365 days;

    mapping(bytes32 => POLine) public lines;

    /* =============================================================== */
    /*                             EVENTS                               */
    /* =============================================================== */

    event POFunded(
        bytes32 indexed invoiceId,
        address indexed financier,
        address indexed seller,
        uint128 principalUsdc,
        uint128 repayUsdc,
        uint64 releaseTimeoutAt
    );
    event POReleased(bytes32 indexed invoiceId, address indexed seller, uint128 principalUsdc);
    event PORepaid(
        bytes32 indexed invoiceId, address indexed financier, uint128 repayUsdc, address caller
    );
    event POReclaimed(
        bytes32 indexed invoiceId, address indexed financier, uint128 principalUsdc
    );
    event PODefaulted(
        bytes32 indexed invoiceId, address indexed financier, address indexed seller
    );

    /* =============================================================== */
    /*                             ERRORS                               */
    /* =============================================================== */

    error AlreadyFunded();
    error InvalidInvoiceId();
    error InvalidAmount();
    error InvalidRepay();
    error InvalidTimeout();
    error InvalidState();
    error NotFinancier();
    error NotParty();
    error PoDNotAccepted();
    error PoDAlreadyAccepted();
    error StillWithinWindow();
    error ZeroAddress();
    error MissingEscrowRecord();

    /* =============================================================== */
    /*                          CONSTRUCTOR                             */
    /* =============================================================== */

    constructor(address _usdc, address _registry, address _escrow) {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_registry == address(0)) revert ZeroAddress();
        if (_escrow == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        registry = IKarwanInvoiceRegistry(_registry);
        escrow = IKarwanEscrow(_escrow);
    }

    /* =============================================================== */
    /*                              FUND                                */
    /* =============================================================== */

    /// @notice Financier funds a PO line. Pulls principal from the caller.
    ///         The seller is resolved via the escrow's getEscrow() view so
    ///         the financier cannot accidentally route funds to a wrong
    ///         party — the canonical seller is the only valid recipient.
    ///
    /// @param invoiceId            the deal's jobId in the escrow
    /// @param principalUsdc        amount the financier pays in now
    /// @param repayUsdc            amount the financier expects back from
    ///                             the seller's settlement (must be > principal)
    /// @param releaseTimeoutSeconds seconds from now before financier can
    ///                              reclaim if PoD never anchors
    function fund(
        bytes32 invoiceId,
        uint128 principalUsdc,
        uint128 repayUsdc,
        uint64 releaseTimeoutSeconds
    ) external nonReentrant {
        if (invoiceId == bytes32(0)) revert InvalidInvoiceId();
        if (lines[invoiceId].state != POState.None) revert AlreadyFunded();
        if (principalUsdc == 0) revert InvalidAmount();
        if (repayUsdc <= principalUsdc) revert InvalidRepay();
        if (releaseTimeoutSeconds == 0 || releaseTimeoutSeconds > MAX_RELEASE_WINDOW) {
            revert InvalidTimeout();
        }
        if (registry.isPoDAccepted(invoiceId)) revert PoDAlreadyAccepted();

        // Resolve seller from escrow. Reverts if the deal does not exist.
        address seller = escrow.getEscrow(invoiceId).seller;
        if (seller == address(0)) revert MissingEscrowRecord();

        uint64 nowTs = uint64(block.timestamp);
        lines[invoiceId] = POLine({
            financier: msg.sender,
            seller: seller,
            principalUsdc: principalUsdc,
            repayUsdc: repayUsdc,
            fundedAt: nowTs,
            releaseTimeoutAt: nowTs + releaseTimeoutSeconds,
            releasedAt: 0,
            repaymentTimeoutAt: 0,
            settledAt: 0,
            state: POState.Funded
        });

        usdc.safeTransferFrom(msg.sender, address(this), principalUsdc);

        emit POFunded(
            invoiceId, msg.sender, seller, principalUsdc, repayUsdc, nowTs + releaseTimeoutSeconds
        );
    }

    /* =============================================================== */
    /*                         RELEASE TO SELLER                        */
    /* =============================================================== */

    /// @notice Release the principal to the seller. Verifies that PoD has
    ///         been anchored on the registry. Anyone can call — the principal
    ///         goes to the seller recorded at fund time regardless of caller.
    ///         Starts the repayment window: settlement must come (and
    ///         claimRepayment fire) within MIN_REPAYMENT_WINDOW or the
    ///         financier may mark the line defaulted.
    function releaseToSeller(bytes32 invoiceId) external nonReentrant {
        POLine storage l = lines[invoiceId];
        if (l.state != POState.Funded) revert InvalidState();
        if (!registry.isPoDAccepted(invoiceId)) revert PoDNotAccepted();

        uint64 nowTs = uint64(block.timestamp);
        l.state = POState.Released;
        l.releasedAt = nowTs;
        l.repaymentTimeoutAt = nowTs + MIN_REPAYMENT_WINDOW;

        uint128 principal = l.principalUsdc;
        usdc.safeTransfer(l.seller, principal);

        emit POReleased(invoiceId, l.seller, principal);
    }

    /* =============================================================== */
    /*                         CLAIM REPAYMENT                          */
    /* =============================================================== */

    /// @notice Pull `repayUsdc` from the seller's wallet and pay the
    ///         financier. The seller pre-approved this contract for the
    ///         repay amount at offer-accept time (standard ERC20 approval).
    ///         Callable by the financier or the seller — either party can
    ///         trigger the settlement to close out the line cleanly.
    function claimRepayment(bytes32 invoiceId) external nonReentrant {
        POLine storage l = lines[invoiceId];
        if (l.state != POState.Released) revert InvalidState();
        if (msg.sender != l.financier && msg.sender != l.seller) revert NotParty();

        l.state = POState.Settled;
        l.settledAt = uint64(block.timestamp);

        address financier = l.financier;
        address seller = l.seller;
        uint128 repay = l.repayUsdc;

        usdc.safeTransferFrom(seller, financier, repay);

        emit PORepaid(invoiceId, financier, repay, msg.sender);
    }

    /* =============================================================== */
    /*                       RECLAIM PRINCIPAL                          */
    /* =============================================================== */

    /// @notice Financier reclaims the principal when PoD never landed and
    ///         the release window expired. The line was Funded, never made
    ///         it to Released. State -> Reclaimed.
    function reclaimPrincipal(bytes32 invoiceId) external nonReentrant {
        POLine storage l = lines[invoiceId];
        if (l.state != POState.Funded) revert InvalidState();
        if (msg.sender != l.financier) revert NotFinancier();
        if (block.timestamp < l.releaseTimeoutAt) revert StillWithinWindow();
        if (registry.isPoDAccepted(invoiceId)) revert PoDAlreadyAccepted();

        l.state = POState.Reclaimed;

        uint128 principal = l.principalUsdc;
        usdc.safeTransfer(l.financier, principal);

        emit POReclaimed(invoiceId, l.financier, principal);
    }

    /* =============================================================== */
    /*                        MARK DEFAULTED                            */
    /* =============================================================== */

    /// @notice Financier writes the line off after the repayment window
    ///         expires with no claim. No funds move on chain — the seller
    ///         already has the principal, the buyer's settlement landed in
    ///         the seller's wallet, but the seller refused or failed to
    ///         allow the contract to pull repayUsdc. Off-chain recourse
    ///         (dispute, stake slash via v2.D, reputation hit) follows.
    ///         State -> Defaulted.
    function markDefaulted(bytes32 invoiceId) external {
        POLine storage l = lines[invoiceId];
        if (l.state != POState.Released) revert InvalidState();
        if (msg.sender != l.financier) revert NotFinancier();
        if (block.timestamp < l.repaymentTimeoutAt) revert StillWithinWindow();

        l.state = POState.Defaulted;
        emit PODefaulted(invoiceId, l.financier, l.seller);
    }

    /* =============================================================== */
    /*                             VIEWS                                */
    /* =============================================================== */

    /// @notice Explicit struct getter. The auto-generated public mapping
    ///         getter unpacks fields by position, which is fragile across
    ///         struct edits; returning the whole struct keeps off-chain
    ///         consumers stable.
    function getLine(bytes32 invoiceId) external view returns (POLine memory) {
        return lines[invoiceId];
    }
}
