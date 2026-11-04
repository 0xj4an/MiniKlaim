// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MiniKlaimDrops} from "../src/MiniKlaimDrops.sol";

/// @notice Deploy `MiniKlaimDrops` (UUPS) behind an ERC1967 proxy.
/// Reads `SERVER_SIGNER_PRIVATE_KEY`: that key deploys, gets REWARDER_ROLE
/// (create, edit, expire drops, sign vouchers) and is the relayer that submits
/// `claimDropsFor`. DEFAULT_ADMIN_ROLE (upgrade, withdraw, pause, roles) goes to
/// `DROPS_ADMIN`, a wallet the server does not hold; it falls back to the
/// deployer only when unset. Put the PROXY address in
/// NEXT_PUBLIC_CELO_DROPS_ADDRESS.
///
/// The allowlist is pinned to Celo mainnet (chain id 42220) USDT and COPm.
contract DeployDrops is Script {
    address internal constant USDT_CELO_MAINNET = 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e;
    address internal constant COPM_CELO_MAINNET = 0x8A567e2aE79CA692Bd748aB832081C45de4041eA;

    function run() external {
        require(block.chainid == 42220, "DeployDrops: Celo mainnet only");
        uint256 pk = vm.envUint("SERVER_SIGNER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address admin = vm.envOr("DROPS_ADMIN", deployer);

        address[] memory tokens = new address[](2);
        tokens[0] = USDT_CELO_MAINNET;
        tokens[1] = COPM_CELO_MAINNET;

        console2.log("Deployer (rewarder + relayer):", deployer);
        console2.log("Admin:", admin);

        vm.startBroadcast(pk);
        MiniKlaimDrops impl = new MiniKlaimDrops();
        bytes memory initData = abi.encodeCall(MiniKlaimDrops.initialize, (admin, deployer, tokens));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        vm.stopBroadcast();

        console2.log("MiniKlaimDrops implementation at:", address(impl));
        console2.log("MiniKlaimDrops PROXY (use this address) at:", address(proxy));
    }
}
