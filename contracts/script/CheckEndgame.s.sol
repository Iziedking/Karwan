// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KarwanTimelock} from "../src/suite/KarwanTimelock.sol";
import {KarwanHub} from "../src/suite/KarwanHub.sol";
import {KarwanIdentityRegistry} from "../src/suite/KarwanIdentityRegistry.sol";
import {KarwanRecord} from "../src/suite/KarwanRecord.sol";
import {KarwanStakeVault} from "../src/suite/KarwanStakeVault.sol";
import {KarwanAgreementEscrow} from "../src/suite/KarwanAgreementEscrow.sol";
import {KarwanTimeEscrow} from "../src/suite/KarwanTimeEscrow.sol";
import {KarwanJobEscrow} from "../src/suite/KarwanJobEscrow.sol";
import {KarwanTradeFinance} from "../src/suite/KarwanTradeFinance.sol";
import {KarwanCheckVerifier} from "../src/suite/KarwanCheckVerifier.sol";
import {EndgameConfig, EndgameConfigLib} from "./suite/EndgameConfig.sol";
import {EndgameDeployment} from "./suite/EndgameDeploy.sol";
import {EndgameCheck} from "./suite/EndgameCheck.sol";

/// @notice Reads a deployed suite back against its config. Without PHASE it
///         checks the state right after the deploy; PHASE=configured checks
///         the state after the owner Safe executed the first batch.
///
///   CONFIG=deployments/endgame-5042002.config.json [PHASE=configured] \
///   forge script script/CheckEndgame.s.sol --rpc-url $RPC
contract CheckEndgame is Script {
    function run() external view {
        EndgameConfig memory c = EndgameConfigLib.load(vm, vm.envString("CONFIG"));
        string memory j = vm.readFile(string.concat("deployments/endgame-", vm.toString(block.chainid), ".json"));
        EndgameDeployment memory d;
        d.timelock = KarwanTimelock(payable(vm.parseJsonAddress(j, ".timelock")));
        d.hub = KarwanHub(vm.parseJsonAddress(j, ".hub"));
        d.identity = KarwanIdentityRegistry(vm.parseJsonAddress(j, ".identity"));
        d.record = KarwanRecord(vm.parseJsonAddress(j, ".record"));
        d.vault = KarwanStakeVault(vm.parseJsonAddress(j, ".vault"));
        d.agreement = KarwanAgreementEscrow(vm.parseJsonAddress(j, ".agreement"));
        d.time = KarwanTimeEscrow(vm.parseJsonAddress(j, ".time"));
        d.jobs = KarwanJobEscrow(vm.parseJsonAddress(j, ".jobs"));
        d.tradeFinance = KarwanTradeFinance(vm.parseJsonAddress(j, ".tradeFinance"));
        d.verifier = KarwanCheckVerifier(vm.parseJsonAddress(j, ".verifier"));

        if (keccak256(bytes(vm.envOr("PHASE", string("deployed")))) == keccak256("configured")) {
            EndgameCheck.configured(d, c);
            console.log("configured: every role and value matches the config");
        } else {
            EndgameCheck.deployed(d, c, vm.parseJsonAddress(j, ".deployer"));
            console.log("deployed: the timelock owns the hub and the deployer holds nothing");
        }
        console.log("timelock", address(d.timelock));
        console.log("hub", address(d.hub));
        console.log("identity", address(d.identity));
        console.log("record", address(d.record));
        console.log("vault", address(d.vault));
        console.log("agreement", address(d.agreement));
        console.log("time", address(d.time));
        console.log("jobs", address(d.jobs));
        console.log("tradeFinance", address(d.tradeFinance));
        console.log("verifier", address(d.verifier));
    }
}
