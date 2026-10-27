// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";

/// The deployed JobBoard's bytecode, read through the calls Karwan makes.
interface IDeployedJobBoard {
    function postJob(bytes32 salt, uint256 budget, uint64 deadline, string calldata termsHash) external returns (bytes32);
    function submitBid(bytes32 jobId, uint256 price, uint64 deadline) external;
    function acceptBid(bytes32 jobId, address seller) external;
    function bids(bytes32 jobId, address seller) external view returns (address, uint256, uint64, bool);
    function jobs(bytes32 jobId)
        external
        view
        returns (address, uint256, uint64, string memory, uint8, address, uint256, uint64);
}

/// @notice View 35 rests on two facts about the JobBoard deployed on Arc
///         Testnet: a seller's second offer replaces their first, and an offer
///         above the posted budget can be accepted. Checked against the live
///         bytecode on a fork before any code relies on them (rule 14).
///         Run with `forge-remote.sh --arc test/arc-checks`.
contract ArcJobBoardRevisionTest is Test {
    IDeployedJobBoard internal constant BOARD = IDeployedJobBoard(0x35224C2234263B5506a9F7BfF4bb98e9FceD3FF3);
    bytes32 internal constant BID_SUBMITTED = keccak256("BidSubmitted(bytes32,address,uint256,uint64)");
    bytes32 internal constant JOB_POSTED = keccak256("JobPosted(bytes32,address,uint256,uint64,string)");

    address internal buyer = makeAddr("view35Buyer");
    address internal seller = makeAddr("view35Seller");

    function setUp() public {
        if (!vm.envOr("ARC_FORK", false)) vm.skip(true);
        assertGt(address(BOARD).code.length, 0, "the JobBoard is deployed at this block");
        vm.deal(buyer, 100 ether);
        vm.deal(seller, 100 ether);
    }

    /// The deployed build neither returns the job id nor derives it as the
    /// current source does, so it is read from JobPosted, as the backend does.
    function _post(bytes32 salt, uint256 budget) internal returns (bytes32 jobId, uint64 deadline) {
        deadline = uint64(block.timestamp + 7 days);
        vm.recordLogs();
        _as(buyer, abi.encodeCall(IDeployedJobBoard.postJob, (salt, budget, deadline, "view35")), "postJob");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(BOARD) && logs[i].topics[0] == JOB_POSTED) jobId = logs[i].topics[1];
        }
        assertTrue(jobId != bytes32(0), "JobPosted names the job");
        (address posted,,,,,,,) = BOARD.jobs(jobId);
        assertEq(posted, buyer);
    }

    /// Runs one call as `who` and stops with the revert data when it fails.
    function _as(address who, bytes memory data, string memory what) internal {
        vm.prank(who);
        (bool ok, bytes memory ret) = address(BOARD).call(data);
        if (!ok) {
            emit log_named_string("call", what);
            emit log_named_bytes("reverted with", ret);
            revert(what);
        }
    }

    function test_a_second_offer_from_the_same_seller_replaces_the_first() public {
        (bytes32 jobId, uint64 deadline) = _post(keccak256("revise"), 120e6);
        vm.recordLogs();
        _as(seller, abi.encodeCall(IDeployedJobBoard.submitBid, (jobId, 142.71e6, deadline)), "first submitBid");
        _as(seller, abi.encodeCall(IDeployedJobBoard.submitBid, (jobId, 130e6, deadline)), "second submitBid");

        (address who, uint256 price,, bool exists) = BOARD.bids(jobId, seller);
        assertEq(who, seller);
        assertEq(price, 130e6, "the lower offer replaced the first");
        assertTrue(exists);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 submitted;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(BOARD) && logs[i].topics[0] == BID_SUBMITTED) submitted++;
        }
        assertEq(submitted, 2, "each offer emits BidSubmitted, so the buyer's agent hears the second one");
    }

    function test_an_offer_above_the_budget_can_be_accepted() public {
        (bytes32 jobId, uint64 deadline) = _post(keccak256("above"), 120e6);
        _as(seller, abi.encodeCall(IDeployedJobBoard.submitBid, (jobId, 150e6, deadline)), "submitBid");
        _as(buyer, abi.encodeCall(IDeployedJobBoard.acceptBid, (jobId, seller)), "acceptBid");
        (,,,,, address acceptedSeller, uint256 acceptedPrice,) = BOARD.jobs(jobId);
        assertEq(acceptedSeller, seller);
        assertEq(acceptedPrice, 150e6, "accepted at the offer, above the 120 budget");
    }
}
