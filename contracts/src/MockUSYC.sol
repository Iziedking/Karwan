// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal USDC interface (the backing asset).
interface IUSDC {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title MockUSYC
/// @notice Testnet stand-in for Hashnote / Circle USYC. Combines three roles
///         into one contract so a single testnet deployment exercises the full
///         flow:
///           1. USYC ERC-20 token (mint on deposit, burn on redeem)
///           2. Teller — ERC-4626-shaped deposit / redeem against USDC
///           3. Oracle — Chainlink-aggregator-style latestAnswer
///         On mainnet `KarwanTreasury` and `KarwanVault` point at the three
///         real Hashnote addresses instead, so the swap is an env-var change.
///
///         Verified against the canonical Circle docs
///         (developers.circle.com/tokenized/usyc/subscribe-and-redeem):
///           function deposit(uint256 _assets, address _receiver) external returns (uint256);
///           function redeem(uint256 _shares, address _receiver, address _account) external returns (uint256);
///         The earlier MockUSYC used buy/sell which broke the "one-line
///         mainnet swap" claim — fixed here in v2.E.
///
/// @dev USYC is 6 decimals (matching the real token on Arc Testnet). Price is
///      reported with 8 decimals (1e8 = $1.00) to match Chainlink USD feeds.
///      The price ramps linearly from $1.00 at deploy by the configured APY,
///      so testnet redemptions return slightly more USDC over time the way a
///      yield-bearing fund share would. Simulated yield is unbacked by real
///      assets, so `redeem` caps payout at the USDC actually held and
///      `fund()` lets an operator pre-fund the simulated yield from a faucet.
contract MockUSYC {
    /* =============================================================== */
    /*                       ERC-20 (USYC token)                        */
    /* =============================================================== */

    string public constant name = "Mock US Yield Coin";
    string public constant symbol = "USYC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /* =============================================================== */
    /*                       Backing + pricing                          */
    /* =============================================================== */

    IUSDC public immutable usdc;

    /// @notice Price scale: 1e8 = $1.00, matching Chainlink USD feeds.
    uint256 public constant PRICE_SCALE = 1e8;

    /// @notice Annual yield in basis points used to ramp the price linearly.
    uint256 public immutable apyBps;
    uint64 public immutable startedAt;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Emitted on subscribe (USDC -> USYC).
    /// @param caller msg.sender (entity calling the deposit)
    /// @param receiver address the freshly minted USYC was credited to
    /// @param assets USDC amount pulled
    /// @param shares USYC amount minted
    /// @param price USYC/USD at execution (8dp)
    event Deposited(
        address indexed caller,
        address indexed receiver,
        uint256 assets,
        uint256 shares,
        uint256 price
    );

    /// @notice Emitted on redeem (USYC -> USDC).
    /// @param caller msg.sender (entity calling the redeem)
    /// @param receiver address the USDC was credited to
    /// @param account address whose USYC was burned
    /// @param shares USYC amount burned
    /// @param assets USDC amount paid out (may be capped at held balance)
    /// @param price USYC/USD at execution (8dp)
    event Redeemed(
        address indexed caller,
        address indexed receiver,
        address indexed account,
        uint256 shares,
        uint256 assets,
        uint256 price
    );

    error TransferFailed();
    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAmount();
    error ZeroAddress();

    constructor(address _usdc, uint256 _apyBps) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IUSDC(_usdc);
        apyBps = _apyBps;
        startedAt = uint64(block.timestamp);
    }

    /* =============================================================== */
    /*                            Pricing                               */
    /* =============================================================== */

    /// @notice Current USYC/USD price, 8 decimals. Ramps linearly with the
    ///         configured APY since deploy.
    function price() public view returns (uint256) {
        uint256 elapsed = block.timestamp - startedAt;
        uint256 growth = (PRICE_SCALE * apyBps * elapsed) / (10_000 * 365 days);
        return PRICE_SCALE + growth;
    }

