// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SuiteFixture} from "./SuiteFixture.sol";
import {KarwanHub} from "../../src/suite/KarwanHub.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";
import {TestFamily} from "./mocks/TestFamily.sol";
import {BlocklistToken} from "./mocks/BlocklistToken.sol";

contract SettlementHandler is Test {
    KarwanHub internal hub;
    TestFamily internal family;
    BlocklistToken internal usdc;
    address internal owner;
    address public stranger = makeAddr("stranger");
    address[4] public actors;
    bytes32[] public deals;
    bool public unexpectedRevert;
    bool public strangerPaid;
    uint256 public fundedTotal;

    constructor(KarwanHub hub_, TestFamily family_, BlocklistToken usdc_, address owner_) {
        hub = hub_;
        family = family_;
        usdc = usdc_;
        owner = owner_;
        for (uint256 i; i < 4; ++i) {
            actors[i] = makeAddr(string(abi.encodePacked("actor", vm.toString(i))));
            usdc.mint(actors[i], 1_000_000e6);
            vm.prank(actors[i]);
            usdc.approve(address(family), type(uint256).max);
        }
    }

    function dealCount() external view returns (uint256) {
        return deals.length;
    }

    function open(uint256 payerSeed, uint256 payeeSeed) external {
        address payer = actors[payerSeed % 4];
        address payee = actors[(payerSeed + 1 + (payeeSeed % 3)) % 4];
        bytes32 id = keccak256(abi.encode("deal", deals.length));
        address[] memory list = new address[](1);
        list[0] = payee;
        vm.prank(payer);
        try family.open(id, address(usdc), list, uint64(block.timestamp + 30 days)) {
            deals.push(id);
        } catch {}
    }

    function fund(uint256 dealSeed, uint256 amount) external {
        if (deals.length == 0) return;
        bytes32 id = deals[dealSeed % deals.length];
        KarwanSettlementBase.Account memory a = family.accountOf(id);
        if (usdc.blocked(a.payer)) return;
        amount = bound(amount, 1, 300e6);
        vm.prank(a.payer);
        try family.fund(id, amount) {
            fundedTotal += amount;
        } catch {}
    }

    function pay(uint256 dealSeed, uint256 who, uint256 amount) external {
        if (deals.length == 0) return;
        bytes32 id = deals[dealSeed % deals.length];
        KarwanSettlementBase.Account memory a = family.accountOf(id);
        if (a.balance == 0 || a.closed) return;
        address party = who % 2 == 0 ? a.payer : family.payeesOf(id)[0];
        amount = bound(amount, 1, a.balance);
        try family.pay(id, party, amount) {} catch {
            unexpectedRevert = true;
        }
    }

    function payFee(uint256 dealSeed, uint256 amount) external {
        if (deals.length == 0) return;
        bytes32 id = deals[dealSeed % deals.length];
        KarwanSettlementBase.Account memory a = family.accountOf(id);
        uint256 left = family.feeLeft(id);
        if (left > a.balance) left = a.balance;
        if (left == 0) return;
        amount = bound(amount, 1, left);
        try family.payFee(id, amount) {} catch {
            unexpectedRevert = true;
        }
    }

    function strangerTakes(uint256 dealSeed, uint256 amount) external {
        if (deals.length == 0) return;
        bytes32 id = deals[dealSeed % deals.length];
        amount = bound(amount, 1, 1_000e6);
        try family.pay(id, stranger, amount) {
            strangerPaid = true;
        } catch {}
    }

    function setBlocked(uint256 who, bool isBlocked) external {
        usdc.setBlocked(actors[who % 4], isBlocked);
    }

    function withdraw(uint256 who) external {
        address a = actors[who % 4];
        if (usdc.blocked(a) || family.owed(address(usdc), a) == 0) return;
        vm.prank(a);
        try family.withdrawOwed(address(usdc)) {} catch {
            unexpectedRevert = true;
        }
    }

    function pause(bool paused) external {
        vm.prank(owner);
        if (paused) hub.pauseFamily(address(family));
        else hub.resumeFamily(address(family));
    }
}

contract SettlementInvariantTest is SuiteFixture {
    SettlementHandler internal handler;

    function setUp() public {
        _deploySuite();
        hub.setCaps(address(family), address(usdc), PER_DEAL, 1_000_000e6);
        handler = new SettlementHandler(hub, family, usdc, address(this));
        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 200
    function invariant_books_balance() public view {
        assertEq(usdc.balanceOf(address(family)), family.held(address(usdc)) + family.owedTotal(address(usdc)));
    }

    function invariant_held_is_the_sum_of_deal_balances() public view {
        uint256 sum;
        for (uint256 i; i < handler.dealCount(); ++i) {
            sum += family.accountOf(handler.deals(i)).balance;
        }
        assertEq(sum, family.held(address(usdc)));
    }

    function invariant_no_stranger_is_ever_paid() public view {
        assertFalse(handler.strangerPaid());
        assertEq(usdc.balanceOf(handler.stranger()), 0);
        assertEq(family.owed(address(usdc), handler.stranger()), 0);
    }

    function invariant_fees_within_rate() public view {
        uint256 fees = usdc.balanceOf(feeSafe) + family.owed(address(usdc), feeSafe);
        assertLe(fees, (handler.fundedTotal() * FEE_BPS) / 10_000);
    }

    function invariant_exits_never_revert_paused_or_blocked() public view {
        assertFalse(handler.unexpectedRevert());
    }
}
