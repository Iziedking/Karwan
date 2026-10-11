// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IKarwanHub} from "./interfaces/IKarwanSuite.sol";
import {SigCheck} from "./SigCheck.sol";

/// @title KarwanIdentityRegistry
/// @notice One identity per person. Wallets and agents join an identity only
///         with their own signature, so nobody can attach someone else's wallet
///         to their record. The controlling wallet can hand control to another
///         of the person's wallets, or a recovery wallet the person named can
///         take over after 7 days unless the person cancels. Agents carry an
///         expiry and spending limits that every escrow family enforces.
contract KarwanIdentityRegistry is EIP712 {
    enum Kind {
        None,
        Wallet,
        Agent
    }

    struct Binding {
        uint64 id;
        Kind kind;
        uint64 expiry;
    }

    struct AgentLimit {
        uint128 perPayment;
        uint128 total;
        uint128 used;
    }

    struct RecoveryRequest {
        address wallet;
        uint64 readyAt;
    }

    uint64 public constant RECOVERY_DELAY = 7 days;
    bytes32 public constant BIND_TYPEHASH = keccak256(
        "Bind(uint64 id,address wallet,uint8 kind,uint64 expiry,uint128 perPayment,uint128 total,uint256 nonce,uint256 deadline)"
    );

    IKarwanHub public immutable hub;
    uint64 public identityCount;

    mapping(uint64 => address) public controllerOf;
    mapping(uint64 => address) public pendingControllerOf;
    mapping(uint64 => address) public recoveryOf;
    mapping(uint64 => RecoveryRequest) public recoveryRequestOf;
    mapping(address => Binding) public bindingOf;
    mapping(address => AgentLimit) public agentLimitOf;
    mapping(address => uint256) public nonces;

    event Registered(uint64 indexed id, address indexed controller);
    event Bound(uint64 indexed id, address indexed wallet, Kind kind, uint64 expiry, uint128 perPayment, uint128 total);
    event Unbound(uint64 indexed id, address indexed wallet);
    event ControllerProposed(uint64 indexed id, address indexed next);
    event ControllerChanged(uint64 indexed id, address indexed controller);
    event RecoverySet(uint64 indexed id, address indexed wallet);
    event RecoveryStarted(uint64 indexed id, address indexed wallet, uint64 readyAt);
    event RecoveryCancelled(uint64 indexed id);
    event AgentAllowanceUsed(address indexed agent, address indexed family, uint256 amount, uint256 used);

    error AlreadyBound();
    error NotController();
    error NotBound();
    error BadBinding();
    error BadSignature();
    error Expired();
    error NotFamily();
    error OverLimit();
    error IsController();
    error NotReady();
    error NoRequest();

    constructor(address hub_) EIP712("KarwanIdentity", "1") {
        hub = IKarwanHub(hub_);
    }

    /// @notice Start an identity with the calling wallet as its controller.
    function register() external returns (uint64 id) {
        if (bindingOf[msg.sender].id != 0) revert AlreadyBound();
        id = ++identityCount;
        controllerOf[id] = msg.sender;
        bindingOf[msg.sender] = Binding(id, Kind.Wallet, 0);
        emit Registered(id, msg.sender);
        emit Bound(id, msg.sender, Kind.Wallet, 0, 0, 0);
    }

    /// @notice Attach a wallet or an agent to the caller's identity. The
    ///         wallet signs the exact binding, limits included.
    function bind(
        address wallet,
        Kind kind,
        uint64 expiry,
        uint128 perPayment,
        uint128 total,
        uint256 deadline,
        bytes calldata walletSig
    ) external {
        uint64 id = _controlled(msg.sender);
        if (bindingOf[wallet].id != 0) revert AlreadyBound();
        if (kind == Kind.Agent) {
            if (expiry <= block.timestamp || perPayment == 0 || total < perPayment) revert BadBinding();
        } else if (kind != Kind.Wallet || expiry != 0 || perPayment != 0 || total != 0) {
            revert BadBinding();
        }
        if (block.timestamp > deadline) revert Expired();
        bytes32 digest = bindDigest(id, wallet, kind, expiry, perPayment, total, deadline);
        nonces[wallet]++;
        if (!SigCheck.isValid(wallet, digest, walletSig)) revert BadSignature();
        bindingOf[wallet] = Binding(id, kind, expiry);
        if (kind == Kind.Agent) agentLimitOf[wallet] = AgentLimit(perPayment, total, 0);
        emit Bound(id, wallet, kind, expiry, perPayment, total);
    }

    /// @notice A wallet leaves its identity, by itself or by the controller.
    ///         The controlling wallet cannot leave; hand control over first.
    function unbind(address wallet) external {
        Binding memory b = bindingOf[wallet];
        if (b.id == 0) revert NotBound();
        if (msg.sender != wallet && msg.sender != controllerOf[b.id]) revert NotController();
        if (controllerOf[b.id] == wallet) revert IsController();
        delete bindingOf[wallet];
        delete agentLimitOf[wallet];
        if (pendingControllerOf[b.id] == wallet) delete pendingControllerOf[b.id];
        if (recoveryOf[b.id] == wallet) {
            delete recoveryOf[b.id];
            delete recoveryRequestOf[b.id];
        }
        emit Unbound(b.id, wallet);
    }

    function proposeController(address next) external {
        uint64 id = _controlled(msg.sender);
        _requireOwnWallet(id, next);
        pendingControllerOf[id] = next;
        emit ControllerProposed(id, next);
    }

    function acceptController() external {
        uint64 id = bindingOf[msg.sender].id;
        if (id == 0 || pendingControllerOf[id] != msg.sender) revert NotController();
        _setController(id, msg.sender);
    }

    /// @notice Name one of the person's own wallets as recovery, or zero to clear.
    function setRecovery(address wallet) external {
        uint64 id = _controlled(msg.sender);
        if (wallet != address(0)) {
            _requireOwnWallet(id, wallet);
            if (wallet == msg.sender) revert IsController();
        }
        recoveryOf[id] = wallet;
        delete recoveryRequestOf[id];
        emit RecoverySet(id, wallet);
    }

    function startRecovery() external {
        uint64 id = bindingOf[msg.sender].id;
        if (id == 0 || recoveryOf[id] != msg.sender) revert NotController();
        uint64 readyAt = uint64(block.timestamp) + RECOVERY_DELAY;
        recoveryRequestOf[id] = RecoveryRequest(msg.sender, readyAt);
        emit RecoveryStarted(id, msg.sender, readyAt);
    }

    function cancelRecovery() external {
        uint64 id = _controlled(msg.sender);
        delete recoveryRequestOf[id];
        emit RecoveryCancelled(id);
    }

    function finishRecovery() external {
        uint64 id = bindingOf[msg.sender].id;
        RecoveryRequest memory r = recoveryRequestOf[id];
        if (id == 0 || r.wallet != msg.sender) revert NoRequest();
        if (block.timestamp < r.readyAt) revert NotReady();
        _setController(id, msg.sender);
    }

    /// @notice Count a payment against an agent's limits. Called by escrow
    ///         families when an agent funds a deal; a no-op for other wallets.
    function useAgentAllowance(address wallet, uint256 amount) external {
        if (!hub.isFamily(msg.sender)) revert NotFamily();
        Binding memory b = bindingOf[wallet];
        if (b.kind != Kind.Agent) return;
        if (b.expiry <= block.timestamp) revert Expired();
        AgentLimit storage l = agentLimitOf[wallet];
        if (amount > l.perPayment || l.used + amount > l.total) revert OverLimit();
        l.used += uint128(amount);
        emit AgentAllowanceUsed(wallet, msg.sender, amount, l.used);
    }

    // -------------------------------- Views -------------------------------

    /// @notice The identity a wallet belongs to, or 0. An expired agent belongs to none.
    function identityOf(address wallet) external view returns (uint64) {
        Binding memory b = bindingOf[wallet];
        if (b.kind == Kind.Agent && b.expiry <= block.timestamp) return 0;
        return b.id;
    }

    function isAgent(address wallet) external view returns (bool) {
        Binding memory b = bindingOf[wallet];
        return b.kind == Kind.Agent && b.expiry > block.timestamp;
    }

    function bindDigest(
        uint64 id,
        address wallet,
        Kind kind,
        uint64 expiry,
        uint128 perPayment,
        uint128 total,
        uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(BIND_TYPEHASH, id, wallet, uint8(kind), expiry, perPayment, total, nonces[wallet], deadline)
            )
        );
    }

    // ------------------------------ Internals -----------------------------

    function _controlled(address who) internal view returns (uint64 id) {
        id = bindingOf[who].id;
        if (id == 0 || controllerOf[id] != who) revert NotController();
    }

    function _requireOwnWallet(uint64 id, address wallet) internal view {
        Binding memory b = bindingOf[wallet];
        if (b.id != id || b.kind != Kind.Wallet) revert NotBound();
    }

    function _setController(uint64 id, address next) internal {
        controllerOf[id] = next;
        delete pendingControllerOf[id];
        delete recoveryRequestOf[id];
        if (recoveryOf[id] == next) delete recoveryOf[id];
        emit ControllerChanged(id, next);
    }
}
