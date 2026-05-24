// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MiniKlaimBadges} from "../src/MiniKlaimBadges.sol";

contract MiniKlaimBadgesTest is Test {
    MiniKlaimBadges badges;

    address admin = address(0xA11CE);
    address alice = address(0x1111);
    address bob = address(0x2222);

    uint256 constant FIRST_STEPS = 1;
    uint256 constant FIVE_BLOCKS = 2;

    function setUp() public {
        badges = new MiniKlaimBadges(admin, "https://miniklaim.fun/api/badges/");
    }

    function test_mintGivesPlayerBalanceOne() public {
        vm.prank(admin);
        badges.mint(alice, FIRST_STEPS);
        assertEq(badges.balanceOf(alice, FIRST_STEPS), 1);
    }

    function test_mintTwiceReverts() public {
        vm.startPrank(admin);
        badges.mint(alice, FIRST_STEPS);
        vm.expectRevert(MiniKlaimBadges.AlreadyUnlocked.selector);
        badges.mint(alice, FIRST_STEPS);
        vm.stopPrank();
    }

    function test_batchSkipsExisting() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = FIRST_STEPS;
        ids[1] = FIVE_BLOCKS;

        vm.startPrank(admin);
        badges.mint(alice, FIRST_STEPS);
        badges.mintBatch(alice, ids);
        vm.stopPrank();

        // First was already there; both should end up balance 1, not 2.
        assertEq(badges.balanceOf(alice, FIRST_STEPS), 1);
        assertEq(badges.balanceOf(alice, FIVE_BLOCKS), 1);
    }

    function test_onlyMinterCanMint() public {
        vm.expectRevert();
        vm.prank(alice);
        badges.mint(alice, FIRST_STEPS);
    }

    function test_playerCannotTransfer() public {
        vm.prank(admin);
        badges.mint(alice, FIRST_STEPS);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimBadges.TransfersDisabled.selector);
        badges.safeTransferFrom(alice, bob, FIRST_STEPS, 1, "");
    }

    function test_playerCannotApproveAndTransfer() public {
        vm.prank(admin);
        badges.mint(alice, FIRST_STEPS);

        vm.prank(alice);
        badges.setApprovalForAll(bob, true);

        vm.prank(bob);
        vm.expectRevert(MiniKlaimBadges.TransfersDisabled.selector);
        badges.safeTransferFrom(alice, bob, FIRST_STEPS, 1, "");
    }

    function test_uriReflectsBase() public {
        vm.prank(admin);
        badges.mint(alice, FIRST_STEPS);
        assertEq(badges.uri(FIRST_STEPS), "https://miniklaim.fun/api/badges/1");
    }

    function test_adminCanUpdateBaseUri() public {
        vm.prank(admin);
        badges.setBaseURI("https://example.com/b/");
        assertEq(badges.uri(FIRST_STEPS), "https://example.com/b/1");
    }

    function test_nonAdminCannotUpdateBaseUri() public {
        vm.expectRevert();
        vm.prank(alice);
        badges.setBaseURI("https://example.com/b/");
    }
}
