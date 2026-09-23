// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Guardable} from "./Guardable.sol";

interface IStakeYieldPool {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
}

/// @title KarwanStakeVault
/// @notice Seller stake that backs deals. Stake is committed to a deal only
///         when the staker, or an agent they signed for, accepts that deal,
///         and a slash pays only the beneficiary fixed at that moment.
///
///         Agents bind with one EIP-712 signature from the owner (a passkey
///         smart wallet or a plain key, checked with SignatureChecker), capped
///         and with an expiry. The backend submits it, so the user never sends
///         a separate transaction, and a stolen agent key can commit at most
///         the cap until the expiry.
///
///         No operator can move stake. Idle stake is parked in the Karwan yield
///         pool, which only this vault can take back from.
contract KarwanStakeVault is Ownable2Step, ReentrancyGuard, EIP712, Guardable {
    using SafeERC20 for IERC20;

    uint256 public constant MIN_STAKE = 1e6;
    uint64 public constant COOLDOWN = 3 days;
    uint64 public constant STRANDED_AFTER = 30 days;
    bytes32 public constant BIND_TYPEHASH =
        keccak256("BindAgent(address owner,address agent,uint128 cap,uint64 expiry,uint256 nonce)");

    IERC20 public immutable usdc;
    IStakeYieldPool public pool;
    /// @notice Unreserved stake kept liquid on top of reservations and
    ///         cooldowns before anything is parked in the pool.
    uint256 public liquidFloor = 1_000e6;
    uint256 public parked;

    struct Account {
        uint256 active;
        uint256 reserved;
        uint256 cooling;
        uint64 claimableAt;
        uint64 stakedSince;
    }

    struct Binding {
        address owner;
        uint128 cap;
        uint128 committed;
        uint64 expiry;
    }

    struct Reservation {
        address owner;
        address agent;
        uint128 amount;
        address beneficiary;
        uint64 createdAt;
        bool active;
    }

    mapping(address => Account) public accounts;
    mapping(address => Binding) public bindingOf;
    mapping(address => uint256) public nonces;
    mapping(address => bool) public isConsumer;
    mapping(bytes32 => Reservation) internal _reservations;

    uint256 public totalActive;
    uint256 public totalReserved;
    uint256 public totalCooling;

    event Staked(address indexed owner, uint256 amount);
    event WithdrawRequested(address indexed owner, uint256 amount, uint64 claimableAt);
    event WithdrawCancelled(address indexed owner, uint256 amount);
    event Claimed(address indexed owner, uint256 amount);
    event AgentBound(address indexed owner, address indexed agent, uint128 cap, uint64 expiry);
    event AgentRevoked(address indexed owner, address indexed agent);
    event ConsumerSet(address indexed consumer, bool allowed);
    event Reserved(bytes32 indexed id, address indexed consumer, address indexed owner, address agent, uint256 amount, address beneficiary);
    event Released(bytes32 indexed id, address indexed consumer, address indexed owner, uint256 amount);
    event Slashed(bytes32 indexed id, address indexed owner, address indexed beneficiary, uint256 amount);
    event StrandedReleased(bytes32 indexed id, address indexed consumer, address indexed owner, uint256 amount);
    event PoolSet(address indexed pool);
    event LiquidFloorSet(uint256 floor);
    event Parked(uint256 amount, uint256 parkedAfter);
    event Unparked(uint256 amount, uint256 parkedAfter);

    error ZeroAddress();
    error ZeroAmount();
    error BelowMinimum();
    error InsufficientFreeStake();
    error NothingCooling();
    error StillCooling();
    error NotConsumer();
    error AlreadyReserved();
    error NotReserved();
    error BadNonce();
    error Expired();
    error BadSignature();
    error AgentIsOwner();
    error AgentBoundElsewhere();
    error NotBindingOwner();
    error CapExceeded();
    error ConsumerStillActive();
    error NotStrandedYet();
    error PoolStillHoldsStake();

    constructor(address _usdc, address _owner) Ownable(_owner) EIP712("KarwanStakeVault", "1") {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    function _guardianAdmin() internal view override returns (address) {
        return owner();
    }

    // ============================ Configuration ============================

    function setConsumer(address consumer, bool allowed) external onlyOwner {
        if (consumer == address(0)) revert ZeroAddress();
        isConsumer[consumer] = allowed;
        emit ConsumerSet(consumer, allowed);
    }

    /// @notice Point at the yield pool. Only while nothing is parked, so stake
    ///         is never left in a pool the vault no longer knows about.
    function setPool(address _pool) external onlyOwner {
        if (parked != 0) revert PoolStillHoldsStake();
        pool = IStakeYieldPool(_pool);
        emit PoolSet(_pool);
    }

    function setLiquidFloor(uint256 floor) external onlyOwner {
        liquidFloor = floor;
        emit LiquidFloorSet(floor);
    }

    // =============================== Stakers ===============================

    function stake(uint256 amount) external nonReentrant {
        if (amount < MIN_STAKE) revert BelowMinimum();
        Account storage a = accounts[msg.sender];
        if (a.active == 0) a.stakedSince = uint64(block.timestamp);
        a.active += amount;
        totalActive += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /// @notice Move unreserved stake into the cooldown. A new request restarts
    ///         the cooldown for everything cooling.
    function requestWithdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Account storage a = accounts[msg.sender];
        if (a.active - a.reserved < amount) revert InsufficientFreeStake();
        a.active -= amount;
        a.cooling += amount;
        totalActive -= amount;
        totalCooling += amount;
        if (a.active == 0) a.stakedSince = 0;
        a.claimableAt = uint64(block.timestamp) + COOLDOWN;
        emit WithdrawRequested(msg.sender, amount, a.claimableAt);
    }

    function cancelWithdraw() external {
        Account storage a = accounts[msg.sender];
        uint256 amount = a.cooling;
        if (amount == 0) revert NothingCooling();
        if (a.active == 0) a.stakedSince = uint64(block.timestamp);
        a.cooling = 0;
        a.active += amount;
        totalCooling -= amount;
        totalActive += amount;
        a.claimableAt = 0;
        emit WithdrawCancelled(msg.sender, amount);
    }

    /// @notice Take out stake whose cooldown ended. A guardian hold can delay
    ///         this within its budget, never take it.
    function claim() external nonReentrant {
        Account storage a = accounts[msg.sender];
        uint256 amount = a.cooling;
        if (amount == 0) revert NothingCooling();
        if (block.timestamp < a.claimableAt) revert StillCooling();
        _requireNotHeld(bytes32(uint256(uint160(msg.sender))));
        a.cooling = 0;
        a.claimableAt = 0;
        totalCooling -= amount;
        _ensureLiquid(amount);
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ================================ Agents ===============================

    function bindDigest(address owner_, address agent, uint128 cap, uint64 expiry, uint256 nonce)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(BIND_TYPEHASH, owner_, agent, cap, expiry, nonce)));
    }

    /// @notice Bind `agent` to `owner_` with the owner's signature. Anyone may
    ///         submit it; only the owner's signature makes it valid.
    function bindAgentWithSig(
        address owner_,
        address agent,
        uint128 cap,
        uint64 expiry,
        uint256 nonce,
        bytes calldata signature
    ) external {
        if (owner_ == address(0) || agent == address(0)) revert ZeroAddress();
        if (agent == owner_) revert AgentIsOwner();
        if (expiry <= block.timestamp) revert Expired();
        if (nonce != nonces[owner_]) revert BadNonce();
        Binding storage b = bindingOf[agent];
        if (b.owner != address(0) && b.owner != owner_) {
            if (b.expiry > block.timestamp || b.committed != 0) revert AgentBoundElsewhere();
            b.committed = 0;
        }
        if (!SignatureChecker.isValidSignatureNow(owner_, bindDigest(owner_, agent, cap, expiry, nonce), signature)) {
            revert BadSignature();
        }
        nonces[owner_] = nonce + 1;
        b.owner = owner_;
        b.cap = cap;
        b.expiry = expiry;
        emit AgentBound(owner_, agent, cap, expiry);
    }

    /// @notice The owner stops an agent committing more stake. Reservations it
    ///         already made stay until their deals end.
    function revokeAgent(address agent) external {
        Binding storage b = bindingOf[agent];
        if (b.owner != msg.sender) revert NotBindingOwner();
        b.expiry = 0;
        emit AgentRevoked(msg.sender, agent);
    }

    /// @notice The identity behind an address: the owner a live or past agent
    ///         was bound to, else the address itself.
    function resolveOwner(address addr) public view returns (address) {
        address o = bindingOf[addr].owner;
        return o == address(0) ? addr : o;
    }

    function freeStakeOf(address owner_) external view returns (uint256) {
        Account storage a = accounts[owner_];
        return a.active - a.reserved;
    }

    // ============================== Consumers ==============================

    function _key(address consumer, bytes32 id) internal pure returns (bytes32) {
        return keccak256(abi.encode(consumer, id));
    }

    /// @notice Commit `amount` of the stake behind `party` to deal `id`.
    ///         Called by an allowlisted consumer when `party` accepts the deal.
    ///         An agent can only commit its owner's stake within its signed cap
    ///         and before its expiry.
    function reserve(bytes32 id, address party, uint256 amount, address beneficiary) external {
        if (!isConsumer[msg.sender]) revert NotConsumer();
        if (party == address(0) || beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        bytes32 k = _key(msg.sender, id);
        if (_reservations[k].active) revert AlreadyReserved();

        address owner_ = party;
        address agent;
        Binding storage b = bindingOf[party];
        if (b.owner != address(0)) {
            if (b.expiry <= block.timestamp) revert Expired();
            if (uint256(b.committed) + amount > b.cap) revert CapExceeded();
            owner_ = b.owner;
            agent = party;
            b.committed += uint128(amount);
        }
        Account storage a = accounts[owner_];
        if (a.active - a.reserved < amount) revert InsufficientFreeStake();
        a.reserved += amount;
        totalReserved += amount;
        _reservations[k] = Reservation({
            owner: owner_,
            agent: agent,
            amount: uint128(amount),
            beneficiary: beneficiary,
            createdAt: uint64(block.timestamp),
            active: true
        });
        emit Reserved(id, msg.sender, owner_, agent, amount, beneficiary);
    }

    function release(bytes32 id) external {
        Reservation storage r = _reservations[_key(msg.sender, id)];
        if (!r.active) return;
        uint256 amount = r.amount;
        _clear(r);
        emit Released(id, msg.sender, r.owner, amount);
    }

    function slash(bytes32 id) external nonReentrant {
        _slash(id, type(uint256).max);
    }

    /// @notice Pay up to `amount` of the reservation to its beneficiary; the
    ///         rest returns to the owner's free stake.
    function slashTo(bytes32 id, uint256 amount) external nonReentrant {
        _slash(id, amount);
    }

    /// @notice Owner escape hatch for a reservation left behind by a consumer
    ///         that has been removed. Only after STRANDED_AFTER, and the stake
    ///         stays with its owner.
    function adminRelease(address consumer, bytes32 id) external onlyOwner {
        if (isConsumer[consumer]) revert ConsumerStillActive();
        Reservation storage r = _reservations[_key(consumer, id)];
        if (!r.active) revert NotReserved();
        if (block.timestamp < uint256(r.createdAt) + STRANDED_AFTER) revert NotStrandedYet();
        uint256 amount = r.amount;
        _clear(r);
        emit StrandedReleased(id, consumer, r.owner, amount);
    }

    function reservationOf(address consumer, bytes32 id) external view returns (Reservation memory) {
        return _reservations[_key(consumer, id)];
    }

    // ================================ Yield ================================

    /// @notice Park unreserved stake above the liquid floor in the yield pool.
    ///         Anyone can call it.
    function parkIdle() external nonReentrant {
        if (address(pool) == address(0)) return;
        uint256 liquid = usdc.balanceOf(address(this));
        uint256 keep = totalReserved + totalCooling + liquidFloor;
        if (liquid <= keep) return;
        uint256 amount = liquid - keep;
        if (amount > totalActive - totalReserved) amount = totalActive - totalReserved;
        if (amount == 0) return;
        parked += amount;
        usdc.forceApprove(address(pool), amount);
        pool.deposit(amount);
        emit Parked(amount, parked);
    }

    // =============================== Internals =============================

    function _slash(bytes32 id, uint256 cap) internal {
        Reservation storage r = _reservations[_key(msg.sender, id)];
        if (!r.active) revert NotReserved();
        uint256 reserved = r.amount;
        uint256 take = cap < reserved ? cap : reserved;
        address owner_ = r.owner;
        address beneficiary = r.beneficiary;
        _clear(r);
        if (take > 0) {
            accounts[owner_].active -= take;
            totalActive -= take;
            if (accounts[owner_].active == 0) accounts[owner_].stakedSince = 0;
            _ensureLiquid(take);
            usdc.safeTransfer(beneficiary, take);
        }
        emit Slashed(id, owner_, beneficiary, take);
    }

    function _clear(Reservation storage r) internal {
        uint256 amount = r.amount;
        r.active = false;
        accounts[r.owner].reserved -= amount;
        totalReserved -= amount;
        if (r.agent != address(0)) {
            Binding storage b = bindingOf[r.agent];
            if (b.owner == r.owner) b.committed -= uint128(amount);
        }
    }

    function _ensureLiquid(uint256 need) internal {
        uint256 liquid = usdc.balanceOf(address(this));
        if (liquid >= need) return;
        uint256 gap = need - liquid;
        if (gap > parked) gap = parked;
        parked -= gap;
        pool.withdraw(gap);
        emit Unparked(gap, parked);
    }
}
