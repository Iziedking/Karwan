// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KarwanSettlementBase} from "../../../src/suite/KarwanSettlementBase.sol";

/// @notice A family with no rules of its own: anyone may move any deal's money
///         to anyone. It stands in for a hostile or broken family, so every test
///         against it shows what the base alone guarantees.
contract TestFamily is KarwanSettlementBase {
    mapping(bytes32 => bool) public longstopped;

    constructor(address hub_) KarwanSettlementBase(hub_, "KarwanTestFamily", "1") {}

    function open(bytes32 dealId, address asset, address[] calldata payees, uint64 horizon) external {
        _open(dealId, asset, msg.sender, payees, horizon);
    }

    function accept(bytes32 dealId) external {
        _markConsent(dealId, msg.sender);
    }

    function addPayee(bytes32 dealId, address payee) external {
        _addPayee(dealId, payee);
    }

    function fund(bytes32 dealId, uint256 amount) external nonReentrant {
        _fund(dealId, amount);
    }

    function pledge(bytes32 dealId, uint256 amount) external {
        _pledge(dealId, amount);
    }

    function pay(bytes32 dealId, address party, uint256 amount) external nonReentrant {
        _payTo(dealId, party, amount);
    }

    function claim(bytes32 dealId, address party, uint256 amount) external nonReentrant {
        _requireNotHeld(dealId);
        _payTo(dealId, party, amount);
    }

    function payFee(bytes32 dealId, uint256 amount) external nonReentrant {
        _payFee(dealId, amount);
    }

    function close(bytes32 dealId) external {
        _close(dealId);
    }

    function recordOutcome(bytes32 dealId, uint8 party, uint8 outcome, uint16 detail) external {
        _recordOutcome(dealId, party, outcome, detail);
    }

    function extendHorizon(bytes32 dealId, uint64 horizon) external {
        _extendHorizon(dealId, horizon);
    }

    function _onLongstop(bytes32 dealId) internal override {
        longstopped[dealId] = true;
    }
}
