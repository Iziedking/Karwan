// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgreementTerms, AgreementState} from "../../src/suite/agreement/AgreementTypes.sol";
import {EndgameDeployment} from "./EndgameDeploy.sol";

/// @notice Every role the first settings name, used once on a configured
///         suite: the issuer writes a fact, two of three checkers pass a
///         delivery, and the auto arbiter proposes a split that anyone carries
///         out once the appeal window has passed. The live script and the Arc
///         fork test run these same steps.
abstract contract EndgameRoles {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 internal constant BUSINESS_VERIFIED = keccak256("karwan.fact.business_verified.v1");
    bytes32 internal constant CHECKED_SALT = keccak256("endgame testnet: checked deal");
    bytes32 internal constant DISPUTED_SALT = keccak256("endgame testnet: disputed deal");
    uint128 internal constant DEAL = 20e6;
    uint16 internal constant SPLIT_BPS = 5_000;
    uint256 internal constant GAS_FLOOR = 0.5e6;
    uint256 internal constant GAS_TOP_UP = 1e6;
    uint64 internal constant APPEAL_WINDOW = 72 hours;

    struct RoleKeys {
        uint256 buyer;
        uint256 seller;
        uint256 arbiter;
        uint256 issuer;
        uint256 checker1;
        uint256 checker2;
        uint256 checker3;
    }

    struct Opened {
        uint256 factId;
        bytes32 checked;
        bytes32 disputed;
    }

    /// @notice Stage one: identities, the fact, the checked deal settled, and
    ///         the disputed deal waiting out the appeal window on a proposal.
    function _openStage(EndgameDeployment memory d, RoleKeys memory k) internal returns (Opened memory o) {
        address usdc = d.jobs.asset();
        address buyer = VM.addr(k.buyer);
        address seller = VM.addr(k.seller);
        require(d.hub.isVerifier(address(d.verifier)), "suite not configured: no verifier");
        require(d.hub.isIssuer(VM.addr(k.issuer)), "suite not configured: issuer not set");
        require(d.hub.autoArbiter() == VM.addr(k.arbiter), "suite not configured: arbiter differs");

        VM.startBroadcast(k.buyer);
        if (d.identity.identityOf(buyer) == 0) d.identity.register();
        IERC20(usdc).approve(address(d.agreement), type(uint256).max);
        _topUp(usdc, VM.addr(k.arbiter));
        _topUp(usdc, VM.addr(k.issuer));
        VM.stopBroadcast();
        VM.startBroadcast(k.seller);
        if (d.identity.identityOf(seller) == 0) d.identity.register();
        VM.stopBroadcast();

        VM.startBroadcast(k.issuer);
        o.factId = d.record.recordFact(
            seller, BUSINESS_VERIFIED, 2, keccak256("endgame testnet: business registration check"), uint64(block.timestamp + 365 days)
        );
        VM.stopBroadcast();

        o.checked = _checkedDeal(d, k, usdc, seller);
        o.disputed = _disputedDeal(d, k, usdc, seller);
    }

    /// @notice Stage two, once the appeal window has passed: the buyer carries
    ///         out the arbiter's proposal and the deal ends as ruled.
    function _settleStage(EndgameDeployment memory d, RoleKeys memory k) internal returns (bytes32 id) {
        id = d.agreement.dealIdFor(VM.addr(k.buyer), DISPUTED_SALT);
        require(d.agreement.getDeal(id).state == AgreementState.Disputed, "the disputed deal is not waiting");
        VM.startBroadcast(k.buyer);
        d.agreement.executeRuling(id);
        VM.stopBroadcast();
        require(d.agreement.getDeal(id).state == AgreementState.Ruled, "the ruling was not carried out");
    }

    function _checkedDeal(EndgameDeployment memory d, RoleKeys memory k, address usdc, address seller)
        internal
        returns (bytes32 id)
    {
        AgreementTerms memory t = _terms(usdc, seller);
        t.reviewStarts = 2;
        t.startLongstop = 4 days;
        t.silentLongstop = 14 days;
        t.verifier = address(d.verifier);
        t.checkPolicy = keccak256("endgame testnet: proof of delivery matches the order");
        bytes32 h = d.agreement.termsHashOf(t);
        VM.startBroadcast(k.buyer);
        id = d.agreement.fund(CHECKED_SALT, t);
        VM.stopBroadcast();

        bytes32 proof = keccak256("endgame testnet: proof of delivery, checked deal");
        VM.startBroadcast(k.seller);
        d.agreement.accept(id, h);
        d.agreement.markDelivered(id, proof);
        VM.stopBroadcast();
        require(!d.agreement.getDeal(id).checkPassed, "check recorded before the report");

        (address[] memory signers, bytes[] memory sigs) =
            _twoOfThree(k, d.verifier.reportDigest(address(d.agreement), id, 1, true, proof));
        VM.startBroadcast(k.buyer);
        d.verifier.report(address(d.agreement), id, 1, true, proof, signers, sigs);
        VM.stopBroadcast();
        require(d.agreement.getDeal(id).checkPassed, "the two checkers' pass was not recorded");

        VM.startBroadcast(k.buyer);
        d.agreement.release(id);
        VM.stopBroadcast();
        require(d.agreement.getDeal(id).state == AgreementState.Settled, "checked deal not settled");
    }

    function _disputedDeal(EndgameDeployment memory d, RoleKeys memory k, address usdc, address seller)
        internal
        returns (bytes32 id)
    {
        AgreementTerms memory t = _terms(usdc, seller);
        t.partialBps = SPLIT_BPS;
        bytes32 h = d.agreement.termsHashOf(t);
        VM.startBroadcast(k.buyer);
        id = d.agreement.fund(DISPUTED_SALT, t);
        VM.stopBroadcast();
        VM.startBroadcast(k.seller);
        d.agreement.accept(id, h);
        d.agreement.markDelivered(id, keccak256("endgame testnet: proof of delivery, disputed deal"));
        VM.stopBroadcast();
        VM.startBroadcast(k.buyer);
        d.agreement.dispute(id, keccak256("endgame testnet: half the order arrived damaged"));
        VM.stopBroadcast();
        VM.startBroadcast(k.arbiter);
        d.agreement.proposeRuling(id, SPLIT_BPS, keccak256("endgame testnet: split the price"));
        VM.stopBroadcast();
        require(d.agreement.getDeal(id).state == AgreementState.Disputed, "the dispute is not open");
    }

    function _terms(address usdc, address seller) internal view returns (AgreementTerms memory t) {
        t.asset = usdc;
        t.seller = seller;
        t.amount = DEAL;
        t.trancheBps[0] = 10_000;
        t.acceptBy = uint64(block.timestamp + 1 days);
        t.deliveryDeadline = uint64(block.timestamp + 30 days);
        t.reclaimGrace = 2 days;
        t.reviewWindow = 3 days;
        t.silentLongstop = 10 days;
        t.agreementHash = keccak256("endgame testnet: illustrative order");
    }

    /// @notice Checkers 1 and 2 sign, listed in ascending address order as the
    ///         verifier requires.
    function _twoOfThree(RoleKeys memory k, bytes32 digest)
        internal
        pure
        returns (address[] memory signers, bytes[] memory sigs)
    {
        uint256 a = k.checker1;
        uint256 b = k.checker2;
        if (VM.addr(b) < VM.addr(a)) (a, b) = (b, a);
        signers = new address[](2);
        sigs = new bytes[](2);
        signers[0] = VM.addr(a);
        signers[1] = VM.addr(b);
        sigs[0] = _sign(a, digest);
        sigs[1] = _sign(b, digest);
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _topUp(address usdc, address who) internal {
        if (IERC20(usdc).balanceOf(who) < GAS_FLOOR) IERC20(usdc).transfer(who, GAS_TOP_UP);
    }
}
