// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SigCheck} from "../../src/suite/SigCheck.sol";
import {Wallet1271} from "./mocks/Wallet1271.sol";

contract SigCheckHarness {
    function isValid(address signer, bytes32 digest, bytes memory sig) external view returns (bool) {
        return SigCheck.isValid(signer, digest, sig);
    }
}

contract SigCheckTest is Test {
    uint256 internal constant N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    bytes32 internal constant DIGEST = keccak256("karwan");
    SigCheckHarness internal h;

    function setUp() public {
        h = new SigCheckHarness();
    }

    function _sign(uint256 key, bytes32 d) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, d);
        return abi.encodePacked(r, s, v);
    }

    function test_eoa_signature_is_valid() public {
        (address w, uint256 k) = makeAddrAndKey("alice");
        assertTrue(h.isValid(w, DIGEST, _sign(k, DIGEST)));
    }

    function test_other_signer_is_refused() public {
        (address w,) = makeAddrAndKey("alice");
        (, uint256 k2) = makeAddrAndKey("mallory");
        assertFalse(h.isValid(w, DIGEST, _sign(k2, DIGEST)));
    }

    function test_zero_signer_is_refused() public {
        (, uint256 k) = makeAddrAndKey("alice");
        assertFalse(h.isValid(address(0), DIGEST, _sign(k, DIGEST)));
    }

    function test_contract_wallet_signs_through_1271() public {
        (address o, uint256 k) = makeAddrAndKey("owner");
        Wallet1271 w = new Wallet1271(o);
        assertTrue(h.isValid(address(w), DIGEST, _sign(k, DIGEST)));
    }

    function test_contract_wallet_refuses_a_stranger() public {
        (address o,) = makeAddrAndKey("owner");
        (, uint256 k2) = makeAddrAndKey("mallory");
        Wallet1271 w = new Wallet1271(o);
        assertFalse(h.isValid(address(w), DIGEST, _sign(k2, DIGEST)));
    }

    function test_delegated_eoa_without_1271_still_signs() public {
        (address w, uint256 k) = makeAddrAndKey("delegated");
        vm.etch(w, abi.encodePacked(hex"ef0100", address(0xBEEF)));
        assertTrue(h.isValid(w, DIGEST, _sign(k, DIGEST)));
    }

    function test_high_s_signature_is_refused() public {
        (address w, uint256 k) = makeAddrAndKey("alice");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(k, DIGEST);
        bytes32 s2 = bytes32(N - uint256(s));
        uint8 v2 = v == 27 ? 28 : 27;
        assertFalse(h.isValid(w, DIGEST, abi.encodePacked(r, s2, v2)));
    }
}
