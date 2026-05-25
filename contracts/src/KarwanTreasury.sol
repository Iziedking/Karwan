// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 interface (USDC and USYC).
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice The USYC Teller: subscribe USDC -> USYC (`buy`) and redeem
///         USYC -> USDC (`sell`). Matches the live Hashnote / Circle interface.
interface ITeller {
    function buy(uint256 amount) external returns (uint256);
    function sell(uint256 amount) external returns (uint256);
}

/// @notice USYC price feed, Chainlink-aggregator style. Reports the USYC price
///         in USD with 8 decimals.
interface IPriceOracle {
    function latestAnswer() external view returns (int256);
}

/// @title KarwanTreasury
/// @notice Collects Karwan's platform fees in USDC and parks the idle balance in
///         USYC so the protocol's own reserves earn yield instead of sitting
///         flat. On testnet `teller`, `usyc`, and `oracle` all point at MockUSYC;
///         on mainnet they point at the real Hashnote / Circle USYC Teller,
///         token, and price feed, so the swap is a redeploy with three addresses
///         and no code change.
///
///         Roles:
///           - owner: redeems USYC back to USDC for outbound payments, pays out,
///             and rotates the keeper.
///           - keeper: sweeps idle USDC into USYC (an automation wallet / cron).
contract KarwanTreasury {
    IERC20 public immutable usdc;
    ITeller public immutable teller;
    IERC20 public immutable usyc;
    IPriceOracle public immutable oracle;

    address public owner;
    address public keeper;

    /// @notice USDC kept liquid for outbound payments. Only the balance ABOVE
    ///         this is swept into USYC. 6 decimals.
    uint256 public idleThreshold;

    /// @notice Price scale of the oracle (8 decimals, 1e8 = $1.00).
    uint256 private constant PRICE_SCALE = 1e8;

    uint256 private _reentrancyStatus = 1;

    modifier nonReentrant() {
        require(_reentrancyStatus == 1, "REENTRANT");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @dev Owner is always allowed to act as keeper too.
    modifier onlyKeeper() {
        if (msg.sender != keeper && msg.sender != owner) revert NotKeeper();
        _;
    }

    event Deposited(address indexed from, uint256 amount);
    event SweptToUSYC(uint256 usdcIn, uint256 usycOut);
    event RedeemedFromUSYC(uint256 usycIn, uint256 usdcOut);
    event PaidOut(address indexed to, uint256 amount);
    event KeeperChanged(address indexed keeper);
    event OwnerChanged(address indexed owner);
    event IdleThresholdChanged(uint256 threshold);

    error NotOwner();
    error NotKeeper();
    error TransferFailed();
    error ApprovalFailed();
    error NothingToSweep();
    error ZeroAddress();

    constructor(
        address _usdc,
        address _teller,
        address _usyc,
        address _oracle,
        address _keeper,
        uint256 _idleThreshold
    ) {
        if (
            _usdc == address(0) || _teller == address(0) || _usyc == address(0)
                || _oracle == address(0)
        ) revert ZeroAddress();
        usdc = IERC20(_usdc);
        teller = ITeller(_teller);
        usyc = IERC20(_usyc);
        oracle = IPriceOracle(_oracle);
        owner = msg.sender;
        keeper = _keeper;
        idleThreshold = _idleThreshold;
    }

    /// @notice Pull `amount` USDC from the caller into the treasury. The escrow
    ///         (or anyone topping up reserves) calls this after approving.
    function deposit(uint256 amount) external {
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Deposited(msg.sender, amount);
    }

    /// @notice Sweep USDC above the idle threshold into USYC so reserves earn
    ///         yield. Keeper-gated so it can run on a schedule.
    function sweepToUSYC() external onlyKeeper nonReentrant returns (uint256 usycOut) {
        uint256 bal = usdc.balanceOf(address(this));
        if (bal <= idleThreshold) revert NothingToSweep();
        uint256 toSweep = bal - idleThreshold;
        if (!usdc.approve(address(teller), toSweep)) revert ApprovalFailed();
        usycOut = teller.buy(toSweep);
        emit SweptToUSYC(toSweep, usycOut);
    }

    /// @notice Redeem USYC back to USDC, e.g. to fund an outbound payment.
    function redeemFromUSYC(uint256 usycAmount)
        external
        onlyOwner
        nonReentrant
        returns (uint256 usdcOut)
    {
        if (!usyc.approve(address(teller), usycAmount)) revert ApprovalFailed();
        usdcOut = teller.sell(usycAmount);
        emit RedeemedFromUSYC(usycAmount, usdcOut);
    }

    /// @notice Send USDC out of the treasury (ops, payouts, settlements).
    function payout(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (!usdc.transfer(to, amount)) revert TransferFailed();
        emit PaidOut(to, amount);
    }

    /// @notice Total reserves valued in USDC: liquid USDC plus the USYC holding
    ///         marked to the current oracle price. 6 decimals.
    function totalReserves() external view returns (uint256) {
        uint256 usdcBal = usdc.balanceOf(address(this));
        uint256 usycBal = usyc.balanceOf(address(this));
        uint256 p = uint256(oracle.latestAnswer()); // 8 decimals
        uint256 usycAsUsdc = (usycBal * p) / PRICE_SCALE; // 6dp * 8dp / 1e8 = 6dp
        return usdcBal + usycAsUsdc;
    }

    // --- admin ---

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperChanged(_keeper);
    }

    function setIdleThreshold(uint256 t) external onlyOwner {
        idleThreshold = t;
        emit IdleThresholdChanged(t);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }
}
