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
    BlocklistToken[2] internal assets;
    address internal owner;
    address internal guardian;
    address internal senior;
    address public stranger = makeAddr("stranger");
    address public financier = makeAddr("financier");
    address[4] public actors;
    bytes32[] public deals;
    bool public unexpectedRevert;
    bool public strangerPaid;
    mapping(address => uint256) public fundedTotal;
    mapping(address => uint256) public assignedTotal;

    constructor(
        KarwanHub hub_,
        TestFamily family_,
        BlocklistToken a0,
        BlocklistToken a1,
        address owner_,
        address guardian_,
        address senior_
    ) {
        hub = hub_;
        family = family_;
        assets[0] = a0;
        assets[1] = a1;
        owner = owner_;
        guardian = guardian_;
        senior = senior_;
        for (uint256 i; i < 4; ++i) {
            actors[i] = makeAddr(string(abi.encodePacked("actor", vm.toString(i))));
            for (uint256 j; j < 2; ++j) {
                assets[j].mint(actors[i], 1_000_000e6);
                vm.prank(actors[i]);
                assets[j].approve(address(family), type(uint256).max);
            }
        }
    }

    function dealCount() external view returns (uint256) {
        return deals.length;
    }

    function _deal(uint256 seed) internal view returns (bytes32 id, KarwanSettlementBase.Account memory a) {
        id = deals[seed % deals.length];
        a = family.accountOf(id);
    }

    function open(uint256 payerSeed, uint256 payeeSeed, uint256 assetSeed, bool two) external {
        address payer = actors[payerSeed % 4];
        address[] memory list = new address[](two ? 2 : 1);
        list[0] = actors[(payerSeed + 1 + (payeeSeed % 3)) % 4];
        if (two) list[1] = actors[(payerSeed + 1 + ((payeeSeed + 1) % 3)) % 4];
        bytes32 id = keccak256(abi.encode("deal", deals.length));
        vm.prank(payer);
        try family.open(id, address(assets[assetSeed % 2]), list, uint64(block.timestamp + 30 days)) {
            deals.push(id);
        } catch {}
    }

    function fund(uint256 dealSeed, uint256 amount) external {
        if (deals.length == 0) return;
        (bytes32 id, KarwanSettlementBase.Account memory a) = _deal(dealSeed);
        if (BlocklistToken(a.asset).blocked(a.payer)) return;
        amount = bound(amount, 1, 300e6);
        vm.prank(a.payer);
        try family.fund(id, amount) {
            fundedTotal[a.asset] += amount;
        } catch {}
    }

    function pay(uint256 dealSeed, uint256 who, uint256 amount) external {
        if (deals.length == 0) return;
        (bytes32 id, KarwanSettlementBase.Account memory a) = _deal(dealSeed);
        if (a.balance == 0 || a.closed) return;
        address[] memory payees = family.payeesOf(id);
        uint256 pick = who % (payees.length + 1);
        address party = pick == 0 ? a.payer : payees[pick - 1];
        amount = bound(amount, 1, a.balance);
        try family.pay(id, party, amount) {} catch {
            unexpectedRevert = true;
        }
    }

    function payFee(uint256 dealSeed, uint256 amount) external {
        if (deals.length == 0) return;
        (bytes32 id, KarwanSettlementBase.Account memory a) = _deal(dealSeed);
        uint256 left = family.feeLeft(id);
        if (left > a.balance) left = a.balance;
        if (left == 0) return;
        amount = bound(amount, 1, left);
        try family.payFee(id, amount) {} catch {
            unexpectedRevert = true;
        }
    }

    function assign(uint256 dealSeed, uint256 who, uint128 amount) external {
        if (deals.length == 0) return;
        (bytes32 id, KarwanSettlementBase.Account memory a) = _deal(dealSeed);
        if (a.closed || a.payeeCount == 0) return;
        address payee = family.payeesOf(id)[who % a.payeeCount];
        amount = uint128(bound(amount, 1, 1_000e6));
        vm.prank(payee);
        try family.assignPayout(id, payee, financier, amount, 0, 0, "") {
            assignedTotal[a.asset] += amount;
        } catch {}
    }

    function hold(uint256 dealSeed) external {
        if (deals.length == 0) return;
        (bytes32 id,) = _deal(dealSeed);
        vm.prank(guardian);
        try family.hold(id, bytes32("fuzz")) {} catch {}
    }

    function longstop(uint256 dealSeed, uint256 toPayer, uint256 firstShare) external {
        if (deals.length == 0) return;
        (bytes32 id, KarwanSettlementBase.Account memory a) = _deal(dealSeed);
        if (a.closed || a.balance == 0) return;
        uint256 due = uint256(a.horizon) + family.LONGSTOP();
        if (block.timestamp < due) vm.warp(due);
        toPayer = bound(toPayer, 0, a.balance);
        uint256 rest = a.balance - toPayer;
        uint256[] memory toPayees = new uint256[](a.payeeCount);
        if (a.payeeCount == 1) {
            toPayees[0] = rest;
        } else {
            toPayees[0] = bound(firstShare, 0, rest);
            toPayees[1] = rest - toPayees[0];
        }
        vm.prank(senior);
        try family.longstopSplit(id, toPayer, toPayees) {} catch {
            unexpectedRevert = true;
        }
    }

    function strangerTakes(uint256 dealSeed, uint256 amount) external {
        if (deals.length == 0) return;
        (bytes32 id,) = _deal(dealSeed);
        amount = bound(amount, 1, 1_000e6);
        try family.pay(id, stranger, amount) {
            strangerPaid = true;
        } catch {}
    }

    function setBlocked(uint256 who, uint256 assetSeed, bool isBlocked) external {
        assets[assetSeed % 2].setBlocked(actors[who % 4], isBlocked);
    }

    function withdraw(uint256 who, uint256 assetSeed) external {
        address a = actors[who % 4];
        BlocklistToken t = assets[assetSeed % 2];
        if (t.blocked(a) || family.owed(address(t), a) == 0) return;
        vm.prank(a);
        try family.withdrawOwed(address(t)) {} catch {
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
    BlocklistToken internal eurc;

    function setUp() public {
        _deploySuite();
        eurc = new BlocklistToken(6);
        hub.setAsset(address(eurc), true, 5_000e6);
        hub.setCaps(address(family), address(usdc), PER_DEAL, 1_000_000e6);
        hub.setCaps(address(family), address(eurc), PER_DEAL, 1_000_000e6);
        handler = new SettlementHandler(hub, family, usdc, eurc, address(this), guardian, seniorSafe);
        targetContract(address(handler));
    }

    function _assets() internal view returns (BlocklistToken[2] memory list) {
        list[0] = usdc;
        list[1] = eurc;
    }

    function invariant_books_balance_per_asset() public view {
        BlocklistToken[2] memory list = _assets();
        for (uint256 i; i < 2; ++i) {
            address t = address(list[i]);
            assertEq(list[i].balanceOf(address(family)), family.held(t) + family.owedTotal(t));
        }
    }

    function invariant_held_is_the_sum_of_deal_balances_per_asset() public view {
        uint256[2] memory sum;
        for (uint256 i; i < handler.dealCount(); ++i) {
            KarwanSettlementBase.Account memory a = family.accountOf(handler.deals(i));
            sum[a.asset == address(usdc) ? 0 : 1] += a.balance;
        }
        assertEq(sum[0], family.held(address(usdc)));
        assertEq(sum[1], family.held(address(eurc)));
    }

    function invariant_no_stranger_is_ever_paid() public view {
        assertFalse(handler.strangerPaid());
        BlocklistToken[2] memory list = _assets();
        for (uint256 i; i < 2; ++i) {
            assertEq(list[i].balanceOf(handler.stranger()), 0);
            assertEq(family.owed(address(list[i]), handler.stranger()), 0);
        }
    }

    function invariant_fees_within_rate_per_asset() public view {
        BlocklistToken[2] memory list = _assets();
        for (uint256 i; i < 2; ++i) {
            address t = address(list[i]);
            uint256 fees = list[i].balanceOf(feeSafe) + family.owed(t, feeSafe);
            assertLe(fees, (handler.fundedTotal(t) * FEE_BPS) / 10_000);
        }
    }

    function invariant_assignee_never_gets_more_than_assigned() public view {
        BlocklistToken[2] memory list = _assets();
        for (uint256 i; i < 2; ++i) {
            address t = address(list[i]);
            uint256 got = list[i].balanceOf(handler.financier()) + family.owed(t, handler.financier());
            assertLe(got, handler.assignedTotal(t));
        }
    }

    function invariant_exits_never_revert_paused_blocked_held_or_assigned() public view {
        assertFalse(handler.unexpectedRevert());
    }
}
