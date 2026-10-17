// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BlocklistToken} from "./BlocklistToken.sol";

/// @notice A token that, once armed, calls back into a contract while it moves
///         a balance, and keeps how that call ended. It stands for an asset or
///         a receiver that tries to re-enter a contract in the middle of a payment.
contract ReenteringToken is BlocklistToken {
    address public target;
    bytes public data;
    bool public attempted;
    bool public succeeded;
    bytes public reason;

    constructor() BlocklistToken(6) {}

    function arm(address target_, bytes calldata data_) external {
        target = target_;
        data = data_;
        attempted = false;
        succeeded = false;
        delete reason;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        address t = target;
        if (t == address(0) || from == address(0)) return;
        target = address(0);
        attempted = true;
        bytes memory ret;
        (succeeded, ret) = t.call(data);
        if (!succeeded) reason = ret;
    }
}
