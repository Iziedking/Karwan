// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BlocklistToken} from "./BlocklistToken.sol";

contract MockShare is ERC20 {
    address public immutable teller;

    constructor() ERC20("Mock USYC", "mUSYC") {
        teller = msg.sender;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == teller, "teller");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == teller, "teller");
        _burn(from, amount);
    }
}

/// @notice Behaves like the USYC Teller where it matters to the pool: only
///         entitled addresses subscribe or redeem, it can be paused, its price
///         moves, buying a share can cost a spread over selling it, and its
///         quotes round against the caller. Raising the price
///         mints the asset into the Teller so redemptions can be paid.
contract MockTeller {
    uint256 internal constant ONE = 1e18;

    BlocklistToken public immutable asset_;
    MockShare public immutable share_;
    uint256 public price = 1.14e18;
    /// How much dearer a share is to buy than to sell, in basis points.
    uint256 public spreadBps;
    /// Mints this much less than it quotes, in basis points.
    uint256 public shortBps;
    /// Refuses a redemption of more shares than this; zero for no limit.
    uint256 public redeemLimit;
    bool public paused;
    mapping(address => bool) public entitled;

    error NotPermissioned();
    error Paused();

    constructor(BlocklistToken asset__) {
        asset_ = asset__;
        share_ = new MockShare();
    }

    function asset() external view returns (address) {
        return address(asset_);
    }

    function share() external view returns (address) {
        return address(share_);
    }

    function entitle(address who, bool ok) external {
        entitled[who] = ok;
    }

    function setPaused(bool p) external {
        paused = p;
    }

    /// Moves the price; a rise is backed by minting the asset into the Teller.
    function setPrice(uint256 p) external {
        uint256 supply = share_.totalSupply();
        uint256 need = (supply * p) / ONE;
        uint256 have = asset_.balanceOf(address(this));
        if (need > have) asset_.mint(address(this), need - have);
        price = p;
    }

    function setSpread(uint256 bps) external {
        spreadBps = bps;
    }

    function setShort(uint256 bps) external {
        shortBps = bps;
    }

    function setRedeemLimit(uint256 shares) external {
        redeemLimit = shares;
    }

    function maxDeposit(address who) external view returns (uint256) {
        return entitled[who] && !paused ? type(uint256).max : 0;
    }

    function previewDeposit(uint256 assets) public view returns (uint256) {
        return (assets * ONE * 10_000) / (price * (10_000 + spreadBps));
    }

    function previewRedeem(uint256 shares) public view returns (uint256) {
        return (shares * price) / ONE;
    }

    function previewWithdraw(uint256 assets) public view returns (uint256) {
        return (assets * ONE + price - 1) / price;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        if (!entitled[msg.sender] || !entitled[receiver]) revert NotPermissioned();
        if (paused) revert Paused();
        shares = (previewDeposit(assets) * (10_000 - shortBps)) / 10_000;
        IERC20(address(asset_)).transferFrom(msg.sender, address(this), assets);
        share_.mint(receiver, shares);
    }

    function redeem(uint256 shares, address receiver, address account) external returns (uint256 assets) {
        if (!entitled[msg.sender] || !entitled[receiver]) revert NotPermissioned();
        if (paused) revert Paused();
        require(account == msg.sender, "account");
        require(redeemLimit == 0 || shares <= redeemLimit, "limit");
        assets = previewRedeem(shares);
        share_.burn(account, shares);
        IERC20(address(asset_)).transfer(receiver, assets);
    }
}
