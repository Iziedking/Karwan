// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DealEscrowBase} from "./KarwanDealEscrow.t.sol";
import {DealTerms} from "../src/KarwanDealTypes.sol";

/// Pins the terms hash and deal id the backend computes in
/// backend/src/chain/dealTermsV3.ts. If either side changes its encoding, one
/// of these tests or the backend's parity test fails.
contract DealTermsParityTest is DealEscrowBase {
    bytes32 constant TERMS_HASH = 0xce7c7e18a4e093c2cd817d364850a2655c63c90feb5babf8834bc09711f87300;
    bytes32 constant DEAL_ID = 0x3b69df8c396d46e181c51d86879f7788d787412d3a3b1c1dc93f4005036156df;

    function _parityTerms() internal pure returns (DealTerms memory t) {
        t.seller = address(0x3333333333333333333333333333333333333333);
        t.amount = 1_000_000_000;
        t.pcts[0] = 50;
        t.pcts[1] = 30;
        t.pcts[2] = 20;
        t.reservationBps = 7500;
        t.deliveryDeadline = 1_800_864_000;
        t.reclaimGrace = 86_400;
        t.reviewWindow = 259_200;
        t.reviewStarts = 2;
        t.startLongstop = 604_800;
        t.maxExtensions = 1;
        t.extensionSecs = 259_200;
        t.finalRelease = 1;
        t.silenceOutcome = 0;
        t.silentLongstop = 1_123_200;
        t.checkPolicy = bytes32(0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd);
        t.agreementHash = bytes32(0xabababababababababababababababababababababababababababababababab);
    }

    function test_TermsHashMatchesTheBackend() public view {
        assertEq(escrow.termsHashOf(_parityTerms()), TERMS_HASH);
    }

    function test_DealIdFormulaMatchesTheBackend() public {
        address fixedEscrow = address(0x1111111111111111111111111111111111111111);
        address fixedBuyer = address(0x2222222222222222222222222222222222222222);
        bytes32 salt = bytes32(0x4444444444444444444444444444444444444444444444444444444444444444);
        assertEq(keccak256(abi.encode(uint256(5042002), fixedEscrow, fixedBuyer, salt)), DEAL_ID);

        vm.chainId(5042002);
        assertEq(
            escrow.dealIdFor(fixedBuyer, salt),
            keccak256(abi.encode(uint256(5042002), address(escrow), fixedBuyer, salt)),
            "the contract uses that same formula"
        );
    }
}
