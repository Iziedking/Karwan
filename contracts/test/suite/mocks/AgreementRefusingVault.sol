// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKarwanStakeVault} from "../../../src/suite/interfaces/IKarwanSuite.sol";

/// @notice A stake vault that takes any reservation and can be set to refuse
///         freeing it or reporting its expiry, the way a broken or hostile
///         vault would fail the escrow's calls.
contract AgreementRefusingVault is IKarwanStakeVault {
    mapping(bytes32 => uint64) public expiryByKey;
    bool public refuseRelease;
    bool public refuseExpiry;

    error Refused();

    function setRefusals(bool release_, bool expiry_) external {
        refuseRelease = release_;
        refuseExpiry = expiry_;
    }

    function reserve(bytes32 ref, address, address, uint128, address, uint64 expiresAt, uint256, bytes calldata)
        external
    {
        expiryByKey[_key(msg.sender, ref)] = expiresAt;
    }

    function extend(bytes32 ref, uint64 expiresAt) external {
        expiryByKey[_key(msg.sender, ref)] = expiresAt;
    }

    function slash(bytes32, uint256) external pure returns (uint256) {
        return 0;
    }

    function release(bytes32 ref) external {
        if (refuseRelease) revert Refused();
        delete expiryByKey[_key(msg.sender, ref)];
    }

    function expiryOf(address family, bytes32 ref) external view returns (uint64) {
        if (refuseExpiry) revert Refused();
        return expiryByKey[_key(family, ref)];
    }

    function _key(address family, bytes32 ref) internal pure returns (bytes32) {
        return keccak256(abi.encode(family, ref));
    }
}
