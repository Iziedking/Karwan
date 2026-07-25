// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        if (allowance[from][msg.sender] < type(uint256).max) {
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// Teller that just takes the USDC and mints nothing back, standing in for a
/// teller the operator has repointed at an address they control.
contract DrainTeller {
    IERC20 public immutable usdc;
    constructor(IERC20 u) { usdc = u; }
    function deposit(uint256 amount, address) external returns (uint256) {
        usdc.transferFrom(msg.sender, address(this), amount);
        return amount;
    }
    function redeem(uint256, address, address) external pure returns (uint256) {
        return 0;
    }
}

/// @title F-2 and F-4 exploit gates
contract KarwanF2F4AttackTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address guardian = makeAddr("guardian");
    address operator = makeAddr("operator");
    bytes32 constant JOB = keccak256("f2-job");

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(
            address(usdc),
            150,
            treasury,
            address(vault),
            address(rep),
            10000,
            KarwanEscrow.YieldConfig({backstop: address(0), operator: address(0), coverageFloor: 0, maxYieldBps: 8000}),
            KarwanEscrow.TimingConfig({
                minReviewWindow: 60,
                maxReviewWindow: 180 days,
                disputeTimeoutSecs: 14 days,
                attestedWindowSecs: 1 days,
                maxDeadlineHorizon: 730 days
            })
        );
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        escrow.setGuardian(guardian);

        usdc.mint(buyer, 1000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _pcts() internal pure returns (uint8[] memory p) {
        p = new uint8[](2);
        p[0] = 50;
        p[1] = 50;
    }

    function _deliveredDeal() internal {
        vm.prank(buyer);
        escrow.fundEscrow(
            JOB,
            seller,
            500e18,
            _pcts(),
            0,
            KarwanEscrow.Timing({deliveryDeadline: 0, reviewWindow: 5 days, reclaimGrace: 0})
        );
        vm.prank(seller);
        escrow.acceptEscrow(JOB);
        vm.prank(seller);
        escrow.markDelivered(JOB, "proof");
    }

    // ============================== F-2 ==============================

    /// The hold budget is a cumulative cap. Repeated holds inside one block
    /// consume none of it (elapsed is zero), so a guardian that re-holds in a
    /// loop must not be able to push the seller's claim deadline out
    /// indefinitely. Total extension across every hold on an id is capped at
    /// maxHoldSecs.
    function test_F2_RepeatedHoldsCannotExtendDeadlineBeyondBudget() public {
        _deliveredDeal();
        uint64 budget = escrow.maxHoldSecs();
        uint64 deadlineBefore = escrow.getEscrow(JOB).claimDeadline;

        // Ten hold/release cycles in a single block. No time passes, so no
        // budget is consumed by any of them.
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(guardian);
            escrow.hold(JOB, "flag");
            vm.prank(guardian);
            escrow.releaseHold(JOB);
        }

        uint64 deadlineAfter = escrow.getEscrow(JOB).claimDeadline;
        assertLe(
            deadlineAfter - deadlineBefore,
            budget,
            "total deadline extension must never exceed the hold budget"
        );
    }

    /// Two holds in the same block, without an intervening release, must not
    /// stack either.
    function test_F2_BackToBackHoldsDoNotStack() public {
        _deliveredDeal();
        uint64 budget = escrow.maxHoldSecs();
        uint64 deadlineBefore = escrow.getEscrow(JOB).claimDeadline;

        vm.prank(guardian);
        escrow.hold(JOB, "flag-1");
        vm.prank(guardian);
        escrow.hold(JOB, "flag-2");

        assertLe(
            escrow.getEscrow(JOB).claimDeadline - deadlineBefore,
            budget,
            "back-to-back holds must not double the extension"
        );
    }

    /// A single honest hold still buys the seller the time it was frozen for.
    function test_F2_SingleHoldStillExtends() public {
        _deliveredDeal();
        uint64 deadlineBefore = escrow.getEscrow(JOB).claimDeadline;

        vm.prank(guardian);
        escrow.hold(JOB, "flag");

        assertGt(
            escrow.getEscrow(JOB).claimDeadline,
            deadlineBefore,
            "an honest hold still compensates the frozen party"
        );
    }

    // ============================== F-4 ==============================

    /// withdrawForYield refuses to drop liquid USDC below reservations plus
    /// cooling positions. wrap() moves USDC to the teller and must honour the
    /// same floor: without it an operator repoints the teller and wraps the
    /// whole balance, taking staker principal with it.
    function test_F4_WrapCannotBreachCoverageFloor() public {
        address staker = makeAddr("staker");
        usdc.mint(staker, 1_000e18);
        vm.startPrank(staker);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e18);
        vm.stopPrank();

        // Reserve against a live deal so the vault owes cash it must keep.
        vm.prank(address(escrow));
        vault.reserve(JOB, staker, 400e18, buyer);

        // The vault's operator defaults to its deployer, which is this test.
        DrainTeller teller = new DrainTeller(usdc);
        vault.setTeller(address(teller), address(usdc));

        uint256 liquid = usdc.balanceOf(address(vault));
        vm.expectRevert(KarwanVault.InsufficientLiquidUsdc.selector);
        vault.wrap(liquid);

        // Wrapping only the genuine surplus is still fine.
        vault.wrap(liquid - 400e18);
        assertEq(usdc.balanceOf(address(vault)), 400e18, "reservation stays liquid");
    }
}
