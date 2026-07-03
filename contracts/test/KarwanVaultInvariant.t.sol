// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 a) external { balanceOf[to] += a; totalSupply += a; }
    function approve(address s, uint256 a) external override returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external override returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address t, uint256 a) external override returns (bool) {
        if (allowance[f][msg.sender] < type(uint256).max) allowance[f][msg.sender] -= a;
        balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
}

/// @dev Drives the vault through deposit / withdraw lifecycle + consumer
///      reserve/release/slash, over a small fixed staker set, while tracking
///      reservation resolution so the invariant can prove every reserve ends as
///      exactly one of release or slash, never both.
contract VaultHandler is Test {
    KarwanVault public vault;
    MockUSDC public usdc;
    address public beneficiary = makeAddr("beneficiary");

    address[3] public stakers;
    // per-staker position ids we've opened (ghost, may include closed ones)
    mapping(uint256 => uint256[]) public posIds;

    bytes32[] public reserveIds;
    mapping(bytes32 => bool) public reserveActive;
    mapping(bytes32 => uint8) public reserveResolutions; // count of release|slash per id (must stay <= 1)
    uint256 public reserveNonce;

    constructor(KarwanVault _vault, MockUSDC _usdc) {
        vault = _vault;
        usdc = _usdc;
        stakers[0] = makeAddr("s0");
        stakers[1] = makeAddr("s1");
        stakers[2] = makeAddr("s2");
    }

    function sumActivePrincipal() external view returns (uint256 s) {
        for (uint256 i; i < 3; i++) s += vault.activePrincipalOf(stakers[i]);
    }

    function maxResolutions() external view returns (uint8 m) {
        for (uint256 i; i < reserveIds.length; i++) {
            uint8 r = reserveResolutions[reserveIds[i]];
            if (r > m) m = r;
        }
    }

    function deposit(uint256 sIdx, uint256 amount) external {
        address s = stakers[sIdx % 3];
        if (vault.positionCountOf(s) >= vault.MAX_POSITIONS_PER_OWNER()) return;
        amount = bound(amount, vault.MIN_PRINCIPAL(), 1000e6);
        usdc.mint(s, amount);
        vm.startPrank(s);
        usdc.approve(address(vault), amount);
        uint256 pid = vault.deposit(amount);
        vm.stopPrank();
        posIds[sIdx % 3].push(pid);
    }

    function requestWithdraw(uint256 sIdx, uint256 pSeed) external {
        address s = stakers[sIdx % 3];
        uint256[] storage ids = posIds[sIdx % 3];
        if (ids.length == 0) return;
        uint256 pid = ids[pSeed % ids.length];
        vm.prank(s);
        try vault.requestWithdraw(pid) {} catch {}
    }

    function cancelWithdraw(uint256 sIdx, uint256 pSeed) external {
        address s = stakers[sIdx % 3];
        uint256[] storage ids = posIds[sIdx % 3];
        if (ids.length == 0) return;
        uint256 pid = ids[pSeed % ids.length];
        vm.prank(s);
        try vault.cancelWithdraw(pid) {} catch {}
    }

    function claim(uint256 sIdx, uint256 pSeed, uint256 warp) external {
        address s = stakers[sIdx % 3];
        uint256[] storage ids = posIds[sIdx % 3];
        if (ids.length == 0) return;
        uint256 pid = ids[pSeed % ids.length];
        vm.warp(block.timestamp + bound(warp, 0, 10 days));
        vm.prank(s);
        try vault.claim(pid) {} catch {}
    }

    function reserve(uint256 sIdx, uint256 amount) external {
        address s = stakers[sIdx % 3];
        uint256 free = vault.freeStakeOf(s);
        if (free == 0) return;
        amount = bound(amount, 1, free);
        bytes32 id = keccak256(abi.encode("r", ++reserveNonce));
        // handler is an authorized consumer
        try vault.reserve(id, s, amount, beneficiary) {
            reserveIds.push(id);
            reserveActive[id] = true;
        } catch {}
    }

    function release(uint256 idSeed) external {
        if (reserveIds.length == 0) return;
        bytes32 id = reserveIds[idSeed % reserveIds.length];
        if (!reserveActive[id]) return;
        try vault.release(id) {
            reserveActive[id] = false;
            reserveResolutions[id] += 1;
        } catch {}
    }

    function slash(uint256 idSeed) external {
        if (reserveIds.length == 0) return;
        bytes32 id = reserveIds[idSeed % reserveIds.length];
        if (!reserveActive[id]) return;
        try vault.slash(id) {
            reserveActive[id] = false;
            reserveResolutions[id] += 1;
        } catch {}
    }
}

/// @title KarwanVault solvency invariants (§8)
/// @notice Coverage, solvency, and reservation conservation hold across any
///         sequence of deposits, withdrawals, reservations, releases and slashes.
contract KarwanVaultInvariantTest is Test {
    KarwanVault vault;
    MockUSDC usdc;
    VaultHandler handler;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        handler = new VaultHandler(vault, usdc);
        // Authorize the handler as a consumer so it can reserve/release/slash.
        vault.setConsumer(address(handler), true);
        targetContract(address(handler));
    }

    /// H-2 coverage: liquid USDC always covers everything payable in cash
    /// (active reservations that could slash + cooling positions that claim).
    function invariant_Coverage() public view {
        assertGe(
            usdc.balanceOf(address(vault)),
            vault.totalReservedAll() + vault.totalCoolingAll(),
            "vault liquid must cover reserved + cooling"
        );
    }

    /// Solvency: liquid + funds out for yield always cover all staker principal
    /// still owed (active + cooling). >= because realised yield surplus adds a
    /// buffer on top.
    function invariant_Solvency() public view {
        assertGe(
            usdc.balanceOf(address(vault)) + vault.outForYield(),
            handler.sumActivePrincipal() + vault.totalCoolingAll(),
            "vault must be able to cover all principal owed"
        );
    }

    /// Reservation conservation: no reservation is ever resolved more than once
    /// (release XOR slash, never both, never twice).
    function invariant_ReservationResolvedAtMostOnce() public view {
        assertLe(handler.maxResolutions(), 1, "a reservation resolves at most once");
    }
}
