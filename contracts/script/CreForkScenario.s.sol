// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanHub} from "../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../src/suite/KarwanRecord.sol";
import {KarwanAgreementEscrow} from "../src/suite/KarwanAgreementEscrow.sol";
import {KarwanCheckVerifier} from "../src/suite/KarwanCheckVerifier.sol";
import {KarwanCreAdapter} from "../src/suite/KarwanCreAdapter.sol";
import {KarwanCreFees} from "../src/suite/KarwanCreFees.sol";
import {AgreementTerms, AgreementBounds} from "../src/suite/agreement/AgreementTypes.sol";
import {DeployCreAdapter} from "./DeployCreAdapter.s.sol";

interface IUsdc {
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Rehearsal only, on a fork of Arc Testnet (scripts/ops/arc-fork.sh):
///         the suite core, an Agreement escrow, the CRE adapter on the
///         simulation forwarder and V-CRE|K, then one checked deal funded,
///         accepted and delivered, so `cre workflow simulate` has a real
///         Delivered log to start from. Refuses any chain but Arc Testnet,
///         and refuses to run unless CRE_REHEARSAL=1.
contract CreForkScenario is Script {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant MOCK_FORWARDER = 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1;

    function run() external {
        require(block.chainid == 5_042_002, "Arc Testnet fork only");
        require(vm.envOr("CRE_REHEARSAL", false), "rehearsal only");
        uint256 deployerKey = vm.envUint("SCENARIO_DEPLOYER_KEY");
        uint256 sellerKey = vm.envUint("SCENARIO_SELLER_KEY");
        address deployer = vm.addr(deployerKey);
        address seller = vm.addr(sellerKey);
        address checker = vm.envAddress("SCENARIO_CHECKER");
        address creOwner = vm.envAddress("CRE_WORKFLOW_OWNER");
        bytes32 policyHash = vm.envBytes32("CRE_SCENARIO_POLICY_HASH");
        bytes32 proofHash = vm.envBytes32("CRE_SCENARIO_PROOF_HASH");

        vm.startBroadcast(deployerKey);
        KarwanHub hub = new KarwanHub(deployer);
        KarwanIdentityRegistry identity = new KarwanIdentityRegistry(address(hub));
        KarwanRecord record = new KarwanRecord(address(hub));
        hub.wire(address(identity), address(record), deployer);
        KarwanAgreementEscrow escrow = new KarwanAgreementEscrow(address(hub), AgreementBounds(1 hours, 30 days, 365 days));
        // The hub refuses the stake vault, which is the deployer here, as fee recipient.
        hub.setFeeRecipient(checker);
        hub.setGuardian(deployer);
        hub.setReviewers(deployer, deployer);
        hub.setAsset(USDC, true, 5_000e6);
        hub.registerFamily(address(escrow), 100);
        hub.setCaps(address(escrow), USDC, 1_000e6, 10_000e6);
        DeployCreAdapter adapterScript = new DeployCreAdapter();
        KarwanCreAdapter adapter = new KarwanCreAdapter(
            MOCK_FORWARDER, creOwner, address(hub), deployer, adapterScript.factKinds(), adapterScript.keepSelectors()
        );
        address[] memory signers = new address[](2);
        (signers[0], signers[1]) =
            address(adapter) < checker ? (address(adapter), checker) : (checker, address(adapter));
        KarwanCheckVerifier verifier = new KarwanCheckVerifier(signers, 1);
        hub.setVerifier(address(verifier), true);
        hub.setIssuer(address(adapter), true);
        // 0.25 USDC, the x402 dry-run price DeployCreFees fixes.
        KarwanCreFees fees = new KarwanCreFees(USDC, address(adapter), checker, 250_000);
        IUsdc(USDC).approve(address(escrow), type(uint256).max);

        AgreementTerms memory t;
        t.asset = USDC;
        t.seller = seller;
        t.amount = 100e6;
        t.trancheBps[0] = 10_000;
        t.acceptBy = uint64(block.timestamp + 1 days);
        t.deliveryDeadline = uint64(block.timestamp + 10 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = 2 days;
        t.startLongstop = 4 days;
        t.silentLongstop = 14 days;
        t.reviewStarts = 2;
        t.partialBps = 5_000;
        t.verifier = address(verifier);
        t.checkPolicy = policyHash;
        t.agreementHash = keccak256("cre fork scenario");
        bytes32 dealId = escrow.fund(bytes32(vm.envOr("SCENARIO_SALT", uint256(1))), t);
        vm.stopBroadcast();

        bytes32 termsHash = escrow.termsHashOf(t);
        vm.startBroadcast(sellerKey);
        escrow.accept(dealId, termsHash);
        escrow.markDelivered(dealId, proofHash);
        vm.stopBroadcast();

        console.log("hub", address(hub));
        console.log("escrow", address(escrow));
        console.log("adapter", address(adapter));
        console.log("verifier V-CRE|K", address(verifier));
        console.log("fees", address(fees));
        console.logBytes32(dealId);
    }
}
