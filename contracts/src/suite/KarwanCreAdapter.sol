// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {IReceiver, IERC165} from "../interfaces/IReceiver.sol";
import {IKarwanHub, IKarwanIdentity} from "./interfaces/IKarwanSuite.sol";
import {
    IKarwanCreAdapter, IKarwanCheckVerifierView, IKarwanRecordFacts, IKarwanCreFeesRelease
} from "./interfaces/IKarwanCreAdapter.sol";
import {AgreementDeal} from "./agreement/AgreementTypes.sol";

interface IAgreementDeals {
    function getDeal(bytes32 dealId) external view returns (AgreementDeal memory);
}

/// @title KarwanCreAdapter
/// @notice The only way Chainlink CRE workflows act on the suite. A report is
///         accepted only from the forwarder, only from the workflow bound to
///         its kind, and only within an hour of issue: the forwarder never
///         reverts and anyone may retry a failed delivery, so age is the guard.
///         It holds no money and has no owner.
contract KarwanCreAdapter is IReceiver, IERC1271, IKarwanCreAdapter {
    uint8 public constant CHECK = 1;
    uint8 public constant FACT = 2;
    uint8 public constant KEEP = 3;
    uint8 public constant DRY = 4;
    uint64 public constant MAX_AGE = 1 hours;
    /// DON time can run slightly ahead of Arc's block time.
    uint64 public constant MAX_SKEW = 5 minutes;
    uint256 public constant MAX_CALLS = 8;
    uint256 public constant KEEP_CALL_GAS = 1_500_000;

    bytes4 private constant ATTEST = bytes4(keccak256("attestCheck(bytes32,uint32,bool,bytes32)"));
    bytes4 private constant RECORD_FACT = bytes4(keccak256("recordFact(address,bytes32,uint8,bytes32,uint64)"));
    bytes4 private constant REVOKE = bytes4(keccak256("revoke(uint256)"));
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant VERIFIER_NAME = keccak256("KarwanCheckVerifier");
    bytes32 private constant VERIFIER_VERSION = keccak256("1");
    bytes32 private constant REPORT_TYPEHASH =
        keccak256("Report(address family,bytes32 dealId,uint32 revision,bool pass,bytes32 evidenceHash)");

    address public immutable forwarder;
    address public immutable workflowOwner;
    IKarwanHub public immutable hub;
    address public immutable binder;

    struct Binding {
        bytes32 workflowId;
        bytes10 workflowName;
    }

    struct Verdict {
        bool set;
        bool pass;
        bytes32 evidenceHash;
    }

    mapping(uint8 => Binding) public bindingOf;
    mapping(bytes32 => bool) public reportUsed;
    mapping(bytes32 => bool) public isFactKind;
    mapping(bytes4 => bool) public isKeepSelector;
    mapping(bytes32 => bool) public approved;
    mapping(bytes32 => Verdict) private _verdicts;
    /// @dev The wallet each fact was written for; a revoke must name the same one.
    mapping(uint256 => address) public issuedTo;

    /// @dev One outside account backs one person at a time: the hold is keyed
    ///      by the workflow's keyed account key and lasts while its fact is live.
    struct SealHold {
        uint64 identity;
        uint64 expiresAt;
        uint256 factId;
    }

    mapping(bytes32 => SealHold) public sealHold;
    mapping(uint256 => bytes32) private _holdOf;

    error NotForwarder();
    error NotBinder();
    error BadBinding();
    error BadMetadata();
    error BadWorkflow();
    error BadEnvelope();
    error Stale();
    error UsedReport();
    error BadSelector();
    error BadKind();
    error NotAllowedKind();
    error NotIssued();
    error SealHeld();
    error BadOp();
    error BadCall();

    constructor(
        address forwarder_,
        address workflowOwner_,
        address hub_,
        address binder_,
        bytes32[] memory factKinds,
        bytes4[] memory keepSelectors
    ) {
        if (forwarder_ == address(0) || workflowOwner_ == address(0) || hub_ == address(0) || binder_ == address(0)) {
            revert BadBinding();
        }
        forwarder = forwarder_;
        workflowOwner = workflowOwner_;
        hub = IKarwanHub(hub_);
        binder = binder_;
        for (uint256 i; i < factKinds.length; ++i) {
            if (factKinds[i] == bytes32(0)) revert BadKind();
            isFactKind[factKinds[i]] = true;
        }
        // The adapter is a verifier signer and a record issuer; no keeper call
        // may reach the functions those roles open.
        for (uint256 i; i < keepSelectors.length; ++i) {
            bytes4 s = keepSelectors[i];
            if (s == bytes4(0) || s == ATTEST || s == RECORD_FACT || s == REVOKE) revert BadSelector();
            isKeepSelector[s] = true;
        }
    }

    /// @notice A CRE workflow id changes with any edit to its code or config,
    ///         so a kind can be rebound. The binder is the timelock in
    ///         production (DeployCreAdapter refuses an EOA), so every rebind is
    ///         public and waits out the delay.
    function bindWorkflow(uint8 kind, bytes32 workflowId, bytes10 workflowName) external {
        if (msg.sender != binder) revert NotBinder();
        if (kind < CHECK || kind > DRY || workflowId == bytes32(0) || workflowName == bytes10(0)) revert BadBinding();
        bindingOf[kind] = Binding(workflowId, workflowName);
        emit WorkflowBound(kind, workflowId, workflowName);
    }

    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder();
        (bytes32 id, bytes10 name, address owner) = _metadata(metadata);
        (uint8 kind, uint256 chainId, address target, uint64 issuedAt, bytes32 reportId, bytes memory body) =
            abi.decode(report, (uint8, uint256, address, uint64, bytes32, bytes));
        Binding memory b = bindingOf[kind];
        if (b.workflowId == bytes32(0) || id != b.workflowId || name != b.workflowName || owner != workflowOwner) {
            revert BadWorkflow();
        }
        if (chainId != block.chainid || target != address(this) || reportId == bytes32(0)) revert BadEnvelope();
        if (issuedAt > block.timestamp + MAX_SKEW || block.timestamp > uint256(issuedAt) + MAX_AGE) revert Stale();
        if (reportUsed[reportId]) revert UsedReport();
        reportUsed[reportId] = true;
        if (kind == CHECK) _check(reportId, body);
        else if (kind == FACT) _fact(body);
        else if (kind == KEEP) _keep(body);
        else _dry(body);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IERC1271).interfaceId;
    }

    /// @dev Metadata is workflowId (32) | workflowName (10) | owner (20), and
    ///      production appends a 2-byte report id, so 62 or 64 bytes.
    function _metadata(bytes calldata m) private pure returns (bytes32 id, bytes10 name, address owner) {
        if (m.length != 62 && m.length != 64) revert BadMetadata();
        assembly {
            id := calldataload(m.offset)
            // keep the 10 name bytes only; the word also carries the owner
            name := and(calldataload(add(m.offset, 32)), not(sub(shl(176, 1), 1)))
            owner := shr(96, calldataload(add(m.offset, 42)))
        }
    }

    /// @dev The first result for a delivery is final. The verifier keeps no
    ///      record of reports, so a stored pass could otherwise be replayed
    ///      over a fail, or the reverse.
    function _check(bytes32 reportId, bytes memory body) private {
        (address verifier, address family, bytes32 dealId, uint32 revision, bool pass, bytes32 evidenceHash) =
            abi.decode(body, (address, address, bytes32, uint32, bool, bytes32));
        bytes32 key = verdictKey(verifier, family, dealId, revision);
        Verdict storage v = _verdicts[key];
        if (v.set) {
            if (v.pass != pass || v.evidenceHash != evidenceHash) emit CheckRefused(verifier, family, dealId, revision);
            return;
        }
        // The escrow lets a pass overturn a fail; a delivery that already has
        // a result on chain, from Karwan's fallback checker, keeps it.
        if (_decidedOnChain(family, dealId, revision)) {
            emit CheckRefused(verifier, family, dealId, revision);
            return;
        }
        _verdicts[key] = Verdict(true, pass, evidenceHash);
        approved[checkDigest(verifier, family, dealId, revision, pass, evidenceHash)] = true;
        emit CheckApproved(verifier, family, dealId, revision, pass, evidenceHash, reportId);
        _submit(verifier, family, dealId, revision, pass, evidenceHash);
    }

    function _decidedOnChain(address family, bytes32 dealId, uint32 revision) private view returns (bool) {
        try IAgreementDeals(family).getDeal(dealId) returns (AgreementDeal memory d) {
            return d.revision == revision && (d.checkPassed || d.checkFailed);
        } catch {
            return false;
        }
    }

    /// @dev A verifier the adapter alone can satisfy gets the result at once.
    ///      Otherwise, or when the escrow refuses it now, the approval stays
    ///      and anyone may submit it with the other signatures.
    function _submit(address verifier, address family, bytes32 dealId, uint32 revision, bool pass, bytes32 evidenceHash)
        private
    {
        IKarwanCheckVerifierView v = IKarwanCheckVerifierView(verifier);
        try v.threshold() returns (uint8 t) {
            if (t != 1 || !v.isSigner(address(this))) return;
        } catch {
            return;
        }
        address[] memory signers = new address[](1);
        signers[0] = address(this);
        bytes[] memory sigs = new bytes[](1);
        try v.report(family, dealId, revision, pass, evidenceHash, signers, sigs) {
            emit CheckSubmitted(verifier, dealId, revision);
        } catch (bytes memory reason) {
            emit CheckSubmitFailed(verifier, dealId, revision, reason);
        }
    }

    /// @dev Only the fact kinds fixed at deployment, so a workflow can never
    ///      write an outcome or a person check; only its own facts are revoked,
    ///      each for the wallet it was written for.
    function _fact(bytes memory body) private {
        (
            uint8 op,
            address wallet,
            bytes32 factKind,
            uint8 level,
            bytes32 seal,
            uint64 expiresAt,
            uint256 factId,
            bytes32 accountKey
        ) = abi.decode(body, (uint8, address, bytes32, uint8, bytes32, uint64, uint256, bytes32));
        IKarwanRecordFacts rec = IKarwanRecordFacts(hub.record());
        if (op == 1) {
            if (!isFactKind[factKind]) revert NotAllowedKind();
            if (accountKey == bytes32(0)) revert BadOp();
            uint64 person = IKarwanIdentity(hub.identity()).identityOf(wallet);
            bytes32 holdKey = keccak256(abi.encode(factKind, accountKey));
            SealHold memory hold = sealHold[holdKey];
            bool live = hold.identity != 0 && hold.expiresAt > block.timestamp;
            if (live && hold.identity != person) revert SealHeld();
            uint256 id = rec.recordFact(wallet, factKind, level, seal, expiresAt);
            issuedTo[id] = wallet;
            sealHold[holdKey] = SealHold(person, expiresAt, id);
            _holdOf[id] = holdKey;
            emit FactWritten(id, wallet, factKind, level);
            // A renewal by the same person retires the fact it replaces.
            if (live) {
                emit FactRevoked(hold.factId);
                rec.revoke(hold.factId);
            }
        } else if (op == 2) {
            if (wallet == address(0) || issuedTo[factId] != wallet) revert NotIssued();
            bytes32 key = _holdOf[factId];
            if (sealHold[key].factId == factId) delete sealHold[key];
            emit FactRevoked(factId);
            rec.revoke(factId);
        } else {
            revert BadOp();
        }
    }

    /// @dev Each call is a timeout its family lets anyone trigger, and the
    ///      terms decide who is paid. One call that is not yet due fails alone.
    function _keep(bytes memory body) private {
        KeepCall[] memory calls = abi.decode(body, (KeepCall[]));
        if (calls.length == 0 || calls.length > MAX_CALLS) revert BadCall();
        for (uint256 i; i < calls.length; ++i) {
            KeepCall memory c = calls[i];
            if (!isKeepSelector[c.selector] || c.args.length > 64 || !hub.isFamily(c.family)) revert BadCall();
        }
        for (uint256 i; i < calls.length; ++i) {
            KeepCall memory c = calls[i];
            (bool ok, bytes memory reason) = c.family.call{gas: KEEP_CALL_GAS}(abi.encodePacked(c.selector, c.args));
            emit KeepResult(c.family, c.selector, c.args, ok, ok ? bytes("") : reason);
        }
    }

    /// @dev A signed dry-run answer releases the fee the agent paid. The fee
    ///      contract accepts only its own adapter, so naming another moves nothing.
    function _dry(bytes memory body) private {
        (address fees, bytes32 runId, bytes32 resultHash) = abi.decode(body, (address, bytes32, bytes32));
        emit DryRunAnswered(fees, runId, resultHash);
        IKarwanCreFeesRelease(fees).release(runId, resultHash);
    }

    function isValidSignature(bytes32 hash, bytes memory) external view override returns (bytes4) {
        return approved[hash] ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }

    function verdictOf(bytes32 key) external view returns (bool set, bool pass, bytes32 evidenceHash) {
        Verdict memory v = _verdicts[key];
        return (v.set, v.pass, v.evidenceHash);
    }

    function verdictKey(address verifier, address family, bytes32 dealId, uint32 revision)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(verifier, family, dealId, revision));
    }

    /// @notice The verifier's own EIP-712 digest, computed here so the adapter
    ///         never trusts a value returned by an address named in a report.
    function checkDigest(
        address verifier,
        address family,
        bytes32 dealId,
        uint32 revision,
        bool pass,
        bytes32 evidenceHash
    ) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, VERIFIER_NAME, VERIFIER_VERSION, block.chainid, verifier));
        bytes32 structHash = keccak256(abi.encode(REPORT_TYPEHASH, family, dealId, revision, pass, evidenceHash));
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }
}
