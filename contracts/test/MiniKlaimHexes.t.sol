// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MiniKlaimHexes} from "../src/MiniKlaimHexes.sol";

contract MiniKlaimHexesTest is Test {
    MiniKlaimHexes hexes;

    address admin = address(0xA11CE);
    address alice = address(0x1111);
    address bob = address(0x2222);

    // Backend voucher signer (holds CAPTURER_ROLE). We need a known private key to sign.
    uint256 constant SIGNER_PK = 0xB0B5;
    address signer;

    bytes32 constant CLAIM_RUN_TYPEHASH =
        keccak256("ClaimRun(address player,uint256[] h3Ids,uint256 nonce)");

    // A made-up H3-resolution-12 cell id.
    uint256 constant HEX_A = 0x8c2a306638783ff;
    uint256 constant HEX_B = 0x8c2a306638781ff;

    function setUp() public {
        MiniKlaimHexes impl = new MiniKlaimHexes();
        bytes memory initData = abi.encodeCall(
            MiniKlaimHexes.initialize, (admin, "https://miniklaim.fun/api/hexes/")
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        hexes = MiniKlaimHexes(address(proxy));

        signer = vm.addr(SIGNER_PK);
        bytes32 capturerRole = hexes.CAPTURER_ROLE();
        vm.prank(admin);
        hexes.grantRole(capturerRole, signer);
    }

    // --- EIP-712 voucher helpers ---------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("MiniKlaimHexes")),
                keccak256(bytes("1")),
                block.chainid,
                address(hexes)
            )
        );
    }

    function _signVoucher(uint256 pk, address player, uint256[] memory h3Ids, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(CLAIM_RUN_TYPEHASH, player, keccak256(abi.encodePacked(h3Ids)), nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _twoHexes() internal pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = HEX_A;
        ids[1] = HEX_B;
    }

    function test_initialCaptureMintsToPlayer() public {
        vm.prank(admin);
        hexes.capture(alice, HEX_A);
        assertEq(hexes.ownerOf(HEX_A), alice);
        assertEq(hexes.balanceOf(alice), 1);
    }

    function test_recaptureTransfersToNewPlayer() public {
        vm.startPrank(admin);
        hexes.capture(alice, HEX_A);
        hexes.capture(bob, HEX_A);
        vm.stopPrank();
        assertEq(hexes.ownerOf(HEX_A), bob);
        assertEq(hexes.balanceOf(alice), 0);
        assertEq(hexes.balanceOf(bob), 1);
    }

    function test_recaptureBySameOwnerIsNoop() public {
        vm.startPrank(admin);
        hexes.capture(alice, HEX_A);
        hexes.capture(alice, HEX_A);
        vm.stopPrank();
        assertEq(hexes.balanceOf(alice), 1);
    }

    function test_batchCapturesMultipleHexes() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = HEX_A;
        ids[1] = HEX_B;
        vm.prank(admin);
        hexes.captureBatch(alice, ids);
        assertEq(hexes.ownerOf(HEX_A), alice);
        assertEq(hexes.ownerOf(HEX_B), alice);
        assertEq(hexes.balanceOf(alice), 2);
    }

    function test_onlyCapturerRoleCanCapture() public {
        vm.expectRevert();
        vm.prank(alice);
        hexes.capture(alice, HEX_A);
    }

    function test_playerCannotTransfer() public {
        vm.prank(admin);
        hexes.capture(alice, HEX_A);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimHexes.TransfersDisabled.selector);
        hexes.transferFrom(alice, bob, HEX_A);
    }

    function test_playerCannotTransferAfterApprove() public {
        vm.prank(admin);
        hexes.capture(alice, HEX_A);

        vm.prank(alice);
        hexes.approve(bob, HEX_A);

        vm.prank(bob);
        vm.expectRevert(MiniKlaimHexes.TransfersDisabled.selector);
        hexes.transferFrom(alice, bob, HEX_A);
    }

    function test_tokenUriReflectsBase() public {
        vm.prank(admin);
        hexes.capture(alice, HEX_A);
        string memory uri = hexes.tokenURI(HEX_A);
        // HEX_A in decimal:
        assertEq(uri, "https://miniklaim.fun/api/hexes/631246145620247551");
    }

    function test_adminCanUpdateBaseUri() public {
        vm.prank(admin);
        hexes.capture(alice, HEX_A);

        vm.prank(admin);
        hexes.setBaseURI("https://example.com/h/");
        assertEq(hexes.tokenURI(HEX_A), "https://example.com/h/631246145620247551");
    }

    function test_nonAdminCannotUpdateBaseUri() public {
        vm.prank(alice);
        vm.expectRevert();
        hexes.setBaseURI("https://example.com/h/");
    }

    // --- claimRun (player-submitted, voucher-gated) --------------------------------

    function test_claimRunWithValidVoucherCapturesToSender() public {
        uint256[] memory ids = _twoHexes();
        bytes memory sig = _signVoucher(SIGNER_PK, alice, ids, 1);

        vm.prank(alice);
        hexes.claimRun(ids, 1, sig);

        assertEq(hexes.ownerOf(HEX_A), alice);
        assertEq(hexes.ownerOf(HEX_B), alice);
        assertEq(hexes.balanceOf(alice), 2);
        assertEq(hexes.totalClaimRuns(), 1);
    }

    function test_claimRunRejectsForgedSigner() public {
        uint256[] memory ids = _twoHexes();
        // 0xBAD is not a CAPTURER_ROLE key.
        bytes memory sig = _signVoucher(0xBAD, alice, ids, 1);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimHexes.InvalidVoucher.selector);
        hexes.claimRun(ids, 1, sig);
    }

    function test_claimRunRejectsVoucherForAnotherPlayer() public {
        uint256[] memory ids = _twoHexes();
        // Voucher names bob, but alice tries to redeem it -> structHash binds to msg.sender.
        bytes memory sig = _signVoucher(SIGNER_PK, bob, ids, 1);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimHexes.InvalidVoucher.selector);
        hexes.claimRun(ids, 1, sig);
    }

    function test_claimRunRejectsNonceReplay() public {
        uint256[] memory ids = _twoHexes();
        bytes memory sig = _signVoucher(SIGNER_PK, alice, ids, 7);

        vm.prank(alice);
        hexes.claimRun(ids, 7, sig);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimHexes.NonceAlreadyUsed.selector);
        hexes.claimRun(ids, 7, sig);
    }

    function test_metricsCountUniquePlayersAndCaptures() public {
        uint256[] memory aliceIds = new uint256[](1);
        aliceIds[0] = HEX_A;
        vm.prank(alice);
        hexes.claimRun(aliceIds, 1, _signVoucher(SIGNER_PK, alice, aliceIds, 1));

        uint256[] memory bobIds = new uint256[](1);
        bobIds[0] = HEX_B;
        vm.prank(bob);
        hexes.claimRun(bobIds, 2, _signVoucher(SIGNER_PK, bob, bobIds, 2));

        assertEq(hexes.uniquePlayers(), 2);
        assertEq(hexes.totalCaptures(), 2);
        assertEq(hexes.capturesByPlayer(alice), 1);
        assertEq(hexes.totalClaimRuns(), 2);
    }

    // --- adminImport (migration) ---------------------------------------------------

    function test_adminImportMintsToOwners() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;
        uint256[] memory ids = _twoHexes();

        vm.prank(admin);
        hexes.adminImport(players, ids);

        assertEq(hexes.ownerOf(HEX_A), alice);
        assertEq(hexes.ownerOf(HEX_B), bob);
        assertEq(hexes.uniquePlayers(), 2);
    }

    function test_nonAdminCannotImport() public {
        address[] memory players = new address[](1);
        players[0] = alice;
        uint256[] memory ids = new uint256[](1);
        ids[0] = HEX_A;

        vm.prank(alice);
        vm.expectRevert();
        hexes.adminImport(players, ids);
    }

    // --- UUPS upgradeability --------------------------------------------------------

    function test_upgradePreservesStateAndAddsBehavior() public {
        // Capture a hex on V1.
        vm.prank(admin);
        hexes.capture(alice, HEX_A);

        // Upgrade to V2.
        MiniKlaimHexesV2 v2impl = new MiniKlaimHexesV2();
        vm.prank(admin);
        hexes.upgradeToAndCall(address(v2impl), "");

        // State persisted through the upgrade.
        assertEq(hexes.ownerOf(HEX_A), alice);
        // New behavior is live.
        assertEq(MiniKlaimHexesV2(address(hexes)).version(), 2);
    }

    function test_nonAdminCannotUpgrade() public {
        MiniKlaimHexesV2 v2impl = new MiniKlaimHexesV2();
        vm.prank(alice);
        vm.expectRevert();
        hexes.upgradeToAndCall(address(v2impl), "");
    }
}

/// @dev Minimal V2 used only to prove the upgrade path works and storage persists.
contract MiniKlaimHexesV2 is MiniKlaimHexes {
    function version() external pure returns (uint256) {
        return 2;
    }
}
