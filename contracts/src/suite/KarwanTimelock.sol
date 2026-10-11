// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title KarwanTimelock
/// @notice Every change to Karwan's contracts waits here in public. The owner
///         Safe queues and executes; the guardian Safe can cancel a queued
///         change; nobody else holds a role, and the delay can never fall below
///         24 hours. The guardian can delay governance, never block it: the
///         owner can queue any change as protected, which waits at least 7 days
///         and only the owner can cancel.
contract KarwanTimelock is TimelockController {
    uint256 public constant FLOOR = 24 hours;
    uint256 public constant PROTECTED_DELAY = 7 days;

    mapping(bytes32 => bool) public isProtected;

    error BelowFloor();
    error Protected();
    error Zero();

    constructor(uint256 minDelay, address ownerSafe, address guardianSafe)
        TimelockController(minDelay, _only(ownerSafe), _only(ownerSafe), address(0))
    {
        if (minDelay < FLOOR) revert BelowFloor();
        if (ownerSafe == address(0) || guardianSafe == address(0)) revert Zero();
        _grantRole(CANCELLER_ROLE, guardianSafe);
    }

    /// @notice Change the delay through the timelock itself, never below the floor.
    function updateDelay(uint256 newDelay) public override {
        if (newDelay < FLOOR) revert BelowFloor();
        super.updateDelay(newDelay);
    }

    /// @notice Queue a change the guardian cannot cancel. It waits the longer
    ///         of the current delay and 7 days.
    function scheduleProtected(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt)
        external
    {
        isProtected[hashOperation(target, value, data, predecessor, salt)] = true;
        uint256 delay = getMinDelay();
        schedule(target, value, data, predecessor, salt, delay > PROTECTED_DELAY ? delay : PROTECTED_DELAY);
    }

    function cancel(bytes32 id) public override {
        if (isProtected[id] && !hasRole(PROPOSER_ROLE, msg.sender)) revert Protected();
        super.cancel(id);
    }

    function _only(address a) private pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = a;
    }
}
