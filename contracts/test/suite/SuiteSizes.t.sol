// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "forge-std/console.sol";
import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanTimelock} from "../../src/suite/KarwanTimelock.sol";
import {KarwanAgreementEscrow} from "../../src/suite/KarwanAgreementEscrow.sol";
import {KarwanCheckVerifier} from "../../src/suite/KarwanCheckVerifier.sol";
import {KarwanTradeFinance} from "../../src/suite/KarwanTradeFinance.sol";
import {KarwanYieldPool} from "../../src/suite/KarwanYieldPool.sol";
import {KarwanTimeEscrow} from "../../src/suite/KarwanTimeEscrow.sol";
import {TimeLib} from "../../src/suite/time/TimeLib.sol";
import {TimeDisputeLib} from "../../src/suite/time/TimeDisputeLib.sol";
import {KarwanJobEscrow} from "../../src/suite/KarwanJobEscrow.sol";
import {JobLib} from "../../src/suite/jobs/JobLib.sol";
import {BountyLib} from "../../src/suite/jobs/BountyLib.sol";
import {JobDisputeLib} from "../../src/suite/jobs/JobDisputeLib.sol";
import {SettlementLib} from "../../src/suite/settlement/SettlementLib.sol";
import {AgreementBounds} from "../../src/suite/agreement/AgreementTypes.sol";
import {AgreementLib} from "../../src/suite/agreement/AgreementLib.sol";
import {AgreementDisputeLib} from "../../src/suite/agreement/AgreementDisputeLib.sol";
import {DisputeLib} from "../../src/suite/dispute/DisputeLib.sol";
import {AgreementDeliveryLib} from "../../src/suite/agreement/AgreementDeliveryLib.sol";
import {AgreementTermsLib} from "../../src/suite/agreement/AgreementTermsLib.sol";

contract SuiteSizesTest is SuiteFixture {
    uint256 internal constant ARC_LIMIT = 24_576;
    uint256 internal constant HEADROOM = 2_048;

    function setUp() public {
        _deploySuite();
    }

    function test_every_contract_keeps_two_kilobytes_of_headroom() public {
        KarwanTimelock tl = new KarwanTimelock(48 hours, makeAddr("o"), makeAddr("g"));
        KarwanAgreementEscrow agreement =
            new KarwanAgreementEscrow(address(hub), AgreementBounds(1 hours, 30 days, 365 days));
        address[] memory signers = new address[](1);
        signers[0] = makeAddr("checker");
        KarwanCheckVerifier verifier = new KarwanCheckVerifier(signers, 1);
        _check("KarwanTimelock", address(tl).code.length);
        _check("KarwanHub", address(hub).code.length);
        _check("KarwanIdentityRegistry", address(identity).code.length);
        _check("KarwanRecord", address(record).code.length);
        _check("TestFamily (settlement base)", address(family).code.length);
        _check("KarwanAgreementEscrow", address(agreement).code.length);
        _check("KarwanCheckVerifier", address(verifier).code.length);
        _check("KarwanStakeVault", address(vault).code.length);
        _check("KarwanTradeFinance", address(new KarwanTradeFinance(address(hub))).code.length);
        _check("KarwanYieldPool", address(new KarwanYieldPool(address(hub), address(usdc))).code.length);
        _check("KarwanTimeEscrow", address(new KarwanTimeEscrow(address(hub))).code.length);
        _check("KarwanJobEscrow", address(new KarwanJobEscrow(address(hub), address(usdc))).code.length);
        _check("SettlementLib", type(SettlementLib).runtimeCode.length);
        _check("AgreementLib", type(AgreementLib).runtimeCode.length);
        _check("AgreementDeliveryLib", type(AgreementDeliveryLib).runtimeCode.length);
        _check("AgreementTermsLib", type(AgreementTermsLib).runtimeCode.length);
        _check("AgreementDisputeLib", type(AgreementDisputeLib).runtimeCode.length);
        _check("DisputeLib", type(DisputeLib).runtimeCode.length);
        _check("TimeLib", type(TimeLib).runtimeCode.length);
        _check("TimeDisputeLib", type(TimeDisputeLib).runtimeCode.length);
        _check("JobLib", type(JobLib).runtimeCode.length);
        _check("BountyLib", type(BountyLib).runtimeCode.length);
        _check("JobDisputeLib", type(JobDisputeLib).runtimeCode.length);
    }

    /// The base is compiled into every family, so its entry points must leave
    /// a family most of the contract for its own entry points.
    function test_settlement_base_stays_small() public view {
        assertLe(address(family).code.length, 9_000);
    }

    function _check(string memory name, uint256 n) internal pure {
        console.log(name, n);
        assertLe(n, ARC_LIMIT - HEADROOM, name);
    }
}
