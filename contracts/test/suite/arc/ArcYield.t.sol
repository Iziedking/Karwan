// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KarwanHub} from "../../../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../../../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../../../src/suite/KarwanRecord.sol";
import {KarwanStakeVault} from "../../../src/suite/KarwanStakeVault.sol";
import {KarwanYieldPool} from "../../../src/suite/KarwanYieldPool.sol";
import {TestFamily} from "../mocks/TestFamily.sol";

interface IRolesAuthority {
    function owner() external view returns (address);
    function setUserRole(address user, uint8 role, bool enabled) external;
}

/// @notice Deal money in Circle's real USYC Teller, against Arc Foundry forking
///         Arc testnet (`forge-remote.sh --arc`). A pool Circle has not
///         entitled stays in cash and pays every deal; an entitled pool holds
///         real USYC and still pays every deal in full.
contract ArcYieldTest is Test {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    address internal constant TELLER = 0x9fdF14c5B14173D74C08Af27AebFf39240dC105A;
    IERC20 internal constant USYC = IERC20(0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C);
    IRolesAuthority internal constant ENTITLEMENTS = IRolesAuthority(0xCC205224862C7641930c87679E98999d23C26113);
    uint256 internal constant AMOUNT = 20_000e6;
    bytes32 internal constant DEAL = bytes32("arc-yield");

    KarwanHub internal hub;
    TestFamily internal family;
    KarwanYieldPool internal pool;
    address internal buyer = makeAddr("arcYieldBuyer");
    address internal seller = makeAddr("arcYieldSeller");
    address internal feeSafe = makeAddr("arcFeeSafe");

    function setUp() public {
        if (!vm.envOr("ARC_FORK", false)) vm.skip(true);
        hub = new KarwanHub(address(this));
        KarwanIdentityRegistry identity = new KarwanIdentityRegistry(address(hub));
        KarwanRecord record = new KarwanRecord(address(hub));
        KarwanStakeVault vault = new KarwanStakeVault(address(hub));
        hub.wire(address(identity), address(record), address(vault));
        hub.setAsset(address(USDC), true, 1_000_000e6);
        hub.setFeeRecipient(feeSafe);
        hub.setGuardian(makeAddr("arcGuardian"));
        hub.setReviewers(makeAddr("arcReview"), makeAddr("arcSenior"));
        family = new TestFamily(address(hub));
        hub.registerFamily(address(family), 100);
        hub.setCaps(address(family), address(USDC), 100_000e6, 1_000_000e6);
        pool = new KarwanYieldPool(address(hub), address(USDC));
        hub.setYieldPool(address(USDC), address(pool));
        pool.setTeller(TELLER);
        hub.setYieldShare(address(family), 9_000);
        vm.deal(feeSafe, 10 ether);
        vm.startPrank(feeSafe);
        USDC.approve(address(pool), 1e6);
        pool.backstop(1e6);
        vm.stopPrank();
        vm.deal(buyer, 100_000 ether);
        vm.startPrank(buyer);
        USDC.approve(address(family), type(uint256).max);
        address[] memory payees = new address[](1);
        payees[0] = seller;
        family.open(DEAL, address(USDC), payees, uint64(block.timestamp + 30 days));
        family.fund(DEAL, AMOUNT);
        vm.stopPrank();
    }

    function test_a_pool_circle_has_not_entitled_stays_in_cash_on_arc() public {
        family.rebalanceYield(address(USDC));
        pool.rebalance();
        assertEq(USYC.balanceOf(address(pool)), 0);
        family.pay(DEAL, seller, AMOUNT);
        assertEq(USDC.balanceOf(seller), AMOUNT);
    }

    function test_an_entitled_pool_holds_real_usyc_and_pays_in_full_on_arc() public {
        vm.prank(ENTITLEMENTS.owner());
        ENTITLEMENTS.setUserRole(address(pool), 0, true);
        family.rebalanceYield(address(USDC));
        pool.rebalance();
        assertGt(USYC.balanceOf(address(pool)), 0);
        assertGe(pool.value(), pool.totalPrincipal());
        family.pay(DEAL, seller, AMOUNT);
        assertEq(USDC.balanceOf(seller), AMOUNT);
        assertEq(family.parked(address(USDC)), 0);
        assertEq(pool.totalPrincipal(), 0);
    }
}
