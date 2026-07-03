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

contract MockBackstop {
    IERC20 public immutable usdc;
    address public escrow;

    constructor(IERC20 _usdc) {
        usdc = _usdc;
    }

    function setEscrow(address e) external {
        escrow = e;
    }

    function receiveEscrowFloat(uint256 amount) external {
        require(msg.sender == escrow, "not escrow");
        usdc.transferFrom(escrow, address(this), amount);
    }

    function returnEscrowLiquidity(uint256 amount) external {
        require(msg.sender == escrow, "not escrow");
        usdc.transfer(escrow, amount);
    }
}

/// @dev Handler drives a single deal through funds, sweeps, and payouts while
///      the invariant checks that the escrow's tracked liability is always
///      fully backed by liquid USDC plus what's parked at the Treasury. This is
///      the core "principal can never be lost to yield routing" guarantee.
contract YieldHandler is Test {
    KarwanEscrow public escrow;
    MockUSDC public usdc;
    MockBackstop public backstop;
    address public buyer;
    address public seller;
    address public keeper;

    uint256 public dealNonce;
    bytes32 public activeJob;
    bool public dealOpen;
    bool public accepted;
    bool public delivered;

    constructor(
        KarwanEscrow _escrow,
        MockUSDC _usdc,
        MockBackstop _backstop,
        address _buyer,
        address _seller,
        address _keeper
    ) {
        escrow = _escrow;
        usdc = _usdc;
        backstop = _backstop;
        buyer = _buyer;
        seller = _seller;
        keeper = _keeper;
    }

    function _pcts() internal pure returns (uint8[] memory p) {
        p = new uint8[](2);
        p[0] = 50;
        p[1] = 50;
    }

    function fund(uint256 amount) external {
        if (dealOpen) return;
        amount = bound(amount, 1e18, 500e18);
        activeJob = keccak256(abi.encode(++dealNonce));
        dealOpen = true;
        accepted = false;
        delivered = false;
        vm.prank(buyer);
        try escrow.fundEscrow(activeJob, seller, amount, _pcts(), 0) {} catch { dealOpen = false; }
    }

    function accept() external {
        if (!dealOpen || accepted) return;
        vm.prank(seller);
        try escrow.acceptEscrow(activeJob) { accepted = true; } catch {}
    }

    function sweep(uint256 amount) external {
        uint256 bal = usdc.balanceOf(address(escrow));
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(keeper);
        try escrow.sweepIdle(amount) {} catch {}
    }

    function release(uint256 idx) external {
        if (!dealOpen || !accepted) return;
        idx = bound(idx, 0, 1);
        vm.prank(buyer);
        try escrow.releaseProgress(activeJob, uint8(idx)) {
            if (escrow.getEscrow(activeJob).state == KarwanEscrow.EscrowState.Settled) {
                dealOpen = false;
            }
        } catch {}
    }

    function releaseFinal() external {
        if (!dealOpen || !accepted) return;
        vm.prank(buyer);
        try escrow.releaseFinal(activeJob) { dealOpen = false; } catch {}
    }
}

/// @title Escrow yield solvency invariant
/// @notice Over random fund/accept/sweep/release sequences, the escrow's
///         tracked liability is always fully covered by liquid USDC + funds
///         parked at the Treasury, and the escrow never becomes insolvent.
contract KarwanEscrowYieldInvariantTest is Test {
    KarwanEscrow escrow;
    KarwanVault vault;
    KarwanReputation rep;
    MockUSDC usdc;
    MockBackstop backstop;
    YieldHandler handler;

    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address treasury = makeAddr("treasury");
    address keeper = makeAddr("keeper");

    function setUp() public {
        usdc = new MockUSDC();
        vault = new KarwanVault(address(usdc));
        rep = new KarwanReputation();
        escrow = new KarwanEscrow(address(usdc), 150, treasury, address(vault), address(rep), 10000);
        vault.setEscrow(address(escrow));
        rep.setEscrow(address(escrow));
        backstop = new MockBackstop(usdc);
        backstop.setEscrow(address(escrow));
        escrow.setYieldBackstop(address(backstop));
        escrow.setYieldOperator(keeper);
        escrow.setMaxYieldBps(10000);

        usdc.mint(buyer, 1_000_000e18);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        handler = new YieldHandler(escrow, usdc, backstop, buyer, seller, keeper);
        // The handler pranks buyer/seller/keeper, so it needs no direct role.
        targetContract(address(handler));
    }

    /// The liability is always fully backed: liquid USDC in the escrow plus
    /// what's recoverable from the Treasury covers every dollar owed.
    function invariant_LiabilityAlwaysCovered() public view {
        assertGe(
            usdc.balanceOf(address(escrow)) + escrow.atTreasury(),
            escrow.escrowedTotal(),
            "escrow liability must always be covered by liquid + parked USDC"
        );
    }

    /// atTreasury never exceeds what the backstop actually holds (no phantom
    /// parked funds).
    function invariant_ParkedMatchesBackstop() public view {
        assertLe(
            escrow.atTreasury(),
            usdc.balanceOf(address(backstop)),
            "atTreasury can never exceed the USDC actually parked at the treasury"
        );
    }
}
