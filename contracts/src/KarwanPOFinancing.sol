// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Guardable} from "./Guardable.sol";

/// @notice KarwanEscrow subset used for seller lookup at fund time. v2 reads
///         the decoupled sellerOf() view so adding escrow struct fields never
///         breaks the ABI decode. The canonical seller is the only valid
///         recipient of the advance.
interface IKarwanEscrow {
    function sellerOf(bytes32 jobId) external view returns (address);

    /// Sell this deal's receivable to `assignee` for up to `amount`. The escrow
    /// pays the assignee ahead of the seller at settlement.
    function assignPayout(bytes32 jobId, address assignee, uint128 amount) external;

    /// How much the escrow has already paid the assignee. Drives the shortfall
    /// calculation at repayment.
    function assignmentOf(bytes32 jobId)
        external
        view
        returns (address assignee, uint128 amount, uint128 paid);
}

/// @notice KarwanInvoiceRegistry subset. Used only to reject a PO whose goods
///         have already been delivered: that is factoring, not PO financing.
interface IKarwanInvoiceRegistry {
    function isPoDAccepted(bytes32 invoiceId) external view returns (bool);
}

/// @notice KarwanVault subset for factoring stake. The financier can require
///         the seller to back the line with reserved stake; on default it
///         slashes to the financier, on settle it releases. Namespaced by
///         this contract as the consumer, so PO lines can't collide with escrow
///         insurance reservations. Requires vault.setConsumer(poFinancing).
interface IKarwanVault {
    function reserve(bytes32 id, address ownerOrAgent, uint256 amount, address beneficiary) external;
    function release(bytes32 id) external;
    /// Slash `amount` to the beneficiary and return the remainder to the
    /// owner's free stake. Clamped to the reservation size by the vault.
    function slashTo(bytes32 id, uint256 amount) external;
    function freeStakeOf(address owner) external view returns (uint256);
}

