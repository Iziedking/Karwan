// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanStakeVault} from "../src/KarwanStakeVault.sol";
import {KarwanYieldPool} from "../src/KarwanYieldPool.sol";
import {PoolToken} from "./KarwanYieldPool.t.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// Minimal passkey-style smart wallet: valid when its signer key signed.
contract SmartWallet is IERC1271 {
    address public signer;

    constructor(address s) { signer = s; }

    function isValidSignature(bytes32 hash, bytes memory sig) external view returns (bytes4) {
        (address rec,,) = ECDSA.tryRecover(hash, sig);
        return rec == signer ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

contract KarwanStakeVaultTest is Test {
    PoolToken usdc;
    KarwanStakeVault vault;
    KarwanYieldPool pool;

    address owner = makeAddr("timelock");
    address escrow = makeAddr("escrow");
    address buyer = makeAddr("buyer");
    address stranger = makeAddr("stranger");
    uint256 sellerPk = 0xA11CE;
    address seller;
    address agent = makeAddr("seller-agent");
    bytes32 constant DEAL = keccak256("deal-1");

    function setUp() public {
        seller = vm.addr(sellerPk);
        usdc = new PoolToken();
        vault = new KarwanStakeVault(address(usdc), owner);
        vm.prank(owner);
        vault.setConsumer(escrow, true);
        _stake(seller, 1_000e6);
    }

    function _stake(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        vault.stake(amount);
        vm.stopPrank();
    }

    function _sig(uint256 pk, address o, address a, uint128 cap, uint64 expiry, uint256 nonce) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, vault.bindDigest(o, a, cap, expiry, nonce));
        return abi.encodePacked(r, s, v);
    }

    function _bind(uint128 cap) internal {
        uint64 expiry = uint64(block.timestamp + 30 days);
        vault.bindAgentWithSig(seller, agent, cap, expiry, 0, _sig(sellerPk, seller, agent, cap, expiry, 0));
    }

    // ------------------------------- binding -------------------------------

    function test_S1_CannotBindAsSomeoneElsesAgentWithoutTheirSignature() public {
        uint256 attackerPk = 0xBAD;
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes memory forged = _sig(attackerPk, seller, stranger, 1_000e6, expiry, 0);
        vm.expectRevert(KarwanStakeVault.BadSignature.selector);
        vault.bindAgentWithSig(seller, stranger, 1_000e6, expiry, 0, forged);
    }

    function test_S3_ASignatureCannotBeReplayed() public {
        uint64 expiry = uint64(block.timestamp + 30 days);
        bytes memory sig = _sig(sellerPk, seller, agent, 500e6, expiry, 0);
        vault.bindAgentWithSig(seller, agent, 500e6, expiry, 0, sig);
        vm.expectRevert(KarwanStakeVault.BadNonce.selector);
        vault.bindAgentWithSig(seller, agent, 500e6, expiry, 0, sig);
    }

    function test_BindingWorksForASmartWalletOwner() public {
        uint256 keyPk = 0xC0FFEE;
        SmartWallet wallet = new SmartWallet(vm.addr(keyPk));
        _stake(address(wallet), 200e6);
        address walletAgent = makeAddr("wallet-agent");
        uint64 expiry = uint64(block.timestamp + 30 days);
        vault.bindAgentWithSig(address(wallet), walletAgent, 200e6, expiry, 0, _sig(keyPk, address(wallet), walletAgent, 200e6, expiry, 0));
        vm.prank(escrow);
        vault.reserve(DEAL, walletAgent, 150e6, buyer);
        assertEq(vault.freeStakeOf(address(wallet)), 50e6);
    }

    function test_S4_AgentCannotCommitBeyondItsCap() public {
        _bind(300e6);
        vm.startPrank(escrow);
        vault.reserve(DEAL, agent, 200e6, buyer);
        vm.expectRevert(KarwanStakeVault.CapExceeded.selector);
        vault.reserve(keccak256("deal-2"), agent, 101e6, buyer);
        vm.stopPrank();
    }

    function test_ExpiredOrRevokedAgentCannotCommit() public {
        _bind(300e6);
        vm.prank(seller);
        vault.revokeAgent(agent);
        vm.prank(escrow);
        vm.expectRevert(KarwanStakeVault.Expired.selector);
        vault.reserve(DEAL, agent, 100e6, buyer);
    }

    function test_AgentCannotBeRepointedToAnotherOwnerWhileLive() public {
        _bind(300e6);
        uint256 otherPk = 0xB0B;
        address other = vm.addr(otherPk);
        uint64 expiry = uint64(block.timestamp + 30 days);
        bytes memory sig = _sig(otherPk, other, agent, 1e6, expiry, 0);
        vm.expectRevert(KarwanStakeVault.AgentBoundElsewhere.selector);
        vault.bindAgentWithSig(other, agent, 1e6, expiry, 0, sig);
    }

    // ----------------------------- reservations ----------------------------

    function test_S2_OnlyAllowlistedConsumersReserve() public {
        vm.prank(stranger);
        vm.expectRevert(KarwanStakeVault.NotConsumer.selector);
        vault.reserve(DEAL, seller, 100e6, stranger);
        vm.prank(stranger);
        vm.expectRevert();
        vault.setConsumer(stranger, true);
    }

    function test_SlashPaysOnlyTheBeneficiaryFixedAtReservation() public {
        vm.prank(escrow);
        vault.reserve(DEAL, seller, 400e6, buyer);
        vm.prank(escrow);
        vault.slashTo(DEAL, 250e6);
        assertEq(usdc.balanceOf(buyer), 250e6);
        assertEq(vault.freeStakeOf(seller), 750e6, "unslashed part returns to free stake");
    }

    function test_S5_ReservedStakeCannotBeWithdrawn() public {
        vm.prank(escrow);
        vault.reserve(DEAL, seller, 900e6, buyer);
        vm.prank(seller);
        vm.expectRevert(KarwanStakeVault.InsufficientFreeStake.selector);
        vault.requestWithdraw(200e6);
    }

    function test_S6_AdminCannotReleaseALiveConsumersReservation() public {
        vm.prank(escrow);
        vault.reserve(DEAL, seller, 400e6, buyer);
        vm.prank(owner);
        vm.expectRevert(KarwanStakeVault.ConsumerStillActive.selector);
        vault.adminRelease(escrow, DEAL);

        vm.prank(owner);
        vault.setConsumer(escrow, false);
        vm.prank(owner);
        vm.expectRevert(KarwanStakeVault.NotStrandedYet.selector);
        vault.adminRelease(escrow, DEAL);

        vm.warp(block.timestamp + 30 days);
        vm.prank(owner);
        vault.adminRelease(escrow, DEAL);
        assertEq(vault.freeStakeOf(seller), 1_000e6, "stake stays with its owner");
    }

    function test_CooldownThenClaim() public {
        vm.prank(seller);
        vault.requestWithdraw(600e6);
        vm.prank(seller);
        vm.expectRevert(KarwanStakeVault.StillCooling.selector);
        vault.claim();
        vm.warp(block.timestamp + 3 days);
        vm.prank(seller);
        vault.claim();
        assertEq(usdc.balanceOf(seller), 600e6);
    }

    // -------------------------------- yield --------------------------------

    function test_IdleStakeParksInThePoolAndComesBackForSlashes() public {
        pool = new KarwanYieldPool(address(usdc), 8, owner);
        vm.startPrank(owner);
        pool.setClient(address(vault), true);
        vault.setPool(address(pool));
        vault.setLiquidFloor(0);
        vm.stopPrank();
        _stake(makeAddr("big"), 100_000e6);
        vault.parkIdle();
        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(vault.parked(), 101_000e6);

        vm.prank(escrow);
        vault.reserve(DEAL, seller, 500e6, buyer);
        vm.prank(escrow);
        vault.slash(DEAL);
        assertEq(usdc.balanceOf(buyer), 500e6, "slash unparks what it needs");
    }

    function test_PoolCannotBeSwappedWhileStakeIsParked() public {
        pool = new KarwanYieldPool(address(usdc), 8, owner);
        vm.startPrank(owner);
        pool.setClient(address(vault), true);
        vault.setPool(address(pool));
        vault.setLiquidFloor(0);
        vm.stopPrank();
        vault.parkIdle();
        vm.prank(owner);
        vm.expectRevert(KarwanStakeVault.PoolStillHoldsStake.selector);
        vault.setPool(address(0));
    }
}

