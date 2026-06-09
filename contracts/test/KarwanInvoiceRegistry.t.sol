// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {KarwanInvoiceRegistry, IKarwanEscrow} from "../src/KarwanInvoiceRegistry.sol";

/// @notice Minimal escrow mock that only implements getEscrow(jobId). The
///         registry never touches the rest of the escrow ABI, so the mock
///         stays small. `seedDeal` records a buyer/seller pair under a
///         jobId; unseeded jobIds return the zero account (treated as
///         InvalidInvoiceId by the registry).
contract MockEscrow {
    mapping(bytes32 => IKarwanEscrow.EscrowAccount) private _accounts;

    function seedDeal(bytes32 jobId, address buyer, address seller) external {
        IKarwanEscrow.EscrowAccount storage a = _accounts[jobId];
        a.buyer = buyer;
        a.seller = seller;
    }

    function getEscrow(bytes32 jobId) external view returns (IKarwanEscrow.EscrowAccount memory) {
        return _accounts[jobId];
    }
}

contract KarwanInvoiceRegistryTest is Test {
    KarwanInvoiceRegistry reg;
    MockEscrow escrow;

    address owner = makeAddr("owner");
    address buyer = makeAddr("buyer");
    address seller = makeAddr("seller");
    address financier = makeAddr("financier");
    address attester = makeAddr("attester");
    address rando = makeAddr("rando");

    bytes32 constant JOB = keccak256("job-1");
    bytes32 constant INVOICE_HASH = keccak256("invoice.pdf");
    bytes32 constant PO_HASH = keccak256("po.pdf");
    bytes32 constant POD_HASH = keccak256("pod.pdf");

    function setUp() public {
        reg = new KarwanInvoiceRegistry(owner);
        escrow = new MockEscrow();
        reg.setEscrow(address(escrow));
        escrow.seedDeal(JOB, buyer, seller);
    }

    /* ============================ DEPLOYMENT ============================= */

    function test_Constructor_SetsOwnerAndDeployer() public {
        KarwanInvoiceRegistry fresh = new KarwanInvoiceRegistry(owner);
        assertEq(fresh.owner(), owner);
        assertEq(fresh.deployer(), address(this));
    }

    function test_Constructor_RevertsOnZeroOwner() public {
        vm.expectRevert(KarwanInvoiceRegistry.ZeroAddress.selector);
        new KarwanInvoiceRegistry(address(0));
    }

    /* ============================ ESCROW BIND ============================ */

    function test_SetEscrow_OneShot() public {
        // setUp already bound; a second call reverts.
        vm.expectRevert(KarwanInvoiceRegistry.NotDeployer.selector);
        reg.setEscrow(makeAddr("other-escrow"));
    }

    function test_SetEscrow_RevertsOnZero() public {
        KarwanInvoiceRegistry fresh = new KarwanInvoiceRegistry(owner);
        vm.expectRevert(KarwanInvoiceRegistry.ZeroAddress.selector);
        fresh.setEscrow(address(0));
    }

    function test_SetEscrow_RevertsForNonDeployer() public {
        KarwanInvoiceRegistry fresh = new KarwanInvoiceRegistry(owner);
        vm.prank(rando);
        vm.expectRevert(KarwanInvoiceRegistry.NotDeployer.selector);
        fresh.setEscrow(address(escrow));
    }

    function test_SetEscrow_ZeroesDeployerAfterBind() public {
        // setUp bound the escrow; deployer must be zero now.
        assertEq(reg.deployer(), address(0));
    }

    function test_Anchor_RevertsBeforeEscrowBound() public {
        KarwanInvoiceRegistry fresh = new KarwanInvoiceRegistry(owner);
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.EscrowNotSet.selector);
        fresh.anchor(JOB, INVOICE_HASH, 1);
    }

    /* ========================= OWNERSHIP HANDOVER ========================= */

    function test_TransferOwnership_TwoStep() public {
        address newOwner = makeAddr("multisig");
        vm.prank(owner);
        reg.transferOwnership(newOwner);
        assertEq(reg.pendingOwner(), newOwner);
        // Until acceptance, owner is unchanged.
        assertEq(reg.owner(), owner);

        vm.prank(newOwner);
        reg.acceptOwnership();
        assertEq(reg.owner(), newOwner);
        assertEq(reg.pendingOwner(), address(0));
    }

    function test_TransferOwnership_OnlyOwner() public {
        vm.prank(rando);
        vm.expectRevert(KarwanInvoiceRegistry.NotOwner.selector);
        reg.transferOwnership(rando);
    }

    function test_TransferOwnership_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(KarwanInvoiceRegistry.ZeroAddress.selector);
        reg.transferOwnership(address(0));
    }

    function test_AcceptOwnership_OnlyPending() public {
        vm.prank(owner);
        reg.transferOwnership(makeAddr("intended"));
        vm.prank(rando);
        vm.expectRevert(KarwanInvoiceRegistry.NotPendingOwner.selector);
        reg.acceptOwnership();
    }

    /* ========================== ATTESTER ALLOWLIST ======================== */

    function test_AddAttester_OwnerOnly() public {
        vm.prank(owner);
        reg.addAttester(attester);
        assertTrue(reg.isAttester(attester));
    }

    function test_AddAttester_RevertsForNonOwner() public {
        vm.prank(rando);
        vm.expectRevert(KarwanInvoiceRegistry.NotOwner.selector);
        reg.addAttester(attester);
    }

    function test_AddAttester_RevertsOnZero() public {
        vm.prank(owner);
        vm.expectRevert(KarwanInvoiceRegistry.ZeroAddress.selector);
        reg.addAttester(address(0));
    }

    function test_RemoveAttester_OwnerOnly() public {
        vm.prank(owner);
        reg.addAttester(attester);
        vm.prank(owner);
        reg.removeAttester(attester);
        assertFalse(reg.isAttester(attester));
    }

    /* ============================== ANCHOR =============================== */

    function test_Anchor_ByBuyer() public {
        vm.prank(buyer);
        reg.anchor(JOB, INVOICE_HASH, 1);
        assertEq(reg.docCount(JOB), 1);
        KarwanInvoiceRegistry.DocAnchor[] memory docs = reg.docsOf(JOB);
        assertEq(docs[0].hash, INVOICE_HASH);
        assertEq(docs[0].kind, 1);
        assertEq(docs[0].anchorer, buyer);
    }

    function test_Anchor_BySeller() public {
        vm.prank(seller);
        reg.anchor(JOB, PO_HASH, 2);
        assertEq(reg.docCount(JOB), 1);
    }

    function test_Anchor_RejectsRando() public {
        vm.prank(rando);
        vm.expectRevert(KarwanInvoiceRegistry.NotParty.selector);
        reg.anchor(JOB, INVOICE_HASH, 1);
    }

    function test_Anchor_RevertsOnUnseededJob() public {
        bytes32 unknown = keccak256("nope");
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.InvalidInvoiceId.selector);
        reg.anchor(unknown, INVOICE_HASH, 1);
    }

    function test_Anchor_RevertsOnZeroInvoiceId() public {
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.InvalidInvoiceId.selector);
        reg.anchor(bytes32(0), INVOICE_HASH, 1);
    }

    function test_Anchor_RevertsOnEmptyHash() public {
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.EmptyHash.selector);
        reg.anchor(JOB, bytes32(0), 1);
    }

    function test_Anchor_RevertsOnZeroKind() public {
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.InvalidKind.selector);
        reg.anchor(JOB, INVOICE_HASH, 0);
    }

    function test_Anchor_RevertsOnOverflowKind() public {
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.InvalidKind.selector);
        reg.anchor(JOB, INVOICE_HASH, 7);
    }

    function test_Anchor_AcceptsAllValidKinds() public {
        for (uint8 k = 1; k <= 6; k++) {
            vm.prank(seller);
            reg.anchor(JOB, keccak256(abi.encode("doc", k)), k);
        }
        assertEq(reg.docCount(JOB), 6);
    }

    function test_Anchor_AppendsMultiple() public {
        vm.prank(seller);
        reg.anchor(JOB, INVOICE_HASH, 1);
        vm.prank(buyer);
        reg.anchor(JOB, PO_HASH, 2);
        assertEq(reg.docCount(JOB), 2);
    }

    /* ============================= SET PAYEE ============================= */

    function test_SetPayee_BootstrapBySeller() public {
        vm.prank(seller);
        reg.setPayee(JOB, financier);
        assertEq(reg.payeeOf(JOB), financier);
    }

    function test_SetPayee_RejectsBootstrapByBuyer() public {
        vm.prank(buyer);
        vm.expectRevert(KarwanInvoiceRegistry.NotPayee.selector);
        reg.setPayee(JOB, financier);
    }

    function test_SetPayee_RejectsBootstrapByRando() public {
        vm.prank(rando);
        vm.expectRevert(KarwanInvoiceRegistry.NotPayee.selector);
        reg.setPayee(JOB, financier);
    }

    function test_SetPayee_MutationByCurrentPayee() public {
        vm.prank(seller);
        reg.setPayee(JOB, financier);
        address financier2 = makeAddr("financier-two");
        vm.prank(financier);
        reg.setPayee(JOB, financier2);
        assertEq(reg.payeeOf(JOB), financier2);
    }

    function test_SetPayee_RejectsMutationBySeller_AfterBootstrap() public {
        vm.prank(seller);
        reg.setPayee(JOB, financier);
        // Seller is no longer the payee; cannot re-mutate.
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.NotPayee.selector);
        reg.setPayee(JOB, seller);
    }

    function test_SetPayee_RevertsOnZeroPayee() public {
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.ZeroAddress.selector);
        reg.setPayee(JOB, address(0));
    }

    function test_SetPayee_LocksAfterPoD() public {
        vm.prank(seller);
        reg.setPayee(JOB, financier);

        vm.prank(buyer);
        reg.acceptPoD(JOB, POD_HASH);

        // Even the current payee cannot mutate after PoD.
        address financier2 = makeAddr("financier-two");
        vm.prank(financier);
        vm.expectRevert(KarwanInvoiceRegistry.PoDLocked.selector);
        reg.setPayee(JOB, financier2);
    }

    function test_SetPayee_RevertsBeforeEscrowBound() public {
        KarwanInvoiceRegistry fresh = new KarwanInvoiceRegistry(owner);
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.EscrowNotSet.selector);
        fresh.setPayee(JOB, financier);
    }

    /* ============================= ACCEPT PoD ============================ */

    function test_AcceptPoD_ByBuyer() public {
        vm.prank(buyer);
        reg.acceptPoD(JOB, POD_HASH);
        assertTrue(reg.isPoDAccepted(JOB));
        assertEq(reg.podHashOf(JOB), POD_HASH);
    }

    function test_AcceptPoD_ByAttester() public {
        vm.prank(owner);
        reg.addAttester(attester);

        vm.prank(attester);
        reg.acceptPoD(JOB, POD_HASH);
        assertTrue(reg.isPoDAccepted(JOB));
    }

    function test_AcceptPoD_RejectsRando() public {
        vm.prank(rando);
        vm.expectRevert(KarwanInvoiceRegistry.NotPodAuthorised.selector);
        reg.acceptPoD(JOB, POD_HASH);
    }

    function test_AcceptPoD_RejectsSeller() public {
        // Seller cannot self-attest; that would defeat the whole point.
        vm.prank(seller);
        vm.expectRevert(KarwanInvoiceRegistry.NotPodAuthorised.selector);
        reg.acceptPoD(JOB, POD_HASH);
    }

    function test_AcceptPoD_LatchesOnSecondCall() public {
        vm.prank(buyer);
        reg.acceptPoD(JOB, POD_HASH);
        vm.prank(buyer);
        vm.expectRevert(KarwanInvoiceRegistry.PoDAlreadyAccepted.selector);
        reg.acceptPoD(JOB, POD_HASH);
    }

    function test_AcceptPoD_RevertsOnEmptyHash() public {
        vm.prank(buyer);
        vm.expectRevert(KarwanInvoiceRegistry.EmptyHash.selector);
        reg.acceptPoD(JOB, bytes32(0));
    }

    function test_AcceptPoD_RevertsBeforeEscrowBound() public {
        KarwanInvoiceRegistry fresh = new KarwanInvoiceRegistry(owner);
        vm.prank(buyer);
        vm.expectRevert(KarwanInvoiceRegistry.EscrowNotSet.selector);
        fresh.acceptPoD(JOB, POD_HASH);
    }

    function test_AcceptPoD_RemovedAttesterCannotSign() public {
        vm.prank(owner);
        reg.addAttester(attester);
        vm.prank(owner);
        reg.removeAttester(attester);

        vm.prank(attester);
        vm.expectRevert(KarwanInvoiceRegistry.NotPodAuthorised.selector);
        reg.acceptPoD(JOB, POD_HASH);
    }

    /* =============================== VIEWS =============================== */

    function test_ResolvePayee_DefaultsToSeller() public view {
        assertEq(reg.resolvePayee(JOB), seller);
    }

    function test_ResolvePayee_HonoursOverride() public {
        vm.prank(seller);
        reg.setPayee(JOB, financier);
        assertEq(reg.resolvePayee(JOB), financier);
    }

    function test_DocCount_ZeroForUnseededJob() public view {
        bytes32 unknown = keccak256("nope");
        assertEq(reg.docCount(unknown), 0);
    }

    /* ============================= EVENTS ================================ */

    function test_DocumentAnchored_Emits() public {
        vm.expectEmit(true, false, false, true, address(reg));
        emit KarwanInvoiceRegistry.DocumentAnchored(JOB, INVOICE_HASH, 1, seller);
        vm.prank(seller);
        reg.anchor(JOB, INVOICE_HASH, 1);
    }

    function test_PayeeChanged_Emits() public {
        vm.expectEmit(true, true, true, false, address(reg));
        emit KarwanInvoiceRegistry.PayeeChanged(JOB, seller, financier);
        vm.prank(seller);
        reg.setPayee(JOB, financier);
    }

    function test_PoDAccepted_Emits() public {
        vm.expectEmit(true, true, false, true, address(reg));
        emit KarwanInvoiceRegistry.PoDAccepted(JOB, POD_HASH, buyer, uint64(block.timestamp));
        vm.prank(buyer);
        reg.acceptPoD(JOB, POD_HASH);
    }

    /* ============================ INTEGRATION ============================ */

    function test_FullFactoringSetupSequence() public {
        // 1. Buyer anchors PO; seller anchors invoice + BoL.
        vm.prank(buyer);
        reg.anchor(JOB, PO_HASH, 2);
        vm.prank(seller);
        reg.anchor(JOB, INVOICE_HASH, 1);
        vm.prank(seller);
        reg.anchor(JOB, keccak256("bol.pdf"), 3);
        assertEq(reg.docCount(JOB), 3);

        // 2. Seller redirects payee to financier (factoring accepted).
        vm.prank(seller);
        reg.setPayee(JOB, financier);
        assertEq(reg.resolvePayee(JOB), financier);

        // 3. Buyer signs PoD on delivery.
        vm.prank(buyer);
        reg.acceptPoD(JOB, POD_HASH);
        assertTrue(reg.isPoDAccepted(JOB));

        // 4. Payee is now frozen.
        vm.prank(financier);
        vm.expectRevert(KarwanInvoiceRegistry.PoDLocked.selector);
        reg.setPayee(JOB, makeAddr("eve"));
    }
}
