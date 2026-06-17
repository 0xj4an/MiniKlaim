// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MiniKlaimBadges} from "../src/MiniKlaimBadges.sol";

contract MiniKlaimBadgesTest is Test {
    MiniKlaimBadges badges;

    address admin = address(0xA11CE);
    address alice = address(0x1111);
    address bob = address(0x2222);

    uint256 constant SIGNER_PK = 0xB0B5;
    address signer;

    bytes32 constant CLAIM_BADGES_TYPEHASH =
        keccak256("ClaimBadges(address player,uint256[] badgeIds,uint256 nonce)");

    uint256 constant FIRST_STEPS = 1;
    uint256 constant FIVE_BLOCKS = 2;

    function setUp() public {
        MiniKlaimBadges impl = new MiniKlaimBadges();
        bytes memory initData = abi.encodeCall(
            MiniKlaimBadges.initialize, (admin, "https://miniklaim.fun/api/badges/")
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        badges = MiniKlaimBadges(address(proxy));

        signer = vm.addr(SIGNER_PK);
        bytes32 minterRole = badges.MINTER_ROLE();
        vm.prank(admin);
        badges.grantRole(minterRole, signer);
    }

    // --- EIP-712 voucher helpers ---------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("MiniKlaimBadges")),
                keccak256(bytes("1")),
                block.chainid,
                address(badges)
            )
        );
    }

    function _signVoucher(uint256 pk, address player, uint256[] memory ids, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(CLAIM_BADGES_TYPEHASH, player, keccak256(abi.encodePacked(ids)), nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _twoBadges() internal pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = FIRST_STEPS;
        ids[1] = FIVE_BLOCKS;
    }

    // --- relayer mint --------------------------------------------------------------

    function test_mintGivesPlayerBalanceOne() public {
        vm.prank(admin);
        badges.mint(alice, FIRST_STEPS);
        assertEq(badges.balanceOf(alice, FIRST_STEPS), 1);
    }

    function test_mintTwiceIsNoop() public {
        vm.startPrank(admin);
        badges.mint(alice, FIRST_STEPS);
        badges.mint(alice, FIRST_STEPS);
        vm.stopPrank();
        assertEq(badges.balanceOf(alice, FIRST_STEPS), 1);
        assertEq(badges.totalBadgesMinted(), 1);
    }

    function test_batchSkipsExisting() public {
        uint256[] memory ids = _twoBadges();
        vm.startPrank(admin);
        badges.mint(alice, FIRST_STEPS);
        badges.mintBatch(alice, ids);
        vm.stopPrank();
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

    function test_uriReflectsBase() public view {
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

    // --- claimBadges (player-submitted, voucher-gated) -----------------------------

    function test_claimBadgesWithValidVoucher() public {
        uint256[] memory ids = _twoBadges();
        vm.prank(alice);
        badges.claimBadges(ids, 1, _signVoucher(SIGNER_PK, alice, ids, 1));
        assertEq(badges.balanceOf(alice, FIRST_STEPS), 1);
        assertEq(badges.balanceOf(alice, FIVE_BLOCKS), 1);
        assertEq(badges.totalClaimTxns(), 1);
    }

    function test_claimBadgesRejectsForgedSigner() public {
        uint256[] memory ids = _twoBadges();
        vm.prank(alice);
        vm.expectRevert(MiniKlaimBadges.InvalidVoucher.selector);
        badges.claimBadges(ids, 1, _signVoucher(0xBAD, alice, ids, 1));
    }

    function test_claimBadgesRejectsVoucherForAnotherPlayer() public {
        uint256[] memory ids = _twoBadges();
        vm.prank(alice);
        vm.expectRevert(MiniKlaimBadges.InvalidVoucher.selector);
        badges.claimBadges(ids, 1, _signVoucher(SIGNER_PK, bob, ids, 1));
    }

    function test_claimBadgesRejectsNonceReplay() public {
        uint256[] memory ids = _twoBadges();
        bytes memory sig = _signVoucher(SIGNER_PK, alice, ids, 7);
        vm.prank(alice);
        badges.claimBadges(ids, 7, sig);
        vm.prank(alice);
        vm.expectRevert(MiniKlaimBadges.NonceAlreadyUsed.selector);
        badges.claimBadges(ids, 7, sig);
    }

    // --- adminImport (migration) ---------------------------------------------------

    function test_adminImportUnlocksForOwners() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;
        uint256[] memory ids = _twoBadges();
        vm.prank(admin);
        badges.adminImport(players, ids);
        assertEq(badges.balanceOf(alice, FIRST_STEPS), 1);
        assertEq(badges.balanceOf(bob, FIVE_BLOCKS), 1);
        assertEq(badges.uniqueHolders(), 2);
    }

    function test_nonAdminCannotImport() public {
        address[] memory players = new address[](1);
        players[0] = alice;
        uint256[] memory ids = new uint256[](1);
        ids[0] = FIRST_STEPS;
        vm.prank(alice);
        vm.expectRevert();
        badges.adminImport(players, ids);
    }

    // --- UUPS upgradeability --------------------------------------------------------

    function test_upgradePreservesStateAndAddsBehavior() public {
        vm.prank(admin);
        badges.mint(alice, FIRST_STEPS);

        MiniKlaimBadgesV2 v2impl = new MiniKlaimBadgesV2();
        vm.prank(admin);
        badges.upgradeToAndCall(address(v2impl), "");

        assertEq(badges.balanceOf(alice, FIRST_STEPS), 1);
        assertEq(MiniKlaimBadgesV2(address(badges)).version(), 2);
    }

    function test_nonAdminCannotUpgrade() public {
        MiniKlaimBadgesV2 v2impl = new MiniKlaimBadgesV2();
        vm.prank(alice);
        vm.expectRevert();
        badges.upgradeToAndCall(address(v2impl), "");
    }
}

/// @dev Minimal V2 used only to prove the upgrade path works and storage persists.
contract MiniKlaimBadgesV2 is MiniKlaimBadges {
    function version() external pure returns (uint256) {
        return 2;
    }
}
