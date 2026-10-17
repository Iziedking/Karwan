// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SuiteFixture} from "./SuiteFixture.sol";
import {AgreementFixture} from "./agreement/AgreementFixture.sol";
import {KarwanSettlementBase} from "../../src/suite/KarwanSettlementBase.sol";
import {KarwanStakeVault} from "../../src/suite/KarwanStakeVault.sol";
import {KarwanYieldPool} from "../../src/suite/KarwanYieldPool.sol";
import {KarwanTradeFinance} from "../../src/suite/KarwanTradeFinance.sol";
import {BlocklistToken} from "./mocks/BlocklistToken.sol";
import {ReenteringToken} from "./mocks/ReenteringToken.sol";

/// @notice A token that calls back mid-payment, and what it found.
abstract contract ReentryChecks {
    function _token() internal view virtual returns (ReenteringToken);

    function _arm(address target, bytes memory call) internal {
        _token().arm(target, call);
    }

    function _refused() internal view returns (bool) {
        ReenteringToken t = _token();
        return t.attempted() && !t.succeeded()
            && keccak256(t.reason())
                == keccak256(abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
    }
}

/// @notice The stake vault, the yield pool and a family's own yield step are
///         closed to re-entry by a token that calls back mid-payment.
contract SettlementReentrancyTest is SuiteFixture, ReentryChecks {
    address internal seller;
    uint256 internal sellerKey;
    address internal buyer;
    bytes32 internal constant REF = bytes32("deal-1");

    function setUp() public {
        _deploySuite();
        (seller, sellerKey,) = _person("seller");
        (buyer,,) = _person("buyer");
        usdc.mint(seller, 1_000e6);
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vault.stake(address(usdc), 100e6);
        vm.stopPrank();
    }

    function _newToken() internal override returns (BlocklistToken) {
        return new ReenteringToken();
    }

    function _token() internal view override returns (ReenteringToken) {
        return ReenteringToken(address(usdc));
    }

    function _armVault() internal {
        _arm(address(vault), abi.encodeCall(KarwanStakeVault.withdrawOwed, (address(usdc))));
    }

    function _armPool() internal {
        _arm(address(pool), abi.encodeCall(KarwanYieldPool.backstop, (0)));
    }

    function _reserve(uint128 amount) internal {
        uint64 expiresAt = uint64(vm.getBlockTimestamp() + 90 days);
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        bytes32 d = vault.reserveDigest(address(family), REF, address(usdc), amount, buyer, expiresAt, deadline);
        bytes memory sig = _sig(sellerKey, d);
        vm.prank(address(family));
        vault.reserve(REF, seller, address(usdc), amount, buyer, expiresAt, deadline, sig);
    }

    // ------------------------------- Stakes -------------------------------

    function test_staking_is_closed_to_reentry() public {
        _armVault();
        vm.prank(seller);
        vault.stake(address(usdc), 10e6);
        assertTrue(_refused());
    }

    function test_withdrawing_a_stake_is_closed_to_reentry() public {
        vm.prank(seller);
        vault.requestWithdraw(address(usdc), 40e6);
        vm.warp(vm.getBlockTimestamp() + 7 days);
        _armVault();
        vm.prank(seller);
        vault.withdraw(address(usdc));
        assertTrue(_refused());
    }

    function test_slashing_is_closed_to_reentry() public {
        _reserve(60e6);
        _armVault();
        vm.prank(address(family));
        vault.slash(REF, 20e6);
        assertTrue(_refused());
    }

    function test_withdrawing_an_owed_slash_is_closed_to_reentry() public {
        _reserve(60e6);
        usdc.setBlocked(buyer, true);
        vm.prank(address(family));
        vault.slash(REF, 20e6);
        usdc.setBlocked(buyer, false);
        _armVault();
        vm.prank(buyer);
        vault.withdrawOwed(address(usdc));
        assertTrue(_refused());
    }

    // ------------------------------ The pool ------------------------------

    function _withPool() internal {
        _deployYield(address(family), 9_000);
        usdc.mint(address(family), 1_000_000e6);
        vm.prank(address(family));
        usdc.approve(address(pool), type(uint256).max);
    }

    function test_parking_is_closed_to_reentry() public {
        _withPool();
        _armPool();
        vm.prank(address(family));
        pool.deposit(100_000e6);
        assertTrue(_refused());
    }

    function test_taking_back_is_closed_to_reentry() public {
        _withPool();
        vm.prank(address(family));
        pool.deposit(100_000e6);
        _armPool();
        vm.prank(address(family));
        pool.withdraw(40_000e6);
        assertTrue(_refused());
    }

    function test_rebalancing_the_pool_is_closed_to_reentry() public {
        _withPool();
        vm.prank(address(family));
        pool.deposit(100_000e6);
        _armPool();
        pool.rebalance();
        assertTrue(_refused());
    }

    function test_sweeping_yield_is_closed_to_reentry() public {
        _withPool();
        vm.prank(address(family));
        pool.deposit(100_000e6);
        pool.rebalance();
        teller.setPrice(1.1514e18);
        _armPool();
        pool.sweepYield();
        assertTrue(_refused());
    }

    function test_a_backstop_is_closed_to_reentry() public {
        _withPool();
        usdc.mint(feeSafe, 10e6);
        vm.prank(feeSafe);
        usdc.approve(address(pool), 10e6);
        _armPool();
        vm.prank(feeSafe);
        pool.backstop(10e6);
        assertTrue(_refused());
    }

    function test_a_familys_yield_step_is_closed_to_reentry() public {
        _deployYield(address(family), 9_000);
        _funded(buyer, 1_000e6);
        vm.startPrank(buyer);
        family.open(REF, address(usdc), _one(seller), uint64(vm.getBlockTimestamp() + 30 days));
        family.fund(REF, 500e6);
        vm.stopPrank();
        _arm(address(family), abi.encodeCall(KarwanSettlementBase.withdrawOwed, (address(usdc))));
        family.rebalanceYield(address(usdc));
        assertTrue(_refused());
    }
}

/// @notice Trade finance is closed to re-entry when it opens a line and when
///         it settles one.
contract TradeFinanceReentrancyTest is AgreementFixture, ReentryChecks {
    KarwanTradeFinance internal tf;
    address internal financier = makeAddr("financier");

    function setUp() public {
        _deployAgreement();
        tf = new KarwanTradeFinance(address(hub));
        hub.registerFamily(address(tf), 0);
        usdc.mint(financier, 1_000e6);
        vm.prank(financier);
        usdc.approve(address(tf), type(uint256).max);
        usdc.mint(seller, 100e6);
        vm.startPrank(seller);
        usdc.approve(address(vault), type(uint256).max);
        vault.stake(address(usdc), 100e6);
        vm.stopPrank();
    }

    function _newToken() internal override returns (BlocklistToken) {
        return new ReenteringToken();
    }

    function _token() internal view override returns (ReenteringToken) {
        return ReenteringToken(address(usdc));
    }

    function _armTf() internal {
        _arm(address(tf), abi.encodeCall(KarwanTradeFinance.settle, (bytes32(0))));
    }

    function _open(bytes32 id) internal returns (bytes32 lineId) {
        uint256 deadline = vm.getBlockTimestamp() + 1 hours;
        uint64 expiresAt = escrow.accountOf(id).horizon + 180 days + 30 days;
        bytes32 a = escrow.assignDigest(id, seller, financier, 60e6, address(tf), 7, deadline);
        KarwanTradeFinance.Signed memory assign = KarwanTradeFinance.Signed(7, deadline, _sig(sellerKey, a));
        lineId = tf.lineIdFor(address(escrow), id, financier, 50e6, 60e6, 10e6);
        bytes32 r = vault.reserveDigest(address(tf), lineId, address(usdc), 10e6, financier, expiresAt, deadline);
        KarwanTradeFinance.StakeSig memory reservation = KarwanTradeFinance.StakeSig(deadline, _sig(sellerKey, r));
        vm.prank(financier);
        tf.open(address(escrow), id, 50e6, 60e6, 10e6, expiresAt, assign, reservation);
    }

    function test_opening_a_line_is_closed_to_reentry() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("line"));
        _armTf();
        _open(id);
        assertTrue(_refused());
    }

    /// The deal ends with nothing for the seller, so the line settles from the
    /// stake, which the vault pays to the financier while the line is settling.
    function test_settling_a_line_is_closed_to_reentry() public {
        bytes32 id = _fundAccepted(_terms(), bytes32("line"));
        bytes32 lineId = _open(id);
        vm.prank(buyer);
        escrow.proposeSplit(id, 0);
        vm.prank(seller);
        escrow.acceptSplit(id, 0);
        _armTf();
        tf.settle(lineId);
        assertTrue(_refused());
    }
}