    /// @notice Chainlink-aggregator-style price read. 8-decimal, legacy
    ///         interface; KarwanTreasury v3 used this before being patched.
    function latestAnswer() external view returns (int256) {
        return int256(price());
    }

    /// @notice Modern Chainlink interface used by KarwanTreasury v4+. The
    ///         real Hashnote USYC oracle on Arc Testnet exposes only this,
    ///         returning 18-decimal prices. The mock scales the internal
    ///         8-decimal `price()` up by 1e10 to match that surface so
    ///         tests against the patched Treasury read sane numbers.
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt_,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        uint256 p18 = price() * 1e10;
        return (uint80(1), int256(p18), block.timestamp, block.timestamp, uint80(1));
    }

    /* =============================================================== */
    /*                       Teller (ERC-4626 shape)                    */
    /* =============================================================== */

    /// @notice Subscribe to USYC. Caller spends `_assets` USDC, `_receiver`
    ///         receives freshly-minted USYC at the current price.
    ///         Caller must approve this contract for `_assets` USDC first.
    ///
    ///         Matches the real Hashnote Teller signature exactly:
    ///           function deposit(uint256 _assets, address _receiver) external returns (uint256);
    function deposit(uint256 _assets, address _receiver) external returns (uint256 shares) {
        if (_assets == 0) revert ZeroAmount();
        if (_receiver == address(0)) revert ZeroAddress();
        if (!usdc.transferFrom(msg.sender, address(this), _assets)) revert TransferFailed();
        uint256 p = price();
        shares = (_assets * PRICE_SCALE) / p; // 6dp * 1e8 / 8dp = 6dp
        _mint(_receiver, shares);
        emit Deposited(msg.sender, _receiver, _assets, shares, p);
    }

    /// @notice Redeem USYC. `_account` holds the USYC, `_receiver` gets the
    ///         USDC. When `_account != msg.sender`, the caller must hold an
    ///         ERC-20 allowance against `_account` (standard transferFrom
    ///         semantics) — matches the real Teller's expectation of an
    ///         on-chain approval pattern.
    ///
    ///         Matches the real Hashnote Teller signature exactly:
    ///           function redeem(uint256 _shares, address _receiver, address _account) external returns (uint256);
    ///
    ///         Payout capped at USDC held so the mock stays solvent when
    ///         simulated yield hasn't been pre-funded via fund().
    function redeem(uint256 _shares, address _receiver, address _account)
        external
        returns (uint256 assets)
    {
        if (_shares == 0) revert ZeroAmount();
        if (_receiver == address(0) || _account == address(0)) revert ZeroAddress();

        // Allowance check when the caller is redeeming on behalf of another
        // holder. type(uint256).max is treated as an infinite allowance to
        // match standard ERC-20 behaviour.
        if (_account != msg.sender) {
            uint256 a = allowance[_account][msg.sender];
            if (a < _shares) revert InsufficientAllowance();
            if (a != type(uint256).max) allowance[_account][msg.sender] = a - _shares;
        }
        if (balanceOf[_account] < _shares) revert InsufficientBalance();

        uint256 p = price();
        assets = (_shares * p) / PRICE_SCALE; // 6dp * 8dp / 1e8 = 6dp
        _burn(_account, _shares);

        uint256 held = usdc.balanceOf(address(this));
        if (assets > held) assets = held;
        if (!usdc.transfer(_receiver, assets)) revert TransferFailed();
        emit Redeemed(msg.sender, _receiver, _account, _shares, assets, p);
    }

    /// @notice Top up USDC backing so simulated yield can be paid on
    ///         redemption. Open on testnet; anyone can fund the mock from a
    ///         faucet drip.
    function fund(uint256 _amount) external {
        if (_amount == 0) revert ZeroAmount();
        if (!usdc.transferFrom(msg.sender, address(this), _amount)) revert TransferFailed();
    }

    /* =============================================================== */
    /*                          Minimal ERC-20                          */
    /* =============================================================== */

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
