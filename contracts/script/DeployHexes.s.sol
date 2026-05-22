// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MiniKlaimHexes} from "../src/MiniKlaimHexes.sol";

/// @notice Deploy `MiniKlaimHexes` to whatever chain the `--rpc-url` points at.
/// Reads the signer key from `SERVER_SIGNER_PRIVATE_KEY` env var.
/// The deployer also receives `DEFAULT_ADMIN_ROLE` and `CAPTURER_ROLE`.
contract DeployHexes is Script {
    function run() external {
        uint256 pk = vm.envUint("SERVER_SIGNER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        string memory baseUri = vm.envOr(
            "HEXES_BASE_URI",
            string("https://www.miniklaim.fun/api/onchain/hexes/")
        );

        console2.log("Deployer:", deployer);
        console2.log("Base URI:", baseUri);

        vm.startBroadcast(pk);
        MiniKlaimHexes hexes = new MiniKlaimHexes(deployer, baseUri);
        vm.stopBroadcast();

        console2.log("MiniKlaimHexes deployed at:", address(hexes));
    }
}
