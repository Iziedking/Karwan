// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC20 interface (USDC on Arc).
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title KarwanVault
/// @notice Flexible USDC vault that powers the staking signal in Karwan's
///         reputation formula (see docs/reputation-model.md §3). Users deposit
///         any amount and can request to withdraw at any time. There is NO
///         forced lock duration — instead, withdrawal goes through a 7-day
///         cooling window during which the position no longer contributes to
///         the user's stake signal and the backend can run fraud checks. The
///         user can cancel the withdrawal request and resume earning
///         reputation without losing their accrued tenure.
///
///         The reputation formula reads two things off this contract:
///           1. The principal of every Active position (the stake signal).
///           2. `depositedAt` per position (the tenure signal — longer is
///              better, with diminishing returns past one year).
///
///         The 7-day cool-down is a public-good design choice: if a user
///         deposits to spike their reputation then immediately bails, they
///         lose a week of stake signal and the platform has a week to detect
///         and respond. Honest users who change their mind can `cancelWithdraw`
///         and keep their tenure intact.
///
/// @dev On Arc Testnet the vault holds plain USDC. On mainnet the intent is to
///      route deposits through Hashnote's USYC mint/redeem so locked principal
///      also earns ~5% APY for the depositor. The on-chain interface is
///      unchanged; only the internal token movement differs.
contract KarwanVault {
    enum PositionState {
        None,
        Active,     // earning the stake + tenure signal
        Cooling,    // withdrawal requested, in fraud window; signal paused
        Withdrawn
    }

    struct Position {
        address owner;
        uint256 principal;
        /// Set on deposit. Never changes during the position's lifetime, even
        /// across a cancelled withdrawal request. Tenure is `now - depositedAt`
        /// for any Active position.
        uint64 depositedAt;
        /// 0 unless in Cooling. Tracked so the indexer can compute the exact
        /// downtime window if the user later cancels.
        uint64 cooldownStartedAt;
        /// 0 unless in Cooling. After this timestamp the owner can claim.
        uint64 claimableAt;
        PositionState state;
    }

    IERC20 public immutable usdc;
    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) public positions;

    /// @notice Cooling window between a withdrawal request and the user being
    ///         able to claim the principal. Fixed at 7 days; the reputation
    ///         engine uses this to gate stake signal and run fraud checks.
    uint32 public constant COOLDOWN_DAYS = 7;

    /// @notice Minimum principal per position. Stops dust positions from
    ///         gaming the stake signal with sub-dollar deposits.
    uint256 public constant MIN_PRINCIPAL = 1e6; // 1 USDC (6 decimals)

    uint256 private _reentrancyStatus = 1;

    modifier nonReentrant() {
        require(_reentrancyStatus == 1, "REENTRANT");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    event Deposited(uint256 indexed positionId, address indexed owner, uint256 principal);
    event WithdrawalRequested(
        uint256 indexed positionId,
        address indexed owner,
        uint64 claimableAt
    );
    event WithdrawalCancelled(uint256 indexed positionId, address indexed owner);
    event Claimed(uint256 indexed positionId, address indexed owner, uint256 principal);

    error InvalidPrincipal();
    error TransferFailed();
    error NotOwner();
    error NotActive();
    error NotCooling();
    error StillCooling();

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    /// @notice Open a new staking position. Caller must have approved this
    ///         contract for `amount` USDC. A user may hold multiple positions
    ///         in parallel — each tracks its own `depositedAt` so older
    ///         positions earn more tenure-weight in the reputation formula.
    function deposit(uint256 amount) external nonReentrant returns (uint256 positionId) {
        if (amount < MIN_PRINCIPAL) revert InvalidPrincipal();
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        positionId = nextPositionId++;
        positions[positionId] = Position({
            owner: msg.sender,
            principal: amount,
            depositedAt: uint64(block.timestamp),
            cooldownStartedAt: 0,
            claimableAt: 0,
            state: PositionState.Active
        });

        emit Deposited(positionId, msg.sender, amount);
    }

    /// @notice Begin withdrawing a position. Starts the 7-day cool-down.
    ///         The position immediately stops contributing to the stake
    ///         signal (the reputation engine reads PositionState and only
    ///         counts Active positions).
    function requestWithdraw(uint256 positionId) external {
        Position storage p = positions[positionId];
        if (p.state != PositionState.Active) revert NotActive();
        if (msg.sender != p.owner) revert NotOwner();

        p.cooldownStartedAt = uint64(block.timestamp);
        p.claimableAt = uint64(block.timestamp) + uint64(COOLDOWN_DAYS) * 1 days;
        p.state = PositionState.Cooling;

        emit WithdrawalRequested(positionId, p.owner, p.claimableAt);
    }

    /// @notice Cancel an in-flight withdrawal request. Position returns to
    ///         Active. Tenure (depositedAt) is unchanged, so the user keeps
    ///         every reputation-day they had accrued before requesting.
    function cancelWithdraw(uint256 positionId) external {
        Position storage p = positions[positionId];
        if (p.state != PositionState.Cooling) revert NotCooling();
        if (msg.sender != p.owner) revert NotOwner();

        p.cooldownStartedAt = 0;
        p.claimableAt = 0;
        p.state = PositionState.Active;

        emit WithdrawalCancelled(positionId, p.owner);
    }

    /// @notice Claim the principal of a position whose cool-down has elapsed.
    function claim(uint256 positionId) external nonReentrant {
        Position storage p = positions[positionId];
        if (p.state != PositionState.Cooling) revert NotCooling();
        if (msg.sender != p.owner) revert NotOwner();
        if (block.timestamp < p.claimableAt) revert StillCooling();

        uint256 amount = p.principal;
        p.state = PositionState.Withdrawn;
        if (!usdc.transfer(p.owner, amount)) revert TransferFailed();
        emit Claimed(positionId, p.owner, amount);
    }

    /// @notice View: whether the position is currently contributing to the
    ///         stake signal. Cooling and Withdrawn positions return false.
    function isActive(uint256 positionId) external view returns (bool) {
        return positions[positionId].state == PositionState.Active;
    }

    /// @notice View: principal counted toward the stake signal for this
    ///         position. Returns 0 for non-Active positions.
    function activePrincipal(uint256 positionId) external view returns (uint256) {
        Position memory p = positions[positionId];
        if (p.state != PositionState.Active) return 0;
        return p.principal;
    }

    /// @notice View: seconds since the position was first deposited. Used by
    ///         the reputation engine to compute the tenure weight. Returns 0
    ///         for non-Active positions so withdrawn/cooling positions don't
    ///         leak tenure into the signal.
    function tenureSeconds(uint256 positionId) external view returns (uint256) {
        Position memory p = positions[positionId];
        if (p.state != PositionState.Active) return 0;
        if (block.timestamp <= p.depositedAt) return 0;
        return block.timestamp - p.depositedAt;
    }
}
