// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KarwanHub} from "../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../src/suite/KarwanIdentityRegistry.sol";
import {KarwanAgreementEscrow} from "../src/suite/KarwanAgreementEscrow.sol";
import {AgreementTerms, AgreementState} from "../src/suite/agreement/AgreementTypes.sol";

/// @notice One real Arc Testnet deal for the live CRE dry run: 5 USDC on the
///         suite's Agreement escrow, with the GitHub acceptance policy agreed
///         at funding (its fingerprint as checkPolicy) and the suite verifier,
///         accepted by the seller and not yet delivered. Each step runs only if
///         the chain does not show it done, so a second run sends nothing.
///
///   CRE_POLICY_HASH=0x... forge script script/CreLiveDryRunDeal.s.sol --rpc-url $RPC [--broadcast]
///   keys: CRE_DEMO_BUYER_KEY, CRE_DEMO_SELLER_KEY
contract CreLiveDryRunDeal is Script {
    bytes32 internal constant SALT = keccak256("karwan cre live dry run 2026-10");
    uint128 internal constant AMOUNT = 5e6;

    function run() external {
        require(block.chainid == 5_042_002, "Arc Testnet only");
        string memory j = vm.readFile("deployments/endgame-5042002.json");
        KarwanHub hub = KarwanHub(vm.parseJsonAddress(j, ".hub"));
        KarwanIdentityRegistry identity = KarwanIdentityRegistry(vm.parseJsonAddress(j, ".identity"));
        KarwanAgreementEscrow escrow = KarwanAgreementEscrow(vm.parseJsonAddress(j, ".agreement"));
        address verifier = vm.parseJsonAddress(j, ".verifier");
        address usdc = 0x3600000000000000000000000000000000000000;
        bytes32 policy = vm.envBytes32("CRE_POLICY_HASH");
        uint256 buyerKey = vm.envUint("CRE_DEMO_BUYER_KEY");
        uint256 sellerKey = vm.envUint("CRE_DEMO_SELLER_KEY");
        address buyer = vm.addr(buyerKey);
        address seller = vm.addr(sellerKey);
        require(hub.isVerifier(verifier), "the suite verifier is not registered");

        bytes32 id = escrow.dealIdFor(buyer, SALT);
        if (escrow.getDeal(id).state == AgreementState.None) {
            vm.startBroadcast(buyerKey);
            if (identity.identityOf(buyer) == 0) identity.register();
            if (IERC20(usdc).allowance(buyer, address(escrow)) < 2 * uint256(AMOUNT)) {
                IERC20(usdc).approve(address(escrow), type(uint256).max);
            }
            escrow.fund(SALT, _terms(usdc, seller, verifier, policy));
            vm.stopBroadcast();
        }
        require(escrow.getTerms(id).checkPolicy == policy, "the deal carries another policy");
        if (escrow.getDeal(id).state == AgreementState.Funded) {
            bytes32 h = escrow.termsHashOf(escrow.getTerms(id));
            vm.startBroadcast(sellerKey);
            if (identity.identityOf(seller) == 0) identity.register();
            escrow.accept(id, h);
            vm.stopBroadcast();
        }

        console.log("escrow (family)", address(escrow));
        console.log("deal id");
        console.logBytes32(id);
        console.log("buyer", buyer, "identity", identity.identityOf(buyer));
        console.log("seller", seller, "identity", identity.identityOf(seller));
        console.log("verifier", verifier);
        console.log("checkPolicy");
        console.logBytes32(policy);
        console.log("state (2 = accepted)", uint8(escrow.getDeal(id).state));
    }

    function _terms(address usdc, address seller, address verifier, bytes32 policy)
        internal
        view
        returns (AgreementTerms memory t)
    {
        t.asset = usdc;
        t.seller = seller;
        t.amount = AMOUNT;
        t.trancheBps[0] = 10_000;
        t.acceptBy = uint64(block.timestamp + 1 days);
        t.deliveryDeadline = uint64(block.timestamp + 14 days);
        t.reclaimGrace = 1 days;
        t.reviewWindow = 2 days;
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.silentLongstop = 14 days;
        // The policy names a partial line, so the terms allow a partial share.
        t.partialBps = 5_000;
        t.verifier = verifier;
        t.checkPolicy = policy;
        t.agreementHash = keccak256("karwan cre live dry run: the replay fixture's agreed tests");
    }
}
