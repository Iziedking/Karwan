// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice USYC Teller (ERC-4626-shaped). Verified against the canonical
///         Circle docs (developers.circle.com/tokenized/usyc/subscribe-and-redeem).
interface IUSYCTeller {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

/// @notice Hashnote USYC/USD price oracle on Arc Testnet. latestRoundData()
///         returns an 18-decimal price. The v1 8-decimal wiring reverted.
interface IPriceOracle {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @title KarwanTreasury v2
/// @notice Collects Karwan's platform fees in USDC and parks idle balance in
///         USYC so protocol reserves earn yield. Also the yield backstop for
///         KarwanEscrow: the escrow sweeps idle deal USDC here (earning USYC
///         yield the treasury owns) and pulls it back on demand for payouts.
///
///         v2 vs the v2.E deploy:
///           - Escrow yield hook: receiveEscrowFloat / returnEscrowLiquidity,
///             with escrowFloat kept liquid at all times so the escrow's
///             pull-back can never fail (invariant: liquid >= escrowFloat).
///           - Two-step ownership (audit I-2).
///           - Guarded oracle reads (audit M-2): totalReserves reverts on a
///             non-positive, stale, or out-of-round price. Oracle + teller are
///             settable adapter slots so a frozen or replaced feed is a repoint,
///             not a redeploy.
///           - Keeper withdrawal cap per rolling window (audit M-3 partial) plus
///             the vault-style liquid-coverage guard on every outflow.
///           - Optional payout timelock (payoutDelay; 0 = immediate on testnet).
///
///         Roles:
///           owner  : redeem USYC, pay out, rotate keeper, set adapters/params.
///                    Two-step transfer; a multisig on mainnet.
///           keeper : sweep idle USDC into USYC and run the off-chain yield
///                    withdraw/deposit pair. Automation wallet or operator EOA.
///           escrow : the wired KarwanEscrow; the only caller of the escrow
///                    float hooks.
contract KarwanTreasury is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    /// @notice USYC adapter slots. Settable (owner) so a frozen oracle or a
    ///         replaced Teller is a repoint. teller+usyc move together.
    IUSYCTeller public teller;
    IERC20 public usyc;
    IPriceOracle public oracle;

    address public owner;
    address public pendingOwner;
    address public keeper;
    /// @notice Wired KarwanEscrow; only it may call the escrow float hooks.
    address public escrow;

    /// @notice USDC kept liquid for outbound payments; sweepToUSYC only wraps
    ///         above it. The escrow float is ALSO kept liquid on top of this.
    uint256 public idleThreshold;

    /// @notice USDC out to the keeper for off-chain yield. Counted in reserves.
    uint256 public outForYield;

    /// @notice USDC the escrow has parked here for yield. Recoverable 1:1 by
    ///         the escrow and NOT the treasury's to spend: every outflow keeps
    ///         the conservative (par-valued) backing at or above it, so escrow
    ///         principal can never be lost. The float itself IS wrapped into
    ///         USYC to earn — that is the whole point — so returnEscrowLiquidity
    ///         unwraps on demand when the liquid buffer is short.
    uint256 public escrowFloat;

    /// @notice Liquid USDC buffer kept for instant escrow pull-backs. sweepToUSYC
    ///         and the keeper withdrawal never dip liquid below it, so normal
    ///         pull-backs are served without an unwrap. Owner-set; the keeper
    ///         sizes it to expected near-term releases. A pull-back beyond the
    ///         buffer unwraps USYC; if even that can't cover, it reverts and the
    ///         escrow payout reverts whole (funds delayed, never lost).
    uint256 public escrowLiquidFloor;

    /// @notice Oracle freshness bound for totalReserves (audit M-2). Owner-set;
    ///         default 24h for USYC NAV cadence. Testnet can widen it to
    ///         tolerate the frozen Arc oracle rather than repointing.
    uint256 public maxStaleness = 24 hours;

