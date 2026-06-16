// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MiniKlaimHexes} from "../src/MiniKlaimHexes.sol";

/// @notice Deploy `MiniKlaimHexes` (UUPS) behind an ERC1967 proxy.
/// Reads the signer key from `SERVER_SIGNER_PRIVATE_KEY` env var.
/// The deployer receives `DEFAULT_ADMIN_ROLE` (upgrade + admin) and `CAPTURER_ROLE`.
/// The PROXY address is the one to put in NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS.
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
        MiniKlaimHexes impl = new MiniKlaimHexes();
        bytes memory initData =
            abi.encodeCall(MiniKlaimHexes.initialize, (deployer, baseUri));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        vm.stopBroadcast();

        console2.log("MiniKlaimHexes implementation at:", address(impl));
        console2.log("MiniKlaimHexes PROXY (use this address) at:", address(proxy));
    }
}
