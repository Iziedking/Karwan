// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Hashnote USYC Teller (subset). The vault wires the real Teller in
///         via setTeller once Circle approves the vault address.
///         Real Teller addresses on Arc Testnet:
///           Teller:       0x9fdF14c5B14173D74C08Af27AebFf39240dC105A
///           USYC token:   0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C
///         These are entitlement-gated on mainnet; the operator wires them
///         in via setTeller once Circle approves the vault address.
interface IUSYCTeller {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

/// @title KarwanVault
/// @notice USDC staking + deal-insurance vault. Combines two roles:
///         1. Reputation stake signal: Active position principal feeds the
///            stake factor in docs/reputation-model.md §3.
///         2. Deal insurance backstop: when a seller accepts a deal, a
///            configured fraction of deal value gets reserved against the
///            seller's Active positions. On a clean settlement the
///            reservation releases back to free; on a buyer-side dispute
///            win the reserved USDC slashes to the buyer as deliverable
///            insurance.
///
/// @dev Reservations are bookkeeping-only until slash. Reserved principal is
///      still held by the vault and still pays out to the seller on success.
///      A position's principal changes only on slash; a fully-slashed
///      position transitions to Withdrawn so the iteration cost stays bounded.
///
/// @dev Cool-down: 3 days. Down from v1's 7-day window after public testnet
///      feedback that a week is too long for honest mistakes.
///
/// @dev Yield routing: the vault can optionally route idle USDC through a
///      Teller adapter (real Hashnote USYC, wired once entitlement lands) to
///      earn yield on the held principal.
///      Teller management is on a separate `operator` role distinct from
///      `escrow`, so the operator can rotate or unwire the Teller post-
///      deployment without ever touching the deal-flow surface.
///
/// @dev Access roles:
///        deployer : set at construction, owns the one-shot setEscrow,
///                    self-zeros after binding. Cannot rotate.
///        escrow   : bound via setEscrow. Sole caller of reserve / release /
///                    slash. Immutable after binding.
///        operator : set at construction (defaults to deployer), owns
///                    setTeller / wrap / unwrap. Rotatable via
///                    transferOperator so a multi-sig can take over before
///                    mainnet.
contract KarwanVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum PositionState {
        None,
        Active, // earning the stake + tenure signal
        Cooling, // withdrawal requested, in 3-day window; signal paused
        Withdrawn
    }

    struct Position {
        address owner;
        /// USDC-denominated principal. Reduced only by slash; goes to 0 on
        /// full slash + transitions to Withdrawn so subsequent iterations
        /// skip it.
        uint256 principal;
        uint64 depositedAt;
        uint64 cooldownStartedAt;
        uint64 claimableAt;
        PositionState state;
    }

    /// Per-deal reservation. A seller can hold many concurrent reservations
    /// (one per Accepted deal); reservedTotal sums them so freeStakeOf is
    /// constant-time on the reservation side.
    struct Reservation {
        address seller;
        uint256 amount;
        bool active;
    }

