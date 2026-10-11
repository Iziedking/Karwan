// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IKarwanHub} from "./interfaces/IKarwanSuite.sol";

/// @title KarwanHub
/// @notice The registry every Karwan contract reads: which escrow families
///         exist, which assets and limits apply, who reviews disputes, which
///         verifiers and issuers are trusted. It holds no money. Its owner is
///         the timelock, and families copy what a deal needs when it opens, so
///         a change here never reaches a deal already open.
contract KarwanHub is Ownable2Step {
    uint16 public constant MAX_FEE_BPS = 1_000;

    struct Family {
        bool registered;
        bool retired;
        bool revoked;
        bool paused;
        uint16 feeBps;
    }

    struct Caps {
        uint128 perDeal;
        uint128 total;
    }

    address public immutable deployer;
    address public identity;
    address public record;
    address public stakeVault;

    address public feeRecipient;
    address public guardian;
    address public reviewSafe;
    address public seniorSafe;
    address public autoArbiter;

    mapping(address => Family) public families;
    mapping(address => bool) public assetAllowed;
    mapping(address => uint128) public highValueOf;
    mapping(address => mapping(address => Caps)) public capsOf;
    mapping(address => bool) public isVerifier;
    mapping(address => bool) public isIssuer;

    event Wired(address indexed identity, address indexed record, address indexed stakeVault);
    event FamilySet(address indexed family, bool retired, uint16 feeBps);
    event FamilyPaused(address indexed family, bool paused, address by);
    event FamilyRevoked(address indexed family);
    event AssetSet(address indexed asset, bool allowed, uint128 highValue);
    event CapsSet(address indexed family, address indexed asset, uint128 perDeal, uint128 total);
    event RoleSet(bytes32 indexed role, address indexed who);
    event ListSet(bytes32 indexed list, address indexed who, bool ok);

    error NotDeployer();
    error AlreadyWired();
    error AlreadyRegistered();
    error UnknownFamily();
    error NotGuardian();
    error BadFee();
    error BadCaps();
    error BadAsset();
    error NotAllowed();
    error Zero();

    constructor(address owner_) Ownable(owner_) {
        deployer = msg.sender;
    }

    /// @notice Point at the identity registry, record and stake vault, once,
    ///         in the deploy run. The deployer has no power after this.
    function wire(address identity_, address record_, address stakeVault_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (identity != address(0)) revert AlreadyWired();
        if (identity_ == address(0) || record_ == address(0) || stakeVault_ == address(0)) revert Zero();
        identity = identity_;
        record = record_;
        stakeVault = stakeVault_;
        emit Wired(identity_, record_, stakeVault_);
    }

    // ------------------------------ Families ------------------------------

    function registerFamily(address family, uint16 feeBps) external onlyOwner {
        if (family == address(0)) revert Zero();
        if (feeBps > MAX_FEE_BPS) revert BadFee();
        Family storage f = families[family];
        if (f.registered) revert AlreadyRegistered();
        f.registered = true;
        f.feeBps = feeBps;
        emit FamilySet(family, false, feeBps);
    }

    function setFamilyFee(address family, uint16 feeBps) external onlyOwner {
        if (feeBps > MAX_FEE_BPS) revert BadFee();
        Family storage f = _family(family);
        f.feeBps = feeBps;
        emit FamilySet(family, f.retired, feeBps);
    }

    /// @notice A retired family opens no new deals, ever. Its open deals still
    ///         settle, and it still counts as a family for records and stake.
    function retireFamily(address family) external onlyOwner {
        Family storage f = _family(family);
        f.retired = true;
        emit FamilySet(family, true, f.feeBps);
    }

    /// @notice Withdraw every power a family has outside its own deals: it can
    ///         no longer write records, spend agent allowances or reserve stake,
    ///         and it opens nothing new. Its open deals still pay out.
    function revokeFamily(address family) external onlyOwner {
        Family storage f = _family(family);
        f.retired = true;
        f.revoked = true;
        emit FamilyRevoked(family);
    }

    /// @notice Stop a family's new deals and new money. The guardian or the
    ///         owner can pause; only the owner resumes. Exits never pause.
    function pauseFamily(address family) external {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _family(family).paused = true;
        emit FamilyPaused(family, true, msg.sender);
    }

    function resumeFamily(address family) external onlyOwner {
        _family(family).paused = false;
        emit FamilyPaused(family, false, msg.sender);
    }

    // --------------------------- Assets and caps --------------------------

    function setAsset(address asset, bool allowed, uint128 highValue) external onlyOwner {
        if (asset == address(0)) revert Zero();
        if (allowed && IERC20Metadata(asset).decimals() != 6) revert BadAsset();
        assetAllowed[asset] = allowed;
        highValueOf[asset] = highValue;
        emit AssetSet(asset, allowed, highValue);
    }

    function setCaps(address family, address asset, uint128 perDeal, uint128 total) external onlyOwner {
        if (perDeal > total) revert BadCaps();
        _family(family);
        capsOf[family][asset] = Caps(perDeal, total);
        emit CapsSet(family, asset, perDeal, total);
    }

    // -------------------------------- Roles -------------------------------

    function setFeeRecipient(address who) external onlyOwner {
        if (who == address(0)) revert Zero();
        feeRecipient = who;
        emit RoleSet("feeRecipient", who);
    }

    function setGuardian(address who) external onlyOwner {
        if (who == address(0)) revert Zero();
        guardian = who;
        emit RoleSet("guardian", who);
    }

    function setReviewers(address review, address senior) external onlyOwner {
        if (review == address(0) || senior == address(0)) revert Zero();
        reviewSafe = review;
        seniorSafe = senior;
        emit RoleSet("reviewSafe", review);
        emit RoleSet("seniorSafe", senior);
    }

    /// @notice Zero turns automatic proposals off; disputes then go straight
    ///         to the reviewers.
    function setAutoArbiter(address who) external onlyOwner {
        autoArbiter = who;
        emit RoleSet("autoArbiter", who);
    }

    function setVerifier(address who, bool ok) external onlyOwner {
        if (who == address(0)) revert Zero();
        isVerifier[who] = ok;
        emit ListSet("verifier", who, ok);
    }

    function setIssuer(address who, bool ok) external onlyOwner {
        if (who == address(0)) revert Zero();
        isIssuer[who] = ok;
        emit ListSet("issuer", who, ok);
    }

    // -------------------------------- Views -------------------------------

    /// @notice Everything a family copies into a deal when it opens.
    function openingConfig(address family, address asset) external view returns (IKarwanHub.OpeningConfig memory c) {
        Family storage f = families[family];
        Caps storage k = capsOf[family][asset];
        c.open = f.registered && !f.retired && !f.paused && assetAllowed[asset] && k.perDeal != 0
            && feeRecipient != address(0) && reviewSafe != address(0) && seniorSafe != address(0);
        c.feeBps = f.feeBps;
        c.feeRecipient = feeRecipient;
        c.perDealCap = k.perDeal;
        c.highValue = highValueOf[asset];
        c.reviewSafe = reviewSafe;
        c.seniorSafe = seniorSafe;
        c.autoArbiter = autoArbiter;
    }

    function totalCapOf(address family, address asset) external view returns (uint128) {
        return capsOf[family][asset].total;
    }

    /// @notice A family that may write records and use allowances: registered
    ///         and not revoked. A retired family still counts.
    function isFamily(address family) external view returns (bool) {
        return families[family].registered && !families[family].revoked;
    }

    /// @notice The hub can never be left without an owner.
    function renounceOwnership() public view override onlyOwner {
        revert NotAllowed();
    }

    function _family(address family) internal view returns (Family storage f) {
        f = families[family];
        if (!f.registered) revert UnknownFamily();
    }
}
