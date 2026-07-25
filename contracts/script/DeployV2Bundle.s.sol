// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanEscrow} from "../src/KarwanEscrow.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {KarwanVault} from "../src/KarwanVault.sol";
import {KarwanTreasury} from "../src/KarwanTreasury.sol";
import {KarwanInvoiceRegistry} from "../src/KarwanInvoiceRegistry.sol";
import {KarwanBusinessRegistry} from "../src/KarwanBusinessRegistry.sol";
import {KarwanYieldDistributor} from "../src/KarwanYieldDistributor.sol";

/// @title v2 bundle deploy and verify
/// @notice Deploys the v2 contracts, wires every reference, sets every safety
///         parameter, and then asserts the resulting on-chain state.
///
///         The verification pass is the point of this script. Several v2
///         safety features are inert at their zero defaults rather than
///         failing loudly:
///
///           - Treasury.maxKeeperOutPerWindow == 0 disables the keeper cap
///             outright (see KarwanTreasury: `if (... == 0) return;`).
///           - Treasury.payoutDelay == 0 permits immediate payouts.
///           - Treasury.escrowLiquidFloor == 0 makes the sweep floor
///             max(idleThreshold, 0), so only idleThreshold constrains it.
///           - Escrow.arbiter == address(0) makes resolve() revert, so a
///             dispute can never be ruled on.
///           - Guardable.guardian == address(0) disables holds entirely.
///
///         A bundle can therefore deploy "successfully" and be missing half
///         its protections. _verify reverts instead.
///
///         One-shot wiring worth knowing before running this: Vault.setEscrow
///         is deployer-only, reverts if already set, and zeroes `deployer`
///         afterwards. It gets exactly one attempt per vault deployment.
///
///         The escrow is automatically a vault reservation consumer
///         (_isConsumer returns true for `escrow`), so no setConsumer call is
///         needed for it. KarwanPOFinancing is deliberately NOT added as a
///         consumer: the backend funds every line with requiredStakeUsdc = 0,
///         so it never calls vault.reserve, and authorising it early would
///         grant slash rights it does not use.
contract DeployV2Bundle is Script {
    struct Addrs {
        address rep;
        address vault;
        address treasury;
        address escrow;
        address invoiceRegistry;
        address businessRegistry;
        address yieldDistributor;
    }

    struct Params {
        address usdc;
        uint16 feeBps;
        uint16 maxReservationBps;
        address usycTeller;
        address usycToken;
        address usycOracle;
        address keeper;
        address arbiter;
        address guardian;
        address reviewer;
        address yieldOperator;
        uint256 idleThreshold;
        uint256 escrowLiquidFloor;
        uint256 keeperCap;
        uint256 keeperWindowSecs;
        uint256 payoutDelay;
    }

    function run() external {
        Params memory p = _readEnv();
        vm.startBroadcast();
        Addrs memory a = _deploy(p);
        _wire(a, p);
        _verify(a, p);
        vm.stopBroadcast();
        _report(a);
    }

    // ------------------------------------------------------------------
    // Configuration
    // ------------------------------------------------------------------

    function _readEnv() internal view returns (Params memory p) {
        p.usdc = vm.envOr("USDC_ADDR", address(0x3600000000000000000000000000000000000000));
        p.feeBps = uint16(vm.envOr("KARWAN_FEE_BPS", uint256(200)));
        p.maxReservationBps = uint16(vm.envOr("KARWAN_MAX_RESERVATION_BPS", uint256(10000)));

        p.usycTeller = vm.envOr("USYC_TELLER_ADDR", address(0));
        p.usycToken = vm.envOr("USYC_TOKEN_ADDR", address(0));
        p.usycOracle = vm.envOr("USYC_ORACLE_ADDR", address(0));

        p.keeper = vm.envOr("TREASURY_KEEPER_ADDR", msg.sender);
        p.arbiter = vm.envOr("KARWAN_ARBITER_ADDR", address(0));
        p.guardian = vm.envOr("KARWAN_GUARDIAN_ADDR", address(0));
        p.reviewer = vm.envOr("KARWAN_REVIEWER_ADDR", msg.sender);
        p.yieldOperator = vm.envOr("KARWAN_YIELD_OPERATOR_ADDR", address(0));

        p.idleThreshold = vm.envOr("TREASURY_IDLE_THRESHOLD", uint256(10_000_000));
        p.escrowLiquidFloor = vm.envOr("TREASURY_ESCROW_LIQUID_FLOOR", uint256(0));
        p.keeperCap = vm.envOr("TREASURY_KEEPER_CAP", uint256(0));
        // setKeeperCap rejects a zero window even when the cap itself is 0,
        // so this always needs a real value.
        p.keeperWindowSecs = vm.envOr("TREASURY_KEEPER_WINDOW_SECS", uint256(1 days));
        p.payoutDelay = vm.envOr("TREASURY_PAYOUT_DELAY", uint256(0));

        // Fail before broadcasting rather than halfway through a bundle.
        require(p.usycTeller != address(0), "USYC_TELLER_ADDR unset");
        require(p.usycToken != address(0), "USYC_TOKEN_ADDR unset");
        require(p.usycOracle != address(0), "USYC_ORACLE_ADDR unset");
        require(p.arbiter != address(0), "KARWAN_ARBITER_ADDR unset: resolve() would revert forever");
        require(p.guardian != address(0), "KARWAN_GUARDIAN_ADDR unset: holds would be disabled");
    }

    /// @dev The escrow's yield wiring is immutable, so the treasury address is
    ///      needed before the escrow exists. Deploy order is therefore
    ///      reputation, vault, treasury, escrow, then the registries.
    function _deploy(Params memory p) internal returns (Addrs memory a) {
        a.rep = address(new KarwanReputation());
        a.vault = address(new KarwanVault(p.usdc));
        a.treasury = address(
            new KarwanTreasury(p.usdc, p.usycTeller, p.usycToken, p.usycOracle, p.keeper, p.idleThreshold)
        );

        a.escrow = address(
            new KarwanEscrow(
                p.usdc,
                p.feeBps,
                a.treasury,
                a.vault,
                a.rep,
                p.maxReservationBps,
                KarwanEscrow.YieldConfig({
                    backstop: a.treasury,
                    operator: p.yieldOperator,
                    coverageFloor: 0,
                    maxYieldBps: 8000
                }),
                KarwanEscrow.TimingConfig({
                    minReviewWindow: uint64(vm.envOr("ESCROW_MIN_REVIEW_WINDOW", uint256(60))),
                    maxReviewWindow: uint64(vm.envOr("ESCROW_MAX_REVIEW_WINDOW", uint256(180 days))),
                    disputeTimeoutSecs: uint64(vm.envOr("ESCROW_DISPUTE_TIMEOUT", uint256(14 days))),
                    attestedWindowSecs: uint64(vm.envOr("ESCROW_ATTESTED_WINDOW", uint256(1 days))),
                    maxDeadlineHorizon: uint64(vm.envOr("ESCROW_MAX_DEADLINE_HORIZON", uint256(730 days)))
                })
            )
        );

        // These three take their admin roles as constructor arguments, so the
        // reviewer and yield operator are never briefly unset.
        a.invoiceRegistry = address(new KarwanInvoiceRegistry(msg.sender));
        a.businessRegistry = address(new KarwanBusinessRegistry(msg.sender, p.reviewer));
        a.yieldDistributor = address(new KarwanYieldDistributor(p.usdc, p.keeper));
    }

    function _wire(Addrs memory a, Params memory p) internal {
        // Vault.setEscrow is one-shot and deployer-only, and zeroes `deployer`
        // on success. It also makes the escrow a reservation consumer.
        KarwanVault(a.vault).setEscrow(a.escrow);
        KarwanVault(a.vault).setTeller(p.usycTeller, p.usycToken);

        KarwanReputation(a.rep).setEscrow(a.escrow);

        KarwanTreasury(a.treasury).setEscrow(a.escrow);
        KarwanTreasury(a.treasury).setEscrowLiquidFloor(p.escrowLiquidFloor);
        KarwanTreasury(a.treasury).setKeeperCap(p.keeperCap, p.keeperWindowSecs);
        KarwanTreasury(a.treasury).setPayoutDelay(p.payoutDelay);

        KarwanInvoiceRegistry(a.invoiceRegistry).setEscrow(a.escrow);
        // Factoring pays the seller and assigns the receivable in one call, so
        // the registry needs USDC to relay the advance through and the escrow's
        // permission to record the redirect. Without both, the first factoring
        // attempt reverts.
        KarwanInvoiceRegistry(a.invoiceRegistry).setUsdc(p.usdc);
        KarwanEscrow(a.escrow).setAssigner(a.invoiceRegistry, true);

        // Dispute resolution and guardian holds are both inert until set.
        KarwanEscrow(a.escrow).setArbiter(p.arbiter);
        KarwanEscrow(a.escrow).setGuardian(p.guardian);
    }

    // ------------------------------------------------------------------
    // Verification
    // ------------------------------------------------------------------

    /// @dev Reads back every wired value. A mis-wire aborts the broadcast
    ///      instead of leaving a half-configured bundle on chain.
    function _verify(Addrs memory a, Params memory p) internal view {
        require(KarwanVault(a.vault).escrow() == a.escrow, "vault.escrow");
        require(KarwanReputation(a.rep).escrow() == a.escrow, "reputation.escrow");
        require(KarwanTreasury(a.treasury).escrow() == a.escrow, "treasury.escrow");
        require(KarwanInvoiceRegistry(a.invoiceRegistry).escrow() == a.escrow, "invoiceRegistry.escrow");
        require(KarwanInvoiceRegistry(a.invoiceRegistry).usdc() == p.usdc, "invoiceRegistry.usdc");
        require(
            KarwanEscrow(a.escrow).authorizedAssigners(a.invoiceRegistry),
            "escrow.authorizedAssigners(registry)"
        );

        require(KarwanEscrow(a.escrow).arbiter() == p.arbiter, "escrow.arbiter");
        require(KarwanEscrow(a.escrow).guardian() == p.guardian, "escrow.guardian");
        require(KarwanEscrow(a.escrow).yieldBackstop() == a.treasury, "escrow.yieldBackstop");

        require(address(KarwanEscrow(a.escrow).vault()) == a.vault, "escrow.vault");
        require(address(KarwanEscrow(a.escrow).reputation()) == a.rep, "escrow.reputation");
        require(KarwanEscrow(a.escrow).treasury() == a.treasury, "escrow.treasury");

        require(KarwanTreasury(a.treasury).escrowLiquidFloor() == p.escrowLiquidFloor, "treasury.escrowLiquidFloor");
        require(KarwanTreasury(a.treasury).maxKeeperOutPerWindow() == p.keeperCap, "treasury.keeperCap");
        require(KarwanTreasury(a.treasury).payoutDelay() == p.payoutDelay, "treasury.payoutDelay");
        require(KarwanTreasury(a.treasury).keeper() == p.keeper, "treasury.keeper");

        require(KarwanBusinessRegistry(a.businessRegistry).reviewer() == p.reviewer, "businessRegistry.reviewer");
        require(KarwanYieldDistributor(a.yieldDistributor).operator() == p.keeper, "yieldDistributor.operator");

        // The zero-default traps. These are warnings rather than reverts
        // because zero is a legitimate testnet choice, but they must be a
        // deliberate one: on mainnet an unset cap or timelock is a finding.
        if (p.keeperCap == 0) {
            console2.log("WARNING: treasury keeper cap is 0, the per-window cap is DISABLED");
        }
        if (p.payoutDelay == 0) {
            console2.log("WARNING: treasury payout delay is 0, payouts are IMMEDIATE");
        }
        if (p.escrowLiquidFloor == 0) {
            console2.log("WARNING: treasury escrow liquid floor is 0");
        }
        if (p.yieldOperator == address(0)) {
            console2.log("NOTE: escrow yield operator unset, sweepIdle is unavailable (yield-inert)");
        }
    }

    function _report(Addrs memory a) internal pure {
        console2.log("KARWAN_REPUTATION_ADDR      ", a.rep);
        console2.log("KARWAN_VAULT_ADDR           ", a.vault);
        console2.log("KARWAN_TREASURY_ADDR        ", a.treasury);
        console2.log("KARWAN_ESCROW_ADDR          ", a.escrow);
        console2.log("KARWAN_INVOICE_REGISTRY_ADDR", a.invoiceRegistry);
        console2.log("KARWAN_BUSINESS_REGISTRY_ADDR", a.businessRegistry);
        console2.log("KARWAN_YIELD_DISTRIBUTOR_ADDR", a.yieldDistributor);
    }
}
