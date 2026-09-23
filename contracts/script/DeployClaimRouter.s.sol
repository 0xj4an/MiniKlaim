// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {MiniKlaimClaimRouter} from "../src/MiniKlaimClaimRouter.sol";

/// @notice Deploy `MiniKlaimClaimRouter` and wire it in one go.
///
/// Not a proxy: the router is deliberately immutable (see the contract docs).
/// Put the deployed address in NEXT_PUBLIC_<CHAIN>_CLAIM_ROUTER_ADDRESS.
///
/// The script also performs the three grants the router needs, because a router
/// without them is inert and the grants are easy to forget:
///   - VOUCHER_SIGNER_ROLE on the router  -> the backend signer key
///   - CAPTURER_ROLE on Hexes             -> the router
///   - MINTER_ROLE on Badges              -> the router
///
/// `SERVER_SIGNER_PRIVATE_KEY` is both the backend signer and the existing
/// DEFAULT_ADMIN_ROLE holder on Hexes and Badges, so one key can do all of it.
///
/// Chain-agnostic on purpose: pass the target addresses explicitly and pick the
/// network with `--rpc-url`.
///
///   HEXES_ADDRESS=0x... BADGES_ADDRESS=0x... \
///     forge script script/DeployClaimRouter.s.sol --rpc-url celo --broadcast
contract DeployClaimRouter is Script {
    function run() external {
        uint256 pk = vm.envUint("SERVER_SIGNER_PRIVATE_KEY");
        address signer = vm.addr(pk);
        address hexesAddr = vm.envAddress("HEXES_ADDRESS");
        address badgesAddr = vm.envAddress("BADGES_ADDRESS");

        console2.log("Deployer (admin + voucher signer):", signer);
        console2.log("Hexes:", hexesAddr);
        console2.log("Badges:", badgesAddr);

        vm.startBroadcast(pk);
        MiniKlaimClaimRouter router = new MiniKlaimClaimRouter(signer, hexesAddr, badgesAddr);
        router.grantRole(router.VOUCHER_SIGNER_ROLE(), signer);
        IAccessControl(hexesAddr).grantRole(keccak256("CAPTURER_ROLE"), address(router));
        IAccessControl(badgesAddr).grantRole(keccak256("MINTER_ROLE"), address(router));
        vm.stopBroadcast();

        console2.log("MiniKlaimClaimRouter (use this address) at:", address(router));
        console2.log("Granted VOUCHER_SIGNER_ROLE on router to:", signer);
        console2.log("Granted CAPTURER_ROLE on Hexes to router");
        console2.log("Granted MINTER_ROLE on Badges to router");
    }
}
