// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BlocklistToken} from "./BlocklistToken.sol";

/// @notice Charges the sender 1% on top of every transfer: the receiver gets
///         exactly what was asked, and the sender loses more.
contract SettlementSenderFeeToken is BlocklistToken {
    constructor() BlocklistToken(6) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) super._update(from, address(0xdead), value / 100);
        super._update(from, to, value);
    }
}
