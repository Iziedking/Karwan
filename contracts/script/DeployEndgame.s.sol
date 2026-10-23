// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Vm} from "forge-std/Vm.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {EndgameConfig, EndgameConfigLib} from "./suite/EndgameConfig.sol";
import {EndgameDeploy, EndgameDeployment} from "./suite/EndgameDeploy.sol";
import {EndgameCheck} from "./suite/EndgameCheck.sol";

/// @notice Deploys the endgame suite owned by its timelock, checks it, and
///         writes the address book plus the two Safe Transaction Builder files
///         the owner Safe signs: the first batch scheduled, then executed once
///         the delay has passed.
///
///   CONFIG=deployments/endgame-5042002.config.json \
///   forge script script/DeployEndgame.s.sol --rpc-url $RPC --broadcast
contract DeployEndgame is Script {
    function run() external {
        deploy(vm.envString("CONFIG"));
    }

    function deploy(string memory configPath) public {
        EndgameConfig memory c = EndgameConfigLib.load(vm, configPath);
        string memory base = string.concat("deployments/endgame-", vm.toString(block.chainid));
        require(!vm.exists(string.concat(base, ".json")), "a deployment is already recorded for this chain");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        EndgameDeployment memory d = EndgameDeploy.deploy(c);
        vm.stopBroadcast();

        EndgameCheck.deployed(d, c, deployer);

        _addressBook(d, deployer, string.concat(base, ".json"));

        _safeFiles(d, c, base);

        console.log("timelock", address(d.timelock));
        console.log("hub", address(d.hub));
        console.log("written", base);
    }

    /// @notice The two Safe Transaction Builder files: the first batch
    ///         scheduled, then executed.
    function _safeFiles(EndgameDeployment memory d, EndgameConfig memory c, string memory base) internal {
        (address[] memory t, uint256[] memory v, bytes[] memory p) = EndgameDeploy.firstSettings(d, c);
        bytes memory schedule =
            abi.encodeCall(TimelockController.scheduleBatch, (t, v, p, bytes32(0), EndgameDeploy.SALT, c.minDelay));
        bytes memory execute = abi.encodeCall(TimelockController.executeBatch, (t, v, p, bytes32(0), EndgameDeploy.SALT));
        _batchFile(
            string.concat(base, ".schedule.json"),
            "Karwan first settings: schedule",
            "Queues the first settings of the suite in the timelock.",
            c.ownerSafe,
            address(d.timelock),
            schedule
        );
        _batchFile(
            string.concat(base, ".execute.json"),
            "Karwan first settings: execute",
            "Executes the queued first settings once the timelock delay has passed.",
            c.ownerSafe,
            address(d.timelock),
            execute
        );
    }

    function _addressBook(EndgameDeployment memory d, address deployer, string memory path) internal {
        string memory k = "endgame";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "block", block.number);
        vm.serializeAddress(k, "deployer", deployer);
        vm.serializeAddress(k, "timelock", address(d.timelock));
        vm.serializeAddress(k, "hub", address(d.hub));
        vm.serializeAddress(k, "identity", address(d.identity));
        vm.serializeAddress(k, "record", address(d.record));
        vm.serializeAddress(k, "vault", address(d.vault));
        vm.serializeAddress(k, "agreement", address(d.agreement));
        vm.serializeAddress(k, "time", address(d.time));
        vm.serializeAddress(k, "jobs", address(d.jobs));
        vm.serializeAddress(k, "tradeFinance", address(d.tradeFinance));
        string memory json = vm.serializeAddress(k, "verifier", address(d.verifier));
        vm.writeJson(json, path);
    }

    function _batchFile(
        string memory path,
        string memory name,
        string memory description,
        address safe,
        address to,
        bytes memory data
    ) internal {
        string memory json = string.concat(
            '{"version":"1.0","chainId":"',
            vm.toString(block.chainid),
            '","createdAt":',
            vm.toString(block.timestamp * 1000),
            ',"meta":{"name":"',
            name,
            '","description":"',
            description,
            '","createdFromSafeAddress":"',
            vm.toString(safe),
            '"},"transactions":[{"to":"',
            vm.toString(to),
            '","value":"0","data":"',
            vm.toString(data),
            '","contractMethod":null,"contractInputsValues":null}]}'
        );
        vm.writeFile(path, json);
    }
}
