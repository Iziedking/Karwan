// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgreementFixture} from "../agreement/AgreementFixture.sol";
import {AgreementTerms} from "../../../src/suite/agreement/AgreementTypes.sol";
import {KarwanCheckVerifier} from "../../../src/suite/KarwanCheckVerifier.sol";
import {KarwanCreAdapter} from "../../../src/suite/KarwanCreAdapter.sol";
import {MockForwarder} from "./mocks/MockForwarder.sol";

abstract contract CreFixture is AgreementFixture {
    bytes32 internal constant CHECK_ID = keccak256("karwan-check");
    bytes32 internal constant FACT_ID = keccak256("karwan-record");
    bytes32 internal constant KEEP_ID = keccak256("karwan-risk");
    bytes10 internal constant CHECK_NAME = bytes10("chk0000001");
    bytes10 internal constant FACT_NAME = bytes10("fct0000001");
    bytes10 internal constant KEEP_NAME = bytes10("kep0000001");
    bytes32 internal constant DEAL = keccak256("deal");
    bytes32 internal constant EVIDENCE = keccak256("evidence");
    bytes32 internal constant WORK_FACT = keccak256("karwan.fact.github_work.v1");

    MockForwarder internal forwarder;
    KarwanCreAdapter internal adapter;
    KarwanCheckVerifier internal verifierK;
    KarwanCheckVerifier internal verifierCK;
    address internal creOwner = makeAddr("creOwner");
    address internal checker;
    uint256 internal checkerKey;

    function _deployCre() internal {
        _deployAgreement();
        forwarder = new MockForwarder();
        adapter = _freshAdapter();
        adapter.bindWorkflow(1, CHECK_ID, CHECK_NAME);
        adapter.bindWorkflow(2, FACT_ID, FACT_NAME);
        adapter.bindWorkflow(3, KEEP_ID, KEEP_NAME);
        (checker, checkerKey) = makeAddrAndKey("karwanChecker");
        address[] memory k = new address[](1);
        k[0] = checker;
        verifierK = new KarwanCheckVerifier(k, 1);
        address[] memory ck = new address[](2);
        (ck[0], ck[1]) = address(adapter) < checker ? (address(adapter), checker) : (checker, address(adapter));
        verifierCK = new KarwanCheckVerifier(ck, 1);
        hub.setVerifier(address(verifierK), true);
        hub.setVerifier(address(verifierCK), true);
        hub.setIssuer(address(adapter), true);
    }

    function _freshAdapter() internal returns (KarwanCreAdapter) {
        return new KarwanCreAdapter(address(forwarder), creOwner, address(hub), address(this), _kinds(), _selectors());
    }

    function _kinds() internal pure returns (bytes32[] memory k) {
        k = new bytes32[](1);
        k[0] = WORK_FACT;
    }

    /// The timeouts each family lets anyone trigger.
    function _selectors() internal pure returns (bytes4[] memory s) {
        string[15] memory sigs = [
            "claim(bytes32)",
            "reclaim(bytes32)",
            "cancelMissed(bytes32)",
            "executeRuling(bytes32)",
            "applyFallback(bytes32)",
            "retryRecord(bytes32,uint8)",
            "settle(bytes32,uint16)",
            "close(bytes32)",
            "executeRuling(bytes32,uint16)",
            "applyFallback(bytes32,uint16)",
            "release(uint256)",
            "confirmRejection(uint256)",
            "claimRefund(uint256)",
            "executeRuling(uint256)",
            "applyFallback(uint256)"
        ];
        s = new bytes4[](15);
        for (uint256 i; i < 15; ++i) {
            s[i] = bytes4(keccak256(bytes(sigs[i])));
        }
    }

    function _meta(bytes32 id, bytes10 name, address owner) internal pure returns (bytes memory) {
        return abi.encodePacked(id, name, owner, bytes2(0x0001));
    }

    function _envelope(uint8 kind, uint64 issuedAt, bytes32 reportId, bytes memory body)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(kind, block.chainid, address(adapter), issuedAt, reportId, body);
    }

    function _bound(uint8 kind) internal pure returns (bytes32 id, bytes10 name) {
        if (kind == 1) return (CHECK_ID, CHECK_NAME);
        if (kind == 2) return (FACT_ID, FACT_NAME);
        return (KEEP_ID, KEEP_NAME);
    }

    function _send(uint8 kind, bytes memory body) internal {
        (bytes32 id, bytes10 name) = _bound(kind);
        bytes32 reportId = keccak256(abi.encode(kind, body, block.timestamp));
        forwarder.deliver(address(adapter), id, name, creOwner, _envelope(kind, uint64(block.timestamp), reportId, body));
    }

    function _checkBody(bool pass) internal view returns (bytes memory) {
        return abi.encode(address(verifierCK), address(escrow), DEAL, uint32(1), pass, EVIDENCE);
    }

    function _checkedTerms(address verifier) internal view returns (AgreementTerms memory t) {
        t = _terms();
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.verifier = verifier;
        t.checkPolicy = keccak256("policy");
    }
}
