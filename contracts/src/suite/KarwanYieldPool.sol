// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IKarwanHub, IKarwanYieldPool} from "./interfaces/IKarwanSuite.sol";

/// @notice The parts of an ERC-4626 Teller the pool uses, such as Circle's USYC
///         Teller on Arc.
interface IYieldTeller {
    function asset() external view returns (address);
    function share() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address account) external returns (uint256 assets);
    function previewDeposit(uint256 assets) external view returns (uint256 shares);
    function previewRedeem(uint256 shares) external view returns (uint256 assets);
    function previewWithdraw(uint256 assets) external view returns (uint256 shares);
    function maxDeposit(address account) external view returns (uint256);
}

/// @title KarwanYieldPool
/// @notice Holds one asset for every registered family that parks deal money
///         in it, and subscribes what sits above a cash buffer to a yield Teller
///         such as USYC. A family takes back exactly what it parked, or the call
///         reverts and the family's payout is owed instead. Nothing is
///         subscribed while the pool holds less than a small margin above what
///         is parked, which the treasury seeds once, to absorb the Teller's
///         rounding. Yield first builds a cushion of 0.5% of what is parked;
///         only value above that goes to the fee recipient. Nobody else can take
///         money out, and the Teller can change only while the pool holds none
///         of its shares. The hub points at one pool per asset, once, because
///         the pool is the address Circle entitles.
contract KarwanYieldPool is IKarwanYieldPool, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_BUFFER_BPS = 5_000;
    uint16 public constant MIN_CUSHION_BPS = 10;
    uint16 public constant MAX_CUSHION_BPS = 500;
    /// Value the pool always keeps above what families parked, against the
    /// Teller's rounding.
    uint256 public constant MIN_MARGIN = 1_000;

    address public immutable hub;
    address public immutable asset;

    IYieldTeller public teller;
    IERC20 public share;
    /// Stopped: nothing new is subscribed and anyone can bring every share back
    /// to cash.
    bool public stopped;
    uint16 public bufferBps = 1_000;
    uint16 public cushionBps = 50;
    uint128 public bufferFloor = 5_000e6;

    mapping(address => uint256) public principalOf;
    uint256 public totalPrincipal;

    event Deposited(address indexed family, uint256 amount);
    event Withdrawn(address indexed family, uint256 amount);
    event Subscribed(uint256 assets, uint256 shares);
    event Redeemed(uint256 shares, uint256 assets);
    event SubscribeFailed(uint256 assets);
    event YieldSwept(address indexed to, uint256 amount);
    event Backstopped(address indexed from, uint256 amount);
    event TellerSet(address indexed teller, address indexed share);
    event Stopped(bool stopped, address indexed by);
    event BufferSet(uint16 bufferBps, uint128 bufferFloor);
    event CushionSet(uint16 cushionBps);

    error NotFamily();
    error NotOwner();
    error NotGuardian();
    error BadAmount();
    error OverPrincipal();
    error Busy();
    error SharesHeld();
    error BadTeller();
    error BadSetting();
    error NoYield();
    error Zero();
    error Uncovered();

    constructor(address hub_, address asset_) {
        if (hub_ == address(0) || asset_ == address(0)) revert Zero();
        hub = hub_;
        asset = asset_;
    }

    modifier onlyOwner() {
        if (msg.sender != Ownable(hub).owner()) revert NotOwner();
        _;
    }

    // ------------------------------ Families ------------------------------

    /// @notice A registered family parks money. The hub must point at this pool
    ///         for the asset, and the asset must still be allowed.
    function deposit(uint256 amount) external nonReentrant {
        IKarwanHub h = IKarwanHub(hub);
        if (!h.isFamily(msg.sender) || h.yieldPoolOf(asset) != address(this) || !h.assetAllowed(asset)) {
            revert NotFamily();
        }
        if (amount == 0) revert BadAmount();
        principalOf[msg.sender] += amount;
        totalPrincipal += amount;
        emit Deposited(msg.sender, amount);
        IERC20 token = IERC20(asset);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) revert BadAmount();
    }

    /// @notice A family takes back exactly `amount` of what it parked, even
    ///         after it was revoked, or nothing moves.
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert BadAmount();
        uint256 mine = principalOf[msg.sender];
        if (amount > mine) revert OverPrincipal();
        principalOf[msg.sender] = mine - amount;
        totalPrincipal -= amount;
        emit Withdrawn(msg.sender, amount);
        _ensureCash(amount);
        IERC20(asset).safeTransfer(msg.sender, amount);
    }

    // -------------------------------- Yield -------------------------------

    /// @notice Anyone moves the pool toward its cash buffer: what sits above it
    ///         is subscribed, and a shortfall is redeemed. A subscription costs
    ///         the gap between the Teller's buying and selling price, so the pool
    ///         subscribes only as much as its value above what families parked
    ///         can pay for, by the Teller's quotes, and undoes a subscription
    ///         that leaves what is parked uncovered; yield pays the cost back. A
    ///         stopped pool redeems everything, half at a time if the Teller
    ///         limits a redemption. A Teller that refuses never makes this
    ///         revert.
    function rebalance() external nonReentrant {
        IYieldTeller t = teller;
        if (address(t) == address(0)) return;
        uint256 cash = IERC20(asset).balanceOf(address(this));
        uint256 shares = share.balanceOf(address(this));
        if (stopped) {
            if (shares != 0 && !_tryRedeem(t, shares)) _tryRedeem(t, shares / 2);
            return;
        }
        uint256 target = bufferTarget();
        if (cash > target) {
            _subscribe(t, cash - target);
        } else if (cash < target && shares != 0) {
            uint256 want = _sharesFor(t, target - cash, shares);
            if (want != 0) _tryRedeem(t, want);
        }
    }

    /// @notice Anyone sends value above what is parked plus the cushion to the
    ///         fee recipient, redeeming shares for it as needed and never
    ///         leaving less cash than the buffer.
    function sweepYield() external nonReentrant {
        uint256 line = totalPrincipal + cushion();
        uint256 keep = bufferTarget();
        uint256 amount = _yieldAbove(line);
        uint256 cash = IERC20(asset).balanceOf(address(this));
        if (cash < keep + amount && address(teller) != address(0)) {
            uint256 want = _sharesFor(teller, keep + amount - cash, share.balanceOf(address(this)));
            if (want != 0) _tryRedeem(teller, want);
            amount = _yieldAbove(line);
            cash = IERC20(asset).balanceOf(address(this));
        }
        uint256 spare = cash > keep ? cash - keep : 0;
        if (amount > spare) amount = spare;
        if (amount == 0) revert NoYield();
        address to = IKarwanHub(hub).feeRecipient();
        emit YieldSwept(to, amount);
        IERC20(asset).safeTransfer(to, amount);
    }

    /// @notice Anyone adds value without adding principal, such as the
    ///         treasury covering a fall in the Teller's price.
    function backstop(uint256 amount) external nonReentrant {
        if (amount == 0) revert BadAmount();
        emit Backstopped(msg.sender, amount);
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    }

    // ------------------------------ Settings ------------------------------

    /// @notice The owner wires a Teller, or zero for cash only, while the pool
    ///         holds no shares worth more than its margin, so a redemption path
    ///         is never lost and dust sent to the pool cannot block the change.
    function setTeller(address teller_) external onlyOwner {
        if (_sharesWorth() > MIN_MARGIN) revert SharesHeld();
        IERC20 nextShare;
        if (teller_ != address(0)) {
            if (IYieldTeller(teller_).asset() != asset) revert BadTeller();
            nextShare = IERC20(IYieldTeller(teller_).share());
            if (address(nextShare) == address(0)) revert BadTeller();
        }
        teller = IYieldTeller(teller_);
        share = nextShare;
        emit TellerSet(teller_, address(nextShare));
    }

    /// @notice The guardian or the owner stops new subscriptions; only the
    ///         owner starts them again.
    function stop() external {
        if (msg.sender != IKarwanHub(hub).guardian() && msg.sender != Ownable(hub).owner()) revert NotGuardian();
        stopped = true;
        emit Stopped(true, msg.sender);
    }

    function resume() external onlyOwner {
        stopped = false;
        emit Stopped(false, msg.sender);
    }

    function setBuffer(uint16 bufferBps_, uint128 bufferFloor_) external onlyOwner {
        if (bufferBps_ > MAX_BUFFER_BPS) revert BadSetting();
        bufferBps = bufferBps_;
        bufferFloor = bufferFloor_;
        emit BufferSet(bufferBps_, bufferFloor_);
    }

    function setCushion(uint16 cushionBps_) external onlyOwner {
        if (cushionBps_ < MIN_CUSHION_BPS || cushionBps_ > MAX_CUSHION_BPS) revert BadSetting();
        cushionBps = cushionBps_;
        emit CushionSet(cushionBps_);
    }

    // -------------------------------- Views -------------------------------

    /// @notice Cash plus what the Teller would pay for the pool's shares now. A
    ///         Teller that cannot quote counts the shares as nothing, so yield
    ///         is never swept on a missing price.
    function value() public view returns (uint256 v) {
        v = IERC20(asset).balanceOf(address(this));
        IYieldTeller t = teller;
        if (address(t) == address(0)) return v;
        uint256 shares = share.balanceOf(address(this));
        if (shares == 0) return v;
        try t.previewRedeem(shares) returns (uint256 q) {
            v += q;
        } catch {}
    }

    function bufferTarget() public view returns (uint256) {
        uint256 byShare = (totalPrincipal * bufferBps) / BPS;
        return byShare > bufferFloor ? byShare : bufferFloor;
    }

    function cushion() public view returns (uint256) {
        return (totalPrincipal * cushionBps) / BPS;
    }

    /// @notice How far value has fallen below what families parked. Until the
    ///         treasury covers it, the last families to withdraw may wait.
    function deficit() external view returns (uint256) {
        uint256 v = value();
        return v >= totalPrincipal ? 0 : totalPrincipal - v;
    }

    // ------------------------------ Internals -----------------------------

    function _yieldAbove(uint256 line) internal view returns (uint256) {
        uint256 v = value();
        if (v <= line) revert NoYield();
        return v - line;
    }

    /// Subscribes up to `excess`, no more than the Teller takes or the value
    /// above what is parked pays for, and undoes it if it leaves what is
    /// parked uncovered.
    function _subscribe(IYieldTeller t, uint256 excess) internal {
        uint256 v = value();
        uint256 line = totalPrincipal + MIN_MARGIN;
        if (v <= line) return;
        uint256 room;
        try t.maxDeposit(address(this)) returns (uint256 m) {
            room = m;
        } catch {}
        if (excess > room) excess = room;
        uint256 cost = _entryCost(t, excess);
        if (cost > v - line) excess = (excess * (v - line)) / cost;
        if (excess == 0) return;
        IERC20(asset).forceApprove(address(t), excess);
        try t.deposit(excess, address(this)) returns (uint256 got) {
            emit Subscribed(excess, got);
            if (value() < totalPrincipal) revert Uncovered();
        } catch {
            emit SubscribeFailed(excess);
        }
        IERC20(asset).forceApprove(address(t), 0);
    }

    function _ensureCash(uint256 need) internal {
        uint256 cash = IERC20(asset).balanceOf(address(this));
        if (cash >= need) return;
        IYieldTeller t = teller;
        if (address(t) == address(0)) revert Busy();
        uint256 shares = share.balanceOf(address(this));
        uint256 want = _sharesFor(t, need - cash, shares);
        if (want == 0) revert Busy();
        _tryRedeem(t, want);
        if (IERC20(asset).balanceOf(address(this)) < need) revert Busy();
    }

    /// What subscribing `assets` and redeeming at once would lose, from the
    /// Teller's own quotes; everything if it cannot quote.
    function _entryCost(IYieldTeller t, uint256 assets) internal view returns (uint256) {
        if (assets == 0) return 0;
        try t.previewDeposit(assets) returns (uint256 shares) {
            try t.previewRedeem(shares) returns (uint256 back) {
                return back >= assets ? 0 : assets - back;
            } catch {}
        } catch {}
        return type(uint256).max;
    }

    function _tryRedeem(IYieldTeller t, uint256 shares) internal returns (bool) {
        try t.redeem(shares, address(this), address(this)) returns (uint256 got) {
            emit Redeemed(shares, got);
            return true;
        } catch {
            return false;
        }
    }

    /// What the Teller would pay for the pool's shares; everything if it
    /// cannot quote, so shares of unknown worth are never abandoned.
    function _sharesWorth() internal view returns (uint256) {
        if (address(share) == address(0)) return 0;
        uint256 shares = share.balanceOf(address(this));
        if (shares == 0) return 0;
        try teller.previewRedeem(shares) returns (uint256 q) {
            return q;
        } catch {
            return type(uint256).max;
        }
    }

    /// Shares to redeem for `gap` of the asset, rounded up by the Teller and
    /// capped at what the pool holds.
    function _sharesFor(IYieldTeller t, uint256 gap, uint256 held) internal view returns (uint256 want) {
        try t.previewWithdraw(gap) returns (uint256 q) {
            want = q;
        } catch {
            return 0;
        }
        if (want > held) want = held;
    }
}
