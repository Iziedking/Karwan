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
import {EndgameDeployment} from "./suite/EndgameDeploy.sol";
import {EndgameRoles} from "./suite/EndgameRoles.sol";

/// @notice Uses every role of the configured testnet suite once. STAGE=open
///         writes the fact, settles a deal passed by two of three checkers and
///         leaves a dispute on the arbiter's proposal; STAGE=settle, 72 hours
///         later, carries the proposal out. Arc Testnet only.
///
///   STAGE=open|settle forge script script/EndgameRoleScenario.s.sol --rpc-url $RPC [--broadcast]
///   keys: ENDGAME_BUYER_KEY, ENDGAME_SELLER_KEY, ENDGAME_ARBITER_KEY, ENDGAME_ISSUER_KEY,
///         ENDGAME_CHECKER1_KEY, ENDGAME_CHECKER2_KEY, ENDGAME_CHECKER3_KEY
contract EndgameRoleScenario is Script, EndgameRoles {
    function run() external {
        require(block.chainid == 5_042_002, "Arc Testnet only");
        EndgameDeployment memory d = _book();
        RoleKeys memory k = RoleKeys(
            vm.envUint("ENDGAME_BUYER_KEY"),
            vm.envUint("ENDGAME_SELLER_KEY"),
            vm.envUint("ENDGAME_ARBITER_KEY"),
            vm.envUint("ENDGAME_ISSUER_KEY"),
            vm.envUint("ENDGAME_CHECKER1_KEY"),
            vm.envUint("ENDGAME_CHECKER2_KEY"),
            vm.envUint("ENDGAME_CHECKER3_KEY")
        );
        string memory stage = vm.envString("STAGE");
        if (keccak256(bytes(stage)) == keccak256("open")) {
            Opened memory o = _openStage(d, k);
            console.log("fact id", o.factId);
            console.log("checked deal, settled on two of three checkers:");
            console.logBytes32(o.checked);
            console.log("disputed deal, split proposed by the arbiter; settle after", block.timestamp + APPEAL_WINDOW);
            console.logBytes32(o.disputed);
        } else if (keccak256(bytes(stage)) == keccak256("settle")) {
            bytes32 id = _settleStage(d, k);
            console.log("disputed deal ruled on the arbiter's proposal:");
            console.logBytes32(id);
        } else {
            revert("STAGE is open or settle");
        }
    }

    function _book() internal view returns (EndgameDeployment memory d) {
        string memory j = vm.readFile(string.concat("deployments/endgame-", vm.toString(block.chainid), ".json"));
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
    }
}
