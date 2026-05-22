// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MiniKlaimHexes} from "../src/MiniKlaimHexes.sol";

contract MiniKlaimHexesTest is Test {
    MiniKlaimHexes hexes;

    address admin = address(0xA11CE);
    address alice = address(0x1111);
    address bob = address(0x2222);

    // A made-up H3-resolution-12 cell id.
    uint256 constant HEX_A = 0x8c2a306638783ff;
    uint256 constant HEX_B = 0x8c2a306638781ff;

    function setUp() public {
        hexes = new MiniKlaimHexes(admin, "https://miniklaim.fun/api/hexes/");
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
}
