// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev USDC's EIP-3009 receive path. Only the payee can execute it, so a
///      signed payment reaches this contract only through `open`.
interface IUsdcReceive {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external;
}

/// @title KarwanCreFees
/// @notice Holds what an agent pays for a CRE dry run until Chainlink's network
///         answers. The adapter releases it to Karwan on a signed answer within
///         the hour; after that, anyone returns it to the payer. A payout USDC
///         refuses (a blocklisted address) becomes an owed balance only its
///         owner withdraws. USDC sent here outside `open` belongs to no run and
///         stays here. No owner.
contract KarwanCreFees {
    using SafeERC20 for IERC20;

    uint64 public constant REFUND_AFTER = 1 hours;

    IERC20 public immutable usdc;
    address public immutable adapter;
    address public immutable payee;
    uint256 public immutable price;

    enum State {
        None,
        Open,
        Released,
        Refunded
    }

    struct Run {
        address payer;
        uint64 openedAt;
        State state;
        uint256 amount;
    }

    mapping(bytes32 => Run) public runs;
    /// @notice The sum of open runs.
    uint256 public held;
    mapping(address => uint256) public owed;
    uint256 public owedTotal;

    event Opened(bytes32 indexed runId, address indexed payer, uint256 amount);
    event Released(bytes32 indexed runId, bytes32 resultHash);
    event Refunded(bytes32 indexed runId, address indexed payer);
    event PayoutCredited(address indexed to, uint256 amount);
    event OwedWithdrawn(address indexed to, uint256 amount);

    error BadConfig();
    error BadAmount();
    error RunExists();
    error NotAdapter();
    error NotOpen();
    error TooEarly();
    error TooLate();
    error NothingOwed();

    constructor(address usdc_, address adapter_, address payee_, uint256 price_) {
        if (usdc_ == address(0) || adapter_ == address(0) || payee_ == address(0) || price_ == 0) revert BadConfig();
        usdc = IERC20(usdc_);
        adapter = adapter_;
        payee = payee_;
        price = price_;
    }

    function runIdOf(address payer, bytes32 nonce) public pure returns (bytes32) {
        return keccak256(abi.encode(payer, nonce));
    }

    /// @notice Anyone relays the payer's signed authorization; the run is the
    ///         payer and the authorization's nonce.
    function open(
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external returns (bytes32 runId) {
        if (value != price) revert BadAmount();
        runId = runIdOf(from, nonce);
        if (runs[runId].state != State.None) revert RunExists();
        runs[runId] = Run(from, uint64(block.timestamp), State.Open, value);
        held += value;
        emit Opened(runId, from, value);
        IUsdcReceive(address(usdc)).receiveWithAuthorization(
            from, address(this), value, validAfter, validBefore, nonce, signature
        );
    }

    /// @notice Only on an answer signed by Chainlink's network, through the adapter.
    function release(bytes32 runId, bytes32 resultHash) external {
        if (msg.sender != adapter) revert NotAdapter();
        Run storage r = runs[runId];
        if (r.state != State.Open) revert NotOpen();
        // After the hour the refund is the payer's, whatever arrives late.
        if (block.timestamp >= uint256(r.openedAt) + REFUND_AFTER) revert TooLate();
        r.state = State.Released;
        held -= r.amount;
        emit Released(runId, resultHash);
        _pay(payee, r.amount);
    }

    function refund(bytes32 runId) external {
        Run storage r = runs[runId];
        if (r.state != State.Open) revert NotOpen();
        if (block.timestamp < uint256(r.openedAt) + REFUND_AFTER) revert TooEarly();
        r.state = State.Refunded;
        held -= r.amount;
        emit Refunded(runId, r.payer);
        _pay(r.payer, r.amount);
    }

    function withdrawOwed() external {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingOwed();
        owed[msg.sender] = 0;
        owedTotal -= amount;
        emit OwedWithdrawn(msg.sender, amount);
        usdc.safeTransfer(msg.sender, amount);
    }

    function _pay(address to, uint256 amount) private {
        if (usdc.trySafeTransfer(to, amount)) return;
        owed[to] += amount;
        owedTotal += amount;
        emit PayoutCredited(to, amount);
    }
}
