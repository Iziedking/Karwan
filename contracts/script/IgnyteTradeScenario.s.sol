// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {KarwanHub} from "../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../src/suite/KarwanRecord.sol";
import {KarwanStakeVault} from "../src/suite/KarwanStakeVault.sol";
import {KarwanAgreementEscrow} from "../src/suite/KarwanAgreementEscrow.sol";
import {KarwanTradeFinance} from "../src/suite/KarwanTradeFinance.sol";
import {AgreementTerms, AgreementBounds, AgreementState} from "../src/suite/agreement/AgreementTypes.sol";

interface IUsdc {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @notice Rehearsal only, on Arc Testnet: deploys the contract suite's core,
///         the Agreement escrow and Trade finance, then runs one illustrative
///         export trade end to end. A Lagos supplier with a verified business
///         fact and one completed earlier order wins a two-milestone order from
///         a Dubai buyer, a financier advances most of it against the
///         supplier's signed payout assignment and a 10% stake, the supplier
///         delivers with a bill of lading fingerprint, the buyer releases both
///         milestones, the escrow repays the financier first and pays the
///         supplier the rest, and the outcome lands on both records.
///         Not the canonical deploy and not wired to the Karwan app. Refuses
///         any chain but Arc Testnet and refuses to run unless IGNYTE_REHEARSAL=1.
contract IgnyteTradeScenario is Script {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    uint16 internal constant FEE_BPS = 100;
    uint128 internal constant PER_DEAL_CAP = 1_000e6;
    uint128 internal constant FAMILY_TOTAL_CAP = 10_000e6;
    /// Kept back on every wallet for gas, which Arc charges in USDC.
    uint256 internal constant GAS_RESERVE = 0.5e6;
    bytes32 internal constant BUSINESS_VERIFIED = keccak256("karwan.fact.business_verified.v1");

    struct Keys {
        uint256 deployer;
        uint256 buyer;
        uint256 supplier;
        uint256 financier;
        uint256 issuer;
    }

    struct People {
        address deployer;
        address buyer;
        address supplier;
        address financier;
        address issuer;
    }

    struct Amounts {
        uint128 earlierOrder;
        uint128 order;
        uint16 firstMilestoneBps;
        uint128 advance;
        uint128 repay;
        uint128 stake;
    }

    struct Suite {
        KarwanHub hub;
        KarwanIdentityRegistry identity;
        KarwanRecord record;
        KarwanStakeVault vault;
        KarwanAgreementEscrow escrow;
        KarwanTradeFinance tf;
    }

    Keys internal k;
    People internal p;
    Amounts internal a;
    Suite internal s;

    function run() external {
        require(block.chainid == 5_042_002, "Arc Testnet only");
        require(vm.envOr("IGNYTE_REHEARSAL", false), "rehearsal only");
        _load();
        _preflight();
        _deploy();
        _identities();
        _earlierOrder();
        bytes32 orderId = _mainOrder();
        _summary(orderId);
    }

    function _load() internal {
        k = Keys(
            vm.envUint("IGNYTE_DEPLOYER_KEY"),
            vm.envUint("IGNYTE_BUYER_KEY"),
            vm.envUint("IGNYTE_SUPPLIER_KEY"),
            vm.envUint("IGNYTE_FINANCIER_KEY"),
            vm.envUint("IGNYTE_ISSUER_KEY")
        );
        p = People(vm.addr(k.deployer), vm.addr(k.buyer), vm.addr(k.supplier), vm.addr(k.financier), vm.addr(k.issuer));
        a = Amounts(
            uint128(vm.envUint("IGNYTE_EARLIER_ORDER")),
            uint128(vm.envUint("IGNYTE_ORDER")),
            uint16(vm.envOr("IGNYTE_FIRST_MILESTONE_BPS", uint256(4_000))),
            uint128(vm.envUint("IGNYTE_ADVANCE")),
            uint128(vm.envUint("IGNYTE_REPAY")),
            uint128(vm.envUint("IGNYTE_STAKE"))
        );
    }

    /// Every role is its own wallet, every amount fits the beta caps and the
    /// Trade finance rules, and every wallet holds what its steps spend, before
    /// anything is sent.
    function _preflight() internal view {
        address[5] memory all = [p.deployer, p.buyer, p.supplier, p.financier, p.issuer];
        for (uint256 i; i < 5; ++i) {
            for (uint256 j = i + 1; j < 5; ++j) {
                require(all[i] != all[j], "each role needs its own key");
            }
        }
        require(a.firstMilestoneBps > 0 && a.firstMilestoneBps < 10_000, "two milestones");
        require(_buyerPays(a.earlierOrder) <= PER_DEAL_CAP && _buyerPays(a.order) <= PER_DEAL_CAP, "over the per-deal cap");
        require(a.advance > 0 && a.advance <= a.repay, "advance above repayment");
        require(a.repay <= _sellerNet(a.order), "repayment above what the order pays the supplier");
        require(uint256(a.stake) * 10_000 >= uint256(a.advance) * 1_000, "stake under 10% of the advance");
        _needs(p.buyer, _buyerPays(a.earlierOrder) + _buyerPays(a.order), "buyer");
        _needs(p.supplier, a.stake, "supplier");
        _needs(p.financier, a.advance, "financier");
        _needs(p.deployer, 0, "deployer");
        _needs(p.issuer, 0, "issuer");
    }

    function _deploy() internal {
        vm.startBroadcast(k.deployer);
        s.hub = new KarwanHub(p.deployer);
        s.identity = new KarwanIdentityRegistry(address(s.hub));
        s.record = new KarwanRecord(address(s.hub));
        s.vault = new KarwanStakeVault(address(s.hub));
        s.hub.wire(address(s.identity), address(s.record), address(s.vault));
        s.escrow = new KarwanAgreementEscrow(address(s.hub), AgreementBounds(1 hours, 30 days, 365 days));
        s.tf = new KarwanTradeFinance(address(s.hub));
        s.hub.setFeeRecipient(p.deployer);
        s.hub.setGuardian(p.deployer);
        s.hub.setReviewers(p.deployer, p.deployer);
        s.hub.setAsset(USDC, true, 5_000e6);
        s.hub.registerFamily(address(s.escrow), FEE_BPS);
        s.hub.setCaps(address(s.escrow), USDC, PER_DEAL_CAP, FAMILY_TOTAL_CAP);
        s.hub.registerFamily(address(s.tf), 0);
        s.hub.setIssuer(p.issuer, true);
        vm.stopBroadcast();
        console2.log("[deploy] KarwanHub", address(s.hub));
        console2.log("[deploy] KarwanIdentityRegistry", address(s.identity));
        console2.log("[deploy] KarwanRecord", address(s.record));
        console2.log("[deploy] KarwanStakeVault", address(s.vault));
        console2.log("[deploy] KarwanAgreementEscrow", address(s.escrow));
        console2.log("[deploy] KarwanTradeFinance", address(s.tf));
        console2.log("[deploy] suite wired: USDC allowed, escrow 1% fee, caps 1,000 per deal and 10,000 total, issuer set");
    }

    function _identities() internal {
        vm.startBroadcast(k.buyer);
        s.identity.register();
        IUsdc(USDC).approve(address(s.escrow), type(uint256).max);
        vm.stopBroadcast();
        vm.startBroadcast(k.supplier);
        s.identity.register();
        vm.stopBroadcast();
        vm.startBroadcast(k.financier);
        s.identity.register();
        vm.stopBroadcast();
        console2.log("[identity] buyer, supplier and financier each registered one identity; buyer approved the escrow");

        vm.startBroadcast(k.issuer);
        uint256 factId = s.record.recordFact(
            p.supplier,
            BUSINESS_VERIFIED,
            2,
            keccak256("rehearsal: illustrative business registration check, Lagos"),
            uint64(block.timestamp + 365 days)
        );
        vm.stopBroadcast();
        console2.log("[record] issuer recorded a verified-business fact on the supplier's record, fact id", factId);
    }

    /// The history the financier reads: a smaller first order from the same
    /// buyer, delivered on time and released, written to both records.
    function _earlierOrder() internal {
        AgreementTerms memory t = _terms(a.earlierOrder, 10_000, keccak256("rehearsal: illustrative first order"));
        vm.startBroadcast(k.buyer);
        bytes32 id = s.escrow.fund(keccak256("ignyte earlier order"), t);
        vm.stopBroadcast();
        vm.startBroadcast(k.supplier);
        s.escrow.accept(id, s.escrow.termsHashOf(t));
        s.escrow.markDelivered(id, keccak256("rehearsal: illustrative delivery note, first order"));
        vm.stopBroadcast();
        vm.startBroadcast(k.buyer);
        s.escrow.release(id);
        vm.stopBroadcast();
        require(s.escrow.getDeal(id).state == AgreementState.Settled, "earlier order not settled");
        console2.log("[history] earlier order funded, accepted, delivered on time and released; outcome on both records");
        console2.logBytes32(id);
    }

    function _mainOrder() internal returns (bytes32 id) {
        AgreementTerms memory t =
            _terms(a.order, a.firstMilestoneBps, keccak256("rehearsal: illustrative purchase order, Lagos to Dubai"));
        vm.startBroadcast(k.buyer);
        id = s.escrow.fund(keccak256("ignyte main order"), t);
        vm.stopBroadcast();
        console2.log("[escrow] buyer funded the order in two milestones");
        console2.logBytes32(id);

        vm.startBroadcast(k.supplier);
        s.escrow.accept(id, s.escrow.termsHashOf(t));
        IUsdc(USDC).approve(address(s.vault), a.stake);
        s.vault.stake(USDC, a.stake);
        vm.stopBroadcast();
        console2.log("[escrow] supplier accepted the exact terms and staked", a.stake);

        bytes32 lineId = _openLine(id);

        bytes32 production = keccak256("rehearsal: illustrative production milestone evidence");
        vm.startBroadcast(k.supplier);
        s.escrow.markDelivered(id, production);
        vm.stopBroadcast();
        vm.startBroadcast(k.buyer);
        s.escrow.release(id);
        vm.stopBroadcast();
        console2.log("[milestone 1] production marked, buyer released milestone one; the financier is paid first");

        bytes32 billOfLading = vm.envOr(
            "IGNYTE_BILL_OF_LADING_HASH", keccak256("rehearsal: illustrative bill of lading, Apapa to Jebel Ali")
        );
        vm.startBroadcast(k.supplier);
        s.escrow.markDelivered(id, billOfLading);
        vm.stopBroadcast();
        console2.log("[delivery] supplier shipped and posted the bill of lading fingerprint");
        console2.logBytes32(billOfLading);
        vm.startBroadcast(k.buyer);
        s.escrow.release(id);
        vm.stopBroadcast();
        require(s.escrow.getDeal(id).state == AgreementState.Settled, "order not settled");
        console2.log("[milestone 2] buyer released milestone two; the deal settled and the outcome is on both records");

        vm.startBroadcast(k.financier);
        s.tf.settle(lineId);
        vm.stopBroadcast();
        require(s.tf.lineOf(lineId).state == 2, "line not repaid");
        console2.log("[finance] line settled as repaid in full; the supplier's stake is free again");
    }

    /// The supplier signs the payout assignment and the stake reservation; the
    /// financier submits both with the advance in one transaction.
    function _openLine(bytes32 id) internal returns (bytes32 lineId) {
        uint256 deadline = block.timestamp + 6 hours;
        uint64 expiresAt = s.escrow.accountOf(id).horizon + s.tf.LONGSTOP() + s.tf.SETTLE_WINDOW();
        bytes32 assign = s.escrow.assignDigest(id, p.supplier, p.financier, a.repay, address(s.tf), 1, deadline);
        lineId = s.tf.lineIdFor(address(s.escrow), id, p.financier, a.advance, a.repay, a.stake);
        bytes32 reserve = s.vault.reserveDigest(address(s.tf), lineId, USDC, a.stake, p.financier, expiresAt, deadline);
        KarwanTradeFinance.Signed memory assignment = KarwanTradeFinance.Signed(1, deadline, _sign(k.supplier, assign));
        KarwanTradeFinance.StakeSig memory reservation = KarwanTradeFinance.StakeSig(deadline, _sign(k.supplier, reserve));

        vm.startBroadcast(k.financier);
        IUsdc(USDC).approve(address(s.tf), a.advance);
        s.tf.open(address(s.escrow), id, a.advance, a.repay, a.stake, expiresAt, assignment, reservation);
        vm.stopBroadcast();
        console2.log("[finance] financier opened the line: advance paid to the supplier, repayment assigned, stake reserved");
        console2.logBytes32(lineId);
    }

    function _summary(bytes32 orderId) internal view {
        (address assignee, uint128 assigned, uint128 paid) = s.escrow.assignmentOf(orderId, p.supplier);
        console2.log("[waterfall] assignee is the financier:", assignee == p.financier);
        console2.log("[waterfall] assigned", assigned);
        console2.log("[waterfall] paid to the financier from the escrow", paid);
        console2.log("[waterfall] supplier's net on the order", _sellerNet(a.order));
        console2.log("[waterfall] supplier received from the escrow", _sellerNet(a.order) - paid);
        console2.log("[waterfall] supplier received in total, advance included", _sellerNet(a.order) - paid + a.advance);
        console2.log("[record] facts on the supplier", s.record.factsOf(s.identity.identityOf(p.supplier)).length);
    }

    /// Delivery within 30 days, a 3-day review from each delivery mark, the
    /// buyer may release at any time while the deal runs.
    function _terms(uint128 amount, uint16 firstBps, bytes32 agreement) internal view returns (AgreementTerms memory t) {
        t.asset = USDC;
        t.seller = p.supplier;
        t.amount = amount;
        t.trancheBps[0] = firstBps;
        if (firstBps < 10_000) t.trancheBps[1] = 10_000 - firstBps;
        t.acceptBy = uint64(block.timestamp + 1 days);
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
        t.reclaimGrace = 2 days;
        t.reviewWindow = 3 days;
        t.silentLongstop = 14 days;
        t.agreementHash = agreement;
    }

    function _buyerPays(uint128 amount) internal pure returns (uint256) {
        uint256 fee = (uint256(amount) * FEE_BPS) / 10_000;
        return uint256(amount) + fee / 2;
    }

    function _sellerNet(uint128 amount) internal pure returns (uint128) {
        uint256 fee = (uint256(amount) * FEE_BPS) / 10_000;
        return uint128(uint256(amount) - (fee - fee / 2));
    }

    function _needs(address who, uint256 spend, string memory role) internal view {
        uint256 have = IUsdc(USDC).balanceOf(who);
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
