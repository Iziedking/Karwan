// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanBusinessRegistry} from "../src/KarwanBusinessRegistry.sol";
import {KarwanInvoiceRegistry} from "../src/KarwanInvoiceRegistry.sol";
import {KarwanYieldDistributor} from "../src/KarwanYieldDistributor.sol";

contract MockEscrow {
    mapping(bytes32 => address) private _buyer;
    mapping(bytes32 => address) private _seller;

    function seed(bytes32 jobId, address b, address s) external {
        _buyer[jobId] = b;
        _seller[jobId] = s;
    }

    function partiesOf(bytes32 jobId) external view returns (address, address) {
        return (_buyer[jobId], _seller[jobId]);
    }
}

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[t] += a; return true;
    }
}

/// @title Registry/distributor pre-freeze audit fixes
contract KarwanRegistriesAuditFixesTest is Test {
    address owner = makeAddr("owner");
    address reviewer = makeAddr("reviewer");
    address biz = makeAddr("biz");
    address attester = makeAddr("attester");
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address financier = makeAddr("financier");
    address eve = makeAddr("eve");
    bytes32 constant JOB = keccak256("job");

    // ===================== BusinessRegistry.revoke =====================

    function test_Business_RevokeUndoesVerification() public {
        KarwanBusinessRegistry reg = new KarwanBusinessRegistry(owner, reviewer);
        vm.prank(biz);
        reg.submitRegistration(keccak256("doc"));
        vm.prank(reviewer);
        reg.approve(biz);
        assertTrue(reg.isVerified(biz));

        // Non-reviewer can't revoke.
        vm.prank(eve);
        vm.expectRevert(KarwanBusinessRegistry.NotReviewer.selector);
        reg.revoke(biz, keccak256("fraud"));

        // Reviewer revokes a fraudulent business out of the finance lane.
        vm.prank(reviewer);
        reg.revoke(biz, keccak256("fraud"));
        assertFalse(reg.isVerified(biz), "de-verified without a redeploy");

        // Can't revoke a non-verified record.
        vm.prank(reviewer);
        vm.expectRevert(KarwanBusinessRegistry.NotVerified.selector);
        reg.revoke(biz, keccak256("again"));

        // The business may resubmit afterwards.
        vm.prank(biz);
        reg.submitRegistration(keccak256("doc2"));
        (uint8 status,,) = reg.statusOf(biz);
        assertEq(status, 1, "resubmitted -> Submitted");
    }

    // ================= InvoiceRegistry attester + resets ================

    function _reg() internal returns (KarwanInvoiceRegistry reg, MockEscrow escrow) {
        reg = new KarwanInvoiceRegistry(owner);
        escrow = new MockEscrow();
        vm.prank(owner);
        reg.setEscrow(address(escrow));
        vm.prank(owner);
        reg.addAttester(attester);
    }

    function test_Invoice_AttesterCannotPoisonUnfundedInvoice() public {
        (KarwanInvoiceRegistry reg, ) = _reg();
        // JOB is not funded (escrow has no record). An attester must not be
        // able to pre-accept a PoD on it.
        vm.prank(attester);
        vm.expectRevert(KarwanInvoiceRegistry.InvalidInvoiceId.selector);
        reg.acceptPoD(JOB, keccak256("pod"));
    }

    function test_Invoice_ResetPoDUndoesRogueAccept() public {
        (KarwanInvoiceRegistry reg, MockEscrow escrow) = _reg();
        escrow.seed(JOB, buyer, seller);

        // A rogue attester accepts PoD, locking setPayee.
        vm.prank(attester);
        reg.acceptPoD(JOB, keccak256("pod"));
        assertTrue(reg.isPoDAccepted(JOB));
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.PoDLocked.selector);
        reg.setPayee(JOB, financier);

        // Owner emergency reset unlocks it.
        vm.prank(owner);
        reg.resetPoD(JOB);
        assertFalse(reg.isPoDAccepted(JOB));
        vm.prank(seller);
        reg.setPayee(JOB, financier); // now works
        assertEq(reg.payeeOf(JOB), financier);
    }

    function test_Invoice_ResetPayeeRecoversDeadEnd() public {
        (KarwanInvoiceRegistry reg, MockEscrow escrow) = _reg();
        escrow.seed(JOB, buyer, seller);

        // Seller redirects payee to a financier; deal then falls through.
        vm.prank(seller);
        reg.setPayee(JOB, financier);
        // Seller can no longer move it (only current payee can).
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.NotPayee.selector);
        reg.setPayee(JOB, seller);

        // Owner-only; non-owner can't reset.
        vm.prank(eve);
        vm.expectRevert(KarwanInvoiceRegistry.NotOwner.selector);
        reg.resetPayee(JOB);

        // Owner resets to default; resolvePayee falls back to the seller.
        vm.prank(owner);
        reg.resetPayee(JOB);
        assertEq(reg.payeeOf(JOB), address(0));
        assertEq(reg.resolvePayee(JOB), seller);
    }

    function test_Invoice_ResetPayeeBlockedAfterPoD() public {
        (KarwanInvoiceRegistry reg, MockEscrow escrow) = _reg();
        escrow.seed(JOB, buyer, seller);
        vm.prank(buyer);
        reg.acceptPoD(JOB, keccak256("pod"));
        vm.prank(owner);
        vm.expectRevert(KarwanInvoiceRegistry.PoDLocked.selector);
        reg.resetPayee(JOB);
    }

    // ==================== YieldDistributor pause ====================

    function test_Yield_CreditPauseFreezesCreditNotClaims() public {
        MockUSDC usdc = new MockUSDC();
        KarwanYieldDistributor dist = new KarwanYieldDistributor(address(usdc), address(this));
        usdc.mint(address(this), 1000e6);
        usdc.approve(address(dist), type(uint256).max);

        // Credit a staker while unpaused.
        address[] memory s = new address[](1);
        uint256[] memory a = new uint256[](1);
        s[0] = seller; a[0] = 100e6;
        dist.bulkCredit(s, a);

        // Owner (this) pauses credits.
        dist.setCreditsPaused(true);
        vm.expectRevert(KarwanYieldDistributor.CreditsPaused.selector);
        dist.bulkCredit(s, a);

        // Claims STILL work while credits are paused (never a rug on funds).
        vm.prank(seller);
        uint256 got = dist.claim();
        assertEq(got, 100e6, "staker can always withdraw credited funds");

        // Unpause resumes crediting.
        dist.setCreditsPaused(false);
        dist.bulkCredit(s, a);
    }

    function test_Yield_TwoStepUsesCorrectError() public {
        MockUSDC usdc = new MockUSDC();
        KarwanYieldDistributor dist = new KarwanYieldDistributor(address(usdc), makeAddr("op"));
        dist.transferOwnership(eve);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(KarwanYieldDistributor.NotPendingOwner.selector);
        dist.acceptOwnership();
    }
}
