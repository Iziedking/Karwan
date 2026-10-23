// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KarwanTimelock} from "../../src/suite/KarwanTimelock.sol";
import {KarwanHub} from "../../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../../src/suite/KarwanRecord.sol";
import {KarwanStakeVault} from "../../src/suite/KarwanStakeVault.sol";
import {KarwanAgreementEscrow} from "../../src/suite/KarwanAgreementEscrow.sol";
import {KarwanTimeEscrow} from "../../src/suite/KarwanTimeEscrow.sol";
import {KarwanJobEscrow} from "../../src/suite/KarwanJobEscrow.sol";
import {KarwanTradeFinance} from "../../src/suite/KarwanTradeFinance.sol";
import {KarwanCheckVerifier} from "../../src/suite/KarwanCheckVerifier.sol";
import {AgreementBounds} from "../../src/suite/agreement/AgreementTypes.sol";
import {EndgameConfig} from "./EndgameConfig.sol";

struct EndgameDeployment {
    KarwanTimelock timelock;
    KarwanHub hub;
    KarwanIdentityRegistry identity;
    KarwanRecord record;
    KarwanStakeVault vault;
    KarwanAgreementEscrow agreement;
    KarwanTimeEscrow time;
    KarwanJobEscrow jobs;
    KarwanTradeFinance tradeFinance;
    KarwanCheckVerifier verifier;
}

/// @notice The suite as it deploys. The hub is owned by the timelock from its
///         constructor, so the deployer's only act on it is the one wiring
///         the hub allows; everything else is the first batch, which the owner
///         Safe queues and executes through the timelock.
library EndgameDeploy {
    bytes32 internal constant SALT = keccak256("karwan.endgame.first-settings.v1");

    function deploy(EndgameConfig memory c) internal returns (EndgameDeployment memory d) {
        d.timelock = new KarwanTimelock(c.minDelay, c.ownerSafe, c.guardianSafe);
        d.hub = new KarwanHub(address(d.timelock));
        d.identity = new KarwanIdentityRegistry(address(d.hub));
        d.record = new KarwanRecord(address(d.hub));
        d.vault = new KarwanStakeVault(address(d.hub));
        d.hub.wire(address(d.identity), address(d.record), address(d.vault));
        d.agreement = new KarwanAgreementEscrow(address(d.hub), AgreementBounds(c.minReview, c.maxReview, c.maxHorizon));
        d.time = new KarwanTimeEscrow(address(d.hub));
        d.jobs = new KarwanJobEscrow(address(d.hub), c.usdc);
        d.tradeFinance = new KarwanTradeFinance(address(d.hub));
        if (c.checkers.length != 0) d.verifier = new KarwanCheckVerifier(c.checkers, c.checkerThreshold);
    }

    /// @notice The hub calls the owner Safe queues as one batch. A family is
    ///         registered before its caps are set, since the hub refuses caps
    ///         for a family it does not know.
    function firstSettings(EndgameDeployment memory d, EndgameConfig memory c)
        internal
        pure
        returns (address[] memory targets, uint256[] memory values, bytes[] memory payloads)
    {
        payloads = _payloads(d, c);
        targets = new address[](payloads.length);
        values = new uint256[](payloads.length);
        for (uint256 i; i < payloads.length; ++i) {
            targets[i] = address(d.hub);
        }
    }

    function _payloads(EndgameDeployment memory d, EndgameConfig memory c) private pure returns (bytes[] memory p) {
        p = new bytes[](4 + 1 + 4 + 3 + (address(d.verifier) == address(0) ? 0 : 1) + c.issuers.length);
        uint256 k;
        p[k++] = abi.encodeCall(KarwanHub.setGuardian, (c.guardianSafe));
        p[k++] = abi.encodeCall(KarwanHub.setReviewers, (c.reviewSafe, c.seniorSafe));
        p[k++] = abi.encodeCall(KarwanHub.setFeeRecipient, (c.feeRecipient));
        p[k++] = abi.encodeCall(KarwanHub.setAutoArbiter, (c.autoArbiter));
        p[k++] = abi.encodeCall(KarwanHub.setAsset, (c.usdc, true, c.highValue));
        address[3] memory money = [address(d.agreement), address(d.time), address(d.jobs)];
        for (uint256 i; i < 3; ++i) {
            p[k++] = abi.encodeCall(KarwanHub.registerFamily, (money[i], c.feeBps));
        }
        p[k++] = abi.encodeCall(KarwanHub.registerFamily, (address(d.tradeFinance), uint16(0)));
        for (uint256 i; i < 3; ++i) {
            p[k++] = abi.encodeCall(KarwanHub.setCaps, (money[i], c.usdc, c.perDealCap, c.totalCap));
        }
        if (address(d.verifier) != address(0)) {
            p[k++] = abi.encodeCall(KarwanHub.setVerifier, (address(d.verifier), true));
        }
        for (uint256 i; i < c.issuers.length; ++i) {
            p[k++] = abi.encodeCall(KarwanHub.setIssuer, (c.issuers[i], true));
        }
    }
}
