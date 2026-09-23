// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanYieldPool} from "../src/KarwanYieldPool.sol";
import {KarwanStakeVault} from "../src/KarwanStakeVault.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {KarwanDealEscrow} from "../src/KarwanDealEscrow.sol";

/// @notice Deploys the mainnet contract suite (docs/contract-suite-design.md):
///         YieldPool, StakeVault, Reputation and DealEscrow, with the three
///         escrow libraries linked by forge. Wires them, starts the escrow with
///         new deals paused, then hands every contract to the owner (the
///         timelock behind the owner Safe) with a two-step transfer the owner
///         must accept. Writes a manifest with addresses and runtime code
///         hashes so anyone can check the deployed bytecode against source.
///
///         Stage C and D contracts (PO financing, invoice registry, treasury)
///         are not part of this script.
///
/// Env (all required unless marked):
///   USDC_ADDR            Arc USDC ERC-20 interface (0x3600…0000 on mainnet and testnet)
///   SUITE_OWNER          timelock that will own every contract
///   FEE_SAFE             receives fees and swept yield; backstops the pool
///   REVIEW_SAFE          1-of-4 admin review Safe
///   SENIOR_SAFE          2-of-4 admin review Safe (same owners)
///   GUARDIAN             security agent key (holds, check attestations, pause)
///   AUTO_ARBITER         dispute engine key (optional; zero disables automatic rulings)
///   FINANCE_SIGNER       records financing outcomes on reputation
///   FEE_BPS              platform fee, at most 1000
///   DEAL_CAP, TOTAL_CAP, HIGH_VALUE   USDC 6-decimal caps for the guarded beta
///   USYC_TELLER, USYC_TOKEN, USYC_ORACLE, USYC_PRICE_DECIMALS   (optional; all or none)
contract DeploySuite is Script {
    struct Config {
        address usdc;
        address owner;
        address feeSafe;
        address reviewSafe;
        address seniorSafe;
        address guardian;
        address autoArbiter;
        address financeSigner;
        uint16 feeBps;
        uint128 dealCap;
        uint128 totalCap;
        uint128 highValue;
        address teller;
        address usyc;
        address oracle;
        uint8 priceDecimals;
        KarwanDealEscrow.Bounds bounds;
    }

    struct Suite {
        KarwanYieldPool pool;
        KarwanStakeVault vault;
        KarwanReputation reputation;
        KarwanDealEscrow escrow;
    }

    function defaultBounds() public pure returns (KarwanDealEscrow.Bounds memory) {
        return KarwanDealEscrow.Bounds({
            maxReservationBps: 10_000,
            minReview: 1 hours,
            maxReview: 180 days,
            maxHorizon: 730 days,
            disputeTimeout: 14 days,
            appealWindow: 3 days,
            autoRulingSla: 5 days
        });
    }

    function run() external returns (Suite memory s) {
        Config memory c = Config({
            usdc: vm.envAddress("USDC_ADDR"),
            owner: vm.envAddress("SUITE_OWNER"),
            feeSafe: vm.envAddress("FEE_SAFE"),
            reviewSafe: vm.envAddress("REVIEW_SAFE"),
            seniorSafe: vm.envAddress("SENIOR_SAFE"),
            guardian: vm.envAddress("GUARDIAN"),
            autoArbiter: vm.envOr("AUTO_ARBITER", address(0)),
            financeSigner: vm.envAddress("FINANCE_SIGNER"),
            feeBps: uint16(vm.envUint("FEE_BPS")),
            dealCap: uint128(vm.envUint("DEAL_CAP")),
            totalCap: uint128(vm.envUint("TOTAL_CAP")),
            highValue: uint128(vm.envUint("HIGH_VALUE")),
            teller: vm.envOr("USYC_TELLER", address(0)),
            usyc: vm.envOr("USYC_TOKEN", address(0)),
            oracle: vm.envOr("USYC_ORACLE", address(0)),
            priceDecimals: uint8(vm.envOr("USYC_PRICE_DECIMALS", uint256(8))),
            bounds: defaultBounds()
        });
        vm.startBroadcast();
        s = deploy(c, msg.sender);
        vm.stopBroadcast();
        _writeManifest(s);
    }

    /// @notice The whole deployment, callable from a test without broadcasting.
    ///         `deployer` is whoever sends these calls: the broadcaster in a
    ///         real run, this script contract in a test. It is the temporary
    ///         owner and hands ownership to `c.owner` at the end.
    function deploy(Config memory c, address deployer) public returns (Suite memory s) {
        address self = deployer;
        s.pool = new KarwanYieldPool(c.usdc, c.priceDecimals, self);
        s.vault = new KarwanStakeVault(c.usdc, self);
        s.reputation = new KarwanReputation();
        s.escrow = new KarwanDealEscrow(c.usdc, address(s.vault), self, c.bounds);

        s.pool.setClient(address(s.escrow), true);
        s.pool.setClient(address(s.vault), true);
        s.pool.setTreasury(c.feeSafe);
        if (c.teller != address(0)) s.pool.setTeller(c.teller, c.usyc, c.oracle);

        s.vault.setConsumer(address(s.escrow), true);
        s.vault.setPool(address(s.pool));
        s.vault.setGuardian(c.guardian);

        s.reputation.setEscrow(address(s.escrow));
        s.reputation.lockBackfill();
        // The constructor makes the deployer the one-shot admin for these two
        // signer slots. Filling them here burns the slots, so the deployer keeps
        // no reputation power after the handover.
        s.reputation.setSecurityAgentSigner(c.guardian);
        s.reputation.setFinanceSigner(c.financeSigner);

        s.escrow.setReputation(address(s.reputation));
        s.escrow.setRoles(c.feeSafe, c.autoArbiter, c.reviewSafe, c.seniorSafe);
        s.escrow.setFeeBps(c.feeBps);
        s.escrow.setCaps(c.dealCap, c.totalCap, c.highValue);
        s.escrow.setGuardian(c.guardian);
        s.escrow.setPool(address(s.pool));
        s.escrow.pauseNewDeals();

        s.pool.transferOwnership(c.owner);
        s.vault.transferOwnership(c.owner);
        s.escrow.transferOwnership(c.owner);
        s.reputation.transferOwnership(c.owner);
    }

    function _writeManifest(Suite memory s) internal {
        string memory k = "suite";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "block", block.number);
        vm.serializeAddress(k, "yieldPool", address(s.pool));
        vm.serializeBytes32(k, "yieldPoolCodehash", address(s.pool).codehash);
        vm.serializeAddress(k, "stakeVault", address(s.vault));
        vm.serializeBytes32(k, "stakeVaultCodehash", address(s.vault).codehash);
        vm.serializeAddress(k, "reputation", address(s.reputation));
        vm.serializeBytes32(k, "reputationCodehash", address(s.reputation).codehash);
        vm.serializeAddress(k, "dealEscrow", address(s.escrow));
        string memory json = vm.serializeBytes32(k, "dealEscrowCodehash", address(s.escrow).codehash);
        vm.writeJson(json, string.concat("./deployments/suite-", vm.toString(block.chainid), ".json"));
    }
}
