// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Guardable
/// @notice Shared guardian surface for every Karwan money contract. A single
///         `guardian` (the security agent's on-chain identity, a multisig on
///         mainnet) can freeze a keyed money path while the off-chain pipeline
///         runs (delivery URL scan, malware check, fraud review). The guardian
///         can PAUSE, never move funds: holds are strictly weaker than the
///         parties' own rights.
///
///         Anti-abuse: the cumulative hold time per id is capped at
///         `maxHoldSecs`. Once spent, a hold auto-expires and cannot be
///         re-applied to that id, so the guardian can pause the game but never
///         confiscate the ball. The admin (each contract's existing owner /
///         operator) sets the guardian and the cap.
///
///         Each inheriting contract decides what an `id` means (a jobId, an
///         invoiceId, a staker key, or a single global circuit-breaker key) and
///         calls `_requireNotHeld(id)` at the top of the money paths it guards.
abstract contract Guardable {
    address public guardian;
    uint64 public maxHoldSecs = 7 days;
    uint64 public constant MAX_HOLD_CEIL = 30 days;

    struct HoldInfo {
        uint64 startedAt; // when the current active hold began (0 if inactive)
        uint64 usedSecs;  // cumulative hold seconds already consumed for this id
        bool active;
    }

    mapping(bytes32 => HoldInfo) internal _holds;

    event GuardianSet(address indexed guardian);
    event MaxHoldSecsSet(uint64 secs);
    event Held(bytes32 indexed id, bytes32 reasonHash, uint64 expiresAt);
    event HoldReleased(bytes32 indexed id, uint64 usedSecs);

    error NotGuardian();
    error NotGuardianAdmin();
    error Frozen();
    error ZeroGuardian();
    error InvalidHoldWindow();
    error HoldBudgetExhausted();

    /// @dev Inheriting contract returns its existing admin (owner / operator).
    function _guardianAdmin() internal view virtual returns (address);

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert NotGuardian();
        _;
    }

    modifier onlyGuardianAdmin() {
        if (msg.sender != _guardianAdmin()) revert NotGuardianAdmin();
        _;
    }

    /// @notice Set (or rotate) the guardian. Admin-only. Zero disables holds.
    function setGuardian(address g) external onlyGuardianAdmin {
        guardian = g;
        emit GuardianSet(g);
    }

    /// @notice Set the per-id cumulative hold cap, bounded by a hard ceiling so
    ///         the admin can neither grief it to 0 nor to a permanent lock.
    function setMaxHoldSecs(uint64 s) external onlyGuardianAdmin {
        if (s == 0 || s > MAX_HOLD_CEIL) revert InvalidHoldWindow();
        maxHoldSecs = s;
        emit MaxHoldSecsSet(s);
    }

    /// @notice Freeze `id`. Consumes from the id's remaining hold budget; the
    ///         hold auto-expires when the budget runs out. Reverts once the
    ///         cumulative cap is spent, so re-holds can't trap funds forever.
    function hold(bytes32 id, bytes32 reasonHash) external onlyGuardian {
        _applyHold(id, reasonHash);
    }

    /// @dev Shared hold logic, so a guardian-gated function in the inheriting
    ///      contract (e.g. attestDelivery(pass=false)) can place a hold too.
    function _applyHold(bytes32 id, bytes32 reasonHash) internal {
        _settle(id);
        HoldInfo storage h = _holds[id];
        if (h.usedSecs >= maxHoldSecs) revert HoldBudgetExhausted();
        h.startedAt = uint64(block.timestamp);
        h.active = true;
        uint64 remaining = maxHoldSecs - h.usedSecs;
        emit Held(id, reasonHash, uint64(block.timestamp) + remaining);
    }

    /// @notice Lift the hold on `id` early. Guardian-only. Settles the time
    ///         used so the budget reflects it.
    function releaseHold(bytes32 id) external onlyGuardian {
        _settle(id);
        emit HoldReleased(id, _holds[id].usedSecs);
    }

    /// @notice True while `id` is actively held and inside its remaining budget.
    function isHeld(bytes32 id) public view returns (bool) {
        HoldInfo storage h = _holds[id];
        if (!h.active) return false;
        uint64 remaining = maxHoldSecs > h.usedSecs ? maxHoldSecs - h.usedSecs : 0;
        return block.timestamp < uint256(h.startedAt) + remaining;
    }

    /// @notice Seconds of hold budget left for `id`.
    function holdBudgetLeft(bytes32 id) external view returns (uint64) {
        HoldInfo storage h = _holds[id];
        uint64 used = h.usedSecs;
        if (h.active) {
            uint64 elapsed = uint64(block.timestamp) - h.startedAt;
            used += elapsed;
        }
        return maxHoldSecs > used ? maxHoldSecs - used : 0;
    }

    /// @dev Fold any elapsed active-hold time into usedSecs and deactivate.
    ///      Idempotent; caps the charge at the remaining budget.
    function _settle(bytes32 id) internal {
        HoldInfo storage h = _holds[id];
        if (!h.active) return;
        uint64 elapsed = uint64(block.timestamp) - h.startedAt;
        uint64 remaining = maxHoldSecs > h.usedSecs ? maxHoldSecs - h.usedSecs : 0;
        h.usedSecs += elapsed > remaining ? remaining : elapsed;
        h.active = false;
        h.startedAt = 0;
    }

    function _requireNotHeld(bytes32 id) internal view {
        if (isHeld(id)) revert Frozen();
    }
}
