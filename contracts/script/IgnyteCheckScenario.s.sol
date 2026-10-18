// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {KarwanHub} from "../src/suite/KarwanHub.sol";
import {KarwanAgreementEscrow} from "../src/suite/KarwanAgreementEscrow.sol";
import {KarwanCheckVerifier} from "../src/suite/KarwanCheckVerifier.sol";
import {AgreementTerms, AgreementState} from "../src/suite/agreement/AgreementTypes.sol";

interface IUsdcBalance {
    function balanceOf(address who) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

/// @notice Rehearsal only, on Arc Testnet, after IgnyteTradeScenario: adds a
///         delivery check to the rehearsal suite already deployed. One checker
///         is registered as the verifier; a small order's review starts at a
///         passing check instead of the supplier's own mark. The supplier posts
///         the bill of lading fingerprint, the checker signs a pass over that
///         same fingerprint, anyone submits it, the buyer's review starts, and
///         the buyer releases. Not the canonical deploy and not wired to the
///         Karwan app. Refuses any chain but Arc Testnet and refuses to run
///         unless IGNYTE_REHEARSAL=1.
contract IgnyteCheckScenario is Script {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    /// The rehearsal suite IgnyteTradeScenario deployed on 18 October 2026.
    address internal constant REHEARSAL_HUB = 0x965810a8deD5324c2A899793b866639eE25e6997;
    address internal constant REHEARSAL_ESCROW = 0xF43d77B28334Ba2904f4C73B61ee13431b75CE54;
    uint16 internal constant FEE_BPS = 100;
    uint128 internal constant PER_DEAL_CAP = 1_000e6;
    uint256 internal constant GAS_RESERVE = 0.5e6;
    uint8 internal constant START_ON_CHECK = 2;

    struct Keys {
        uint256 deployer;
        uint256 buyer;
        uint256 supplier;
        uint256 checker;
    }

    struct People {
        address deployer;
        address buyer;
        address supplier;
        address checker;
    }

    Keys internal k;
    People internal p;
    KarwanHub internal hub;
    KarwanAgreementEscrow internal escrow;
    KarwanCheckVerifier internal verifier;
    uint128 internal order;

    function run() external {
        require(block.chainid == 5_042_002, "Arc Testnet only");
        require(vm.envOr("IGNYTE_REHEARSAL", false), "rehearsal only");
        _load();
        _preflight();
        _deployVerifier();
        bytes32 id = _checkedOrder();
        console2.log("[summary] checked order settled; the review started at the checker's pass");
        console2.logBytes32(id);
    }

    function _load() internal {
        k = Keys(
            vm.envUint("IGNYTE_DEPLOYER_KEY"),
            vm.envUint("IGNYTE_BUYER_KEY"),
            vm.envUint("IGNYTE_SUPPLIER_KEY"),
            vm.envUint("IGNYTE_CHECKER_KEY")
        );
        p = People(vm.addr(k.deployer), vm.addr(k.buyer), vm.addr(k.supplier), vm.addr(k.checker));
        hub = KarwanHub(vm.envOr("IGNYTE_HUB", REHEARSAL_HUB));
        escrow = KarwanAgreementEscrow(vm.envOr("IGNYTE_ESCROW", REHEARSAL_ESCROW));
        order = uint128(vm.envUint("IGNYTE_CHECKED_ORDER"));
    }

    /// The suite is the rehearsal one and the deployer still owns its hub, the
    /// checker is nobody else in the story, the order fits the beta cap, and
    /// the buyer holds what it pays, before anything is sent. The checker only
    /// signs, so it needs no USDC.
    function _preflight() internal view {
        require(address(escrow.hub()) == address(hub), "escrow is not on this hub");
        require(hub.owner() == p.deployer, "the deployer no longer owns the hub");
        require(
            p.checker != p.deployer && p.checker != p.buyer && p.checker != p.supplier,
            "the checker needs its own key"
        );
        require(order > 0 && _buyerPays(order) <= PER_DEAL_CAP, "over the per-deal cap");
        require(IUsdcBalance(USDC).allowance(p.buyer, address(escrow)) >= _buyerPays(order), "buyer has not approved the escrow");
        _needs(p.buyer, _buyerPays(order), "buyer");
        _needs(p.supplier, 0, "supplier");
        _needs(p.deployer, 0, "deployer");
    }

    function _deployVerifier() internal {
        address[] memory checkers = new address[](1);
        checkers[0] = p.checker;
        vm.startBroadcast(k.deployer);
        verifier = new KarwanCheckVerifier(checkers, 1);
        hub.setVerifier(address(verifier), true);
        vm.stopBroadcast();
        console2.log("[deploy] KarwanCheckVerifier", address(verifier));
        console2.log("[deploy] one checker, threshold one, registered on the hub as a verifier");
    }

    function _checkedOrder() internal returns (bytes32 id) {
        AgreementTerms memory t;
        t.asset = USDC;
        t.seller = p.supplier;
        t.amount = order;
        t.trancheBps[0] = 10_000;
        t.acceptBy = uint64(block.timestamp + 1 days);
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
        t.reclaimGrace = 2 days;
        t.reviewWindow = 3 days;
        t.reviewStarts = START_ON_CHECK;
        t.startLongstop = 4 days;
        t.silentLongstop = 14 days;
        t.verifier = address(verifier);
        t.checkPolicy = keccak256("rehearsal: bill of lading matches the order");
        t.agreementHash = keccak256("rehearsal: illustrative checked shipment, Lagos to Dubai");

        vm.startBroadcast(k.buyer);
        id = escrow.fund(keccak256("ignyte checked order"), t);
        vm.stopBroadcast();
        console2.log("[check] buyer funded an order whose review starts at a passing delivery check");
        console2.logBytes32(id);

        bytes32 billOfLading = vm.envOr(
            "IGNYTE_CHECKED_BILL_OF_LADING_HASH",
            keccak256("rehearsal: illustrative bill of lading, checked shipment, Apapa to Jebel Ali")
        );
        vm.startBroadcast(k.supplier);
        escrow.accept(id, escrow.termsHashOf(t));
        escrow.markDelivered(id, billOfLading);
        vm.stopBroadcast();
        require(!escrow.getDeal(id).checkPassed, "check recorded before the report");
        require(
            escrow.reviewEndOf(id) == uint64(block.timestamp) + t.startLongstop + t.reviewWindow,
            "review not waiting for the check"
        );
        console2.log("[check] supplier accepted and posted the bill of lading fingerprint; without a check the review only starts at the 4-day longstop");
        console2.logBytes32(billOfLading);

        uint32 revision = 1;
        bytes32 digest = verifier.reportDigest(address(escrow), id, revision, true, billOfLading);
        address[] memory signers = new address[](1);
        bytes[] memory sigs = new bytes[](1);
        signers[0] = p.checker;
        sigs[0] = _sign(k.checker, digest);
        vm.startBroadcast(k.deployer);
        verifier.report(address(escrow), id, revision, true, billOfLading, signers, sigs);
        vm.stopBroadcast();
        require(escrow.getDeal(id).checkPassed, "check not recorded");
        require(escrow.reviewEndOf(id) == uint64(block.timestamp + 3 days), "review did not start at the pass");
        console2.log("[check] checker's signed pass on the same fingerprint submitted; the buyer's review started");

        vm.startBroadcast(k.buyer);
        escrow.release(id);
        vm.stopBroadcast();
        require(escrow.getDeal(id).state == AgreementState.Settled, "checked order not settled");
        console2.log("[check] buyer released; the deal settled and the outcome is on both records");
    }

    function _buyerPays(uint128 amount) internal pure returns (uint256) {
        uint256 fee = (uint256(amount) * FEE_BPS) / 10_000;
        return uint256(amount) + fee / 2;
    }

    function _needs(address who, uint256 spend, string memory role) internal view {
        uint256 have = IUsdcBalance(USDC).balanceOf(who);
        if (have < spend + GAS_RESERVE) {
            console2.log(role, who);
            console2.log("  holds", have);
            console2.log("  needs", spend + GAS_RESERVE);
            revert(string.concat(role, " needs more testnet USDC"));
        }
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 sg) = vm.sign(key, digest);
        return abi.encodePacked(r, sg, v);
    }
}