contract StakeVaultHandler is Test {
    KarwanStakeVault public vault;
    PoolToken public usdc;
    address public escrow;
    address[3] public stakers;
    bytes32[] public ids;
    uint256 public slashedOut;

    constructor(KarwanStakeVault v, PoolToken u, address e) {
        vault = v;
        usdc = u;
        escrow = e;
        stakers = [makeAddr("s0"), makeAddr("s1"), makeAddr("s2")];
    }

    function stake(uint256 who, uint256 amount) external {
        address s = stakers[who % 3];
        amount = bound(amount, 1e6, 50_000e6);
        usdc.mint(s, amount);
        vm.startPrank(s);
        usdc.approve(address(vault), amount);
        vault.stake(amount);
        vm.stopPrank();
    }

    function requestWithdraw(uint256 who, uint256 amount) external {
        address s = stakers[who % 3];
        uint256 free = vault.freeStakeOf(s);
        if (free == 0) return;
        vm.prank(s);
        vault.requestWithdraw(bound(amount, 1, free));
    }

    function claim(uint256 who) external {
        vm.warp(block.timestamp + 3 days);
        vm.prank(stakers[who % 3]);
        try vault.claim() {} catch {}
    }

    function reserve(uint256 who, uint256 amount) external {
        address s = stakers[who % 3];
        uint256 free = vault.freeStakeOf(s);
        if (free == 0) return;
        bytes32 id = keccak256(abi.encode(ids.length, s));
        vm.prank(escrow);
        vault.reserve(id, s, bound(amount, 1, free), makeAddr("beneficiary"));
        ids.push(id);
    }

    function settle(uint256 idx, uint256 amount, bool doSlash) external {
        if (ids.length == 0) return;
        bytes32 id = ids[idx % ids.length];
        vm.startPrank(escrow);
        if (doSlash) {
            uint256 before = usdc.balanceOf(makeAddr("beneficiary"));
            try vault.slashTo(id, amount) {} catch {}
            slashedOut += usdc.balanceOf(makeAddr("beneficiary")) - before;
        } else {
            vault.release(id);
        }
        vm.stopPrank();
    }
}

contract KarwanStakeVaultInvariantTest is Test {
    KarwanStakeVault vault;
    PoolToken usdc;
    StakeVaultHandler handler;
    address escrow = makeAddr("escrow");

    function setUp() public {
        usdc = new PoolToken();
        vault = new KarwanStakeVault(address(usdc), address(this));
        vault.setConsumer(escrow, true);
        handler = new StakeVaultHandler(vault, usdc, escrow);
        targetContract(address(handler));
    }

    /// Every unit held is owed to a staker, active or cooling.
    function invariant_HoldingsEqualStakeOwed() public view {
        assertEq(usdc.balanceOf(address(vault)) + vault.parked(), vault.totalActive() + vault.totalCooling());
    }

    /// Reserved stake never exceeds active stake, per staker and in total.
    function invariant_ReservedWithinActive() public view {
        assertLe(vault.totalReserved(), vault.totalActive());
        for (uint256 i = 0; i < 3; i++) {
            (uint256 active, uint256 reserved,,,) = vault.accounts(handler.stakers(i));
            assertLe(reserved, active);
        }
    }
}
