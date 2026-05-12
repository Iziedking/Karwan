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
        uint8[] milestonePcts;
        uint8 milestonesReleased;
        EscrowState state;
    }

    uint8 internal constant MAX_MILESTONES = 4;
    uint8 internal constant PCT_TOTAL = 100;

    IERC20 public immutable usdc;
    mapping(bytes32 => EscrowAccount) public escrows;

    uint256 private _reentrancyStatus = 1;

    modifier nonReentrant() {
        require(_reentrancyStatus == 1, "REENTRANT");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

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
    error NotParty();
    error InvalidMilestones();
    error InvalidState();
    error TooManyReleases();
    error TransferFailed();

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function fundEscrow(
        bytes32 jobId,
        address seller,
        uint256 amount,
        uint8[] calldata milestonePcts
    ) external nonReentrant {
        if (escrows[jobId].state != EscrowState.None) revert AlreadyFunded();
        uint256 milestoneCount = milestonePcts.length;
        if (milestoneCount == 0 || milestoneCount > MAX_MILESTONES) revert InvalidMilestones();

        uint256 sum;
        for (uint256 i = 0; i < milestoneCount; i++) {
            sum += milestonePcts[i];
        }
        if (sum != PCT_TOTAL) revert InvalidMilestones();

        escrows[jobId] = EscrowAccount({
            buyer: msg.sender,
            seller: seller,
            totalAmount: amount,
            released: 0,
            milestonePcts: milestonePcts,
            milestonesReleased: 0,
            state: EscrowState.Funded
        });

        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        emit EscrowFunded(jobId, msg.sender, seller, amount, milestonePcts);
    }

    function releaseProgress(bytes32 jobId, uint8 milestoneIndex) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();
        if (milestoneIndex != e.milestonesReleased) revert TooManyReleases();
        if (milestoneIndex >= e.milestonePcts.length) revert TooManyReleases();

        uint256 amount = (e.totalAmount * e.milestonePcts[milestoneIndex]) / PCT_TOTAL;
        e.released += amount;
        e.milestonesReleased += 1;

        bool isFinalMilestone = e.milestonesReleased == e.milestonePcts.length;
        if (isFinalMilestone) {
            e.state = EscrowState.Settled;
        }

        if (!usdc.transfer(e.seller, amount)) revert TransferFailed();
        emit ProgressReleased(jobId, milestoneIndex, amount, e.seller);
        if (isFinalMilestone) {
            emit EscrowSettled(jobId, e.released);
        }
    }

    function releaseFinal(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();

        uint256 remaining = e.totalAmount - e.released;
        e.released = e.totalAmount;
        e.state = EscrowState.Settled;

        if (remaining > 0) {
            if (!usdc.transfer(e.seller, remaining)) revert TransferFailed();
        }
        emit EscrowSettled(jobId, e.totalAmount);
    }

    function dispute(bytes32 jobId, string calldata reasonHash) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.buyer && msg.sender != e.seller) revert NotParty();
        e.state = EscrowState.Disputed;
        emit EscrowDisputed(jobId, reasonHash);
    }

    function refund(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Disputed) revert InvalidState();
        // v0: caller is a platform admin acting on off-chain dispute resolution.
        // Access control hardens here in v1 (Ownable / role-based).
        uint256 remaining = e.totalAmount - e.released;
        e.state = EscrowState.Refunded;
        if (remaining > 0) {
            if (!usdc.transfer(e.buyer, remaining)) revert TransferFailed();
        }
        emit EscrowRefunded(jobId, remaining);
    }
}
