// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IYieldTeller {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

interface IYieldPriceOracle {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title KarwanYieldPool
/// @notice Holds USDC for allowlisted client contracts (escrow versions, the
///         stake vault) and subscribes the surplus above a liquid buffer to
///         USYC. Nobody holds the money: the only ways out are a client taking
///         back its own principal, and yield above principal going to the fee
///         treasury. There is no operator withdrawal.
///
///         Long-lived by design. Circle whitelists this address for USYC once,
///         and new escrow versions are added as clients instead of redeploying.
///         The owner is expected to be a timelock behind the owner Safe.
contract KarwanYieldPool is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_BUFFER_BPS = 5_000;
    uint256 public constant MAX_STALENESS_CAP = 7 days;

    IERC20 public immutable usdc;
    /// @notice 10 ** oracle decimals. USYC price is USDC per USYC in this scale.
    uint256 public immutable priceScale;

    address public treasury;
    IYieldTeller public teller;
    IERC20 public usyc;
    IYieldPriceOracle public oracle;
    uint256 public maxStaleness = 1 days;

    /// @notice Liquid USDC kept on hand: max(bufferFloor, bufferBps of principal).
    uint256 public bufferBps = 1_000;
    uint256 public bufferFloor = 5_000e6;
    /// @notice Cushion kept above principal. It absorbs NAV moves and the
    ///         Teller's rounding (each partial redemption can round down by one
    ///         unit), so a pool at zero deficit can always repay every client in
    ///         full. Yield is only swept above it; a backstop restores it.
    uint256 public yieldMargin = 100e6;
    uint256 public constant MIN_YIELD_MARGIN = 1e6;

    mapping(address => bool) public isClient;
    mapping(address => uint256) public principalOf;
    uint256 public totalPrincipal;

    event ClientSet(address indexed client, bool allowed);
    event TreasurySet(address indexed treasury);
    event TellerSet(address indexed teller, address indexed usyc, address indexed oracle);
    event BufferSet(uint256 bufferBps, uint256 bufferFloor);
    event YieldMarginSet(uint256 margin);
    event MaxStalenessSet(uint256 secs);
    event Deposited(address indexed client, uint256 amount, uint256 principalAfter);
    event Withdrawn(address indexed client, uint256 amount, uint256 principalAfter);
    event Subscribed(uint256 usdcIn, uint256 usycOut);
    event Redeemed(uint256 usycIn, uint256 usdcOut);
    event SubscribeFailed(uint256 usdcIn);
    event YieldSwept(address indexed treasury, uint256 amount);
    event Backstopped(address indexed from, uint256 amount);

    error NotClient();
    error ZeroAddress();
    error ZeroAmount();
    error ExceedsPrincipal();
    error InsufficientLiquidity();
    error TellerHoldsUsyc();
    error InvalidBuffer();
    error InvalidStaleness();
    error NoYield();
    error TreasuryNotSet();

