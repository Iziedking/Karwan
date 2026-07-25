// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanInvoiceRegistry} from "../src/KarwanInvoiceRegistry.sol";

/// USDC stand-in exposing the EIP-3009 entry point the factoring advance rides
/// on. Signature checking is reduced to "the financier authorised this exact
/// transfer", which is the property the registry depends on.
contract MockUSDC3009 {
    mapping(address => uint256) public balanceOf;
    mapping(bytes32 => bool) public authorizationState;

    error BadAuthorization();
    error AuthorizationUsed();

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (authorizationState[nonce]) revert AuthorizationUsed();
        if (block.timestamp <= validAfter || block.timestamp >= validBefore) revert BadAuthorization();
        // The mock treats v == 27 as a valid signature over this authorisation
        // and anything else as forged, so tests can exercise both branches.
        if (v != 27) revert BadAuthorization();
        r;
        s;
        authorizationState[nonce] = true;
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}

contract MockEscrow {
    mapping(bytes32 => address) public sellers;
    mapping(address => bool) public authorizedAssigners;

    struct Assignment {
        address assignee;
        uint128 amount;
        uint128 paid;
    }

    mapping(bytes32 => Assignment) public assignmentOf;

    error NotAssigner();
    error AlreadyAssigned();

    function seedDeal(bytes32 jobId, address seller) external {
        sellers[jobId] = seller;
    }

    function setAssigner(address who, bool ok) external {
        authorizedAssigners[who] = ok;
    }

    function partiesOf(bytes32 jobId) external view returns (address, address) {
        return (address(0xB0B), sellers[jobId]);
    }

    function assignPayout(bytes32 jobId, address assignee, uint128 amount) external {
        if (!authorizedAssigners[msg.sender]) revert NotAssigner();
        if (assignmentOf[jobId].assignee != address(0)) revert AlreadyAssigned();
        assignmentOf[jobId] = Assignment({assignee: assignee, amount: amount, paid: 0});
    }
}

/// @title Factoring: the advance and the assignment are one transaction
/// @notice Exploit-first spec for TRADE_FINANCE_V2_DESIGN.md §2, factoring leg.
///
///         Assignment is irrevocable, which creates a griefing vector if the
///         two legs can be separated: a seller who assigns before being paid
///         has permanently redirected their receivable to someone who may never
///         pay, and nothing can undo it.
///
///         So the registry executes the financier's pre-signed EIP-3009 advance
///         to the seller and records the assignment in the same call. The
///         seller cannot assign without collecting, and the financier cannot be
///         assigned to without paying. The registry never holds funds.
contract KarwanRegistryAssignmentTest is Test {
    KarwanInvoiceRegistry registry;
    MockUSDC3009 usdc;
    MockEscrow escrow;

    address owner = address(this);
    address reviewer = makeAddr("reviewer");
    address seller = makeAddr("seller");
    address financier = makeAddr("financier");

    bytes32 constant INVOICE = keccak256("factored-invoice");
    uint256 constant ADVANCE = 9_000_000_000;
    uint128 constant REPAY = 10_000_000_000;

    function setUp() public {
        usdc = new MockUSDC3009();
        escrow = new MockEscrow();
        registry = new KarwanInvoiceRegistry(owner);

        registry.setEscrow(address(escrow));
        registry.setUsdc(address(usdc));
        escrow.seedDeal(INVOICE, seller);
        escrow.setAssigner(address(registry), true);

        usdc.mint(financier, 100_000_000_000);
        vm.warp(1000);
    }

    function _assign(uint8 v) internal {
        vm.prank(seller);
        registry.assignReceivable(
            INVOICE,
            financier,
            REPAY,
            ADVANCE,
            block.timestamp - 1,
            block.timestamp + 1 days,
            keccak256("nonce-1"),
            v,
            bytes32(0),
            bytes32(0)
        );
    }

    /// The happy path: one call moves the advance and books the assignment.
    function test_AdvanceAndAssignmentLandTogether() public {
        _assign(27);

        assertEq(usdc.balanceOf(seller), ADVANCE, "seller collected the advance");
        (address assignee, uint128 amount,) = escrow.assignmentOf(INVOICE);
        assertEq(assignee, financier, "receivable assigned to the financier");
        assertEq(amount, REPAY, "assigned for the repay amount");
        assertEq(registry.payeeOf(INVOICE), financier, "payee record follows");
    }

    /// The griefing vector, closed. A financier who never signed cannot have a
    /// receivable assigned to them, because the advance reverts first and takes
    /// the assignment with it.
    function test_NoAssignmentWithoutAPaidAdvance() public {
        vm.expectRevert();
        _assign(28); // forged signature

        (address assignee,,) = escrow.assignmentOf(INVOICE);
        assertEq(assignee, address(0), "nothing assigned when the advance fails");
        assertEq(usdc.balanceOf(seller), 0, "seller collected nothing");
    }

    /// Only the seller sells their own receivable.
    function test_OnlySellerCanAssign() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert();
        registry.assignReceivable(
            INVOICE,
            financier,
            REPAY,
            ADVANCE,
            block.timestamp - 1,
            block.timestamp + 1 days,
            keccak256("nonce-2"),
            27,
            bytes32(0),
            bytes32(0)
        );
    }

    /// One receivable, one sale. The escrow refuses the second assignment and
    /// that refusal unwinds the second advance too.
    function test_SecondAssignmentReverts() public {
        _assign(27);

        vm.prank(seller);
        vm.expectRevert();
        registry.assignReceivable(
            INVOICE,
            makeAddr("financier2"),
            REPAY,
            ADVANCE,
            block.timestamp - 1,
            block.timestamp + 1 days,
            keccak256("nonce-3"),
            27,
            bytes32(0),
            bytes32(0)
        );
    }

    /// Once delivery is confirmed, settlement is imminent and a late assignment
    /// would race it.
    function test_CannotAssignAfterPoD() public {
        // The buyer confirms delivery, which is what locks the payee.
        vm.prank(address(0xB0B));
        registry.acceptPoD(INVOICE, keccak256("pod"));

        vm.expectRevert();
        _assign(27);
    }
}
