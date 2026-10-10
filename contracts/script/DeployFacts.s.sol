// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {KarwanFacts} from "../src/KarwanFacts.sol";

/// @notice Deploys KarwanFacts, the append-only record of verified facts.
///         Holds no funds.
///
///         FACTS_VAULT   the stake vault whose resolveOwner decides who a person is
///         FACTS_ISSUER  the Karwan issuer wallet the backend writes facts from
///         FACTS_ESCROW  optional: the deal escrow allowed to record deals
///         FACTS_OWNER   optional: the Safe that takes ownership (two-step; the
///                       Safe calls acceptOwnership). Defaults to the broadcaster.
///
///         After deploy, set the backend env:
///           KARWAN_FACTS_ADDR = <printed address>
contract DeployFacts is Script {
    function run() external returns (KarwanFacts facts) {
        address vault = vm.envAddress("FACTS_VAULT");
        address issuer = vm.envAddress("FACTS_ISSUER");
        address escrow = vm.envOr("FACTS_ESCROW", address(0));
        address finalOwner = vm.envOr("FACTS_OWNER", msg.sender);

        vm.startBroadcast();
        facts = new KarwanFacts(vault, msg.sender);
        facts.setIssuer(issuer, true);
        if (escrow != address(0)) facts.setEscrow(escrow, true);
        if (finalOwner != msg.sender) facts.transferOwnership(finalOwner);
        vm.stopBroadcast();

        require(address(facts.vault()) == vault, "vault not set");
        require(facts.isIssuer(issuer), "issuer not set");
        require(escrow == address(0) || facts.isEscrow(escrow), "escrow not set");
        require(finalOwner == msg.sender || facts.pendingOwner() == finalOwner, "ownership not offered");

        console.log("KarwanFacts:  ", address(facts));
        console.log("Vault:        ", vault);
        console.log("Issuer:       ", issuer);
        console.log("Escrow:       ", escrow);
        console.log("Pending owner:", facts.pendingOwner());
    }
}
