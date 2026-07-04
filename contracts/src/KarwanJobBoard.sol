// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title KarwanJobBoard
/// @notice RFQ posting and negotiation primitive for Karwan SME trade deals.
/// @dev State machine: Posted → Bidding → Countered ↔ CounterResponded → Accepted.
///      Final settlement is handled by KarwanEscrow once `acceptBid` fires.
contract KarwanJobBoard {
    enum JobState {
        None,
        Posted,
        Accepted,
        Cancelled,
        Expired
    }

    struct Job {
        address buyer;
        uint256 budget;
        uint64 deadline;
        string termsHash;
        JobState state;
        address acceptedSeller;
        uint256 acceptedPrice;
        uint64 acceptedDeadline;
    }

    struct Bid {
        address seller;
        uint256 price;
        uint64 deadline;
        bool exists;
    }

    struct Counter {
        uint256 price;
        uint64 deadline;
        bool exists;
    }

    mapping(bytes32 => Job) public jobs;
    mapping(bytes32 => mapping(address => Bid)) public bids;
    mapping(bytes32 => mapping(address => Counter)) public counters;

    event JobPosted(
        bytes32 indexed jobId,
        address indexed buyer,
        uint256 budget,
        uint64 deadline,
        string termsHash
    );
    event BidSubmitted(
        bytes32 indexed jobId, address indexed seller, uint256 price, uint64 deadline
    );
    event CounterOfferIssued(
        bytes32 indexed jobId, address indexed seller, uint256 newPrice, uint64 newDeadline
    );
    event CounterResponse(
        bytes32 indexed jobId,
        address indexed seller,
        bool accepted,
        uint256 newPrice,
        uint64 newDeadline
    );
    event BidAccepted(
        bytes32 indexed jobId, address indexed seller, uint256 price, uint64 deadline
    );
    /// @notice A posted job reached its match-accept deadline without an accept
    ///         and was moved to the terminal Expired state. Permissionless: any
    ///         caller can clean up a stale job on-chain (v2b: replaces reliance
    ///         on the off-chain jobExpiryWatcher).
    event JobExpired(bytes32 indexed jobId);

    error JobAlreadyExists();
    error JobNotOpen();
    error NotJobBuyer();
    error NotJobSeller();
    error InvalidBid();
    error NoSuchBid();
    error InvalidJob();
    error BidExpired();
    error InvalidCounter();
    error MatchWindowClosed();
    error MatchWindowOpen();

    /// @notice Post a job. Audit L-1: the jobId is DERIVED as
    ///         keccak256(msg.sender, salt), namespacing it to the poster so no
    ///         other caller can squat or front-run a chosen id. The ABI
    ///         selector is unchanged (salt is bytes32 like the old jobId), so
    ///         the only coordinated change is that callers pass a salt and read
    ///         the derived jobId back from the return / the JobPosted event.
    function postJob(bytes32 salt, uint256 budget, uint64 deadline, string calldata termsHash)
        external
        returns (bytes32 jobId)
    {
        jobId = keccak256(abi.encode(msg.sender, salt));
        if (jobs[jobId].state != JobState.None) revert JobAlreadyExists();
        // forge-lint: disable-next-line(block-timestamp)
        if (budget == 0 || deadline <= block.timestamp) revert InvalidJob();
        jobs[jobId] = Job({
            buyer: msg.sender,
            budget: budget,
            deadline: deadline,
            termsHash: termsHash,
            state: JobState.Posted,
            acceptedSeller: address(0),
            acceptedPrice: 0,
            acceptedDeadline: 0
        });
        emit JobPosted(jobId, msg.sender, budget, deadline, termsHash);
    }

    /// @notice Off-chain helper: the jobId a given poster + salt will produce.
    function deriveJobId(address poster, bytes32 salt) external pure returns (bytes32) {
        return keccak256(abi.encode(poster, salt));
    }

    function submitBid(bytes32 jobId, uint256 price, uint64 deadline) external {
        Job storage j = jobs[jobId];
        if (j.state != JobState.Posted) revert JobNotOpen();
        // Deadlines are day/week-scale; validator-controlled timestamp drift is negligible.
        // forge-lint: disable-next-line(block-timestamp)
        if (price == 0 || deadline <= block.timestamp) revert InvalidBid();
        bids[jobId][msg.sender] =
            Bid({seller: msg.sender, price: price, deadline: deadline, exists: true});
        emit BidSubmitted(jobId, msg.sender, price, deadline);
    }

    function counterOffer(bytes32 jobId, address seller, uint256 newPrice, uint64 newDeadline)
        external
    {
        Job storage j = jobs[jobId];
        if (j.state != JobState.Posted) revert JobNotOpen();
        if (msg.sender != j.buyer) revert NotJobBuyer();
        if (!bids[jobId][seller].exists) revert NoSuchBid();
        // Audit L-2: reject a counter whose deadline is already in the past, so
        // an accepted counter can never yield an instantly-expired bid.
        // forge-lint: disable-next-line(block-timestamp)
        if (newPrice == 0 || newDeadline <= block.timestamp) revert InvalidCounter();
        counters[jobId][seller] =
            Counter({price: newPrice, deadline: newDeadline, exists: true});
        emit CounterOfferIssued(jobId, seller, newPrice, newDeadline);
    }

    function respondToCounter(
        bytes32 jobId,
        bool accept,
        uint256 newPrice,
        uint64 newDeadline
    ) external {
        Job storage j = jobs[jobId];
        if (j.state != JobState.Posted) revert JobNotOpen();
        Counter storage c = counters[jobId][msg.sender];
        if (!c.exists) revert NoSuchBid();
        if (accept) {
            bids[jobId][msg.sender].price = c.price;
            bids[jobId][msg.sender].deadline = c.deadline;
            emit CounterResponse(jobId, msg.sender, true, c.price, c.deadline);
        } else {
            // Audit L-2: a seller's re-counter must also carry a future deadline.
            // forge-lint: disable-next-line(block-timestamp)
            if (newPrice == 0 || newDeadline <= block.timestamp) revert InvalidCounter();
            counters[jobId][msg.sender] =
                Counter({price: newPrice, deadline: newDeadline, exists: true});
            emit CounterResponse(jobId, msg.sender, false, newPrice, newDeadline);
        }
    }

    function acceptBid(bytes32 jobId, address seller) external {
        Job storage j = jobs[jobId];
        if (j.state != JobState.Posted) revert JobNotOpen();
        if (msg.sender != j.buyer) revert NotJobBuyer();
        // v2b: the job's own deadline is the match-accept window. Once it
        // passes, no match can be accepted even on a still-valid bid, so a late
        // accept can't slip through before someone calls expireJob. "Miss the
        // window -> nothing funded" is enforced here, not just by the watcher.
        // forge-lint: disable-next-line(block-timestamp)
        if (j.deadline <= block.timestamp) revert MatchWindowClosed();
        Bid storage b = bids[jobId][seller];
        if (!b.exists) revert NoSuchBid();
        // forge-lint: disable-next-line(block-timestamp)
        if (b.deadline <= block.timestamp) revert BidExpired();
        j.state = JobState.Accepted;
        j.acceptedSeller = seller;
        j.acceptedPrice = b.price;
        j.acceptedDeadline = b.deadline;
        emit BidAccepted(jobId, seller, b.price, b.deadline);
    }

    /// @notice Permissionless terminal cleanup: move a Posted job whose
    ///         match-accept window has closed to Expired. Anyone may call it
    ///         (the buyer, a keeper, a curious seller) once the deadline passes,
    ///         so a matched-but-unaccepted job reaches a dead on-chain state
    ///         instead of lingering in "awaiting approval". No funds are
    ///         involved: the escrow is never touched until acceptBid + a
    ///         separate fund call, both already blocked past the window.
    function expireJob(bytes32 jobId) external {
        Job storage j = jobs[jobId];
        if (j.state != JobState.Posted) revert JobNotOpen();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < j.deadline) revert MatchWindowOpen();
        j.state = JobState.Expired;
        emit JobExpired(jobId);
    }
}
