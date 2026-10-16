// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KarwanHub} from "../../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../../src/suite/KarwanRecord.sol";
import {BlocklistToken} from "./mocks/BlocklistToken.sol";
import {TestFamily} from "./mocks/TestFamily.sol";
import {KarwanStakeVault} from "../../src/suite/KarwanStakeVault.sol";
import {KarwanYieldPool} from "../../src/suite/KarwanYieldPool.sol";
import {MockTeller} from "./mocks/MockTeller.sol";

abstract contract SuiteFixture is Test {
    uint128 internal constant PER_DEAL = 1_000e6;
    uint128 internal constant TOTAL = 10_000e6;
    uint16 internal constant FEE_BPS = 100;

    KarwanHub internal hub;
    KarwanIdentityRegistry internal identity;
    KarwanRecord internal record;
    BlocklistToken internal usdc;
    TestFamily internal family;
    KarwanStakeVault internal vault;
    KarwanYieldPool internal pool;
    MockTeller internal teller;

    address internal feeSafe = makeAddr("feeSafe");
    address internal guardian = makeAddr("guardian");
    address internal reviewSafe = makeAddr("reviewSafe");
    address internal seniorSafe = makeAddr("seniorSafe");
    address internal arbiter = makeAddr("arbiter");
    address internal issuer = makeAddr("issuer");

    function _deploySuite() internal virtual {
        hub = new KarwanHub(address(this));
        identity = new KarwanIdentityRegistry(address(hub));
        record = new KarwanRecord(address(hub));
        vault = new KarwanStakeVault(address(hub));
        hub.wire(address(identity), address(record), address(vault));
        usdc = new BlocklistToken(6);
        hub.setFeeRecipient(feeSafe);
        hub.setGuardian(guardian);
        hub.setReviewers(reviewSafe, seniorSafe);
        hub.setAutoArbiter(arbiter);
        hub.setAsset(address(usdc), true, 5_000e6);
        hub.setIssuer(issuer, true);
        family = new TestFamily(address(hub));
        hub.registerFamily(address(family), FEE_BPS);
        hub.setCaps(address(family), address(usdc), PER_DEAL, TOTAL);
    }

    /// A USDC yield pool on an entitled mock Teller, seeded by the treasury,
    /// with `share` of the family's eligible deal money allowed in it.
    function _deployYield(address fam, uint16 share) internal {
        _deployYieldBare(fam, share);
        _seedPool();
    }

    function _seedPool() internal {
        uint256 seed = 1e6;
        usdc.mint(feeSafe, seed);
        vm.startPrank(feeSafe);
        usdc.approve(address(pool), seed);
        pool.backstop(seed);
        vm.stopPrank();
    }

    function _deployYieldBare(address fam, uint16 share) internal {
        teller = new MockTeller(usdc);
        pool = new KarwanYieldPool(address(hub), address(usdc));
        hub.setYieldPool(address(usdc), address(pool));
        pool.setTeller(address(teller));
        teller.entitle(address(pool), true);
        hub.setYieldShare(fam, share);
    }

    function _person(string memory name) internal returns (address wallet, uint256 key, uint64 id) {
        (wallet, key) = makeAddrAndKey(name);
        vm.prank(wallet);
        id = identity.register();
    }

    function _funded(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(family), type(uint256).max);
    }

    function _sig(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /// One digit, for labelling up to ten fuzzing actors.
    function _digit(uint256 i) internal pure returns (string memory) {
        return string(abi.encodePacked(bytes1(uint8(48 + i))));
    }

    function _one(address a) internal pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = a;
    }
}