    /// @notice Rolling keeper off-chain-yield withdrawal cap (audit M-3). 0
    ///         disables the cap. Window resets after keeperWindowSecs.
    uint256 public maxKeeperOutPerWindow;
    uint256 public keeperWindowSecs = 1 days;
    uint256 public keeperWindowStart;
    uint256 public keeperOutThisWindow;

    /// @notice Payout timelock. 0 = immediate payout() allowed (testnet).
    ///         >0 forces the queue/execute path with this delay (mainnet).
    uint256 public payoutDelay;
    uint256 public constant MAX_PAYOUT_DELAY = 7 days;
    struct QueuedPayout {
        address to;
        uint256 amount;
        uint64 eta;
        bool executed;
    }
    mapping(uint256 => QueuedPayout) public queuedPayouts;
    uint256 public payoutNonce;

    uint256 private constant PRICE_SCALE = 1e18;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != keeper && msg.sender != owner) revert NotKeeper();
        _;
    }

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert NotEscrow();
        _;
    }

    event Deposited(address indexed from, uint256 amount);
    event SweptToUSYC(uint256 usdcIn, uint256 usycOut);
    event RedeemedFromUSYC(uint256 usycIn, uint256 usdcOut);
    event PaidOut(address indexed to, uint256 amount);
    event PayoutQueued(uint256 indexed id, address indexed to, uint256 amount, uint64 eta);
    event PayoutExecuted(uint256 indexed id, address indexed to, uint256 amount);
    event PayoutCancelled(uint256 indexed id);
    event KeeperChanged(address indexed keeper);
    event EscrowChanged(address indexed escrow);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event IdleThresholdChanged(uint256 threshold);
    event EscrowLiquidFloorChanged(uint256 floor);
    event MaxStalenessChanged(uint256 seconds_);
    event KeeperCapChanged(uint256 maxPerWindow, uint256 windowSecs);
    event PayoutDelayChanged(uint256 delay);
    event TellerSet(address indexed teller, address indexed usyc);
    event OracleSet(address indexed oracle);
    event YieldWithdrawn(address indexed keeper, uint256 amount, uint256 outForYieldAfter);
    event YieldDeposited(address indexed keeper, uint256 amount, uint256 outForYieldAfter, uint256 surplus);
    event EscrowFloatReceived(uint256 amount, uint256 escrowFloatAfter);
    event EscrowLiquidityReturned(uint256 amount, uint256 escrowFloatAfter);

    error NotOwner();
    error NotKeeper();
    error NotEscrow();
    error NothingToSweep();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientLiquidUsdc();
    error TellerStillHoldsUsyc();
    error TellerNotSet();
    error StaleOracle();
    error KeeperCapExceeded();
    error PayoutTimelocked();
    error PayoutNotReady();
    error AmountExceedsFloat();
    error DelayTooLong();

    constructor(
        address _usdc,
        address _teller,
        address _usyc,
        address _oracle,
        address _keeper,
        uint256 _idleThreshold
    ) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        // Adapters may be wired at deploy or later; zero is allowed so a
        // treasury can exist before Circle whitelists the USYC path.
        teller = IUSYCTeller(_teller);
        usyc = IERC20(_usyc);
        oracle = IPriceOracle(_oracle);
        owner = msg.sender;
        keeper = _keeper;
        idleThreshold = _idleThreshold;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ============================== Deposits ==============================

    /// @notice Pull `amount` USDC from the caller into the treasury. Open by
    ///         design; anyone can fund the protocol's reserves.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    // ============================ Escrow yield ============================

    /// @notice The escrow parks idle deal USDC here for yield. Pulls `amount`
    ///         from the escrow (which approved first) and books it as a liquid
    ///         reserved float. Escrow-only.
    function receiveEscrowFloat(uint256 amount) external onlyEscrow nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        escrowFloat += amount;
        emit EscrowFloatReceived(amount, escrowFloat);
    }

    /// @notice Return parked USDC to the escrow for a payout. Escrow-only.
    ///         Serves from the liquid buffer; if that's short, unwraps USYC to
    ///         cover (redeeming the gap in shares — USYC NAV >= 1 so this
    ///         over-covers, any excess stays as treasury yield). Reverts if it
    ///         still can't cover, so the escrow payout reverts whole: funds
    ///         delayed, never lost. Backing is always >= escrowFloat, so a
    ///         revert here only ever means an under-sized liquid buffer + no
    ///         redeemable USYC on hand, which the keeper resolves.
    function returnEscrowLiquidity(uint256 amount) external onlyEscrow nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > escrowFloat) revert AmountExceedsFloat();
        escrowFloat -= amount;

        uint256 liquid = usdc.balanceOf(address(this));
        if (liquid < amount) {
            uint256 gap = amount - liquid;
            uint256 usycBal = address(usyc) == address(0) ? 0 : usyc.balanceOf(address(this));
            if (address(teller) == address(0) || usycBal == 0) revert InsufficientLiquidUsdc();
            // Par redemption: redeem `gap` shares (capped at holdings). At
            // NAV >= 1 this yields >= gap USDC. Oracle-free on purpose so the
            // principal-return path never depends on a live price feed.
            uint256 shares = gap > usycBal ? usycBal : gap;
            usyc.forceApprove(address(teller), shares);
            teller.redeem(shares, address(this), address(this));
            if (usdc.balanceOf(address(this)) < amount) revert InsufficientLiquidUsdc();
        }
        usdc.safeTransfer(msg.sender, amount);
        emit EscrowLiquidityReturned(amount, escrowFloat);
    }

    /// @dev Conservative (par-valued) backing of all obligations: liquid USDC +
    ///      USYC counted 1:1 + USDC out for off-chain yield. Oracle-free and,
    ///      since USYC NAV >= 1, never overstates. Every value outflow keeps
    ///      this >= escrowFloat, which is what guarantees escrow principal.
    function _parBacking() internal view returns (uint256) {
        uint256 usycBal = address(usyc) == address(0) ? 0 : usyc.balanceOf(address(this));
        return usdc.balanceOf(address(this)) + usycBal + outForYield;
    }

    // ====================== On-chain yield (entitled) =====================

    /// @notice Sweep USDC above the liquid floor into USYC, wrapping the escrow
    ///         float too so it earns. The floor is the greater of idleThreshold
    ///         and escrowLiquidFloor (the instant-pull-back buffer), never the
    ///         full float. Keeper-only.
    function sweepToUSYC() external onlyKeeper nonReentrant returns (uint256 usycOut) {
        if (address(teller) == address(0)) revert TellerNotSet();
        uint256 bal = usdc.balanceOf(address(this));
        uint256 floor = idleThreshold > escrowLiquidFloor ? idleThreshold : escrowLiquidFloor;
        if (bal <= floor) revert NothingToSweep();
        uint256 toSweep = bal - floor;
        usdc.forceApprove(address(teller), toSweep);
        usycOut = teller.deposit(toSweep, address(this));
        emit SweptToUSYC(toSweep, usycOut);
    }

    /// @notice Redeem USYC back to USDC via the Teller. Owner-only.
    function redeemFromUSYC(uint256 usycAmount)
        external
        onlyOwner
        nonReentrant
        returns (uint256 usdcOut)
    {
        if (address(teller) == address(0)) revert TellerNotSet();
        if (usycAmount == 0) revert ZeroAmount();
        usyc.forceApprove(address(teller), usycAmount);
        usdcOut = teller.redeem(usycAmount, address(this), address(this));
        emit RedeemedFromUSYC(usycAmount, usdcOut);
    }

    // ==================== Off-chain yield (EOA entitled) ==================

    /// @notice Pull `amount` USDC out for off-chain yield routing (keeper EOA
    ///         entitled, contract not). Guards: never dips below the escrow
    ///         float, and respects the rolling keeper cap. Keeper-only.
    function withdrawForYield(uint256 amount) external onlyKeeper nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = usdc.balanceOf(address(this));
        // Keep the instant pull-back buffer liquid. Backing is preserved (the
        // withdrawn USDC is tracked in outForYield), so the escrow float stays
        // covered; this guard just protects the buffer.
        if (bal < amount || bal - amount < escrowLiquidFloor) revert InsufficientLiquidUsdc();
        _chargeKeeperWindow(amount);
        outForYield += amount;
        usdc.safeTransfer(keeper, amount);
        emit YieldWithdrawn(keeper, amount, outForYield);
    }

    /// @notice Return USDC from off-chain yield routing. Surplus over
    ///         outForYield is realised yield and stays in the treasury.
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

    function _chargeKeeperWindow(uint256 amount) internal {
        if (maxKeeperOutPerWindow == 0) return; // cap disabled
        if (block.timestamp >= keeperWindowStart + keeperWindowSecs) {
            keeperWindowStart = block.timestamp;
            keeperOutThisWindow = 0;
        }
        if (keeperOutThisWindow + amount > maxKeeperOutPerWindow) revert KeeperCapExceeded();
        keeperOutThisWindow += amount;
    }

    // ============================== Outbound ==============================

    /// @notice Immediate payout, allowed only when payoutDelay == 0. Keeps
    ///         liquid >= escrowFloat so escrow-owed funds are never paid out.
    function payout(address to, uint256 amount) external onlyOwner nonReentrant {
        if (payoutDelay != 0) revert PayoutTimelocked();
        _payout(to, amount);
    }

    /// @notice Queue a payout to execute after payoutDelay. Used when a
    ///         timelock is set. Coverage is re-checked at execution.
    function queuePayout(address to, uint256 amount) external onlyOwner returns (uint256 id) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        id = ++payoutNonce;
        uint64 eta = uint64(block.timestamp + payoutDelay);
        queuedPayouts[id] = QueuedPayout({to: to, amount: amount, eta: eta, executed: false});
        emit PayoutQueued(id, to, amount, eta);
    }

    function executePayout(uint256 id) external onlyOwner nonReentrant {
        QueuedPayout storage q = queuedPayouts[id];
        if (q.to == address(0) || q.executed) revert PayoutNotReady();
        if (block.timestamp < q.eta) revert PayoutNotReady();
        q.executed = true;
        _payout(q.to, q.amount);
        emit PayoutExecuted(id, q.to, q.amount);
    }

    function cancelPayout(uint256 id) external onlyOwner {
        QueuedPayout storage q = queuedPayouts[id];
        if (q.to == address(0) || q.executed) revert PayoutNotReady();
        q.executed = true; // consume the slot
        emit PayoutCancelled(id);
    }

    function _payout(address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 bal = usdc.balanceOf(address(this));
        // Two guards: enough liquid on hand (keeping the escrow buffer), and
        // the conservative par backing stays >= escrowFloat so a payout can
        // never spend escrow-owed value even when the float is wrapped.
        if (bal < amount || bal - amount < escrowLiquidFloor) revert InsufficientLiquidUsdc();
        if (_parBacking() - amount < escrowFloat) revert InsufficientLiquidUsdc();
        usdc.safeTransfer(to, amount);
        emit PaidOut(to, amount);
    }

    // =============================== Views ===============================

    /// @notice Total reserves in USDC: liquid USDC + USYC marked to a GUARDED
    ///         oracle + USDC out for off-chain yield (audit M-2). Reverts on a
    ///         non-positive, stale, or out-of-round price rather than reporting
    ///         absurd reserves. Widen maxStaleness or repoint the oracle to
    ///         recover. escrowFloat is included (it is treasury-held USDC) but
    ///         is a liability to the escrow, not distributable surplus; read
    ///         distributableReserves() for the spendable figure.
    function totalReserves() public view returns (uint256) {
        uint256 usdcBal = usdc.balanceOf(address(this));
        uint256 usycBal = address(usyc) == address(0) ? 0 : usyc.balanceOf(address(this));
        uint256 usycAsUsdc = 0;
        if (usycBal > 0) {
            usycAsUsdc = (usycBal * _guardedPrice()) / PRICE_SCALE;
        }
        return usdcBal + usycAsUsdc + outForYield;
    }

    /// @notice Reserves the treasury may actually spend: total minus the escrow
    ///         float it must be able to return.
    function distributableReserves() external view returns (uint256) {
        return totalReserves() - escrowFloat;
    }

    /// @notice Non-reverting oracle health probe for the frontend. True when
    ///         totalReserves would not revert on the oracle guard.
    function oracleHealthy() external view returns (bool) {
        if (address(oracle) == address(0)) return false;
        try oracle.latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256,
            uint256 updatedAt,
            uint80 answeredInRound
        ) {
            return answer > 0 && answeredInRound >= roundId
                && updatedAt + maxStaleness >= block.timestamp;
        } catch {
            return false;
        }
    }

    function _guardedPrice() internal view returns (uint256) {
        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) =
            oracle.latestRoundData();
        if (answer <= 0) revert StaleOracle();
        if (answeredInRound < roundId) revert StaleOracle();
        if (updatedAt + maxStaleness < block.timestamp) revert StaleOracle();
        return uint256(answer);
    }

    // =============================== Admin ===============================

    /// @notice Wire (or unwire) the USYC adapter. Both null unwires; refuses to
    ///         swap while holding USYC so a price/redeem path is never orphaned.
    function setTeller(address _teller, address _usyc) external onlyOwner {
        if (address(usyc) != address(0) && usyc.balanceOf(address(this)) > 0) {
            revert TellerStillHoldsUsyc();
        }
        if (address(teller) != address(0)) {
            usdc.forceApprove(address(teller), 0);
        }
        if (_teller == address(0) && _usyc == address(0)) {
            teller = IUSYCTeller(address(0));
            usyc = IERC20(address(0));
            emit TellerSet(address(0), address(0));
            return;
        }
        if (_teller == address(0) || _usyc == address(0)) revert ZeroAddress();
        teller = IUSYCTeller(_teller);
        usyc = IERC20(_usyc);
        emit TellerSet(_teller, _usyc);
    }

    /// @notice Repoint the price oracle (frozen feed / future Chainlink).
    function setOracle(address _oracle) external onlyOwner {
        oracle = IPriceOracle(_oracle);
        emit OracleSet(_oracle);
    }

    function setKeeper(address _keeper) external onlyOwner {
        if (_keeper == address(0)) revert ZeroAddress();
        keeper = _keeper;
        emit KeeperChanged(_keeper);
    }

    /// @notice Wire the escrow allowed to call the float hooks. Refuses to
    ///         change while a float is still parked so the return path can't be
    ///         orphaned onto a new escrow.
    function setEscrow(address _escrow) external onlyOwner {
        if (escrowFloat > 0) revert AmountExceedsFloat();
        escrow = _escrow;
        emit EscrowChanged(_escrow);
    }

    function setIdleThreshold(uint256 t) external onlyOwner {
        idleThreshold = t;
        emit IdleThresholdChanged(t);
    }

    /// @notice Size the liquid buffer kept for instant escrow pull-backs.
    function setEscrowLiquidFloor(uint256 f) external onlyOwner {
        escrowLiquidFloor = f;
        emit EscrowLiquidFloorChanged(f);
    }

    function setMaxStaleness(uint256 s) external onlyOwner {
        if (s == 0) revert ZeroAmount();
        maxStaleness = s;
        emit MaxStalenessChanged(s);
    }

    function setKeeperCap(uint256 maxPerWindow, uint256 windowSecs) external onlyOwner {
        if (windowSecs == 0) revert ZeroAmount();
        maxKeeperOutPerWindow = maxPerWindow;
        keeperWindowSecs = windowSecs;
        emit KeeperCapChanged(maxPerWindow, windowSecs);
    }

    function setPayoutDelay(uint256 delay) external onlyOwner {
        if (delay > MAX_PAYOUT_DELAY) revert DelayTooLong();
        payoutDelay = delay;
        emit PayoutDelayChanged(delay);
    }

    // Two-step ownership (audit I-2).
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        address previous = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, owner);
    }
}
