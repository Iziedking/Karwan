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

/// @title KarwanVault (v2)
/// @notice USDC staking + deal-insurance vault. Combines two roles:
///         1. Reputation stake signal: Active position principal feeds the
///            stake factor in docs/reputation-model.md §3.
///         2. Deal insurance backstop: when a seller accepts a deal, a
///            configured fraction of deal value gets reserved against the
///            seller's Active positions. On a clean settlement the
///            reservation releases back to free; on a buyer-side dispute
///            win the reserved USDC slashes to the reservation's beneficiary
///            as deliverable insurance.
///
/// @dev ===================== v2 audit fixes ==============================
///      C-1 (critical): registerOwner now requires the owner's on-chain
///        consent (approveAgent), so an agent can no longer bind itself to
///        a victim and slash the victim's stake.
///      H-2: withdrawForYield enforces a coverage floor (liquid USDC must
///        stay >= totalReservedAll + totalCoolingAll), so the operator can
///        never drain the insurance/claim backing.
///      H-3: MAX_POSITIONS_PER_OWNER caps the per-owner array, slash walks a
///        bounded set with swap-and-pop of closed positions, and
///        activePrincipalOf is an O(1) aggregate, so slash can't be griefed
///        into out-of-gas.
///      Future-proofing: reservations are keyed per (consumer, id) and carry
///        their beneficiary, and any address the operator authorizes via
///        setConsumer can reserve/release/slash its own namespaced keys.
///        This is the hook the factoring stake module rides on with no
///        further vault redeploy.
///
/// @dev Reservations are bookkeeping-only until slash. Reserved principal is
///      still held by the vault and still pays out to the seller on success.
///      A position's principal changes only on slash; a fully-slashed
///      position transitions to Withdrawn, is swap-popped out of the owner's
///      array, so the iteration cost stays bounded.
///
/// @dev Cool-down: 3 days.
///
/// @dev Access roles:
///        deployer : set at construction, owns the one-shot setEscrow,
///                    self-zeros after binding. Cannot rotate.
///        escrow   : bound via setEscrow. The primary deal-flow consumer.
///                    Immutable after binding. Auto-authorized as a consumer.
///        consumer : escrow, plus any address the operator authorizes via
///                    setConsumer. Callers of reserve / release / slash on
///                    their own namespaced keys.
///        operator : set at construction (defaults to deployer), owns
///                    setTeller / wrap / unwrap / withdrawForYield /
///                    setConsumer / adminRelease. Rotatable via
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
        /// full slash + transitions to Withdrawn.
        uint256 principal;
        uint64 depositedAt;
        uint64 cooldownStartedAt;
        uint64 claimableAt;
        PositionState state;
    }

    /// Per-key reservation. Keyed internally by keccak256(consumer, id) so two
    /// consumers can never collide on the same id, and only the creating
    /// consumer can release/slash it. `beneficiary` is locked at reserve time,
    /// so a consumer can never redirect a slash to an arbitrary address later.
    struct Reservation {
        address owner;
        uint256 amount;
        address beneficiary;
        bool active;
    }

    IERC20 public immutable usdc;
    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) public positions;

    /// Per-owner positionId index. Push on deposit, swap-pop on close. Only
    /// Active + Cooling positions live here (Withdrawn ones are removed), so
    /// the slash walk and the position cap are bounded by live positions.
    mapping(address => uint256[]) public ownerPositionIds;
    /// positionId -> its index inside ownerPositionIds[owner], for O(1)
    /// swap-and-pop removal.
    mapping(uint256 => uint256) private positionArrayIndex;

    /// O(1) aggregate of an owner's Active position principals. Replaces the
    /// per-call loop in activeStakeOf. Maintained on deposit / cool / cancel /
    /// slash. freeStakeOf is now constant-time on both sides.
    mapping(address => uint256) public activePrincipalOf;

    /// Escrow contract permitted to call reserve / release / slash. Set once
    /// via setEscrow. Immutable after binding. Auto-authorized as a consumer.
    address public escrow;
    /// One-shot bootstrap key. Owns setEscrow, then self-zeros so even the
    /// deployer cannot rotate the escrow after binding.
    address public deployer;
    /// Operator role for Teller management + consumer authorization. Distinct
    /// from escrow so the user can rotate keys / wire consumers without
    /// touching the deal-flow surface. Defaults to the deployer; rotatable via
    /// transferOperator.
    address public operator;

    /// Authorized reservation consumers beyond the primary escrow (e.g. the
    /// factoring stake module). Managed by the operator via setConsumer.
    mapping(address => bool) public authorizedConsumers;

    /// Per-internal-key reservation (key = keccak256(consumer, id)).
    mapping(bytes32 => Reservation) public reservations;
    /// Sum of active reservation amounts per owner. Gates freeStakeOf.
    mapping(address => uint256) public reservedTotal;

    /// Global coverage aggregates (H-2). Liquid USDC must always be able to
    /// honour every active reservation (slash pays cash) and every cooling
    /// position (claim pays cash). withdrawForYield may only remove the
    /// surplus above these.
    uint256 public totalReservedAll;
    uint256 public totalCoolingAll;

    /// Optional yield adapter. When set, idle USDC can be wrapped to USYC
    /// via wrap() and held inside the vault for yield. Unset = plain USDC.
    address public teller;
    IERC20 public usyc;

    /// USDC pulled out by the operator for OFF-CHAIN yield routing. Tracks the
    /// outstanding amount so totalReserves stays honest while USDC is in
    /// flight.
    uint256 public outForYield;

    /// Agent -> identity wallet binding. Users stake from their identity
    /// wallet; the seller agent registers its owner via registerOwner so
    /// reserve/release/slash resolve to the right address. Unmapped addresses
    /// pass through unchanged.
    mapping(address => address) public agentOwner;

    /// C-1 fix: an owner must approve an agent BEFORE that agent can bind
    /// itself via registerOwner. approvedAgent[owner][agent].
    mapping(address => mapping(address => bool)) public approvedAgent;

    /// 3-day cool-down. Read dynamically by the reputation engine.
    uint32 public constant COOLDOWN_DAYS = 3;

    /// 1 USDC minimum per position. Kept low on purpose: the live vault holds
    /// real 1 / 6 / 10 USDC stakes, so a higher floor would lock out honest
    /// small stakers. The dust-griefing DoS (H-3) is defused structurally by
    /// MAX_POSITIONS_PER_OWNER + the bounded slash walk, not by the floor.
    uint256 public constant MIN_PRINCIPAL = 1e6;

    /// Max concurrent live (Active + Cooling) positions per owner (H-3). The
    /// live vault's heaviest staker holds 13; 64 leaves generous headroom
    /// while capping the slash walk at a cheap, bounded length.
    uint256 public constant MAX_POSITIONS_PER_OWNER = 64;

    event Deposited(uint256 indexed positionId, address indexed owner, uint256 principal);
    event WithdrawalRequested(uint256 indexed positionId, address indexed owner, uint64 claimableAt);
    event WithdrawalCancelled(uint256 indexed positionId, address indexed owner);
    event Claimed(uint256 indexed positionId, address indexed owner, uint256 principal);

    event Reserved(bytes32 indexed id, address indexed consumer, address indexed owner, uint256 amount, address beneficiary);
    event Released(bytes32 indexed id, address indexed consumer, address indexed owner, uint256 amount);
    event Slashed(bytes32 indexed id, address indexed owner, address indexed beneficiary, uint256 amount);
    event PositionSlashedClosed(uint256 indexed positionId, address indexed owner);

    event EscrowSet(address indexed escrow);
    event ConsumerSet(address indexed consumer, bool authorized);
    event OperatorTransferred(address indexed previousOperator, address indexed newOperator);
    event TellerSet(address indexed teller, address indexed usyc);
    event Wrapped(uint256 usdcAmount, uint256 shares);
    event Unwrapped(uint256 shares, uint256 usdcAmount);
    event YieldWithdrawn(address indexed operator, uint256 amount, uint256 outForYieldAfter);
    event YieldDeposited(address indexed operator, uint256 amount, uint256 outForYieldAfter, uint256 surplus);
    event AgentApproved(address indexed owner, address indexed agent);
    event AgentBound(address indexed agent, address indexed owner);
    event AgentUnbound(address indexed owner, address indexed agent);

    error InvalidPrincipal();
    error NotOwner();
    error NotActive();
    error NotCooling();
    error StillCooling();
    error NotDeployer();
    error NotOperator();
    error EscrowAlreadySet();
    error NotConsumer();
    error ZeroAddress();
    error ReservationLocked();
    error AlreadyReserved();
    error NotReserved();
    error InsufficientFreeStake();
    error InsufficientCoverage();
    error TellerNotSet();
    error TellerStillHoldsUsyc();
    error AgentOwnerAlreadySet();
    error AgentNotApproved();
    error InsufficientLiquidUsdc();
    error TooManyPositions();

    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        deployer = msg.sender;
        operator = msg.sender;
        emit OperatorTransferred(address(0), msg.sender);
    }

    // ============================ Operator admin ============================

    /// @notice Bind the primary escrow consumer. One-shot; immutable after.
    function setEscrow(address _escrow) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (escrow != address(0)) revert EscrowAlreadySet();
        if (_escrow == address(0)) revert ZeroAddress();
        escrow = _escrow;
        deployer = address(0);
        emit EscrowSet(_escrow);
    }

    /// @notice Authorize (or de-authorize) an additional reservation consumer,
    ///         e.g. the factoring stake module. Operator-only. The primary
    ///         escrow is always authorized and is not managed here.
    function setConsumer(address consumer, bool ok) external {
        if (msg.sender != operator) revert NotOperator();
        if (consumer == address(0)) revert ZeroAddress();
        authorizedConsumers[consumer] = ok;
        emit ConsumerSet(consumer, ok);
    }

    /// @notice True if `caller` may reserve/release/slash.
    function _isConsumer(address caller) internal view returns (bool) {
        return caller == escrow || authorizedConsumers[caller];
    }

    /// @notice Rotate the operator role.
    function transferOperator(address newOperator) external {
        if (msg.sender != operator) revert NotOperator();
        if (newOperator == address(0)) revert ZeroAddress();
        address previous = operator;
        operator = newOperator;
        emit OperatorTransferred(previous, newOperator);
    }

    /// @notice Wire (or unwire) the Teller adapter. Both null unwires; both
    ///         non-null wires/replaces. Refuses to swap while holding USYC.
    function setTeller(address _teller, address _usyc) external {
        if (msg.sender != operator) revert NotOperator();

        if (address(usyc) != address(0) && usyc.balanceOf(address(this)) > 0) {
            revert TellerStillHoldsUsyc();
        }
        if (teller != address(0)) {
            usdc.forceApprove(teller, 0);
        }
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

    /// @notice Convert idle USDC into USYC for yield. Operator-only.
    function wrap(uint256 usdcAmount) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (teller == address(0)) revert TellerNotSet();
        usdc.forceApprove(teller, usdcAmount);
        uint256 shares = IUSYCTeller(teller).deposit(usdcAmount, address(this));
        emit Wrapped(usdcAmount, shares);
    }

    /// @notice Redeem USYC back to USDC. Operator-only.
    function unwrap(uint256 shares) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (teller == address(0)) revert TellerNotSet();
        usyc.forceApprove(teller, shares);
        uint256 usdcOut = IUSYCTeller(teller).redeem(shares, address(this), address(this));
        emit Unwrapped(shares, usdcOut);
    }

    /// @notice Pull `amount` USDC out for OFF-CHAIN yield routing.
    ///
    /// @dev H-2 fix: the vault must always hold enough liquid USDC to honour
    ///      every active reservation (slash pays cash) and every cooling
    ///      position (claim pays cash). Only the surplus above
    ///      totalReservedAll + totalCoolingAll may leave. The docstring's old
    ///      promise ("only funds above reserved can leave") is now enforced by
    ///      code, not just documented.
    function withdrawForYield(uint256 amount) external nonReentrant {
        if (msg.sender != operator) revert NotOperator();
        if (amount == 0) revert InvalidPrincipal();
        uint256 bal = usdc.balanceOf(address(this));
        uint256 floor = totalReservedAll + totalCoolingAll;
        if (bal < amount || bal - amount < floor) revert InsufficientLiquidUsdc();
        outForYield += amount;
        usdc.safeTransfer(operator, amount);
        emit YieldWithdrawn(operator, amount, outForYield);
    }

    /// @notice Return USDC from off-chain yield routing. Surplus over
    ///         outForYield is treated as protocol income and stays in the
    ///         vault.
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

    // =============================== Staking ================================

    /// @notice Open a new staking position. Caller must have approved this
    ///         contract for `amount` USDC.
    function deposit(uint256 amount) external nonReentrant returns (uint256 positionId) {
        if (amount < MIN_PRINCIPAL) revert InvalidPrincipal();
        // H-3: bound the per-owner live-position set. Only Active + Cooling
        // positions remain in the array (Withdrawn ones are swap-popped), so
        // this caps concurrent live positions, not lifetime deposits.
        if (ownerPositionIds[msg.sender].length >= MAX_POSITIONS_PER_OWNER) revert TooManyPositions();
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
        positionArrayIndex[positionId] = ownerPositionIds[msg.sender].length;
        ownerPositionIds[msg.sender].push(positionId);
        activePrincipalOf[msg.sender] += amount;

        emit Deposited(positionId, msg.sender, amount);
    }

    /// @notice Start the 3-day cool-down. Reverts if cooling this position
    ///         would leave the caller's remaining Active stake unable to
    ///         cover their open reservations.
    function requestWithdraw(uint256 positionId) external {
        Position storage p = positions[positionId];
        if (p.state != PositionState.Active) revert NotActive();
        if (msg.sender != p.owner) revert NotOwner();

        uint256 remainingActive = activePrincipalOf[msg.sender] - p.principal;
        if (remainingActive < reservedTotal[msg.sender]) revert ReservationLocked();

        // Active -> Cooling: leave the array (still a live position, still
        // counts toward the cap), move the principal from the active aggregate
        // to the cooling coverage aggregate.
        activePrincipalOf[msg.sender] -= p.principal;
        totalCoolingAll += p.principal;

        p.cooldownStartedAt = uint64(block.timestamp);
        p.claimableAt = uint64(block.timestamp) + uint64(COOLDOWN_DAYS) * 1 days;
        p.state = PositionState.Cooling;
        emit WithdrawalRequested(positionId, p.owner, p.claimableAt);
    }

    /// @notice Cancel an in-flight withdrawal. Position returns to Active.
    function cancelWithdraw(uint256 positionId) external {
        Position storage p = positions[positionId];
        if (p.state != PositionState.Cooling) revert NotCooling();
        if (msg.sender != p.owner) revert NotOwner();

        // Cooling -> Active: reverse the aggregate move.
        totalCoolingAll -= p.principal;
        activePrincipalOf[msg.sender] += p.principal;

        p.cooldownStartedAt = 0;
        p.claimableAt = 0;
        p.state = PositionState.Active;
        emit WithdrawalCancelled(positionId, p.owner);
    }

    /// @notice Claim a position whose cool-down has elapsed.
    function claim(uint256 positionId) external nonReentrant {
        Position storage p = positions[positionId];
        if (p.state != PositionState.Cooling) revert NotCooling();
        if (msg.sender != p.owner) revert NotOwner();
        if (block.timestamp < p.claimableAt) revert StillCooling();

        uint256 amount = p.principal;
        address owner = p.owner;
        p.state = PositionState.Withdrawn;
        totalCoolingAll -= amount;
        _removeFromOwnerArray(owner, positionId);
        usdc.safeTransfer(owner, amount);
        emit Claimed(positionId, owner, amount);
    }

    /// @dev O(1) swap-and-pop removal of a closed position from its owner's
    ///      live-position array. The last element takes the vacated slot and
    ///      its index mapping is updated.
    function _removeFromOwnerArray(address owner, uint256 positionId) private {
        uint256[] storage ids = ownerPositionIds[owner];
        uint256 idx = positionArrayIndex[positionId];
        uint256 lastIdx = ids.length - 1;
        if (idx != lastIdx) {
            uint256 lastId = ids[lastIdx];
            ids[idx] = lastId;
            positionArrayIndex[lastId] = idx;
        }
        ids.pop();
        delete positionArrayIndex[positionId];
    }

    // ============================== Insurance ==============================

    /// @notice Owner (identity wallet) approves `agent` to bind itself. C-1:
    ///         registerOwner is inert until this is called by the real owner.
    function approveAgent(address agent) external {
        if (agent == address(0)) revert ZeroAddress();
        approvedAgent[msg.sender][agent] = true;
        emit AgentApproved(msg.sender, agent);
    }

    /// @notice Owner revokes an agent: clears the approval and, if the agent
    ///         is currently bound to this owner, clears the binding too.
    ///         Reservations already booked against the owner stay put (nothing
    ///         new can be booked through a revoked agent). Rebinding requires a
    ///         fresh approveAgent.
    function revokeAgent(address agent) external {
        approvedAgent[msg.sender][agent] = false;
        if (agentOwner[agent] == msg.sender) {
            agentOwner[agent] = address(0);
            emit AgentUnbound(msg.sender, agent);
        }
    }

    /// @notice Agent binds itself to `owner`. Requires the owner's prior
    ///         approveAgent (C-1). Idempotent on the same owner; reverts on a
    ///         different owner so an agent can't be silently re-pointed.
    function registerOwner(address owner) external {
        if (owner == address(0)) revert ZeroAddress();
        if (!approvedAgent[owner][msg.sender]) revert AgentNotApproved();
        address current = agentOwner[msg.sender];
        if (current != address(0) && current != owner) revert AgentOwnerAlreadySet();
        agentOwner[msg.sender] = owner;
        emit AgentBound(msg.sender, owner);
    }

    /// @notice Resolve an address to its stake-owning identity.
    function _resolveOwner(address addr) internal view returns (address) {
        address mapped = agentOwner[addr];
        return mapped == address(0) ? addr : mapped;
    }

    /// @dev Internal key namespacing so two consumers can't collide on the
    ///      same id, and only the creating consumer can act on it.
    function _key(address consumer, bytes32 id) internal pure returns (bytes32) {
        return keccak256(abi.encode(consumer, id));
    }

    /// @notice Reserve `amount` of `ownerOrAgent`'s free stake against `id`,
    ///         payable to `beneficiary` on slash. Consumer-only. `id` is
    ///         namespaced to msg.sender internally.
    function reserve(bytes32 id, address ownerOrAgent, uint256 amount, address beneficiary) external {
        if (!_isConsumer(msg.sender)) revert NotConsumer();
        if (ownerOrAgent == address(0) || beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidPrincipal();

        bytes32 k = _key(msg.sender, id);
        if (reservations[k].active) revert AlreadyReserved();

        address owner = _resolveOwner(ownerOrAgent);
        if (freeStakeOf(owner) < amount) revert InsufficientFreeStake();

        reservations[k] = Reservation({owner: owner, amount: amount, beneficiary: beneficiary, active: true});
        reservedTotal[owner] += amount;
        totalReservedAll += amount;
        emit Reserved(id, msg.sender, owner, amount, beneficiary);
    }

    /// @notice Release a reservation. Idempotent no-op if inactive. Only the
    ///         consumer that created it can release it.
    function release(bytes32 id) external {
        bytes32 k = _key(msg.sender, id);
        Reservation storage r = reservations[k];
        if (!r.active) return;
        r.active = false;
        reservedTotal[r.owner] -= r.amount;
        totalReservedAll -= r.amount;
        emit Released(id, msg.sender, r.owner, r.amount);
    }

    /// @notice Operator escape hatch for a stranded reservation (a consumer
    ///         that cleared its own side but left the vault reservation active
    ///         after a slash inner-revert). Operator-only. Idempotent.
    function adminRelease(address consumer, bytes32 id) external {
        if (msg.sender != operator) revert NotOperator();
        bytes32 k = _key(consumer, id);
        Reservation storage r = reservations[k];
        if (!r.active) return;
        r.active = false;
        reservedTotal[r.owner] -= r.amount;
        totalReservedAll -= r.amount;
        emit Released(id, consumer, r.owner, r.amount);
    }

    /// @notice Slash a reservation's FULL amount to its locked beneficiary.
    ///         Only the creating consumer can slash.
    function slash(bytes32 id) external nonReentrant {
        _settleSlash(msg.sender, id, type(uint256).max);
    }

    /// @notice Slash `amount` of a reservation to its beneficiary and release
    ///         the remainder back to the owner's free stake. Used by arbitrated
    ///         dispute resolutions that split fault proportionally: `amount` is
    ///         the buyer's insurance share, the rest returns to the seller.
    ///         `amount` is clamped to the reservation size. Only the creating
    ///         consumer can call it.
    function slashTo(bytes32 id, uint256 amount) external nonReentrant {
        _settleSlash(msg.sender, id, amount);
    }

    /// @dev Settle a reservation: transfer min(reservationAmount, cap) to the
    ///      beneficiary by FIFO-reducing the owner's Active positions, and
    ///      clear the WHOLE reservation (the unslashed remainder simply returns
    ///      to free stake). Swap-pops any position reduced to zero; the walk is
    ///      bounded by MAX_POSITIONS_PER_OWNER.
    function _settleSlash(address consumer, bytes32 id, uint256 cap) private {
        bytes32 k = _key(consumer, id);
        Reservation storage r = reservations[k];
        if (!r.active) revert NotReserved();

        uint256 reserved = r.amount;
        address owner = r.owner;
        address beneficiary = r.beneficiary;
        uint256 slashAmount = cap < reserved ? cap : reserved;

        r.active = false;
        reservedTotal[owner] -= reserved;
        totalReservedAll -= reserved;

        if (slashAmount > 0) {
            // Walk the owner's live positions oldest-first, taking from Active
            // ones until slashAmount is covered. `i` advances only when we
            // DON'T remove, so a swapped-in element is re-examined; the walk is
            // bounded by the array length (<= MAX_POSITIONS_PER_OWNER).
            uint256[] storage ids = ownerPositionIds[owner];
            uint256 remaining = slashAmount;
            uint256 i = 0;
            while (i < ids.length && remaining > 0) {
                uint256 pid = ids[i];
                Position storage p = positions[pid];
                if (p.state != PositionState.Active || p.principal == 0) {
                    i++;
                    continue;
                }
                uint256 take = remaining < p.principal ? remaining : p.principal;
                p.principal -= take;
                remaining -= take;
                activePrincipalOf[owner] -= take;
                if (p.principal == 0) {
                    p.state = PositionState.Withdrawn;
                    _removeFromOwnerArray(owner, pid);
                    emit PositionSlashedClosed(pid, owner);
                } else {
                    i++;
                }
            }
            // Defence in depth: reserve gated on freeStakeOf, requestWithdraw
            // refuses to cool below reservedTotal, so this should never trigger.
            if (remaining > 0) revert InsufficientCoverage();
            usdc.safeTransfer(beneficiary, slashAmount);
        }
        emit Slashed(id, owner, beneficiary, slashAmount);
    }

    // ================================ Views ================================

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

    /// @notice Sum of an owner's Active position principals. O(1): reads the
    ///         maintained aggregate. Resolves agents to their owner.
    function activeStakeOf(address owner) public view returns (uint256) {
        return activePrincipalOf[_resolveOwner(owner)];
    }

    /// @notice Active stake minus current reservations. Resolves agents.
    function freeStakeOf(address owner) public view returns (uint256) {
        address resolved = _resolveOwner(owner);
        uint256 active = activePrincipalOf[resolved];
        uint256 reserved = reservedTotal[resolved];
        return active > reserved ? active - reserved : 0;
    }

    /// @notice Count of an owner's live (Active + Cooling) positions.
    function positionCountOf(address owner) external view returns (uint256) {
        return ownerPositionIds[owner].length;
    }

    /// @notice Resolve an address to the identity wallet that owns its stake.
    function resolveOwner(address addr) external view returns (address) {
        return _resolveOwner(addr);
    }

    /// @notice Total USDC-equivalent reserves: liquid USDC held + USYC (at par
    ///         on chain) + USDC currently out for off-chain yield. 6 decimals.
    function totalReserves() external view returns (uint256) {
        uint256 usdcHeld = usdc.balanceOf(address(this));
        uint256 result = usdcHeld + outForYield;
        if (teller != address(0) && address(usyc) != address(0)) {
            uint256 usycHeld = usyc.balanceOf(address(this));
            if (usycHeld > 0) {
                result += usycHeld;
            }
        }
        return result;
    }
}