    constructor(address _usdc, uint8 _priceDecimals, address _owner) Ownable(_owner) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        priceScale = 10 ** _priceDecimals;
    }

    // ============================ Configuration ============================

    /// @notice Add or remove a client. Removal only stops new deposits: a
    ///         removed client can always take back its own principal, so old
    ///         deals finish on an old escrow version.
    function setClient(address client, bool allowed) external onlyOwner {
        if (client == address(0)) revert ZeroAddress();
        isClient[client] = allowed;
        emit ClientSet(client, allowed);
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    /// @notice Wire or unwire USYC. Refused while the pool holds USYC, so a
    ///         redemption path is never orphaned. All three zero unwires.
    function setTeller(address _teller, address _usyc, address _oracle) external onlyOwner {
        if (address(usyc) != address(0) && usyc.balanceOf(address(this)) > 0) revert TellerHoldsUsyc();
        if (address(teller) != address(0)) usdc.forceApprove(address(teller), 0);
        bool unwire = _teller == address(0) && _usyc == address(0) && _oracle == address(0);
        if (!unwire && (_teller == address(0) || _usyc == address(0) || _oracle == address(0))) revert ZeroAddress();
        teller = IYieldTeller(_teller);
        usyc = IERC20(_usyc);
        oracle = IYieldPriceOracle(_oracle);
        emit TellerSet(_teller, _usyc, _oracle);
    }

    function setBuffer(uint256 _bufferBps, uint256 _bufferFloor) external onlyOwner {
        if (_bufferBps > MAX_BUFFER_BPS) revert InvalidBuffer();
        bufferBps = _bufferBps;
        bufferFloor = _bufferFloor;
        emit BufferSet(_bufferBps, _bufferFloor);
    }

    function setYieldMargin(uint256 margin) external onlyOwner {
        if (margin < MIN_YIELD_MARGIN) revert InvalidBuffer();
        yieldMargin = margin;
        emit YieldMarginSet(margin);
    }

    function setMaxStaleness(uint256 secs) external onlyOwner {
        if (secs == 0 || secs > MAX_STALENESS_CAP) revert InvalidStaleness();
        maxStaleness = secs;
        emit MaxStalenessSet(secs);
    }

    // =============================== Clients ===============================

    function deposit(uint256 amount) external nonReentrant {
        if (!isClient[msg.sender]) revert NotClient();
        if (amount == 0) revert ZeroAmount();
        principalOf[msg.sender] += amount;
        totalPrincipal += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount, principalOf[msg.sender]);
    }

    /// @notice Take back `amount` of the caller's own principal, to the caller.
    ///         Pays exactly `amount` or reverts with nothing moved.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > principalOf[msg.sender]) revert ExceedsPrincipal();
        principalOf[msg.sender] -= amount;
        totalPrincipal -= amount;
        _ensureLiquid(amount);
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, principalOf[msg.sender]);
    }

    // ============================== Yield path =============================

    function bufferTarget() public view returns (uint256) {
        uint256 byBps = (totalPrincipal * bufferBps) / BPS;
        return byBps > bufferFloor ? byBps : bufferFloor;
    }

    /// @notice Move the pool toward its buffer target. Anyone can call it. A
    ///         Teller that refuses (not entitled, paused) never reverts this.
    function rebalance() external nonReentrant {
        if (address(teller) == address(0)) return;
        uint256 liquid = usdc.balanceOf(address(this));
        uint256 target = bufferTarget();
        if (liquid > target) {
            uint256 excess = liquid - target;
            usdc.forceApprove(address(teller), excess);
            try teller.deposit(excess, address(this)) returns (uint256 shares) {
                emit Subscribed(excess, shares);
            } catch {
                emit SubscribeFailed(excess);
            }
            usdc.forceApprove(address(teller), 0);
        } else if (liquid < target) {
            _tryRedeemFor(target - liquid);
        }
    }

    /// @notice Pool value with USYC at the lower of oracle price and par.
    ///         A stale or broken oracle values USYC at zero for this purpose,
    ///         so yield can never be swept on a bad price.
    function conservativeValue() public view returns (uint256) {
        uint256 liquid = usdc.balanceOf(address(this));
        if (address(usyc) == address(0)) return liquid;
        uint256 shares = usyc.balanceOf(address(this));
        if (shares == 0) return liquid;
        (bool ok, uint256 price) = _price();
        if (!ok) return liquid;
        if (price > priceScale) price = priceScale;
        return liquid + (shares * price) / priceScale;
    }

    /// @notice Shortfall against principal plus margin at the conservative
    ///         value. Non-zero means the treasury owes the pool a top-up; no
    ///         yield can be swept until it is zero.
    function deficit() external view returns (uint256) {
        uint256 value = conservativeValue();
        uint256 line = totalPrincipal + yieldMargin;
        return value >= line ? 0 : line - value;
    }

    /// @notice Send yield above principal plus margin to the fee treasury, in
    ///         USDC, without dipping into the buffer. Anyone can call it.
    function sweepYield() external nonReentrant {
        if (treasury == address(0)) revert TreasuryNotSet();
        uint256 value = conservativeValue();
        uint256 floor = totalPrincipal + yieldMargin;
        if (value <= floor) revert NoYield();
        uint256 amount = value - floor;
        uint256 liquid = usdc.balanceOf(address(this));
        uint256 keep = bufferTarget();
        uint256 spare = liquid > keep ? liquid - keep : 0;
        if (spare < amount) amount = spare;
        if (amount == 0) revert NoYield();
        usdc.safeTransfer(treasury, amount);
        emit YieldSwept(treasury, amount);
    }

    /// @notice Top up the pool (the treasury covering a NAV shortfall). Adds
    ///         value without adding principal.
    function backstop(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Backstopped(msg.sender, amount);
    }

    // =============================== Internals =============================

    function _ensureLiquid(uint256 need) internal {
        uint256 liquid = usdc.balanceOf(address(this));
        if (liquid >= need) return;
        _redeemFor(need - liquid);
        if (usdc.balanceOf(address(this)) < need) revert InsufficientLiquidity();
    }

    /// @dev Redeem enough USYC for `gap` USDC at the current price (par if the
    ///      price is unknown), capped at holdings. Reverts if the Teller does.
    function _redeemFor(uint256 gap) internal {
        if (address(teller) == address(0)) revert InsufficientLiquidity();
        uint256 held = usyc.balanceOf(address(this));
        if (held == 0) revert InsufficientLiquidity();
        uint256 shares = _sharesFor(gap, held);
        uint256 out = teller.redeem(shares, address(this), address(this));
        emit Redeemed(shares, out);
    }

    function _tryRedeemFor(uint256 gap) internal {
        uint256 held = usyc.balanceOf(address(this));
        if (held == 0) return;
        uint256 shares = _sharesFor(gap, held);
        try teller.redeem(shares, address(this), address(this)) returns (uint256 out) {
            emit Redeemed(shares, out);
        } catch {}
    }

    function _sharesFor(uint256 gap, uint256 held) internal view returns (uint256 shares) {
        (bool ok, uint256 price) = _price();
        if (!ok || price >= priceScale) {
            shares = gap;
        } else {
            shares = (gap * priceScale + price - 1) / price;
        }
        if (shares > held) shares = held;
    }

    function _price() internal view returns (bool ok, uint256 price) {
        if (address(oracle) == address(0)) return (false, 0);
        try oracle.latestRoundData() returns (uint80 roundId, int256 answer, uint256, uint256 updatedAt, uint80 answeredInRound) {
            if (answer <= 0 || answeredInRound < roundId || updatedAt + maxStaleness < block.timestamp) {
                return (false, 0);
            }
            return (true, uint256(answer));
        } catch {
            return (false, 0);
        }
    }
}
