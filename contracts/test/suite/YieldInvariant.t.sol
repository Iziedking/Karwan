// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SuiteFixture} from "./SuiteFixture.sol";
import {DealAccount} from "../../src/suite/settlement/SettlementLib.sol";
import {KarwanYieldPool} from "../../src/suite/KarwanYieldPool.sol";
import {TestFamily} from "./mocks/TestFamily.sol";
import {BlocklistToken} from "./mocks/BlocklistToken.sol";
import {MockTeller} from "./mocks/MockTeller.sol";

contract YieldHandler is Test {
    TestFamily internal family;
    KarwanYieldPool internal pool;
    MockTeller internal teller;
    BlocklistToken internal usdc;
    address public buyer = makeAddr("yieldBuyer");
    address[3] public payees;
    address public stranger = makeAddr("yieldStranger");
    bytes32[] public deals;
    bool public exitReverted;

    address internal owner;

    constructor(TestFamily family_, KarwanYieldPool pool_, MockTeller teller_, BlocklistToken usdc_, address owner_) {
        owner = owner_;
        family = family_;
        pool = pool_;
        teller = teller_;
        usdc = usdc_;
        for (uint256 i; i < 3; ++i) {
            payees[i] = makeAddr(string(abi.encodePacked("yieldPayee", vm.toString(i))));
        }
        usdc.mint(buyer, 100_000_000e6);
        vm.prank(buyer);
        usdc.approve(address(family), type(uint256).max);
    }

    function open(uint256 who, uint256 amount, bool short) external {
        bytes32 id = keccak256(abi.encode("yield", deals.length));
        address[] memory list = new address[](1);
        list[0] = payees[who % 3];
        vm.startPrank(buyer);
        try family.open(id, address(usdc), list, uint64(block.timestamp + (short ? 1 days : 30 days))) {
            deals.push(id);
            try family.fund(id, bound(amount, 1, 90_000e6)) {} catch {}
        } catch {}
        vm.stopPrank();
    }

    function pay(uint256 seed, uint256 amount, bool toPayer) external {
        if (deals.length == 0) return;
        bytes32 id = deals[seed % deals.length];
        DealAccount memory a = family.accountOf(id);
        if (a.balance == 0) return;
        address to = toPayer ? a.payer : family.payeesOf(id)[0];
        try family.pay(id, to, bound(amount, 1, a.balance)) {} catch {
            exitReverted = true;
        }
    }

    function payFee(uint256 seed, uint256 amount) external {
        if (deals.length == 0) return;
        bytes32 id = deals[seed % deals.length];
        uint256 left = family.feeLeft(id);
        uint256 bal = family.accountOf(id).balance;
        if (left > bal) left = bal;
        if (left == 0) return;
        try family.payFee(id, bound(amount, 1, left)) {} catch {
            exitReverted = true;
        }
    }

    function park() external {
        try family.rebalanceYield(address(usdc)) {} catch {}
    }

    function rebalancePool() external {
        pool.rebalance();
    }

    function sweep() external {
        try pool.sweepYield() {} catch {}
    }

    function raisePrice(uint256 bps) external {
        teller.setPrice((teller.price() * (10_000 + bound(bps, 0, 50))) / 10_000);
    }

    function setSpread(uint256 bps) external {
        teller.setSpread(bound(bps, 0, 10));
    }

    function seed(uint256 amount) external {
        amount = bound(amount, 1, 50e6);
        usdc.mint(address(this), amount);
        usdc.approve(address(pool), amount);
        pool.backstop(amount);
    }

    /// A stranger tries every way out: a payout to themselves, the pool's
    /// withdrawal, and a sweep, which only ever pays the fee recipient.
    function strangerTakes(uint256 seed, uint256 amount) external {
        if (deals.length != 0) {
            vm.prank(stranger);
            try family.pay(deals[seed % deals.length], stranger, bound(amount, 1, 1_000e6)) {} catch {}
        }
        vm.startPrank(stranger);
        try pool.withdraw(bound(amount, 1, 1_000e6)) {} catch {}
        try pool.sweepYield() {} catch {}
        vm.stopPrank();
    }

    function stopOrResume(bool stop) external {
        vm.prank(owner);
        if (stop) pool.stop();
        else pool.resume();
    }

    function pauseTeller(bool p) external {
        teller.setPaused(p);
    }

    function block_(uint256 who, bool on) external {
        usdc.setBlocked(payees[who % 3], on);
    }

    function withdrawOwed(uint256 who) external {
        address p = payees[who % 3];
        if (usdc.blocked(p) || family.owed(address(usdc), p) == 0) return;
        vm.prank(p);
        try family.withdrawOwed(address(usdc)) {} catch {}
    }

    function wait(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1 minutes, 2 days));
    }
}

contract YieldInvariantTest is SuiteFixture {
    YieldHandler internal handler;

    function setUp() public {
        _deploySuite();
        hub.setCaps(address(family), address(usdc), 100_000e6, 100_000_000e6);
        _deployYield(address(family), 9_000);
        handler = new YieldHandler(family, pool, teller, usdc, address(this));
        targetContract(address(handler));
    }

    /// R2 with yield: what the family holds in cash plus what it parked is
    /// exactly its deals' balances plus what it owes.
    function invariant_family_books_balance_with_parked_money() public view {
        assertEq(
            usdc.balanceOf(address(family)) + family.parked(address(usdc)),
            family.held(address(usdc)) + family.owedTotal(address(usdc))
        );
    }

    function invariant_the_pool_knows_exactly_what_the_family_parked() public view {
        assertEq(family.parked(address(usdc)), pool.principalOf(address(family)));
        assertEq(pool.totalPrincipal(), pool.principalOf(address(family)));
    }

    /// With a price that only rises, the pool can always repay every family in
    /// full: it never subscribes more than its margin pays for.
    function invariant_the_pool_covers_what_families_parked() public view {
        assertGe(pool.value(), pool.totalPrincipal());
    }

    function invariant_exits_never_revert() public view {
        assertFalse(handler.exitReverted());
    }

    function invariant_only_parties_and_the_fee_recipient_are_paid() public view {
        assertEq(usdc.balanceOf(handler.stranger()), 0);
    }
}
