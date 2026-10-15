// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreFixture} from "./CreFixture.sol";
import {AgreementTerms} from "../../../src/suite/agreement/AgreementTypes.sol";

/// Values the TypeScript encoders in cre/shared must reproduce byte for byte
/// (cre/shared/adapterReport.test.ts and suiteAbi.test.ts assert the same).
contract CreVectorsTest is CreFixture {
    function setUp() public {
        _deployCre();
        vm.chainId(5_042_002);
    }

    function vectorTerms() internal pure returns (AgreementTerms memory t) {
        t.asset = address(0xA55E7);
        t.seller = address(0x5E11E2);
        t.amount = 250e6;
        t.trancheBps[0] = 6_000;
        t.trancheBps[1] = 4_000;
        t.acceptBy = 1_800_000_000;
        t.deliveryDeadline = 1_801_000_000;
        t.reclaimGrace = 2 days;
        t.reviewWindow = 3 days;
        t.startLongstop = 4 days;
        t.extensionSecs = 1 days;
        t.silentLongstop = 14 days;
        t.reviewStarts = 2;
        t.maxExtensions = 2;
        t.finalRelease = 1;
        t.silenceOutcome = 0;
        t.partialBps = 5_000;
        t.fallbackBps = 2_500;
        t.parts = 0;
        t.partEvery = 0;
        t.cancelFeeBps = 0;
        t.sellerStake = 10e6;
        t.verifier = address(0xC4EC4);
        t.checkPolicy = keccak256("policy");
        t.agreementHash = keccak256("agreement");
    }

    function test_check_digest_vector() public view {
        assertEq(
            adapter.checkDigest(address(0xC4EC4), address(0xF4A1), keccak256("deal"), 3, true, keccak256("evidence")),
            0x255c3668615ec4ad815e07b1404c255ab19fcdae2c2689e759483bc12aa3050b
        );
    }

    function test_terms_hash_vector() public view {
        assertEq(escrow.termsHashOf(vectorTerms()), 0x5f8b3fed76a77cfc7acd75f7f5498d7e3a79ea6b1cca5c892645ddea42c7cd9b);
    }
}
