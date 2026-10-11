// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice One signature check for every kind of party wallet: an EOA, an EOA
///         delegated under EIP-7702 to code that may not implement ERC-1271,
///         and a smart account or passkey wallet that does. ECDSA signatures
///         may be 65 bytes or 64 bytes (EIP-2098). A smart account or passkey
///         wallet must be deployed on Arc before it can sign: a wallet with no
///         code yet has nothing to answer ERC-1271.
library SigCheck {
    function isValid(address signer, bytes32 digest, bytes memory sig) internal view returns (bool) {
        if (signer == address(0)) return false;
        address recovered;
        ECDSA.RecoverError err;
        if (sig.length == 64) {
            (bytes32 r, bytes32 vs) = abi.decode(sig, (bytes32, bytes32));
            (recovered, err,) = ECDSA.tryRecover(digest, r, vs);
        } else {
            (recovered, err,) = ECDSA.tryRecover(digest, sig);
        }
        if (err == ECDSA.RecoverError.NoError && recovered == signer) return true;
        return signer.code.length != 0 && SignatureChecker.isValidERC1271SignatureNow(signer, digest, sig);
    }
}
