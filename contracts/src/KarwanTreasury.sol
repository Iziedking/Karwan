// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice USYC Teller (ERC-4626-shaped). Verified against the canonical
///         Circle docs (developers.circle.com/tokenized/usyc/subscribe-and-redeem).
///         MockUSYC implements this exactly so the testnet path is the same
///         shape as mainnet — the swap is a redeploy with addresses, not a
///         code change.
interface IUSYCTeller {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

/// @notice Chainlink-aggregator-style oracle for USYC/USD. 8-decimal price.
interface IPriceOracle {
    function latestAnswer() external view returns (int256);
}

/// @title KarwanTreasury
/// @notice Collects Karwan's platform fees in USDC and parks idle balance in
///         USYC so the protocol's reserves earn yield instead of sitting
///         flat. Wired into KarwanEscrow as the immutable `treasury` slot —
///         fees flow here on every milestone release.
///
///         v2.E rewrite vs the original 2026-05-25 deploy:
///           - Teller interface fixed to ERC-4626 deposit/redeem (the old
///             buy/sell shape would have reverted against real Hashnote USYC).
///           - Added entitlement-agnostic yield path (withdrawForYield /
///             depositFromYield) for the case where Circle entitles only an
///             operator EOA instead of the Treasury contract address.
///
///         Roles:
///           owner   — redeems USYC, pays out, rotates keeper, sets the
///                     idle threshold.
///           keeper  — sweeps idle USDC into USYC and runs the
///                     entitlement-agnostic withdrawForYield / depositFromYield
///                     pair. An automation wallet (cron) or operator EOA.
contract KarwanTreasury is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IUSYCTeller public immutable teller;
    IERC20 public immutable usyc;
    IPriceOracle public immutable oracle;

    address public owner;
    address public keeper;

    /// @notice USDC kept liquid for outbound payments. Only the balance ABOVE
    ///         this is swept into USYC by sweepToUSYC. 6 decimals.
    uint256 public idleThreshold;

    /// @notice USDC pulled out by the keeper for off-chain yield routing
    ///         (entitlement-agnostic path). totalReserves accounts for it.
    uint256 public outForYield;

    /// @notice Price scale of the oracle (8 decimals, 1e8 = $1.00).
    uint256 private constant PRICE_SCALE = 1e8;

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
    event YieldWithdrawn(address indexed keeper, uint256 amount, uint256 outForYieldAfter);
    event YieldDeposited(address indexed keeper, uint256 amount, uint256 outForYieldAfter, uint256 surplus);

    error NotOwner();
    error NotKeeper();
    error NothingToSweep();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientLiquidUsdc();

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
        teller = IUSYCTeller(_teller);
        usyc = IERC20(_usyc);
        oracle = IPriceOracle(_oracle);
        owner = msg.sender;
        keeper = _keeper;
        idleThreshold = _idleThreshold;
    }

    /* =============================================================== */
    /*                          DEPOSITS                                */
    /* =============================================================== */

    /// @notice Pull `amount` USDC from the caller into the treasury. The
    ///         escrow (or anyone topping up reserves) calls this after
    ///         approving the treasury. Open by design — anyone can fund the
    ///         protocol's reserves, that's the polar-opposite of risky.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /* =============================================================== */
    /*                ON-CHAIN YIELD (Treasury entitled)                */
    /* =============================================================== */

    /// @notice Sweep USDC above the idle threshold into USYC via the
    ///         on-chain Teller path. Requires the Treasury contract address
    ///         to be entitled — if Circle entitled only an EOA, use
    ///         withdrawForYield instead.
    function sweepToUSYC() external onlyKeeper nonReentrant returns (uint256 usycOut) {
        uint256 bal = usdc.balanceOf(address(this));
        if (bal <= idleThreshold) revert NothingToSweep();
        uint256 toSweep = bal - idleThreshold;
        // forceApprove via SafeERC20 — handles non-zero→non-zero allowance
        // resets on weird tokens (USDT-style behaviour) and never leaves a
        // stale approval on a deprecated Teller.
        usdc.forceApprove(address(teller), toSweep);
        usycOut = teller.deposit(toSweep, address(this));
        emit SweptToUSYC(toSweep, usycOut);
    }

    /// @notice Redeem USYC back to USDC via the on-chain Teller path. Owner-
    ///         only because this primes outbound payments.
    function redeemFromUSYC(uint256 usycAmount)
        external
        onlyOwner
        nonReentrant
        returns (uint256 usdcOut)
    {
        if (usycAmount == 0) revert ZeroAmount();
        usyc.forceApprove(address(teller), usycAmount);
        usdcOut = teller.redeem(usycAmount, address(this), address(this));
        emit RedeemedFromUSYC(usycAmount, usdcOut);
    }

    /* =============================================================== */
    /*       OFF-CHAIN YIELD (operator EOA entitled, contract not)      */
    /* =============================================================== */

    /// @notice Pull `amount` USDC out for off-chain yield routing — used
    ///         when the USYC Entitlements contract permits only the keeper
    ///         EOA (not the Treasury contract address) to hold USYC. The
    ///         keeper subscribes off-chain and returns USDC via
    ///         depositFromYield. Keeper-only.
    function withdrawForYield(uint256 amount) external onlyKeeper nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = usdc.balanceOf(address(this));
        if (bal < amount) revert InsufficientLiquidUsdc();
        outForYield += amount;
        usdc.safeTransfer(keeper, amount);
        emit YieldWithdrawn(keeper, amount, outForYield);
    }

    /// @notice Return USDC from off-chain yield routing. Caller approves the
    ///         treasury for `amount` USDC; the contract pulls it in. `amount`
    ///         can exceed outForYield — the surplus is the realised yield
    ///         from the Teller round-trip and stays in the treasury.
    function depositFromYield(uint256 amount) external onlyKeeper nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(keeper, address(this), amount);
        uint256 surplus;
        if (amount > outForYield) {
            surplus = amount - outForYield;
            outForYield = 0;
        } else {
            outForYield -= amount;
        }
        emit YieldDeposited(keeper, amount, outForYield, surplus);
    }

    /* =============================================================== */
    /*                          OUTBOUND                                */
    /* =============================================================== */

    /// @notice Send USDC out of the treasury for ops, payouts, settlements.
    function payout(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransfer(to, amount);
        emit PaidOut(to, amount);
    }

    /* =============================================================== */
    /*                              VIEWS                               */
    /* =============================================================== */

    /// @notice Total reserves valued in USDC: liquid USDC + USYC marked to
    ///         oracle + USDC currently out for off-chain yield. 6 decimals.
    function totalReserves() external view returns (uint256) {
        uint256 usdcBal = usdc.balanceOf(address(this));
        uint256 usycBal = usyc.balanceOf(address(this));
        uint256 p = uint256(oracle.latestAnswer()); // 8dp
        uint256 usycAsUsdc = (usycBal * p) / PRICE_SCALE; // 6dp * 8dp / 1e8 = 6dp
        return usdcBal + usycAsUsdc + outForYield;
    }

    /* =============================================================== */
    /*                              ADMIN                               */
    /* =============================================================== */

    function setKeeper(address _keeper) external onlyOwner {
        if (_keeper == address(0)) revert ZeroAddress();
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
