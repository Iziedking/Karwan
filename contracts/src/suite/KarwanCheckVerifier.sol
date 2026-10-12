// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SigCheck} from "./SigCheck.sol";

interface ICheckTarget {
    function attestCheck(bytes32 dealId, uint32 revision, bool pass, bytes32 evidenceHash) external;
}

/// @title KarwanCheckVerifier
/// @notice Reports a delivery check to an escrow family only when enough of
///         its independent checkers signed the same result. The checkers and
///         the threshold are fixed at deployment; a new set is a new verifier,
///         registered through the timelock, and deals keep the verifier they
///         opened with. Anyone may submit a signed report. It holds no money.
contract KarwanCheckVerifier is EIP712 {
    bytes32 public constant REPORT_TYPEHASH = keccak256(
        "Report(address family,bytes32 dealId,uint32 revision,bool pass,bytes32 evidenceHash)"
    );

    uint8 public immutable threshold;
    uint8 public immutable signerCount;
    mapping(address => bool) public isSigner;

    event Reported(address indexed family, bytes32 indexed dealId, uint32 revision, bool pass, bytes32 evidenceHash);

    error BadSigners();
    error NotEnough();

    constructor(address[] memory signers, uint8 threshold_) EIP712("KarwanCheckVerifier", "1") {
        if (threshold_ == 0 || threshold_ > signers.length || signers.length > type(uint8).max) revert BadSigners();
        for (uint256 i; i < signers.length; ++i) {
            address s = signers[i];
            if (s == address(0) || isSigner[s]) revert BadSigners();
            isSigner[s] = true;
        }
        threshold = threshold_;
        signerCount = uint8(signers.length);
    }

    /// @notice Pass on a check result signed by at least `threshold` checkers,
    ///         listed in ascending address order so none is counted twice.
    function report(
        address family,
        bytes32 dealId,
        uint32 revision,
        bool pass,
        bytes32 evidenceHash,
        address[] calldata signers,
        bytes[] calldata sigs
    ) external {
        if (signers.length != sigs.length || signers.length < threshold) revert NotEnough();
        bytes32 digest = reportDigest(family, dealId, revision, pass, evidenceHash);
        address last;
        for (uint256 i; i < signers.length; ++i) {
            address s = signers[i];
            if (s <= last || !isSigner[s] || !SigCheck.isValid(s, digest, sigs[i])) revert BadSigners();
            last = s;
        }
        emit Reported(family, dealId, revision, pass, evidenceHash);
        ICheckTarget(family).attestCheck(dealId, revision, pass, evidenceHash);
    }

    function reportDigest(address family, bytes32 dealId, uint32 revision, bool pass, bytes32 evidenceHash)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(REPORT_TYPEHASH, family, dealId, revision, pass, evidenceHash)));
    }
}
