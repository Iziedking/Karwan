// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SuiteFixture} from "../SuiteFixture.sol";

/// @notice Machine-checked proofs, run by Halmos for every amount rather than
///         sampled, along a fund, payout and fee sequence on one deal: the
///         settlement base keeps its books, pays no one outside the deal, and
///         money owed to a payee can always be withdrawn in full.
///         Every step that must succeed is a checked call, so a revert on any
///         input fails the proof instead of being dropped as a path.
///         `scripts/ops/forge-remote.sh --halmos SettlementProofs`
contract SettlementProofs is SuiteFixture {
    bytes32 internal constant DEAL = bytes32("proof");
    address internal payer = address(0xB0B);
    address internal payee = address(0xCAFE);

    /// Halmos treats addresses made from labels as unknowns, so the roles are
    /// fixed here: the fee recipient is the Treasury Safe, never a family.
    function setUp() public {
        _deploySuite();
        hub.setFeeRecipient(address(0xFEE));
        hub.setReviewers(address(0xA11), address(0xA12));
        hub.setGuardian(address(0x6A2D));
        usdc.mint(payer, PER_DEAL);
        vm.prank(payer);
        usdc.approve(address(family), type(uint256).max);
        address[] memory payees = new address[](1);
        payees[0] = payee;
        vm.prank(payer);
        family.open(DEAL, address(usdc), payees, uint64(block.timestamp + 30 days));
    }

    function _ok(address by, bytes memory data) internal {
        vm.prank(by);
        (bool ok,) = address(family).call(data);
        assert(ok);
    }

    function _books() internal view returns (bool) {
        return usdc.balanceOf(address(family)) + family.parked(address(usdc))
            == family.held(address(usdc)) + family.owedTotal(address(usdc));
    }

    /// Any funding, payout (delivered or owed) and fee keeps the books, and
    /// the deal holds exactly what was funded less what left it.
    function check_the_books_balance(uint256 funded, uint256 toPayee, uint256 fee, bool blocked) public {
        vm.assume(funded > 0 && funded <= PER_DEAL);
        vm.assume(toPayee <= funded && fee <= funded - toPayee);
        vm.assume(fee <= (funded * FEE_BPS) / 10_000);
        _ok(payer, abi.encodeCall(family.fund, (DEAL, funded)));
        if (blocked) usdc.setBlocked(payee, true);
        _ok(address(this), abi.encodeCall(family.pay, (DEAL, payee, toPayee)));
        _ok(address(this), abi.encodeCall(family.payFee, (DEAL, fee)));
        assert(_books());
        assert(family.accountOf(DEAL).balance == funded - toPayee - fee);
        assert(family.held(address(usdc)) == funded - toPayee - fee);
    }

    /// A payout the token refused becomes an owed balance that only the payee
    /// can withdraw, in full, once the token lets it through.
    function check_principal_can_always_be_withdrawn(uint256 funded, uint256 toPayee) public {
        vm.assume(funded > 0 && funded <= PER_DEAL && toPayee > 0 && toPayee <= funded);
        _ok(payer, abi.encodeCall(family.fund, (DEAL, funded)));
        usdc.setBlocked(payee, true);
        _ok(address(this), abi.encodeCall(family.pay, (DEAL, payee, toPayee)));
        assert(family.owed(address(usdc), payee) == toPayee);
        assert(usdc.balanceOf(payee) == 0);
        usdc.setBlocked(payee, false);
        _ok(payee, abi.encodeCall(family.withdrawOwed, (address(usdc))));
        assert(usdc.balanceOf(payee) == toPayee);
        assert(family.owed(address(usdc), payee) == 0);
        assert(_books());
    }

    /// No payout reaches anyone outside the deal or exceeds what it holds.
    function check_no_payout_beyond_the_deal(address who, uint256 funded, uint256 amount) public {
        vm.assume(funded > 0 && funded <= PER_DEAL);
        _ok(payer, abi.encodeCall(family.fund, (DEAL, funded)));
        bool outside = who != payer && who != payee;
        vm.assume(outside || amount > funded);
        vm.assume(amount > 0);
        (bool ok,) = address(family).call(abi.encodeCall(family.pay, (DEAL, who, amount)));
        assert(!ok);
        assert(family.accountOf(DEAL).balance == funded);
    }
}
