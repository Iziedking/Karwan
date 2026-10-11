// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Stands in for a passkey or smart-account wallet: it accepts any
///         hash its owner key signed, and lets the owner call out as itself.
contract Wallet1271 is IERC1271 {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        (address r, ECDSA.RecoverError e,) = ECDSA.tryRecover(hash, sig);
        return e == ECDSA.RecoverError.NoError && r == owner ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }

    function execute(address target, bytes calldata data) external returns (bytes memory out) {
        require(msg.sender == owner, "owner");
        bool ok;
        (ok, out) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(out, 32), mload(out))
            }
        }
    }
}
