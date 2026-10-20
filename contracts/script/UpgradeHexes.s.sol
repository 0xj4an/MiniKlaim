// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MiniKlaimHexes} from "../src/MiniKlaimHexes.sol";

/// @notice Upgrade the live MiniKlaimHexes proxy to the current implementation.
/// Reads `SERVER_SIGNER_PRIVATE_KEY` (must hold DEFAULT_ADMIN_ROLE on the proxy) and
/// `HEXES_PROXY` (the proxy address). The proxy address, tokens and counters stay.
/// Run with --rpc-url <chain> --broadcast; dry-run without --broadcast first.
contract UpgradeHexes is Script {
    function run() external {
        uint256 pk = vm.envUint("SERVER_SIGNER_PRIVATE_KEY");
        address proxy = vm.envAddress("HEXES_PROXY");
        MiniKlaimHexes hexes = MiniKlaimHexes(proxy);

        uint256 capturesBefore = hexes.totalCaptures();
        uint256 playersBefore = hexes.uniquePlayers();
        console2.log("Proxy:", proxy);
        console2.log("totalCaptures before:", capturesBefore);

        vm.startBroadcast(pk);
        MiniKlaimHexes impl = new MiniKlaimHexes();
        hexes.upgradeToAndCall(address(impl), "");
        vm.stopBroadcast();

        require(hexes.totalCaptures() == capturesBefore, "captures changed");
        require(hexes.uniquePlayers() == playersBefore, "players changed");
        require(hexes.totalTokensMinted() == 0, "new slot not empty");
        console2.log("New implementation:", address(impl));
    }
}
