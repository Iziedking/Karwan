// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReceiver} from "../../../../src/interfaces/IReceiver.sol";

/// Calls `onReport` the way Chainlink's forwarder does: a low-level call that
/// never reverts, with the outcome recorded instead.
contract MockForwarder {
    bool public lastOk;
    bytes public lastError;

    function deliver(address receiver, bytes32 workflowId, bytes10 name, address owner, bytes calldata report)
        external
    {
        bytes memory metadata = abi.encodePacked(workflowId, name, owner, bytes2(0x0001));
        (lastOk, lastError) = receiver.call(abi.encodeCall(IReceiver.onReport, (metadata, report)));
    }

    function deliverRaw(address receiver, bytes calldata metadata, bytes calldata report) external {
        (lastOk, lastError) = receiver.call(abi.encodeCall(IReceiver.onReport, (metadata, report)));
    }
}