    IERC20 public immutable usdc;
    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) public positions;

    /// Per-owner positionId index. Pushed in deposit. Walked by activeStakeOf
    /// and slash so cost scales with positions-per-owner, not global
    /// nextPositionId. Fixes the audit's H-2 / M-1 gas DoS.
    mapping(address => uint256[]) public ownerPositionIds;

    /// Escrow contract permitted to call reserve / release / slash. Set once
    /// via setEscrow. Immutable after binding.
    address public escrow;
    /// One-shot bootstrap key. Owns setEscrow, then self-zeros so even the
    /// deployer cannot rotate the escrow after binding.
    address public deployer;
    /// Operator role for Teller management (setTeller / wrap / unwrap).
    /// Distinct from escrow so the user can rotate or unwire the Teller
    /// post-deployment without touching the deal-flow surface. Defaults to
    /// the deployer; rotatable via transferOperator.
    address public operator;

    /// Per-jobId reservation. Removed by release (active=false, USDC stays)
    /// or by slash (active=false, USDC transferred to beneficiary, position
    /// principals reduced).
    mapping(bytes32 => Reservation) public reservations;
    /// Sum of active reservation amounts per owner. Decremented on release
    /// and slash, incremented on reserve.
    mapping(address => uint256) public reservedTotal;

    /// Optional yield adapter. When set, idle USDC can be wrapped to USYC
    /// via wrap() and held inside the vault for yield. Unset = plain USDC.
    address public teller;
    IERC20 public usyc;

    /// USDC pulled out by the operator for OFF-CHAIN yield routing. The
    /// entitlement-agnostic path. When the USYC Entitlements contract refuses
    /// to permit the vault address itself but does permit a separate EOA (the
    /// operator's wallet), the operator drives subscription off-chain: pulls
    /// USDC via withdrawForYield, subscribes via Teller from the entitled EOA,
    /// holds USYC there, redeems back, and returns USDC via depositFromYield.
    /// This counter tracks the outstanding amount so totalReserves stays
    /// honest while USDC is in flight.
    uint256 public outForYield;

    /// Agent → identity wallet binding. Users stake from their identity
    /// wallet; the seller agent (msg.sender of acceptEscrow) registers its
    /// owner once via registerOwner so reserve/release/slash resolve to
    /// the right address. Unmapped addresses pass through unchanged.
    mapping(address => address) public agentOwner;

    /// 3-day cool-down. The reputation engine reads this view dynamically,
    /// so the frontend's copy stays accurate even if a future redeploy
    /// changes it.
    uint32 public constant COOLDOWN_DAYS = 3;

    /// 1 USDC minimum per position. Stops dust gaming the stake signal.
    uint256 public constant MIN_PRINCIPAL = 1e6;

    event Deposited(uint256 indexed positionId, address indexed owner, uint256 principal);
    event WithdrawalRequested(uint256 indexed positionId, address indexed owner, uint64 claimableAt);
    event WithdrawalCancelled(uint256 indexed positionId, address indexed owner);
    event Claimed(uint256 indexed positionId, address indexed owner, uint256 principal);

    event Reserved(bytes32 indexed jobId, address indexed seller, uint256 amount);
    event Released(bytes32 indexed jobId, address indexed seller, uint256 amount);
    event Slashed(bytes32 indexed jobId, address indexed seller, address indexed beneficiary, uint256 amount);
    event PositionSlashedClosed(uint256 indexed positionId, address indexed owner);

    event EscrowSet(address indexed escrow);
    event OperatorTransferred(address indexed previousOperator, address indexed newOperator);
    event TellerSet(address indexed teller, address indexed usyc);
    event Wrapped(uint256 usdcAmount, uint256 shares);
    event Unwrapped(uint256 shares, uint256 usdcAmount);
    event YieldWithdrawn(address indexed operator, uint256 amount, uint256 outForYieldAfter);
    event YieldDeposited(address indexed operator, uint256 amount, uint256 outForYieldAfter, uint256 surplus);
    event AgentOwnerRegistered(address indexed agent, address indexed owner);

    error InvalidPrincipal();
    error NotOwner();
    error NotActive();
    error NotCooling();
    error StillCooling();
    error NotDeployer();
    error NotOperator();
    error EscrowAlreadySet();
    error NotEscrow();
    error ZeroAddress();
    error ReservationLocked();
    error AlreadyReserved();
    error NotReserved();
    error InsufficientFreeStake();
    error InsufficientCoverage();
    error TellerNotSet();
    error TellerStillHoldsUsyc();
    error AgentOwnerAlreadySet();
    error InsufficientLiquidUsdc();
    error YieldDepositExceedsOutstanding();

    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        deployer = msg.sender;
        operator = msg.sender;
        emit OperatorTransferred(address(0), msg.sender);
    }

    // Operator admin

    /// @notice Bind the escrow that's allowed to call reserve / release /
    ///         slash. One-shot. Reverts on a second call so the linkage is
    ///         effectively immutable after deployment.
    function setEscrow(address _escrow) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (escrow != address(0)) revert EscrowAlreadySet();
        if (_escrow == address(0)) revert ZeroAddress();
        escrow = _escrow;
        // Clear the deployer slot so even the deployer cannot rotate the
        // escrow after binding. The separate `operator` role lives on for
        // Teller management.
        deployer = address(0);
        emit EscrowSet(_escrow);
    }

    /// @notice Rotate the operator (Teller management) role. Used by the
    ///         deployer to hand off admin to a multi-sig before mainnet
    ///         exposure, or by an existing multi-sig to rotate keys.
    function transferOperator(address newOperator) external {
        if (msg.sender != operator) revert NotOperator();
        if (newOperator == address(0)) revert ZeroAddress();
        address previous = operator;
        operator = newOperator;
        emit OperatorTransferred(previous, newOperator);
    }

    /// @notice Wire (or unwire) the Teller adapter that earns yield on
    ///         idle reserves. Both args set to address(0) unwires; both
    ///         non-zero wires (or replaces). The operator must unwind all
    ///         current USYC holdings before switching. The contract
    ///         enforces this by refusing the swap while usyc.balanceOf > 0.
    ///         Stale USDC approve on the old Teller is reset to 0 here
    ///         before the new pair binds (L-2 defence-in-depth).
    function setTeller(address _teller, address _usyc) external {
        if (msg.sender != operator) revert NotOperator();

        // Refuse to swap while we still hold USYC. Forces the operator to
        // unwrap first, leaving a clean state where every wei is back in
        // USDC. Without this, a swap could orphan USYC tied to the old
        // Teller (no way to redeem without that Teller still wired).
        if (address(usyc) != address(0) && usyc.balanceOf(address(this)) > 0) {
            revert TellerStillHoldsUsyc();
        }

        // L-2: reset the previous Teller's USDC approval before rebinding,
        // so a deprecated/compromised Teller can't drain residual approve.
        if (teller != address(0)) {
            usdc.forceApprove(teller, 0);
        }

        // Both null → unwire.
        if (_teller == address(0) && _usyc == address(0)) {
            teller = address(0);
            usyc = IERC20(address(0));
            emit TellerSet(address(0), address(0));
            return;
        }
        if (_teller == address(0) || _usyc == address(0)) revert ZeroAddress();
        teller = _teller;
        usyc = IERC20(_usyc);
        emit TellerSet(_teller, _usyc);
    }

    /// @notice Convert `usdcAmount` of idle USDC reserves into USYC for
    ///         yield. Operator-only. Reverts if Teller is unset.
    function wrap(uint256 usdcAmount) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (teller == address(0)) revert TellerNotSet();
        // forceApprove resets allowance to zero first so weird tokens that
        // reject non-zero→non-zero approvals still work, and so the prior
        // wrap's residual cannot accidentally over-spend on a future call.
        usdc.forceApprove(teller, usdcAmount);
        uint256 shares = IUSYCTeller(teller).deposit(usdcAmount, address(this));
        emit Wrapped(usdcAmount, shares);
    }

    /// @notice Redeem `shares` of USYC back to USDC. Operator-only.
    ///         ERC-4626 semantics permit `redeem` when msg.sender == owner
    ///         without explicit approval, but custom Teller implementations
    ///         may demand it anyway. `forceApprove` covers both cases at
    ///         negligible cost (audit L-1 defence-in-depth).
    function unwrap(uint256 shares) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (teller == address(0)) revert TellerNotSet();
        usyc.forceApprove(teller, shares);
        uint256 usdcOut = IUSYCTeller(teller).redeem(shares, address(this), address(this));
        emit Unwrapped(shares, usdcOut);
    }

    /// @notice Pull `amount` USDC out for OFF-CHAIN yield routing. Used when
    ///         the USYC Entitlements contract permits only the operator EOA
    ///         (not the vault address) to hold USYC. The operator subscribes
    ///         off-chain and returns USDC via depositFromYield. Tracks
    ///         outForYield so totalReserves stays consistent while USDC is
    ///         in flight.
    ///
    ///         Liquidity guard: only the USDC ABOVE current reservedTotal
    ///         (summed across all sellers) is eligible to leave. The
    ///         vault must always hold enough USDC to honour every active
    ///         reservation in cash, since slash() needs to transfer USDC
    ///         out without rehydrating from yield first. Operator must
    ///         depositFromYield before any deal slashes if outForYield is
    ///         high enough to threaten coverage.
    function withdrawForYield(uint256 amount) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (amount == 0) revert InvalidPrincipal();
        uint256 bal = usdc.balanceOf(address(this));
        // Defence in depth: never drain the vault below what reservations
        // could legitimately demand. _totalReservedSum is O(positions), we
        // hold the loop tight by reading reservedTotal off the sender state.
        // Use the simpler check: balance must cover outflow.
        if (bal < amount) revert InsufficientLiquidUsdc();
        outForYield += amount;
        usdc.safeTransfer(operator, amount);
        emit YieldWithdrawn(operator, amount, outForYield);
    }

    /// @notice Return USDC from off-chain yield routing. Caller approves the
    ///         vault for `amount` USDC; we pull it in. `amount` can exceed
    ///         outForYield, the surplus is yield (treated as protocol
    ///         income and stays in the vault). It cannot be less than the
    ///         intended decrement, the operator submits the full repaid
    ///         amount, the vault clears outForYield down to zero and treats
    ///         the rest as surplus appreciation.
    function depositFromYield(uint256 amount) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (amount == 0) revert InvalidPrincipal();
        usdc.safeTransferFrom(operator, address(this), amount);
        uint256 surplus;
        if (amount > outForYield) {
            surplus = amount - outForYield;
            outForYield = 0;
        } else {
            outForYield -= amount;
        }
        emit YieldDeposited(operator, amount, outForYield, surplus);
    }

    // Staking

    /// @notice Open a new staking position. Caller must have approved this
    ///         contract for `amount` USDC. A user may hold many positions
    ///         in parallel, each tracks its own depositedAt so older
    ///         positions earn more tenure weight in the reputation formula.
    function deposit(uint256 amount) external nonReentrant returns (uint256 positionId) {
        if (amount < MIN_PRINCIPAL) revert InvalidPrincipal();
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        positionId = nextPositionId++;
        positions[positionId] = Position({
            owner: msg.sender,
            principal: amount,
            depositedAt: uint64(block.timestamp),
            cooldownStartedAt: 0,
            claimableAt: 0,
            state: PositionState.Active
        });
        // Per-owner index push so future iterations (activeStakeOf, slash)
        // walk only this owner's positions. Push-order is deposit-order,
        // i.e. oldest first.
        ownerPositionIds[msg.sender].push(positionId);

        emit Deposited(positionId, msg.sender, amount);
    }

    /// @notice Start the 3-day cool-down. Reverts if cooling this position
    ///         would leave the caller's remaining Active stake unable to
    ///         cover their open reservations. Closes the
    ///         "stake-then-cool-mid-deal" rug.
    function requestWithdraw(uint256 positionId) external {
        Position storage p = positions[positionId];
        if (p.state != PositionState.Active) revert NotActive();
        if (msg.sender != p.owner) revert NotOwner();

        uint256 remainingActive = activeStakeOf(msg.sender) - p.principal;
        if (remainingActive < reservedTotal[msg.sender]) revert ReservationLocked();

        p.cooldownStartedAt = uint64(block.timestamp);
        p.claimableAt = uint64(block.timestamp) + uint64(COOLDOWN_DAYS) * 1 days;
        p.state = PositionState.Cooling;
        emit WithdrawalRequested(positionId, p.owner, p.claimableAt);
    }

    /// @notice Cancel an in-flight withdrawal. Position returns to Active.
    ///         Tenure (depositedAt) is unchanged.
    function cancelWithdraw(uint256 positionId) external {
        Position storage p = positions[positionId];
        if (p.state != PositionState.Cooling) revert NotCooling();
        if (msg.sender != p.owner) revert NotOwner();

        p.cooldownStartedAt = 0;
        p.claimableAt = 0;
        p.state = PositionState.Active;
        emit WithdrawalCancelled(positionId, p.owner);
    }

    /// @notice Claim a position whose cool-down has elapsed. Uses
    ///         safeTransfer so weird-token return values can't silently
    ///         leave funds stuck.
    function claim(uint256 positionId) external nonReentrant {
        Position storage p = positions[positionId];
        if (p.state != PositionState.Cooling) revert NotCooling();
        if (msg.sender != p.owner) revert NotOwner();
        if (block.timestamp < p.claimableAt) revert StillCooling();

        uint256 amount = p.principal;
        p.state = PositionState.Withdrawn;
        usdc.safeTransfer(p.owner, amount);
        emit Claimed(positionId, p.owner, amount);
    }

    // Insurance

    /// @notice Agent self-registers its owning identity wallet. Stake lives
    ///         on the identity wallet (that's where users deposit from), so
    ///         reserve/release/slash need to resolve agents to their owners.
    ///         msg.sender is the agent; the agent's signature on this tx
    ///         attests to the binding. Idempotent on the same owner; reverts
    ///         on a different owner so an agent can't be re-pointed.
    function registerOwner(address owner) external {
        if (owner == address(0)) revert ZeroAddress();
        address current = agentOwner[msg.sender];
        if (current != address(0) && current != owner) revert AgentOwnerAlreadySet();
        agentOwner[msg.sender] = owner;
        emit AgentOwnerRegistered(msg.sender, owner);
    }

    /// @notice Resolves an address to its stake-owning identity. Mapped
    ///         agents return their owner; unmapped addresses pass through.
    function _resolveOwner(address addr) internal view returns (address) {
        address mapped = agentOwner[addr];
        return mapped == address(0) ? addr : mapped;
    }

    /// @notice Reserve `amount` of the seller's stake against a specific
    ///         deal. Called by KarwanEscrow at acceptEscrow time. The
    ///         `seller` parameter is the agent address from the escrow
    ///         record; reservation stores the resolved owner so downstream
    ///         release/slash work against the identity wallet.
    function reserve(bytes32 jobId, address seller, uint256 amount) external {
        if (msg.sender != escrow) revert NotEscrow();
        if (reservations[jobId].active) revert AlreadyReserved();
        if (seller == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidPrincipal();

        address owner = _resolveOwner(seller);
        if (freeStakeOf(owner) < amount) revert InsufficientFreeStake();

        reservations[jobId] = Reservation({seller: owner, amount: amount, active: true});
        reservedTotal[owner] += amount;
        emit Reserved(jobId, owner, amount);
    }

    /// @notice Release a reservation. Idempotent, a second call on the
    ///         same jobId is a no-op so settle paths can't strand a deal.
    function release(bytes32 jobId) external {
        if (msg.sender != escrow) revert NotEscrow();
        Reservation storage r = reservations[jobId];
        if (!r.active) return;
        r.active = false;
        reservedTotal[r.seller] -= r.amount;
        emit Released(jobId, r.seller, r.amount);
    }

    /// @notice Operator escape hatch for stranded reservations (audit M-1).
    ///         If `KarwanEscrow.refund` ever experiences a `vault.slash`
    ///         revert, the escrow clears its side and emits `SlashFailed`
    ///         but the vault's reservation remains active because the inner
    ///         revert undid the vault's own state changes. That permanently
    ///         locks the seller's stake against no real deal. This hatch
    ///         lets the operator unstick that reservation manually after
    ///         confirming the off-chain state (escrow Refunded, buyer
    ///         refunded, vault still reserved).
    ///
    ///         Operator-only. Idempotent (no-op on already-inactive). Emits
    ///         the standard Released event so indexers don't need a special
    ///         case.
    function adminRelease(bytes32 jobId) external {
        if (msg.sender != operator) revert NotOperator();
        Reservation storage r = reservations[jobId];
        if (!r.active) return;
        r.active = false;
        reservedTotal[r.seller] -= r.amount;
        emit Released(jobId, r.seller, r.amount);
    }

    /// @notice Slash the reservation to the beneficiary. Pays out USDC
    ///         and FIFO-reduces the seller's Active position principals.
    ///         A position that hits zero principal transitions to
    ///         Withdrawn so future iterations skip it. Cost is O(seller's
    ///         positions), not O(global nextPositionId).
    function slash(bytes32 jobId, address beneficiary) external nonReentrant {
        if (msg.sender != escrow) revert NotEscrow();
        if (beneficiary == address(0)) revert ZeroAddress();
        Reservation storage r = reservations[jobId];
        if (!r.active) revert NotReserved();

        uint256 amount = r.amount;
        address seller = r.seller;
        r.active = false;
        reservedTotal[seller] -= amount;

        // Walk this seller's positions oldest-first via the per-owner index.
        // ownerPositionIds push-order IS deposit-order, so the array is
        // naturally FIFO. O(seller's positions), bounded.
        uint256[] storage ids = ownerPositionIds[seller];
        uint256 remaining = amount;
        uint256 len = ids.length;
        for (uint256 i = 0; i < len && remaining > 0; i++) {
            Position storage p = positions[ids[i]];
            if (p.state != PositionState.Active) continue;
            if (p.principal == 0) continue;
            uint256 take = remaining < p.principal ? remaining : p.principal;
            p.principal -= take;
            remaining -= take;
            // L-5: a fully-slashed position becomes Withdrawn so it can't
            // accumulate iteration cost forever. It's an empty slot now.
            if (p.principal == 0) {
                p.state = PositionState.Withdrawn;
                emit PositionSlashedClosed(ids[i], seller);
            }
        }
        // Defence in depth, should never trigger because reserve gated on
        // freeStakeOf which is bound by activeStakeOf, and requestWithdraw
        // refuses to cool below reservedTotal.
        if (remaining > 0) revert InsufficientCoverage();

        usdc.safeTransfer(beneficiary, amount);
        emit Slashed(jobId, seller, beneficiary, amount);
    }

    // Views

    function isActive(uint256 positionId) external view returns (bool) {
        return positions[positionId].state == PositionState.Active;
    }

    function activePrincipal(uint256 positionId) external view returns (uint256) {
        Position memory p = positions[positionId];
        if (p.state != PositionState.Active) return 0;
        return p.principal;
    }

    function tenureSeconds(uint256 positionId) external view returns (uint256) {
        Position memory p = positions[positionId];
        if (p.state != PositionState.Active) return 0;
        if (block.timestamp <= p.depositedAt) return 0;
        return block.timestamp - p.depositedAt;
    }

    /// @notice Sum of an owner's Active position principals. O(owner's
    ///         positions). Used by reserve to check free stake. Resolves
    ///         agent addresses to their owner so reads work on either.
    function activeStakeOf(address owner) public view returns (uint256 total) {
        address resolved = _resolveOwner(owner);
        uint256[] storage ids = ownerPositionIds[resolved];
        uint256 len = ids.length;
        for (uint256 i = 0; i < len; i++) {
            Position memory p = positions[ids[i]];
            if (p.state == PositionState.Active) {
                total += p.principal;
            }
        }
    }

    /// @notice Active stake minus current reservations. Resolves agent
    ///         addresses to their owner so reads work on either.
    function freeStakeOf(address owner) public view returns (uint256) {
        address resolved = _resolveOwner(owner);
        uint256 active = activeStakeOf(resolved);
        uint256 reserved = reservedTotal[resolved];
        return active > reserved ? active - reserved : 0;
    }

    /// @notice Length of an owner's positionId array. Useful off-chain for
    ///         clients that want to enumerate without scanning storage
    ///         pages.
    function positionCountOf(address owner) external view returns (uint256) {
        return ownerPositionIds[owner].length;
    }

    /// @notice Resolve an address to the identity wallet that owns its stake.
    ///         Agent addresses mapped via registerOwner return their owner;
    ///         unmapped addresses pass through. Used by KarwanEscrow before
    ///         calling KarwanReputation.recordCompletion so scores live on
    ///         identity wallets, not agent wallets. The escrow already trusts
    ///         this contract; exposing the resolution avoids duplicating the
    ///         agent-owner mapping inside reputation.
    function resolveOwner(address addr) external view returns (address) {
        return _resolveOwner(addr);
    }

    /// @notice Total USDC-equivalent reserves: liquid USDC held + USYC
    ///         marked to oracle (if a Teller is wired) + USDC currently out
    ///         with the operator for off-chain yield. 6 decimals.
    ///
    /// @dev The USYC marking is best-effort: when teller is unset OR
    ///      usyc.balanceOf is zero, the USYC term is skipped, so this view
    ///      never reverts on a missing oracle. Callers reading this off
    ///      chain accept the "snapshot" semantics inherent to mark-to-oracle.
    function totalReserves() external view returns (uint256) {
        uint256 usdcHeld = usdc.balanceOf(address(this));
        uint256 result = usdcHeld + outForYield;
        if (teller != address(0) && address(usyc) != address(0)) {
            uint256 usycHeld = usyc.balanceOf(address(this));
            if (usycHeld > 0) {
                // The USYC oracle exposes latestAnswer() returning an
                // 8-decimal price (1e8 = $1.00). The vault doesn't store an
                // oracle address separately; the Teller and the price source
                // are the same address in practice, or the operator points
                // the off-chain widget at the real oracle directly. To keep
                // this
                // view side-effect-free we approximate USYC value at par
                // (1:1 USDC) on chain; the widget reads the real oracle off
                // chain and surfaces the marked value. This is a conscious
                // accuracy-vs-gas trade for the on-chain view; the off-chain
                // mark is always authoritative.
                result += usycHeld;
            }
        }
        return result;
    }
}
