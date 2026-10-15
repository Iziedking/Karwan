// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreFixture} from "./CreFixture.sol";
import {KarwanCreAdapter} from "../../../src/suite/KarwanCreAdapter.sol";
import {KarwanCheckVerifier} from "../../../src/suite/KarwanCheckVerifier.sol";
import {KarwanAgreementEscrow} from "../../../src/suite/KarwanAgreementEscrow.sol";
import {AgreementDeal} from "../../../src/suite/agreement/AgreementTypes.sol";
import {IKarwanCreAdapter} from "../../../src/suite/interfaces/IKarwanCreAdapter.sol";
import {MockForwarder} from "./mocks/MockForwarder.sol";

contract CreHandler is Test {
    KarwanCreAdapter internal adapter;
    MockForwarder internal forwarder;
    KarwanCheckVerifier internal verifier;
    KarwanAgreementEscrow internal escrow;
    address internal creOwner;
    address internal seller;
    bytes32 internal checkId;
    bytes10 internal checkName;
    bytes32 internal keepId;
    bytes10 internal keepName;
    bytes32[] public deals;
    bytes32[] public usedReports;
    uint256 internal nonce;

    constructor(
        KarwanCreAdapter adapter_,
        MockForwarder forwarder_,
        KarwanCheckVerifier verifier_,
        KarwanAgreementEscrow escrow_,
        address creOwner_,
        address seller_,
        bytes32[] memory deals_
    ) {
        adapter = adapter_;
        forwarder = forwarder_;
        verifier = verifier_;
        escrow = escrow_;
        creOwner = creOwner_;
        seller = seller_;
        deals = deals_;
        (checkId, checkName) = adapter.bindingOf(1);
        (keepId, keepName) = adapter.bindingOf(3);
    }

    function dealCount() external view returns (uint256) {
        return deals.length;
    }

    function usedCount() external view returns (uint256) {
        return usedReports.length;
    }

    function _send(uint8 kind, bytes memory body) internal {
        bytes32 reportId = keccak256(abi.encode(kind, ++nonce));
        (bytes32 id, bytes10 name) = kind == 1 ? (checkId, checkName) : (keepId, keepName);
        forwarder.deliver(
            address(adapter),
            id,
            name,
            creOwner,
            abi.encode(kind, block.chainid, address(adapter), uint64(block.timestamp), reportId, body)
        );
        if (forwarder.lastOk()) usedReports.push(reportId);
    }

    function report(uint256 d, uint8 revision, bool pass, bool otherEvidence) external {
        bytes32 id = deals[d % deals.length];
        uint32 rev = uint32(bound(revision, 1, 3));
        bytes32 evidence = otherEvidence ? keccak256("evidence-b") : keccak256("evidence-a");
        _send(1, abi.encode(address(verifier), address(escrow), id, rev, pass, evidence));
    }

    function strangerSubmits(uint256 d, uint8 revision, bool pass, bool otherEvidence) external {
        bytes32 id = deals[d % deals.length];
        uint32 rev = uint32(bound(revision, 1, 3));
        bytes32 evidence = otherEvidence ? keccak256("evidence-b") : keccak256("evidence-a");
        address[] memory s = new address[](1);
        s[0] = address(adapter);
        bytes[] memory sig = new bytes[](1);
        try verifier.report(address(escrow), id, rev, pass, evidence, s, sig) {} catch {}
    }

    function redeliver(uint256 d) external {
        vm.prank(seller);
        try escrow.markDelivered(deals[d % deals.length], keccak256(abi.encode("proof", ++nonce))) {} catch {}
    }

    function keep(uint256 d, bool reclaimNotClaim) external {
        IKarwanCreAdapter.KeepCall[] memory calls = new IKarwanCreAdapter.KeepCall[](1);
        string memory sig = reclaimNotClaim ? "reclaim(bytes32)" : "claim(bytes32)";
        calls[0] = IKarwanCreAdapter.KeepCall(address(escrow), bytes4(keccak256(bytes(sig))), abi.encode(deals[d % deals.length]));
        _send(3, abi.encode(calls));
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 3 days));
    }
}

contract CreAdapterInvariantTest is CreFixture {
    CreHandler internal handler;

    function setUp() public {
        _deployCre();
        bytes32[] memory ids = new bytes32[](3);
        for (uint256 i; i < 3; ++i) {
            ids[i] = _fundAccepted(_checkedTerms(address(verifierCK)), bytes32(i + 1));
            _deliver(ids[i]);
        }
        handler = new CreHandler(adapter, forwarder, verifierCK, escrow, creOwner, seller, ids);
        targetContract(address(handler));
    }

    function invariant_adapter_holds_no_money() public view {
        assertEq(usdc.balanceOf(address(adapter)), 0);
    }

    /// At most one result is approved for any delivery, whatever was sent.
    function invariant_one_verdict_per_delivery() public view {
        bytes32[2] memory evidence = [keccak256("evidence-a"), keccak256("evidence-b")];
        for (uint256 d; d < handler.dealCount(); ++d) {
            bytes32 id = handler.deals(d);
            for (uint32 rev = 1; rev <= 3; ++rev) {
                uint256 approvals;
                for (uint256 e; e < 2; ++e) {
                    if (adapter.approved(adapter.checkDigest(address(verifierCK), address(escrow), id, rev, true, evidence[e]))) {
                        ++approvals;
                    }
                    if (adapter.approved(adapter.checkDigest(address(verifierCK), address(escrow), id, rev, false, evidence[e]))) {
                        ++approvals;
                    }
                }
                assertLe(approvals, 1);
            }
        }
    }

    /// What the escrow holds for the current delivery is what the adapter approved.
    function invariant_escrow_check_matches_the_approved_result() public view {
        for (uint256 d; d < handler.dealCount(); ++d) {
            bytes32 id = handler.deals(d);
            AgreementDeal memory deal = escrow.getDeal(id);
            if (!deal.checkPassed && !deal.checkFailed) continue;
            (bool set, bool pass,) = adapter.verdictOf(adapter.verdictKey(address(verifierCK), address(escrow), id, deal.revision));
            assertTrue(set);
            assertEq(pass, deal.checkPassed);
        }
    }

    function invariant_a_used_report_stays_used() public view {
        for (uint256 i; i < handler.usedCount(); ++i) {
            assertTrue(adapter.reportUsed(handler.usedReports(i)));
        }
    }
}
