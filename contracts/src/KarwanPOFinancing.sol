// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Guardable} from "./Guardable.sol";

/// @notice KarwanEscrow subset used for seller lookup at fund time. v2 reads
///         the decoupled sellerOf() view so adding escrow struct fields never
///         breaks the ABI decode. The canonical seller is the only valid
///         recipient on PoD release.
interface IKarwanEscrow {
    function sellerOf(bytes32 jobId) external view returns (address);
}

/// @notice KarwanInvoiceRegistry subset used for PoD acceptance lookup.
interface IKarwanInvoiceRegistry {
    function isPoDAccepted(bytes32 invoiceId) external view returns (bool);
}

/// @notice KarwanVault subset for factoring stake v2. The financier can require
///         the seller to back the line with reserved stake; on default it
///         slashes to the financier, on settle it releases. Namespaced by
///         this contract as the consumer, so PO lines can't collide with escrow
///         insurance reservations. Requires vault.setConsumer(poFinancing).
interface IKarwanVault {
    function reserve(bytes32 id, address ownerOrAgent, uint256 amount, address beneficiary) external;
    function release(bytes32 id) external;
    function slash(bytes32 id) external;
    function freeStakeOf(address owner) external view returns (uint256);
}

/// @title KarwanPOFinancing
/// @notice Single-funder purchase-order financing. A financier pre-funds the
///         seller's working capital against a PO whose escrow the buyer has
///         already funded. The contract holds the principal until proof of
///         delivery anchors on KarwanInvoiceRegistry, then releases to the
///         seller. The seller repays from their escrow settlement via a
///         pull-based approval, the contract has no claim on the seller's
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
///              used here, that path is for factoring).
///
///           5. Anyone (typically the financier or seller's agent) calls
///              claimRepayment(): contract pulls `repayUsdc` from the
///              seller's wallet using a standard ERC20 approval the seller
///              gave at offer-accept time. Pays financier.
///
///         The platform fee already lands in KarwanTreasury via the escrow
///         on release; PO financing adds no extra fee, the financier's
///         repay-vs-principal spread is the financier's return.
///
///         Failure handling:
///           - PoD never lands: financier calls reclaimPrincipal() after
///             releaseTimeoutAt to recover their deposit. State -> Reclaimed.
///           - Repayment never lands: financier calls markDefaulted() after
///             repaymentTimeoutAt. State -> Defaulted. No funds move on
///             chain; off-chain recourse (dispute, stake slash via v2.D,
///             reputation hit, future SecurityAgent tagging) follows.
contract KarwanPOFinancing is ReentrancyGuard, Guardable {
    using SafeERC20 for IERC20;

    /// @notice Guardian admin (sets the guardian + hold cap). The deployer;
    ///         a multisig on mainnet. PO financing is otherwise permissionless.
    address public owner;

    function _guardianAdmin() internal view override returns (address) {
        return owner;
    }

    // Types

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
        /// v2: seller stake reserved on the vault as factoring collateral.
        /// 0 = unsecured line (back-compat). Slashed to the financier on
        /// default, released on settle / reclaim.
        uint128 requiredStakeUsdc;
    }

    // Storage

    IERC20 public immutable usdc;
    IKarwanInvoiceRegistry public immutable registry;
    IKarwanEscrow public immutable escrow;
    /// @notice Vault for factoring stake reservations (v2). Immutable; this is
    ///         a leaf contract, cheap to redeploy on its own if it must repoint.
    IKarwanVault public immutable vault;

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

    // Events

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
    event CollateralSlashed(bytes32 indexed invoiceId, address indexed financier, uint128 amount);
    event CollateralSlashFailed(bytes32 indexed invoiceId, address indexed financier);

    // Errors

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
    error InsufficientStake();

    // Constructor

    constructor(address _usdc, address _registry, address _escrow, address _vault) {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_registry == address(0)) revert ZeroAddress();
        if (_escrow == address(0)) revert ZeroAddress();
        if (_vault == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        registry = IKarwanInvoiceRegistry(_registry);
        escrow = IKarwanEscrow(_escrow);
        vault = IKarwanVault(_vault);
        owner = msg.sender;
    }

    // Fund

    /// @notice Financier funds a PO line. Pulls principal from the caller.
    ///         The seller is resolved via the escrow's getEscrow() view so
    ///         the financier cannot accidentally route funds to a wrong
    ///         party. The canonical seller is the only valid recipient.
    ///
    /// @param invoiceId            the deal's jobId in the escrow
    /// @param principalUsdc        amount the financier pays in now
    /// @param repayUsdc            amount the financier expects back from
    ///                             the seller's settlement (must be > principal)
    /// @param releaseTimeoutSeconds seconds from now before financier can
    ///                              reclaim if PoD never anchors
    /// @param requiredStakeUsdc  seller stake to reserve on the vault as
    ///                           factoring collateral (v2). 0 = unsecured line.
    ///                           Reverts if the seller lacks the free stake.
    function fund(
        bytes32 invoiceId,
        uint128 principalUsdc,
        uint128 repayUsdc,
        uint64 releaseTimeoutSeconds,
        uint128 requiredStakeUsdc
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
        address seller = escrow.sellerOf(invoiceId);
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
            state: POState.Funded,
            requiredStakeUsdc: requiredStakeUsdc
        });

        // v2: reserve the seller's stake as collateral, payable to the
        // financier on default. Namespaced by this contract on the vault.
        if (requiredStakeUsdc > 0) {
            if (vault.freeStakeOf(seller) < requiredStakeUsdc) revert InsufficientStake();
            vault.reserve(invoiceId, seller, requiredStakeUsdc, msg.sender);
        }

        usdc.safeTransferFrom(msg.sender, address(this), principalUsdc);

        emit POFunded(
            invoiceId, msg.sender, seller, principalUsdc, repayUsdc, nowTs + releaseTimeoutSeconds
        );
    }

    // Release to seller

    /// @notice Release the principal to the seller. Verifies that PoD has
    ///         been anchored on the registry. Anyone can call, the principal
    ///         goes to the seller recorded at fund time regardless of caller.
    ///         Starts the repayment window: settlement must come (and
    ///         claimRepayment fire) within MIN_REPAYMENT_WINDOW or the
    ///         financier may mark the line defaulted.
    function releaseToSeller(bytes32 invoiceId) external nonReentrant {
        POLine storage l = lines[invoiceId];
        if (l.state != POState.Funded) revert InvalidState();
        _requireNotHeld(invoiceId);
        if (!registry.isPoDAccepted(invoiceId)) revert PoDNotAccepted();

        uint64 nowTs = uint64(block.timestamp);
        l.state = POState.Released;
        l.releasedAt = nowTs;
        l.repaymentTimeoutAt = nowTs + MIN_REPAYMENT_WINDOW;

        uint128 principal = l.principalUsdc;
        usdc.safeTransfer(l.seller, principal);

        emit POReleased(invoiceId, l.seller, principal);
    }

    // Claim repayment

    /// @notice Pull `repayUsdc` from the seller's wallet and pay the
    ///         financier. The seller pre-approved this contract for the
    ///         repay amount at offer-accept time (standard ERC20 approval).
    ///         Callable by the financier or the seller, either party can
    ///         trigger the settlement to close out the line cleanly.
    function claimRepayment(bytes32 invoiceId) external nonReentrant {
        POLine storage l = lines[invoiceId];
        if (l.state != POState.Released) revert InvalidState();
        _requireNotHeld(invoiceId);
        if (msg.sender != l.financier && msg.sender != l.seller) revert NotParty();

        l.state = POState.Settled;
        l.settledAt = uint64(block.timestamp);

        address financier = l.financier;
        address seller = l.seller;
        uint128 repay = l.repayUsdc;

        // v2: the line settled cleanly, release the seller's collateral.
        if (l.requiredStakeUsdc > 0) {
            vault.release(invoiceId);
        }

        usdc.safeTransferFrom(seller, financier, repay);

        emit PORepaid(invoiceId, financier, repay, msg.sender);
    }

    // Reclaim principal

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

        // v2: PoD never landed, the seller didn't default, release the stake.
        if (l.requiredStakeUsdc > 0) {
            vault.release(invoiceId);
        }

        uint128 principal = l.principalUsdc;
        usdc.safeTransfer(l.financier, principal);

        emit POReclaimed(invoiceId, l.financier, principal);
    }

    // Mark defaulted

    /// @notice Financier writes the line off after the repayment window
    ///         expires with no claim. No funds move on chain, the seller
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

        // v2: repayment never came, slash the seller's collateral to the
        // financier as on-chain recovery. Wrapped so a vault revert can't trap
        // the write-off (the line is defaulted either way; operator can follow
        // up via adminRelease if the reservation is in a bad state).
        if (l.requiredStakeUsdc > 0) {
            try vault.slash(invoiceId) {
                emit CollateralSlashed(invoiceId, l.financier, l.requiredStakeUsdc);
            } catch {
                emit CollateralSlashFailed(invoiceId, l.financier);
            }
        }

        emit PODefaulted(invoiceId, l.financier, l.seller);
    }

    // Views

    /// @notice Explicit struct getter. The auto-generated public mapping
    ///         getter unpacks fields by position, which is fragile across
    ///         struct edits; returning the whole struct keeps off-chain
    ///         consumers stable.
    function getLine(bytes32 invoiceId) external view returns (POLine memory) {
        return lines[invoiceId];
    }
}
