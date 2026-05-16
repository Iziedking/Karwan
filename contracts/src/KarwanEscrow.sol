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
///         milestone signed by the buyer. A platform fee is split evenly between
///         buyer and seller: the buyer funds dealAmount + half the fee, the seller
///         nets dealAmount - half the fee, and the treasury collects the full fee
///         proportionally across milestone releases.
/// @dev Paired with KarwanJobBoard via jobId. Holds USDC at the contract address.
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
        uint256 dealAmount; // headline amount the parties agreed on
        uint256 sellerNet; // dealAmount minus the seller's fee half; total seller payout
        uint256 feeTotal; // platform fee for the whole deal; goes to treasury
        uint256 released; // running tally of seller payouts
        uint256 feeReleased; // running tally of treasury payouts
        uint8[] milestonePcts;
        uint8 milestonesReleased;
        EscrowState state;
    }

    uint8 internal constant MAX_MILESTONES = 4;
    uint8 internal constant PCT_TOTAL = 100;
    uint16 internal constant BPS_DENOMINATOR = 10000;

    IERC20 public immutable usdc;
    /// @notice Platform fee in basis points applied to the deal amount (e.g. 150 = 1.5%).
    uint16 public immutable feeBps;
    /// @notice Address that collects the platform fee.
    address public immutable treasury;

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
        uint256 dealAmount,
        uint256 fundedAmount,
        uint256 feeTotal,
        uint8[] milestonePcts
    );
    event ProgressReleased(
        bytes32 indexed jobId, uint8 milestoneIndex, uint256 amount, address indexed to
    );
    event FeeCollected(bytes32 indexed jobId, uint8 milestoneIndex, uint256 amount, address indexed treasury);
    event EscrowSettled(bytes32 indexed jobId, uint256 sellerTotal, uint256 feeTotal);
    event EscrowDisputed(bytes32 indexed jobId, string reasonHash);
    event EscrowRefunded(bytes32 indexed jobId, uint256 amount);

    error AlreadyFunded();
    error NotBuyer();
    error NotParty();
    error InvalidMilestones();
    error InvalidState();
    error TooManyReleases();
    error TransferFailed();
    error InvalidTreasury();
    error FeeTooHigh();
    error InvalidSeller();
    error InvalidAmount();

    constructor(address _usdc, uint16 _feeBps, address _treasury) {
        if (_treasury == address(0)) revert InvalidTreasury();
        // Cap the fee at 10% so a misconfigured deploy can't drain deals.
        if (_feeBps > 1000) revert FeeTooHigh();
        usdc = IERC20(_usdc);
        feeBps = _feeBps;
        treasury = _treasury;
    }

    /// @notice Fund an escrow for a deal. The buyer transfers in dealAmount plus
    ///         their half of the platform fee. Milestone percentages apply to the
    ///         seller's net payout.
    function fundEscrow(
        bytes32 jobId,
        address seller,
        uint256 dealAmount,
        uint8[] calldata milestonePcts
    ) external nonReentrant {
        if (escrows[jobId].state != EscrowState.None) revert AlreadyFunded();
        if (seller == address(0) || seller == msg.sender) revert InvalidSeller();
        if (dealAmount == 0) revert InvalidAmount();
        uint256 milestoneCount = milestonePcts.length;
        if (milestoneCount == 0 || milestoneCount > MAX_MILESTONES) revert InvalidMilestones();

        uint256 sum;
        for (uint256 i = 0; i < milestoneCount; i++) {
            sum += milestonePcts[i];
        }
        if (sum != PCT_TOTAL) revert InvalidMilestones();

        uint256 feeTotal = (dealAmount * feeBps) / BPS_DENOMINATOR;
        uint256 buyerFee = feeTotal / 2;
        uint256 sellerFee = feeTotal - buyerFee; // exact even when feeTotal is odd
        uint256 sellerNet = dealAmount - sellerFee;
        uint256 fundedAmount = dealAmount + buyerFee;

        escrows[jobId] = EscrowAccount({
            buyer: msg.sender,
            seller: seller,
            dealAmount: dealAmount,
            sellerNet: sellerNet,
            feeTotal: feeTotal,
            released: 0,
            feeReleased: 0,
            milestonePcts: milestonePcts,
            milestonesReleased: 0,
            state: EscrowState.Funded
        });

        if (!usdc.transferFrom(msg.sender, address(this), fundedAmount)) revert TransferFailed();

        emit EscrowFunded(jobId, msg.sender, seller, dealAmount, fundedAmount, feeTotal, milestonePcts);
    }

    /// @notice Release one milestone. Sends the seller their cut and the treasury
    ///         its proportional fee cut. The final milestone sweeps any rounding
    ///         remainder so the escrow ends empty.
    function releaseProgress(bytes32 jobId, uint8 milestoneIndex) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();
        if (milestoneIndex != e.milestonesReleased) revert TooManyReleases();
        if (milestoneIndex >= e.milestonePcts.length) revert TooManyReleases();

        bool isFinalMilestone = (e.milestonesReleased + 1) == e.milestonePcts.length;

        uint256 sellerCut;
        uint256 feeCut;
        if (isFinalMilestone) {
            sellerCut = e.sellerNet - e.released;
            feeCut = e.feeTotal - e.feeReleased;
        } else {
            uint8 pct = e.milestonePcts[milestoneIndex];
            sellerCut = (e.sellerNet * pct) / PCT_TOTAL;
            feeCut = (e.feeTotal * pct) / PCT_TOTAL;
        }

        e.released += sellerCut;
        e.feeReleased += feeCut;
        e.milestonesReleased += 1;
        if (isFinalMilestone) {
            e.state = EscrowState.Settled;
        }

        if (sellerCut > 0) {
            if (!usdc.transfer(e.seller, sellerCut)) revert TransferFailed();
        }
        emit ProgressReleased(jobId, milestoneIndex, sellerCut, e.seller);

        if (feeCut > 0) {
            if (!usdc.transfer(treasury, feeCut)) revert TransferFailed();
            emit FeeCollected(jobId, milestoneIndex, feeCut, treasury);
        }

        if (isFinalMilestone) {
            emit EscrowSettled(jobId, e.released, e.feeReleased);
        }
    }

    /// @notice Settle a funded escrow in one call, sweeping all remaining seller
    ///         and treasury balances.
    function releaseFinal(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();

        uint256 sellerRemaining = e.sellerNet - e.released;
        uint256 feeRemaining = e.feeTotal - e.feeReleased;
        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.milestonesReleased = uint8(e.milestonePcts.length);
        e.state = EscrowState.Settled;

        if (sellerRemaining > 0) {
            if (!usdc.transfer(e.seller, sellerRemaining)) revert TransferFailed();
        }
        if (feeRemaining > 0) {
            if (!usdc.transfer(treasury, feeRemaining)) revert TransferFailed();
            emit FeeCollected(jobId, e.milestonesReleased, feeRemaining, treasury);
        }
        emit EscrowSettled(jobId, e.sellerNet, e.feeTotal);
    }

    function dispute(bytes32 jobId, string calldata reasonHash) external {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Funded) revert InvalidState();
        if (msg.sender != e.buyer && msg.sender != e.seller) revert NotParty();
        e.state = EscrowState.Disputed;
        emit EscrowDisputed(jobId, reasonHash);
    }

    /// @notice Return all unreleased funds (seller portion + uncollected fee) to
    ///         the buyer. A refunded deal collects no platform fee.
    /// @dev Restricted to the buyer of the escrow. The funds flow to the buyer
    ///      regardless, so opening this to anyone would just let a third party
    ///      grief by forcing the refund before any off-chain resolution. The
    ///      buyer's agent wallet (which is `e.buyer` since it funded) is the
    ///      authorised caller, matching the backend cancel/refund flow.
    function refund(bytes32 jobId) external nonReentrant {
        EscrowAccount storage e = escrows[jobId];
        if (e.state != EscrowState.Disputed) revert InvalidState();
        if (msg.sender != e.buyer) revert NotBuyer();
        uint256 remaining = (e.sellerNet - e.released) + (e.feeTotal - e.feeReleased);
        e.released = e.sellerNet;
        e.feeReleased = e.feeTotal;
        e.state = EscrowState.Refunded;
        if (remaining > 0) {
            if (!usdc.transfer(e.buyer, remaining)) revert TransferFailed();
        }
        emit EscrowRefunded(jobId, remaining);
    }
}
