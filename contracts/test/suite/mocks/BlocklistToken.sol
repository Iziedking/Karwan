// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Behaves like USDC where it matters to escrow: 6 decimals, and a
///         transfer to or from a blocked address reverts.
contract BlocklistToken is ERC20 {
    uint8 private immutable _decimals;
    mapping(address => bool) public blocked;

    constructor(uint8 decimals_) ERC20("Test USD", "TUSD") {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address who, bool isBlocked) external {
        blocked[who] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        require(!blocked[from] && !blocked[to], "blocked");
        super._update(from, to, value);
    }
}

/// @notice Delivers 1% less than it was asked to move.
contract SkimToken is BlocklistToken {
    constructor() BlocklistToken(6) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 skim = value / 100;
            super._update(from, address(0xdead), skim);
            value -= skim;
        }
        super._update(from, to, value);
    }
}
