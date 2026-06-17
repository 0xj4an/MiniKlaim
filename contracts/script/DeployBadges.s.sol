// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MiniKlaimBadges} from "../src/MiniKlaimBadges.sol";

/// @notice Deploy `MiniKlaimBadges` (UUPS) behind an ERC1967 proxy.
/// The PROXY address is the one to put in NEXT_PUBLIC_MINIKLAIM_BADGES_ADDRESS.
contract DeployBadges is Script {
    function run() external {
        uint256 pk = vm.envUint("SERVER_SIGNER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        string memory baseUri = vm.envOr(
            "BADGES_BASE_URI",
            string("https://www.miniklaim.fun/api/onchain/badges/")
        );

        console2.log("Deployer:", deployer);
        console2.log("Base URI:", baseUri);

        vm.startBroadcast(pk);
        MiniKlaimBadges impl = new MiniKlaimBadges();
        bytes memory initData =
            abi.encodeCall(MiniKlaimBadges.initialize, (deployer, baseUri));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        vm.stopBroadcast();

        console2.log("MiniKlaimBadges implementation at:", address(impl));
        console2.log("MiniKlaimBadges PROXY (use this address) at:", address(proxy));
    }
}
