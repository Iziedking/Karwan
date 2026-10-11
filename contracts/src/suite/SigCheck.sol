// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice One signature check for every kind of party wallet: an EOA, an EOA
///         delegated under EIP-7702 to code that may not implement ERC-1271,
///         and a smart account or passkey wallet that does.
library SigCheck {
    function isValid(address signer, bytes32 digest, bytes memory sig) internal view returns (bool) {
        if (signer == address(0)) return false;
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err == ECDSA.RecoverError.NoError && recovered == signer) return true;
        return signer.code.length != 0 && SignatureChecker.isValidERC1271SignatureNow(signer, digest, sig);
    }
}
