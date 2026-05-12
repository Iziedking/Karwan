// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC20 interface (USDC on Arc).
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title KarwanEscrow
/// @notice Milestone-based USDC escrow. Buyer funds upfront; releases happen per
///         milestone signed by the buyer. Final balance releases on full delivery.
/// @dev Paired with KarwanJobBoard via jobId. Holds USDC at contract address.
contract KarwanEscrow {
    enum EscrowState {
        None,
        Funded,
        Settled,
        Disputed,
        Refunded
    }

    struct EscrowAccount {
        address buyer;
        address seller;
        uint256 totalAmount;
        uint256 released;
        uint8[] milestonePcts; // sum must == 100
        uint8 milestonesReleased;
        EscrowState state;
    }

    IERC20 public immutable usdc;
    mapping(bytes32 => EscrowAccount) public escrows;

    event EscrowFunded(
        bytes32 indexed jobId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint8[] milestonePcts
    );
    event ProgressReleased(
        bytes32 indexed jobId, uint8 milestoneIndex, uint256 amount, address indexed to
    );
    event EscrowSettled(bytes32 indexed jobId, uint256 finalAmount);
    event EscrowDisputed(bytes32 indexed jobId, string reasonHash);
    event EscrowRefunded(bytes32 indexed jobId, uint256 amount);

    error AlreadyFunded();
    error NotBuyer();
    error InvalidMilestones();
    error InvalidState();
    error TooManyReleases();

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function fundEscrow(
        bytes32 jobId,
        address seller,
        uint256 amount,
        uint8[] calldata milestonePcts
    ) external {
        if (escrows[jobId].state != EscrowState.None) revert AlreadyFunded();
        uint256 sum;
        for (uint256 i = 0; i < milestonePcts.length; i++) {
            sum += milestonePcts[i];
        }
        if (sum != 100 || milestonePcts.length == 0 || milestonePcts.length > 4) {
            revert InvalidMilestones();
        }

        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert();

        escrows[jobId] = EscrowAccount({
            buyer: msg.sender,
            seller: seller,
            totalAmount: amount,
            released: 0,
            milestonePcts: milestonePcts,
            milestonesReleased: 0,
            state: EscrowState.Funded
        });

        emit EscrowFunded(jobId, msg.sender, seller, amount, milestonePcts);
    }

    function releaseProgress(bytes32 jobId, uint8 milestoneIndex) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();
        if (milestoneIndex != e.milestonesReleased) revert TooManyReleases();
        if (milestoneIndex >= e.milestonePcts.length) revert TooManyReleases();

        uint256 amount = (e.totalAmount * e.milestonePcts[milestoneIndex]) / 100;
        e.released += amount;
        e.milestonesReleased += 1;

        if (!usdc.transfer(e.seller, amount)) revert();
        emit ProgressReleased(jobId, milestoneIndex, amount, e.seller);

        if (e.milestonesReleased == e.milestonePcts.length) {
            e.state = EscrowState.Settled;
            emit EscrowSettled(jobId, e.released);
        }
    }

    function releaseFinal(bytes32 jobId) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();
        uint256 remaining = e.totalAmount - e.released;
        if (remaining > 0) {
            e.released = e.totalAmount;
            if (!usdc.transfer(e.seller, remaining)) revert();
        }
        e.state = EscrowState.Settled;
        emit EscrowSettled(jobId, e.totalAmount);
    }

    function dispute(bytes32 jobId, string calldata reasonHash) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.buyer && msg.sender != e.seller) revert NotBuyer();
        e.state = EscrowState.Disputed;
        emit EscrowDisputed(jobId, reasonHash);
    }

    function refund(bytes32 jobId) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Disputed) revert InvalidState();
        // v0: platform admin handles dispute resolution off-chain and calls refund.
        // v1: replace with on-chain arbitration.
        uint256 remaining = e.totalAmount - e.released;
        e.state = EscrowState.Refunded;
        if (remaining > 0) {
            if (!usdc.transfer(e.buyer, remaining)) revert();
        }
        emit EscrowRefunded(jobId, remaining);
    }
}
