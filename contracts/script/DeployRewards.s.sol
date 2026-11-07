// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MiniKlaimRewards} from "../src/MiniKlaimRewards.sol";

/// @notice Deploy `MiniKlaimRewards` (UUPS) behind an ERC1967 proxy.
/// Same deployer pattern as DeployHexes / DeployBadges: reads
/// `SERVER_SIGNER_PRIVATE_KEY` and grants DEFAULT_ADMIN_ROLE + REWARDER_ROLE
/// to the deployer address. Put the PROXY address in
/// NEXT_PUBLIC_CELO_REWARDS_ADDRESS.
///
/// USDm is hardcoded to the Celo mainnet address (chain id 42220). For a
/// Celo Sepolia deploy the token address must be changed here (Mento stables
/// have different addresses per network).
contract DeployRewards is Script {
    /// @dev USDm (formerly cUSD) on Celo mainnet, chain id 42220.
    address internal constant USDM_CELO_MAINNET = 0x765DE816845861e75A25fCA122bb6898B8B1282a;

    function run() external {
        uint256 pk = vm.envUint("SERVER_SIGNER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console2.log("Deployer (admin + rewarder):", deployer);
        console2.log("Reward token (USDm mainnet):", USDM_CELO_MAINNET);

        vm.startBroadcast(pk);
        MiniKlaimRewards impl = new MiniKlaimRewards();
        bytes memory initData =
            abi.encodeCall(MiniKlaimRewards.initialize, (deployer, USDM_CELO_MAINNET));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        vm.stopBroadcast();

        console2.log("MiniKlaimRewards implementation at:", address(impl));
        console2.log("MiniKlaimRewards PROXY (use this address) at:", address(proxy));
    }
}
