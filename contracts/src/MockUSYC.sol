// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal USDC interface (the backing asset).
interface IUSDC {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title MockUSYC
/// @notice Testnet stand-in for Hashnote / Circle USYC. The live product splits
///         three roles across separate contracts: the USYC ERC-20 token, the
///         Teller that subscribes/redeems against USDC, and a Chainlink-style
///         price oracle. This mock combines all three so a single testnet
///         deployment exercises the full flow. On mainnet `KarwanTreasury`
///         points at the three real addresses instead, so the swap is a redeploy
///         with addresses, not a code change.
///
///         Verified against https://usyc.docs.hashnote.com (May 2026):
///           - the Teller exposes `buy(uint256)` (subscribe USDC -> USYC) and
///             `sell(uint256)` (redeem USYC -> USDC), each returning uint256;
///           - USDC is 6 decimals;
///           - the price is NAV / supply, surfaced through an oracle that follows
///             the Chainlink aggregator interface.
///
/// @dev USYC is modelled at 6 decimals and the price at 8 decimals
///      (1e8 = $1.00). The price ramps linearly from $1.00 at deploy by the
///      configured APY, so testnet redemptions return slightly more USDC over
///      time, the way a yield-bearing fund share would. Simulated yield is not
///      backed by real assets, so `sell` caps its payout at the USDC actually
///      held and `fund()` lets an operator pre-fund the simulated yield.
contract MockUSYC {
    // --- ERC-20 (the USYC token) ---
    string public constant name = "Mock US Yield Coin";
    string public constant symbol = "USYC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // --- backing + pricing ---
    IUSDC public immutable usdc;
    /// @notice Price scale: the price is reported with 8 decimals (1e8 = $1.00),
    ///         matching how a Chainlink USD feed reports.
    uint256 public constant PRICE_SCALE = 1e8;
    /// @notice Annual yield in basis points used to ramp the price (e.g. 500 = 5%).
    uint256 public immutable apyBps;
    uint64 public immutable startedAt;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Bought(address indexed buyer, uint256 usdcIn, uint256 usycOut, uint256 price);
    event Sold(address indexed seller, uint256 usycIn, uint256 usdcOut, uint256 price);

    error TransferFailed();
    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAmount();

    constructor(address _usdc, uint256 _apyBps) {
        usdc = IUSDC(_usdc);
        apyBps = _apyBps;
        startedAt = uint64(block.timestamp);
    }

    /// @notice Current USYC price in USDC, 8 decimals. Ramps linearly with the
    ///         configured APY to simulate yield accrual. NAV / supply on the
    ///         real token; a deterministic ramp here.
    function price() public view returns (uint256) {
        uint256 elapsed = block.timestamp - startedAt;
        uint256 growth = (PRICE_SCALE * apyBps * elapsed) / (10_000 * 365 days);
        return PRICE_SCALE + growth;
    }

    /// @notice Chainlink-aggregator-style price read. Returns the 8-decimal price
    ///         as a signed int, the way `AggregatorInterface.latestAnswer` does.
    function latestAnswer() external view returns (int256) {
        return int256(price());
    }

    /// @notice Subscribe: spend USDC, receive freshly minted USYC at the current
    ///         price. Caller must approve this contract for `usdcAmount` first.
    ///         Mirrors `ITeller.buy`.
    function buy(uint256 usdcAmount) external returns (uint256 usycOut) {
        if (usdcAmount == 0) revert ZeroAmount();
        if (!usdc.transferFrom(msg.sender, address(this), usdcAmount)) revert TransferFailed();
        uint256 p = price();
        usycOut = (usdcAmount * PRICE_SCALE) / p; // 6dp * 1e8 / 8dp = 6dp
        _mint(msg.sender, usycOut);
        emit Bought(msg.sender, usdcAmount, usycOut, p);
    }

    /// @notice Redeem: burn USYC, receive USDC at the current price. Mirrors
    ///         `ITeller.sell`. Payout is capped at the USDC held so the mock
    ///         stays solvent when simulated yield has not been pre-funded.
    function sell(uint256 usycAmount) external returns (uint256 usdcOut) {
        if (usycAmount == 0) revert ZeroAmount();
        if (balanceOf[msg.sender] < usycAmount) revert InsufficientBalance();
        uint256 p = price();
        usdcOut = (usycAmount * p) / PRICE_SCALE; // 6dp * 8dp / 1e8 = 6dp
        _burn(msg.sender, usycAmount);
        uint256 held = usdc.balanceOf(address(this));
        if (usdcOut > held) usdcOut = held;
        if (!usdc.transfer(msg.sender, usdcOut)) revert TransferFailed();
        emit Sold(msg.sender, usycAmount, usdcOut, p);
    }

    /// @notice Top up the USDC backing so simulated yield can be paid on
    ///         redemption. Open on testnet; anyone can fund the mock.
    function fund(uint256 usdcAmount) external {
        if (!usdc.transferFrom(msg.sender, address(this), usdcAmount)) revert TransferFailed();
    }

    // --- minimal ERC-20 ---

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a < amount) revert InsufficientAllowance();
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}
