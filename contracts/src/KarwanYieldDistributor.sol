// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title  KarwanYieldDistributor
/// @notice Per-address USDC yield holding for KarwanVault stakers. The vault
///         subscribes idle USDC into Hashnote USYC via KarwanTreasury and earns
///         the underlying T-bill yield. A daily off-chain cron computes each
///         active staker's pro-rata share (principal x USER_DAILY_APY_BPS) and
///         credits this contract via bulkCredit. Stakers claim any time, no
///         cooldown.
/// @dev    Single-purpose holding contract. No upgradability, no admin pause.
///         The protocol earns the spread between the real USYC APR and the
///         promised user APR: operator only credits the promised amount, the
///         rest stays in the vault.
contract KarwanYieldDistributor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Storage

    /// @notice USDC token. Set at construction, never changes. Distributor is
    ///         USDC-only by design; tokens of any other kind sent here are
    ///         unrecoverable.
    IERC20 public immutable usdc;

    /// @notice Contract owner. Rotates operator + recovers excess USDC sent
    ///         in error (the recovery cannot touch outstanding claimable
    ///         balances; see excessReserves()). Two-step rotation (audit I-2)
    ///         so a fat-fingered transfer can't strand ownership.
    address public owner;
    address public pendingOwner;

    /// @notice Authorized key for bulkCredit. The daily cron's signer.
    ///         Distinct from owner so the cron can run from a hot operator
    ///         wallet while owner sits cold.
    address public operator;

    /// @notice Per-address USDC claimable balance. Accrues via bulkCredit,
    ///         drains via claim / claimTo.
    mapping(address => uint256) public claimable;

    /// @notice Lifetime total ever credited. Useful for protocol-side
    ///         accounting and excess-recovery math. Monotonic.
    uint256 public totalCredited;

    /// @notice Lifetime total ever claimed. Monotonic. Outstanding =
    ///         totalCredited - totalClaimed.
    uint256 public totalClaimed;

    // Events

    /// @notice Emitted once per (staker, amount) pair inside bulkCredit. The
    ///         indexed `day` (unix day number) lets the backend group a
    ///         distribution batch without storing a tx-level cursor.
    event YieldCredited(address indexed staker, uint256 amount, uint32 indexed day);

    /// @notice Emitted on claim. `to` is the receiving address (== staker for
    ///         claim(), arbitrary for claimTo()).
    event YieldClaimed(address indexed staker, address indexed to, uint256 amount);

    event OperatorRotated(address indexed previous, address indexed next);
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnerTransferred(address indexed previous, address indexed next);

    /// @notice Emitted when owner recovers operator-over-funded USDC that was
    ///         never credited to any staker. Recovery cannot touch outstanding
    ///         claimables.
    event ExcessRecovered(address indexed to, uint256 amount);

    // Errors

    error NotOwner();
    error NotOperator();
    error ZeroAddress();
    error ZeroAmount();
    error LengthMismatch();
    error EmptyBatch();
    error NothingToClaim();
    error InsufficientExcess();

    // Constructor

    /// @param _usdc      USDC token address. On Arc this is
    ///                   0x3600000000000000000000000000000000000000.
    /// @param _operator  Initial operator key. The daily cron's signer.
    constructor(address _usdc, address _operator) {
        if (_usdc == address(0) || _operator == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        owner = msg.sender;
        operator = _operator;
    }

    // Modifiers

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    // Distribution

    /// @notice Credit each staker their pro-rata daily yield and pull the
    ///         total USDC from the caller (operator) in one atomic tx.
    ///         Operator MUST approve at least sum(amounts) USDC to this
    ///         contract before calling.
    ///
    ///         Zero amounts in the batch are skipped silently, the cron may
    ///         pass them to keep arrays aligned with the vault's full active
    ///         staker list, even if a particular staker accrued nothing this
    ///         tick (e.g. they entered cooldown).
    ///
    ///         The whole tx reverts if any address is zero, lengths mismatch,
    ///         or the operator hasn't approved enough USDC.
    /// @param stakers  Addresses to credit. Order corresponds to amounts.
    /// @param amounts  USDC amount to credit each staker (6 decimals).
    function bulkCredit(address[] calldata stakers, uint256[] calldata amounts)
        external
        onlyOperator
        nonReentrant
    {
        uint256 n = stakers.length;
        if (n == 0) revert EmptyBatch();
        if (n != amounts.length) revert LengthMismatch();

        uint32 today = uint32(block.timestamp / 86_400);
        uint256 total;

        for (uint256 i; i < n; ++i) {
            address staker = stakers[i];
            if (staker == address(0)) revert ZeroAddress();
            uint256 amount = amounts[i];
            if (amount == 0) continue;
            claimable[staker] += amount;
            total += amount;
            emit YieldCredited(staker, amount, today);
        }

        if (total == 0) revert EmptyBatch();

        totalCredited += total;
        // Pull last: state writes settle first, then the external call. Even
        // though USDC is a known-good token, the reentrancy guard plus this
        // ordering is defence in depth against ERC-20s with hook behaviour.
        usdc.safeTransferFrom(msg.sender, address(this), total);
    }

    // Claim

    /// @notice Withdraw the caller's full claimable balance to themselves.
    /// @return amount The USDC amount transferred.
    function claim() external nonReentrant returns (uint256 amount) {
        amount = _claim(msg.sender, msg.sender);
    }

    /// @notice Withdraw the caller's full claimable balance to a different
    ///         recipient address. Useful for delegated claim or hot/cold
    ///         wallet split, the staker remains the credit owner; the
    ///         recipient is just where the USDC lands.
    /// @param  recipient Address that receives the USDC.
    /// @return amount    The USDC amount transferred.
    function claimTo(address recipient) external nonReentrant returns (uint256 amount) {
        if (recipient == address(0)) revert ZeroAddress();
        amount = _claim(msg.sender, recipient);
    }

    function _claim(address staker, address recipient) internal returns (uint256 amount) {
        amount = claimable[staker];
        if (amount == 0) revert NothingToClaim();
        claimable[staker] = 0;
        totalClaimed += amount;
        usdc.safeTransfer(recipient, amount);
        emit YieldClaimed(staker, recipient, amount);
    }

    // Views

    /// @notice USDC sitting in the contract NOT backing an outstanding claim.
    ///         Sources: operator over-funding by mistake, residual rounding
    ///         from prior batches. Excess can be recovered by owner via
    ///         recoverExcess. Outstanding claimables are NEVER touched.
    function excessReserves() public view returns (uint256) {
        uint256 outstanding = totalCredited - totalClaimed;
        uint256 balance = usdc.balanceOf(address(this));
        unchecked {
            return balance > outstanding ? balance - outstanding : 0;
        }
    }

    /// @notice Outstanding claim liability across all stakers.
    function outstandingClaims() external view returns (uint256) {
        return totalCredited - totalClaimed;
    }

    // Admin

    /// @notice Recover USDC that was accidentally over-deposited and is NOT
    ///         backing any outstanding claim. Bounded by excessReserves();
    ///         outstanding claimable balances cannot be reduced by this
    ///         function. Owner-only.
    /// @param to     Destination for the recovered USDC.
    /// @param amount USDC amount to recover. Must be <= excessReserves().
    function recoverExcess(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > excessReserves()) revert InsufficientExcess();
        usdc.safeTransfer(to, amount);
        emit ExcessRecovered(to, amount);
    }

    /// @notice Rotate the operator key (the cron signer). Owner-only.
    function setOperator(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        address previous = operator;
        operator = next;
        emit OperatorRotated(previous, next);
    }

    /// @notice Begin a two-step ownership transfer (audit I-2). The new owner
    ///         must call acceptOwnership() to take control, so a wrong address
    ///         can never strand ownership. Owner controls operator rotation and
    ///         excess recovery; no privileged access to user claimables.
    function transferOwnership(address next) external onlyOwner {
        pendingOwner = next;
        emit OwnershipTransferStarted(owner, next);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnerTransferred(previous, owner);
    }
}
