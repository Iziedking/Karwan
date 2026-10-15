// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KarwanCreFees} from "../../../src/suite/KarwanCreFees.sol";

interface IUsdcDomain {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

/// @notice A dry-run fee held and settled on Arc's own USDC (FiatTokenV2's
///         receiveWithAuthorization), against Arc Foundry forking Arc testnet.
contract ArcCreFeesTest is Test {
    IERC20 internal constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    bytes32 internal constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    uint256 internal constant PRICE = 250_000;

    KarwanCreFees internal fees;
    address internal adapter = makeAddr("arcAdapter");
    address internal payee = makeAddr("arcKarwanFees");
    address internal agent;
    uint256 internal agentKey;

    function setUp() public {
        if (!vm.envOr("ARC_FORK", false)) vm.skip(true);
        (agent, agentKey) = makeAddrAndKey("arcAgent");
        fees = new KarwanCreFees(address(USDC), adapter, payee, PRICE);
        vm.deal(agent, 1 ether);
    }

    function _open(bytes32 nonce) internal returns (bytes32) {
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, agent, address(fees), PRICE, 0, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IUsdcDomain(address(USDC)).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, digest);
        return fees.open(agent, PRICE, 0, validBefore, nonce, abi.encodePacked(r, s, v));
    }

    function test_an_answered_run_pays_karwan_in_arc_usdc() public {
        uint256 before = USDC.balanceOf(agent);
        bytes32 runId = _open("arc-1");
        assertEq(USDC.balanceOf(address(fees)), PRICE);
        assertEq(USDC.balanceOf(agent), before - PRICE);
        assertTrue(IUsdcDomain(address(USDC)).authorizationState(agent, "arc-1"));
        vm.prank(adapter);
        fees.release(runId, keccak256("answer"));
        assertEq(USDC.balanceOf(payee), PRICE);
        assertEq(USDC.balanceOf(address(fees)), 0);
    }

    function test_an_unanswered_run_returns_to_the_agent_in_arc_usdc() public {
        uint256 before = USDC.balanceOf(agent);
        bytes32 runId = _open("arc-2");
        vm.warp(block.timestamp + 1 hours);
        fees.refund(runId);
        assertEq(USDC.balanceOf(agent), before);
        assertEq(USDC.balanceOf(address(fees)), 0);
    }

    function test_nobody_else_can_execute_the_signed_payment() public {
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, agent, address(fees), PRICE, 0, validBefore, bytes32("arc-3")));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IUsdcDomain(address(USDC)).DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentKey, digest);
        (bool ok,) = address(USDC).call(
            abi.encodeWithSignature(
                "receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)",
                agent, address(fees), PRICE, 0, validBefore, bytes32("arc-3"), abi.encodePacked(r, s, v)
            )
        );
        assertFalse(ok);
        assertEq(USDC.balanceOf(address(fees)), 0);
    }
}