/// @title KarwanPOFinancing
/// @notice Single-funder purchase-order financing. A financier advances a
///         seller's working capital against a PO whose escrow the buyer has
///         already funded. The advance goes to the seller immediately, in the
///         same transaction that redirects the seller's settlement to the
///         financier. The financier is repaid by the escrow at settlement; the
///         seller's stake is the recourse if that falls short.
///
///         THE CORE INVARIANT
///
///         The seller receives the advance in the same transaction that
///         `escrow.assignPayout` redirects their settlement. There is no
///         intermediate custody and no unlock condition, so there is no state
///         in which the redirect is live while the advance is unpaid.
///
///         This is not a stylistic choice. The previous design held the
///         principal in this contract and released it only once proof of
///         delivery anchored on the registry, while assigning the receivable
///         unconditionally at fund time. The ordinary milestone settlement path
///         never anchors PoD, so the default outcome was: the escrow paid the
///         financier out of the seller's proceeds, the seller's advance stayed
///         locked in custody, and after the release window the financier
///         reclaimed the principal as well, ending a full repay amount ahead
///         with nothing at risk. See test/KarwanPOCustodyAttack.t.sol, which
///         proved that exploit against the deployed contract and now proves it
///         closed. Any future change that reintroduces a gap between "advance
///         paid" and "receivable assigned" reopens it.
///
///         Custody-until-delivery also defeated the product. PO financing
///         exists so a seller can buy materials BEFORE delivering. An advance
///         the seller cannot touch until after delivery is not working capital.
///
///         RISK MODEL
///
///         Pre-delivery funding puts the financier at risk from the moment they
///         fund, which is the honest shape for this product. Their protection
///         is layered:
///
///           1. The buyer's money is already locked in escrow. `assignPayout`
///              only succeeds while the deal is Funded or Accepted, so a line
///              cannot open against an unfunded deal.
///           2. The assignment is senior across every escrow payout path and
///              is irrevocable and single-use.
///           3. Seller stake reserved on the vault, slashed to the financier on
///              default.
///
///         How much stake a given seller must post is reputation policy, and
///         policy is deliberately NOT encoded here: tier rules change far more
///         often than money contracts should be redeployed, and reading a v2
///         composite on chain would mean redeploying KarwanReputation and
///         cascading through every contract that references it. The backend
///         computes the requirement from the seller's tier and passes it as
///         `requiredStakeUsdc`. `minStakeBps` is the operator's on-chain
///         backstop: a floor, as a share of principal, that no caller can go
///         under regardless of what the backend asks for.
///
///         Failure handling: repayment never lands (the deal settled short, or
///         never settled at all) -> the financier calls markDefaulted() after
///         repaymentTimeoutAt. Where the line carried collateral, the seller's
///         stake is slashed to the financier on chain. An unsecured line
///         (requiredStakeUsdc == 0) falls back to dispute and a reputation hit.
contract KarwanPOFinancing is ReentrancyGuard, Guardable {
    using SafeERC20 for IERC20;

    /// @notice Owner sets the guardian, the hold cap and the stake floor. The
    ///         deployer; a multisig on mainnet. Funding is otherwise
    ///         permissionless. Two-step transfer, matching the other contracts.
    address public owner;
    address public pendingOwner;

    function _guardianAdmin() internal view override returns (address) {
        return owner;
    }

    /// @dev Audit N-3: a hold freezes claimRepayment, but markDefaulted is not
    ///      hold-gated, so a held borrower could be defaulted + slashed for time
    ///      they were blocked from repaying. Extend the repayment deadline by
    ///      the hold budget so frozen time doesn't count against the borrower.
    function _afterHold(bytes32 id, uint64 holdSecs) internal override {
        POLine storage l = lines[id];
        if (l.state == POState.Outstanding && l.repaymentTimeoutAt != 0) {
            l.repaymentTimeoutAt += holdSecs;
        }
    }

    // Types

    enum POState {
        None,        // 0 - no line
        Outstanding, // 1 - advance paid to the seller, awaiting repayment
        Settled,     // 2 - financier repaid
        Defaulted    // 3 - repayment window passed without settlement
    }

    struct POLine {
        address financier;
        address seller;
        uint128 principalUsdc;
        uint128 repayUsdc;
        uint64 fundedAt;
        uint64 repaymentTimeoutAt;
        uint64 settledAt;
        POState state;
        /// Seller stake reserved on the vault as collateral. 0 = unsecured
        /// line. Slashed to the financier on default, released on settle.
        uint128 requiredStakeUsdc;
    }

    // Storage

    IERC20 public immutable usdc;
    IKarwanInvoiceRegistry public immutable registry;
    IKarwanEscrow public immutable escrow;
    /// @notice Vault for stake reservations. Immutable; this is a leaf
    ///         contract, cheap to redeploy on its own if it must repoint.
    IKarwanVault public immutable vault;

    /// @notice Floor on collateral, in basis points of principal. The operator's
    ///         backstop under whatever the backend's tier policy asks for.
    ///         Default 0 keeps unsecured lines available until an operator
    ///         deliberately raises it.
    uint16 public minStakeBps;

    /// @notice Ceiling on that floor. An operator who could demand more than
    ///         half the principal as collateral could price every seller out of
    ///         the product, which is a griefing vector rather than a safeguard.
    uint16 public constant MAX_MIN_STAKE_BPS = 5000;

    /// @notice Shortest repayment window a financier may set. The window has to
    ///         outlast the buyer's own release timing, since repayment comes out
    ///         of the escrow settlement rather than the seller's wallet.
    uint64 public constant MIN_REPAYMENT_WINDOW = 7 days;

    /// @notice Hard ceiling on the repayment window. Five years is well beyond
    ///         any legitimate trade and stops a financier from parking a
    ///         seller's collateral indefinitely.
    uint64 public constant MAX_REPAYMENT_WINDOW = 5 * 365 days;

    mapping(bytes32 => POLine) public lines;

    // Events

    event POFunded(
        bytes32 indexed invoiceId,
        address indexed financier,
        address indexed seller,
        uint128 principalUsdc,
        uint128 repayUsdc,
        uint64 repaymentTimeoutAt
    );
    event PORepaid(
        bytes32 indexed invoiceId, address indexed financier, uint128 repayUsdc, address caller
    );
    event PODefaulted(
        bytes32 indexed invoiceId, address indexed financier, address indexed seller
    );
    event CollateralSlashed(bytes32 indexed invoiceId, address indexed financier, uint128 amount);
    event CollateralSlashFailed(bytes32 indexed invoiceId, address indexed financier);
    event MinStakeBpsSet(uint16 bps);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // Errors

    error AlreadyFunded();
    error InvalidInvoiceId();
    error InvalidAmount();
    error InvalidRepay();
    error InvalidTimeout();
    error InvalidState();
    error NotFinancier();
    error NotOwner();
    error NotParty();
    error NothingOutstanding();
    error PoDAlreadyAccepted();
    error SelfFunding();
    error StakeBelowFloor();
    error StakeFloorTooHigh();
    error StillWithinWindow();
    error ZeroAddress();
    error MissingEscrowRecord();
    error InsufficientStake();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

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

    // Ownership

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }

    /// @notice Raise or lower the collateral floor for FUTURE lines. Existing
    ///         lines keep the requirement they were opened with.
    function setMinStakeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_MIN_STAKE_BPS) revert StakeFloorTooHigh();
        minStakeBps = bps;
        emit MinStakeBpsSet(bps);
    }

    // Fund

    /// @notice Financier advances a PO line. The principal moves straight from
    ///         the financier to the seller, in the same transaction that
    ///         assigns the receivable. The seller is resolved from the escrow
    ///         so the financier cannot route the advance to a wrong party.
    ///
    /// @param invoiceId               the deal's jobId in the escrow
    /// @param principalUsdc           amount advanced to the seller now
    /// @param repayUsdc               amount the financier is owed back out of
    ///                                the settlement (must exceed principal)
    /// @param repaymentWindowSeconds  seconds before the financier may mark the
    ///                                line defaulted and slash collateral
    /// @param requiredStakeUsdc       seller stake to reserve on the vault as
    ///                                collateral. The backend derives this from
    ///                                the seller's reputation tier; it must
    ///                                clear `minStakeBps` of principal.
    function fund(
        bytes32 invoiceId,
        uint128 principalUsdc,
        uint128 repayUsdc,
        uint64 repaymentWindowSeconds,
        uint128 requiredStakeUsdc
    ) external nonReentrant {
        if (invoiceId == bytes32(0)) revert InvalidInvoiceId();
        if (lines[invoiceId].state != POState.None) revert AlreadyFunded();
        if (principalUsdc == 0) revert InvalidAmount();
        if (repayUsdc <= principalUsdc) revert InvalidRepay();
        if (
            repaymentWindowSeconds < MIN_REPAYMENT_WINDOW
                || repaymentWindowSeconds > MAX_REPAYMENT_WINDOW
        ) {
            revert InvalidTimeout();
        }
        // Goods already delivered and accepted is factoring, not PO financing.
        if (registry.isPoDAccepted(invoiceId)) revert PoDAlreadyAccepted();

        // Resolve seller from escrow. Reverts if the deal does not exist.
        address seller = escrow.sellerOf(invoiceId);
        if (seller == address(0)) revert MissingEscrowRecord();
        // A seller financing their own receivable would assign their settlement
        // to themselves and post their own collateral for the privilege. It has
        // no legitimate use and it corrupts the financing reputation signal.
        if (seller == msg.sender) revert SelfFunding();

        if (uint256(requiredStakeUsdc) * 10_000 < uint256(principalUsdc) * minStakeBps) {
            revert StakeBelowFloor();
        }

        uint64 nowTs = uint64(block.timestamp);
        lines[invoiceId] = POLine({
            financier: msg.sender,
            seller: seller,
            principalUsdc: principalUsdc,
            repayUsdc: repayUsdc,
            fundedAt: nowTs,
            repaymentTimeoutAt: nowTs + repaymentWindowSeconds,
            settledAt: 0,
            state: POState.Outstanding,
            requiredStakeUsdc: requiredStakeUsdc
        });

        // Reserve the seller's stake as collateral, payable to the financier on
        // default. Namespaced by this contract on the vault.
        if (requiredStakeUsdc > 0) {
            if (vault.freeStakeOf(seller) < requiredStakeUsdc) revert InsufficientStake();
            vault.reserve(invoiceId, seller, requiredStakeUsdc, msg.sender);
        }

        // Reverts if this contract is not an authorised assigner, which is
        // deliberate: a line that cannot be assigned would fall back to pulling
        // from the seller, the exact exposure assignment exists to remove.
        escrow.assignPayout(invoiceId, msg.sender, repayUsdc);

        // The invariant, in one line: the advance reaches the seller in the
        // same transaction that redirects the seller's settlement. Financier to
        // seller directly, never through this contract's balance.
        usdc.safeTransferFrom(msg.sender, seller, principalUsdc);

        emit POFunded(
            invoiceId, msg.sender, seller, principalUsdc, repayUsdc, nowTs + repaymentWindowSeconds
        );
    }

    // Claim repayment

    /// @notice Close out the line. The escrow pays the assignee first at
    ///         settlement, so by the time this runs the financier is usually
    ///         already whole and nothing is pulled. A shortfall only arises
    ///         when the deal settled for less than the repay amount; that
    ///         remainder is still the seller's obligation and is pulled against
    ///         the approval the seller gave at offer-accept time.
    function claimRepayment(bytes32 invoiceId) external nonReentrant {
        POLine storage l = lines[invoiceId];
        if (l.state != POState.Outstanding) revert InvalidState();
        _requireNotHeld(invoiceId);
        if (msg.sender != l.financier && msg.sender != l.seller) revert NotParty();

        l.state = POState.Settled;
        l.settledAt = uint64(block.timestamp);

        address financier = l.financier;
        address seller = l.seller;
        uint128 repay = l.repayUsdc;

        // The line settled cleanly, release the seller's collateral.
        if (l.requiredStakeUsdc > 0) {
            vault.release(invoiceId);
        }

        (, , uint128 paidByEscrow) = escrow.assignmentOf(invoiceId);
        uint256 shortfall = repay > paidByEscrow ? uint256(repay) - uint256(paidByEscrow) : 0;
        if (shortfall > 0) {
            usdc.safeTransferFrom(seller, financier, shortfall);
        }

        emit PORepaid(invoiceId, financier, repay, msg.sender);
    }

    // Mark defaulted

    /// @notice Financier writes the line off after the repayment window expires
    ///         without settlement. Only the amount the escrow failed to cover
    ///         is recovered from the seller's collateral; the rest of the bond
    ///         returns to the seller's free stake.
    ///
    ///         Two things this deliberately refuses to do. It will not run at
    ///         all once the escrow has paid the assignment in full: the line is
    ///         whole, and a financier who simply let the window lapse would
    ///         otherwise collect the settlement AND slash the bond. And it
    ///         never slashes more than the shortfall, so a deal that settled
    ///         most of the way does not cost the seller their entire stake.
    ///
    ///         The slash is wrapped so a vault revert can't trap the write-off:
    ///         the line is defaulted either way and the operator can follow up
    ///         via adminRelease if the reservation is in a bad state.
    function markDefaulted(bytes32 invoiceId) external {
        POLine storage l = lines[invoiceId];
        if (l.state != POState.Outstanding) revert InvalidState();
        if (msg.sender != l.financier) revert NotFinancier();
        if (block.timestamp < l.repaymentTimeoutAt) revert StillWithinWindow();

        (, , uint128 paidByEscrow) = escrow.assignmentOf(invoiceId);
        if (paidByEscrow >= l.repayUsdc) revert NothingOutstanding();
        uint256 shortfall = uint256(l.repayUsdc) - uint256(paidByEscrow);

        l.state = POState.Defaulted;

        if (l.requiredStakeUsdc > 0) {
            try vault.slashTo(invoiceId, shortfall) {
                uint256 taken =
                    shortfall < l.requiredStakeUsdc ? shortfall : l.requiredStakeUsdc;
                emit CollateralSlashed(invoiceId, l.financier, uint128(taken));
            } catch {
                emit CollateralSlashFailed(invoiceId, l.financier);
            }
        }

        emit PODefaulted(invoiceId, l.financier, l.seller);
    }

    // Views

    /// @notice Explicit struct getter. The auto-generated public mapping getter
    ///         unpacks fields by position, which is fragile across struct
    ///         edits; returning the whole struct keeps off-chain consumers
    ///         stable.
    function getLine(bytes32 invoiceId) external view returns (POLine memory) {
        return lines[invoiceId];
    }

    /// @notice Collateral floor in USDC for a given principal, so a caller can
    ///         quote the same number the contract will enforce. Rounds UP: fund
    ///         compares `stake * 10000 >= principal * bps` exactly rather than
    ///         against a divided-down floor, so quoting the truncated value
    ///         would hand back a number that reverts whenever the division
    ///         leaves a remainder.
    function stakeFloorFor(uint128 principalUsdc) external view returns (uint256) {
        uint256 numerator = uint256(principalUsdc) * minStakeBps;
        return (numerator + 9_999) / 10_000;
    }
}
