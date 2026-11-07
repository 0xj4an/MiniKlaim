// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MiniKlaimDrops} from "../src/MiniKlaimDrops.sol";

/// @notice Upgrade the live MiniKlaimDrops proxy to the current implementation
///         (v2 adds challenge entries by allowance, split onchain: setChallenge,
///         enterFor, setFeeRecipient). Set the fee recipient right after.
/// Reads `SERVER_SIGNER_PRIVATE_KEY` (must hold DEFAULT_ADMIN_ROLE on the proxy),
/// `DROPS_PROXY` and `DROPS_CHECK_TOKEN` (an allowed token whose accounting must
/// not move). Run with --rpc-url celo --broadcast; dry-run without --broadcast first.
contract UpgradeDrops is Script {
    function run() external {
        uint256 pk = vm.envUint("SERVER_SIGNER_PRIVATE_KEY");
        address proxy = vm.envAddress("DROPS_PROXY");
        address token = vm.envAddress("DROPS_CHECK_TOKEN");
        MiniKlaimDrops drops = MiniKlaimDrops(proxy);

        uint256 committedBefore = drops.committed(token);
        uint256 freeBefore = drops.freeBalance(token);
        bool allowedBefore = drops.allowedToken(token);
        console2.log("Proxy:", proxy);
        console2.log("committed before:", committedBefore);
        console2.log("free before:", freeBefore);

        vm.startBroadcast(pk);
        MiniKlaimDrops impl = new MiniKlaimDrops();
        drops.upgradeToAndCall(address(impl), "");
        vm.stopBroadcast();

        require(drops.committed(token) == committedBefore, "committed changed");
        require(drops.freeBalance(token) == freeBefore, "free balance changed");
        require(drops.allowedToken(token) == allowedBefore, "allowlist changed");
        require(drops.getChallenge(bytes32(0)).token == address(0), "new slot not empty");
        require(drops.feeRecipient() == address(0), "fee recipient slot not empty");
        console2.log("New implementation:", address(impl));
    }
}
