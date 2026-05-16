// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SpendPolicy} from "../src/SpendPolicy.sol";

contract Deploy is Script {
    function run() external returns (SpendPolicy policy) {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);
        policy = new SpendPolicy();
        vm.stopBroadcast();
        console.log("SpendPolicy deployed at:", address(policy));
    }
}
