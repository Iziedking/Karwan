// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanReputation} from "../src/KarwanReputation.sol";
import {KarwanBusinessRegistry} from "../src/KarwanBusinessRegistry.sol";

/// @notice Stage A of the mainnet rollout: the two registries that hold no
///         funds, KarwanReputation and KarwanBusinessRegistry, owned by a Safe.
///         Nothing that holds USDC is deployed or wired here. The Stage B suite
///         points its escrow at this Reputation through a Safe transaction
///         (setEscrow) instead of deploying a second one.
///
///         Until the Safe calls acceptOwnership on Reputation, the deployer is
///         still its owner. Accept straight after the broadcast and check
///         owner() before announcing the address.
///
///         Env:
///           EXPECTED_CHAIN_ID       required. 5042 on Arc mainnet, 5042002 for a rehearsal.
///           REGISTRY_OWNER          required. The Safe that owns both registries. Must be a
///                                   contract unless ALLOW_EOA_OWNER=true (rehearsals only).
///           BUSINESS_REVIEWER_ADDR  required. The wallet the backend reviews businesses with.
///           SECURITY_COUNCIL        optional. May annul a Reputation penalty.
///           SECURITY_AGENT_SIGNER   optional. Fills the one-shot penalty signer slot.
///           FINANCE_SIGNER          optional. Fills the one-shot financing signer slot.
///         A signer slot left empty stays with the deployer, who alone can
///         fill it later, once.
contract DeployRegistries is Script {
    struct Config {
        address owner;
        address reviewer;
        address securityCouncil;
        address securityAgentSigner;
        address financeSigner;
    }

    struct Registries {
        KarwanReputation reputation;
        KarwanBusinessRegistry businessRegistry;
    }

    error WrongChain(uint256 expected, uint256 actual);
    error OwnerNotAContract(address owner);

    function run() external returns (Registries memory r) {
        uint256 expected = vm.envUint("EXPECTED_CHAIN_ID");
        if (block.chainid != expected) revert WrongChain(expected, block.chainid);
        Config memory c = Config({
            owner: vm.envAddress("REGISTRY_OWNER"),
            reviewer: vm.envAddress("BUSINESS_REVIEWER_ADDR"),
            securityCouncil: vm.envOr("SECURITY_COUNCIL", address(0)),
            securityAgentSigner: vm.envOr("SECURITY_AGENT_SIGNER", address(0)),
            financeSigner: vm.envOr("FINANCE_SIGNER", address(0))
        });
        if (c.owner.code.length == 0 && !vm.envOr("ALLOW_EOA_OWNER", false)) {
            revert OwnerNotAContract(c.owner);
        }

        vm.startBroadcast();
        r = deploy(c);
        vm.stopBroadcast();

        _writeManifest(r, c);
        console.log("KarwanReputation:       ", address(r.reputation));
        console.log("KarwanBusinessRegistry: ", address(r.businessRegistry));
        console.log("Registry owner (Safe):  ", c.owner);
        console.log("Business reviewer:      ", c.reviewer);
        console.log("NEXT: the Safe calls acceptOwnership() on KarwanReputation, then owner() must equal the Safe.");
    }

    /// @notice The deployment itself, callable from a test without
    ///         broadcasting. Whoever sends these calls is the temporary
    ///         Reputation owner until the Safe accepts.
    function deploy(Config memory c) public returns (Registries memory r) {
        r.reputation = new KarwanReputation();
        // A fresh network has no v1 history to migrate. Locking now removes the
        // owner's only way to write scores directly.
        r.reputation.lockBackfill();
        if (c.securityCouncil != address(0)) r.reputation.setSecurityCouncil(c.securityCouncil);
        if (c.securityAgentSigner != address(0)) r.reputation.setSecurityAgentSigner(c.securityAgentSigner);
        if (c.financeSigner != address(0)) r.reputation.setFinanceSigner(c.financeSigner);
        r.reputation.transferOwnership(c.owner);

        r.businessRegistry = new KarwanBusinessRegistry(c.owner, c.reviewer);
    }

    function _writeManifest(Registries memory r, Config memory c) internal {
        string memory k = "registries";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "block", block.number);
        vm.serializeAddress(k, "reputation", address(r.reputation));
        vm.serializeBytes32(k, "reputationCodehash", address(r.reputation).codehash);
        vm.serializeAddress(k, "reputationPendingOwner", r.reputation.pendingOwner());
        vm.serializeBool(k, "reputationBackfillLocked", r.reputation.backfillLocked());
        vm.serializeAddress(k, "securityCouncil", c.securityCouncil);
        vm.serializeAddress(k, "securityAgentSigner", r.reputation.securityAgentSigner());
        vm.serializeAddress(k, "financeSigner", r.reputation.financeSigner());
        vm.serializeAddress(k, "businessRegistry", address(r.businessRegistry));
        vm.serializeBytes32(k, "businessRegistryCodehash", address(r.businessRegistry).codehash);
        vm.serializeAddress(k, "businessRegistryOwner", r.businessRegistry.owner());
        string memory json = vm.serializeAddress(k, "businessReviewer", r.businessRegistry.reviewer());
        vm.writeJson(json, string.concat("./deployments/registries-", vm.toString(block.chainid), ".json"));
    }
}
