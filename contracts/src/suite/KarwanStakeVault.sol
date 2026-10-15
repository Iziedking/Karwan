// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IKarwanHub, IKarwanIdentity, IKarwanStakeVault} from "./interfaces/IKarwanSuite.sol";
import {SigCheck} from "./SigCheck.sol";

/// @title KarwanStakeVault
/// @notice People stake to back their deals. A registered family can reserve a
///         person's stake only with a signature from one of that person's own
///         wallets, naming the amount, the one beneficiary a slash can pay, and
///         an expiry. Only the family that reserved can slash, only to that
///         beneficiary, and never more than it reserved. Anyone frees a
///         reservation once it expires or its family is revoked. Stake never
///         goes into yield, and the vault has no owner.
contract KarwanStakeVault is IKarwanStakeVault, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint64 public constant COOLDOWN = 3 days;
    uint64 public constant MAX_TERM = 1_095 days;
    bytes32 internal constant RESERVE_TYPEHASH = keccak256(
        "Reserve(address family,bytes32 ref,address asset,uint128 amount,address beneficiary,uint64 expiresAt,uint256 deadline)"
    );

    /// `active` is everything staked, including what is reserved or cooling.
    struct Stake {
        uint128 active;
        uint128 reserved;
        uint128 cooling;
        uint64 coolUntil;
    }

    struct Reservation {
        uint64 owner;
        bool active;
        address asset;
        address beneficiary;
        uint128 amount;
        uint64 expiresAt;
    }

    IKarwanHub public immutable hub;

    mapping(uint64 => mapping(address => Stake)) internal _stakes;
    mapping(bytes32 => Reservation) internal _reservations;
    /// A family can reserve under one ref only once, ever, so a signature is
    /// never used twice.
    mapping(bytes32 => bool) public reservationUsed;
    mapping(address => mapping(address => uint256)) public owed;
    mapping(address => uint256) public owedTotal;

    event Staked(uint64 indexed owner, address indexed asset, address indexed from, uint256 amount);
    event WithdrawRequested(uint64 indexed owner, address indexed asset, uint256 amount, uint64 claimableAt);
    event WithdrawCancelled(uint64 indexed owner, address indexed asset);
    event Withdrawn(uint64 indexed owner, address indexed asset, address indexed to, uint256 amount);
    event Reserved(
        address indexed family,
        bytes32 indexed ref,
        uint64 indexed owner,
        address asset,
        uint256 amount,
        address beneficiary,
        uint64 expiresAt
    );
    event ReservationExtended(address indexed family, bytes32 indexed ref, uint64 expiresAt);
    event Slashed(address indexed family, bytes32 indexed ref, address indexed beneficiary, uint256 amount);
    event ReservationReleased(address indexed family, bytes32 indexed ref, uint256 amount);
    event PayoutCredited(address indexed asset, address indexed to, uint256 amount);
    event OwedWithdrawn(address indexed asset, address indexed to, uint256 amount);

    error NotPerson();
    error NotFamily();
    error BadAmount();
    error BadTerm();
    error BadDelivery();
    error BadSignature();
    error Expired();
    error Early();
    error Used();
    error NotActive();
    error NotEnoughStake();
    error NothingOwed();

    constructor(address hub_) EIP712("KarwanStakeVault", "1") {
        hub = IKarwanHub(hub_);
    }

    // ------------------------------- Staking ------------------------------

    function stake(address asset, uint256 amount) external nonReentrant {
        uint64 id = _person(msg.sender);
        if (amount == 0 || !hub.assetAllowed(asset)) revert BadAmount();
        IERC20 token = IERC20(asset);
        uint256 before = token.balanceOf(address(this));
        _stakes[id][asset].active += uint128(amount);
        emit Staked(id, asset, msg.sender, amount);
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) revert BadDelivery();
    }

    /// @notice Starts the cooldown on free stake. A new request restarts it for
    ///         everything cooling. Cooling stake cannot be reserved.
    function requestWithdraw(address asset, uint256 amount) external {
        uint64 id = _person(msg.sender);
        Stake storage k = _stakes[id][asset];
        if (amount == 0 || amount > _free(k)) revert BadAmount();
        k.cooling += uint128(amount);
        k.coolUntil = uint64(block.timestamp) + COOLDOWN;
        emit WithdrawRequested(id, asset, amount, k.coolUntil);
    }

    function cancelWithdraw(address asset) external {
        uint64 id = _person(msg.sender);
        _stakes[id][asset].cooling = 0;
        emit WithdrawCancelled(id, asset);
    }

    /// @notice Any of the person's own wallets takes out what finished cooling.
    function withdraw(address asset) external nonReentrant {
        uint64 id = _person(msg.sender);
        Stake storage k = _stakes[id][asset];
        uint256 amount = k.cooling;
        if (amount == 0) revert BadAmount();
        if (block.timestamp < k.coolUntil) revert Early();
        k.cooling = 0;
        k.active -= uint128(amount);
        emit Withdrawn(id, asset, msg.sender, amount);
        IERC20(asset).safeTransfer(msg.sender, amount);
    }

    // ----------------------------- Reservations ---------------------------

    /// @notice A registered family reserves `amount` of the stake behind
    ///         `staker`, who signed exactly these terms from a wallet bound to
    ///         them, never an agent's.
    function reserve(
        bytes32 ref,
        address staker,
        address asset,
        uint128 amount,
        address beneficiary,
        uint64 expiresAt,
        uint256 deadline,
        bytes calldata sig
    ) external {
        if (!hub.isFamily(msg.sender)) revert NotFamily();
        if (amount == 0 || beneficiary == address(0)) revert BadAmount();
        if (expiresAt <= block.timestamp || expiresAt > block.timestamp + MAX_TERM) revert BadTerm();
        if (block.timestamp > deadline) revert Expired();
        bytes32 key = keyOf(msg.sender, ref);
        if (reservationUsed[key]) revert Used();
        uint64 id = _person(staker);
        bytes32 digest = reserveDigest(msg.sender, ref, asset, amount, beneficiary, expiresAt, deadline);
        if (!SigCheck.isValid(staker, digest, sig)) revert BadSignature();
        Stake storage k = _stakes[id][asset];
        if (amount > _free(k)) revert NotEnoughStake();
        reservationUsed[key] = true;
        k.reserved += amount;
        _reservations[key] = Reservation(id, true, asset, beneficiary, amount, expiresAt);
        emit Reserved(msg.sender, ref, id, asset, amount, beneficiary, expiresAt);
    }

    /// @notice The reserving family moves the expiry later, never earlier,
    ///         and never once it has passed: an expired reservation is anyone's
    ///         to free.
    function extend(bytes32 ref, uint64 expiresAt) external {
        bytes32 key = keyOf(msg.sender, ref);
        Reservation storage r = _reservations[key];
        if (!r.active) revert NotActive();
        if (block.timestamp > r.expiresAt) revert Expired();
        if (expiresAt <= r.expiresAt || expiresAt > block.timestamp + MAX_TERM) revert BadTerm();
        r.expiresAt = expiresAt;
        emit ReservationExtended(msg.sender, ref, expiresAt);
    }

    /// @notice The reserving family pays up to `amount` of the reservation to
    ///         its beneficiary, before it expires. What is left stays reserved
    ///         until the family releases it. Returns what was paid.
    function slash(bytes32 ref, uint256 amount) external nonReentrant returns (uint256 paid) {
        if (!hub.isFamily(msg.sender)) revert NotFamily();
        bytes32 key = keyOf(msg.sender, ref);
        Reservation storage r = _reservations[key];
        if (!r.active) revert NotActive();
        if (block.timestamp > r.expiresAt) revert Expired();
        paid = amount < r.amount ? amount : r.amount;
        if (paid == 0) return 0;
        r.amount -= uint128(paid);
        if (r.amount == 0) r.active = false;
        Stake storage k = _stakes[r.owner][r.asset];
        k.reserved -= uint128(paid);
        k.active -= uint128(paid);
        emit Slashed(msg.sender, ref, r.beneficiary, paid);
        _deliver(r.asset, r.beneficiary, paid);
    }

    /// @notice The reserving family frees what is left. Nothing to free is a
    ///         no-op, so a family can always call it on the way out of a deal.
    function release(bytes32 ref) external {
        _release(msg.sender, ref);
    }

    /// @notice Anyone frees a reservation once it expires, or at once if its
    ///         family has been revoked.
    function releaseStale(address family, bytes32 ref) external {
        Reservation storage r = _reservations[keyOf(family, ref)];
        if (!r.active) revert NotActive();
        if (block.timestamp <= r.expiresAt && hub.isFamily(family)) revert Early();
        _release(family, ref);
    }

    /// @notice A slash that could not be delivered, for example to a blocked
    ///         address, waits here for that same address.
    function withdrawOwed(address asset) external nonReentrant {
        uint256 amount = owed[asset][msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[asset][msg.sender] = 0;
        owedTotal[asset] -= amount;
        emit OwedWithdrawn(asset, msg.sender, amount);
        IERC20(asset).safeTransfer(msg.sender, amount);
    }

    // -------------------------------- Views -------------------------------

    function stakeOf(uint64 owner, address asset) external view returns (Stake memory) {
        return _stakes[owner][asset];
    }

    function freeOf(uint64 owner, address asset) external view returns (uint256) {
        return _free(_stakes[owner][asset]);
    }

    function reservationOf(address family, bytes32 ref) external view returns (Reservation memory) {
        return _reservations[keyOf(family, ref)];
    }

    /// @notice When a live reservation ends; zero when nothing is reserved.
    function expiryOf(address family, bytes32 ref) external view returns (uint64) {
        Reservation storage r = _reservations[keyOf(family, ref)];
        return r.active ? r.expiresAt : 0;
    }

    function keyOf(address family, bytes32 ref) public pure returns (bytes32) {
        return keccak256(abi.encode(family, ref));
    }

    function reserveDigest(
        address family,
        bytes32 ref,
        address asset,
        uint128 amount,
        address beneficiary,
        uint64 expiresAt,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(RESERVE_TYPEHASH, family, ref, asset, amount, beneficiary, expiresAt, deadline))
        );
    }

    // ------------------------------ Internals -----------------------------

    function _person(address wallet) internal view returns (uint64 id) {
        IKarwanIdentity identity = IKarwanIdentity(hub.identity());
        id = identity.identityOf(wallet);
        if (id == 0 || identity.isAgent(wallet)) revert NotPerson();
    }

    function _free(Stake storage k) internal view returns (uint256) {
        return uint256(k.active) - k.reserved - k.cooling;
    }

    function _release(address family, bytes32 ref) internal {
        Reservation storage r = _reservations[keyOf(family, ref)];
        if (!r.active) return;
        uint128 amount = r.amount;
        r.active = false;
        r.amount = 0;
        _stakes[r.owner][r.asset].reserved -= amount;
        emit ReservationReleased(family, ref, amount);
    }

    function _deliver(address asset, address to, uint256 amount) internal {
        if (IERC20(asset).trySafeTransfer(to, amount)) return;
        owed[asset][to] += amount;
        owedTotal[asset] += amount;
        emit PayoutCredited(asset, to, amount);
    }
}
