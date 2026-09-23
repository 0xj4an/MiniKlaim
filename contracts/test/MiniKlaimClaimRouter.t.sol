// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {MiniKlaimBadges} from "../src/MiniKlaimBadges.sol";
import {MiniKlaimClaimRouter} from "../src/MiniKlaimClaimRouter.sol";
import {MiniKlaimHexes} from "../src/MiniKlaimHexes.sol";

contract MiniKlaimClaimRouterTest is Test {
    MiniKlaimHexes hexes;
    MiniKlaimBadges badges;
    MiniKlaimClaimRouter router;

    address admin = address(0xA11CE);
    address alice = address(0x1111);
    address bob = address(0x2222);

    uint256 constant SIGNER_PK = 0xB0B5;
    uint256 constant STRANGER_PK = 0xDEAD;
    address signer;

    bytes32 constant CLAIM_ALL_TYPEHASH = keccak256(
        "ClaimAll(address player,uint256[] h3Ids,uint256[] badgeIds,uint256 nonce)"
    );

    uint256 constant HEX_A = 0x8c2a100d2c0d1ff;
    uint256 constant HEX_B = 0x8c2a100d2c0d3ff;
    uint256 constant FIRST_STEPS = 1;
    uint256 constant FIVE_BLOCKS = 2;

    uint256 constant NONCE = 777;

    function setUp() public {
        MiniKlaimHexes hexesImpl = new MiniKlaimHexes();
        hexes = MiniKlaimHexes(
            address(
                new ERC1967Proxy(
                    address(hexesImpl),
                    abi.encodeCall(
                        MiniKlaimHexes.initialize, (admin, "https://miniklaim.fun/api/hexes/")
                    )
                )
            )
        );

        MiniKlaimBadges badgesImpl = new MiniKlaimBadges();
        badges = MiniKlaimBadges(
            address(
                new ERC1967Proxy(
                    address(badgesImpl),
                    abi.encodeCall(
                        MiniKlaimBadges.initialize, (admin, "https://miniklaim.fun/api/badges/")
                    )
                )
            )
        );

        signer = vm.addr(SIGNER_PK);
        router = new MiniKlaimClaimRouter(admin, address(hexes), address(badges));

        vm.startPrank(admin);
        router.grantRole(router.VOUCHER_SIGNER_ROLE(), signer);
        hexes.grantRole(hexes.CAPTURER_ROLE(), address(router));
        badges.grantRole(badges.MINTER_ROLE(), address(router));
        vm.stopPrank();
    }

    // --- helpers -------------------------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("MiniKlaimClaimRouter")),
                keccak256(bytes("1")),
                block.chainid,
                address(router)
            )
        );
    }

    function _sign(
        uint256 pk,
        address player,
        uint256[] memory h3Ids,
        uint256[] memory badgeIds,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_ALL_TYPEHASH,
                player,
                keccak256(abi.encodePacked(h3Ids)),
                keccak256(abi.encodePacked(badgeIds)),
                nonce
            )
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

    function _twoBadges() internal pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = FIRST_STEPS;
        ids[1] = FIVE_BLOCKS;
    }

    function _empty() internal pure returns (uint256[] memory ids) {
        ids = new uint256[](0);
    }

    // --- the whole point: one tx settles hexes and badges together -----------------

    function test_claimAllSettlesHexesAndBadgesInOneCall() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _twoBadges();
        bytes memory sig = _sign(SIGNER_PK, alice, h3, bg, NONCE);

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE, sig);

        assertEq(hexes.ownerOf(HEX_A), alice);
        assertEq(hexes.ownerOf(HEX_B), alice);
        assertEq(badges.balanceOf(alice, FIRST_STEPS), 1);
        assertEq(badges.balanceOf(alice, FIVE_BLOCKS), 1);
    }

    function test_claimAllMintsToCallerNotToRouter() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _twoBadges();
        bytes memory sig = _sign(SIGNER_PK, alice, h3, bg, NONCE);

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE, sig);

        assertEq(hexes.balanceOf(address(router)), 0);
        assertEq(badges.balanceOf(address(router), FIRST_STEPS), 0);
        assertEq(hexes.balanceOf(alice), 2);
    }

    function test_claimAllWorksWithHexesOnly() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _empty();
        bytes memory sig = _sign(SIGNER_PK, alice, h3, bg, NONCE);

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE, sig);

        assertEq(hexes.ownerOf(HEX_A), alice);
        assertEq(badges.balanceOf(alice, FIRST_STEPS), 0);
    }

    function test_claimAllWorksWithBadgesOnly() public {
        uint256[] memory h3 = _empty();
        uint256[] memory bg = _twoBadges();
        bytes memory sig = _sign(SIGNER_PK, alice, h3, bg, NONCE);

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE, sig);

        assertEq(hexes.balanceOf(alice), 0);
        assertEq(badges.balanceOf(alice, FIRST_STEPS), 1);
    }

    function test_claimAllRevertsWhenNothingToClaim() public {
        uint256[] memory h3 = _empty();
        uint256[] memory bg = _empty();
        bytes memory sig = _sign(SIGNER_PK, alice, h3, bg, NONCE);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimClaimRouter.NothingToClaim.selector);
        router.claimAll(h3, bg, NONCE, sig);
    }

    // --- voucher enforcement -------------------------------------------------------

    function test_rejectsVoucherFromUnauthorizedSigner() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _twoBadges();
        bytes memory sig = _sign(STRANGER_PK, alice, h3, bg, NONCE);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimClaimRouter.InvalidVoucher.selector);
        router.claimAll(h3, bg, NONCE, sig);
    }

    function test_rejectsVoucherIssuedForAnotherPlayer() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _twoBadges();
        bytes memory sig = _sign(SIGNER_PK, alice, h3, bg, NONCE);

        vm.prank(bob);
        vm.expectRevert(MiniKlaimClaimRouter.InvalidVoucher.selector);
        router.claimAll(h3, bg, NONCE, sig);
    }

    function test_rejectsTamperedHexList() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _twoBadges();
        bytes memory sig = _sign(SIGNER_PK, alice, h3, bg, NONCE);

        uint256[] memory greedy = new uint256[](3);
        greedy[0] = HEX_A;
        greedy[1] = HEX_B;
        greedy[2] = 0x8c2a100d2c0d5ff;

        vm.prank(alice);
        vm.expectRevert(MiniKlaimClaimRouter.InvalidVoucher.selector);
        router.claimAll(greedy, bg, NONCE, sig);
    }

    function test_rejectsTamperedBadgeList() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _twoBadges();
        bytes memory sig = _sign(SIGNER_PK, alice, h3, bg, NONCE);

        uint256[] memory greedy = new uint256[](3);
        greedy[0] = FIRST_STEPS;
        greedy[1] = FIVE_BLOCKS;
        greedy[2] = 99;

        vm.prank(alice);
        vm.expectRevert(MiniKlaimClaimRouter.InvalidVoucher.selector);
        router.claimAll(h3, greedy, NONCE, sig);
    }

    function test_rejectsReusedNonce() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _twoBadges();
        bytes memory sig = _sign(SIGNER_PK, alice, h3, bg, NONCE);

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE, sig);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimClaimRouter.NonceAlreadyUsed.selector);
        router.claimAll(h3, bg, NONCE, sig);
    }

    function test_revokingRouterRolesDisablesIt() public {
        // Read the role id before pranking: a view call would otherwise consume
        // the single-call prank and `revokeRole` would run as the test contract.
        bytes32 capturerRole = hexes.CAPTURER_ROLE();
        vm.prank(admin);
        hexes.revokeRole(capturerRole, address(router));

        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _twoBadges();
        bytes memory sig = _sign(SIGNER_PK, alice, h3, bg, NONCE);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                address(router),
                capturerRole
            )
        );
        router.claimAll(h3, bg, NONCE, sig);
    }

    // --- idempotency ---------------------------------------------------------------

    function test_alreadyOwnedHexesAndHeldBadgesAreNoops() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _twoBadges();

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE, _sign(SIGNER_PK, alice, h3, bg, NONCE));

        uint256 capturesBefore = hexes.totalCaptures();
        uint256 badgesBefore = badges.totalBadgesMinted();

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE + 1, _sign(SIGNER_PK, alice, h3, bg, NONCE + 1));

        assertEq(hexes.totalCaptures(), capturesBefore);
        assertEq(badges.totalBadgesMinted(), badgesBefore);
    }

    function test_recaptureMovesHexToNewOwner() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _empty();

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE, _sign(SIGNER_PK, alice, h3, bg, NONCE));
        assertEq(hexes.ownerOf(HEX_A), alice);

        vm.prank(bob);
        router.claimAll(h3, bg, NONCE + 1, _sign(SIGNER_PK, bob, h3, bg, NONCE + 1));
        assertEq(hexes.ownerOf(HEX_A), bob);
    }

    // --- metrics -------------------------------------------------------------------

    function test_countsClaimsAndUniqueClaimers() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _empty();

        assertEq(router.totalClaims(), 0);
        assertEq(router.uniqueClaimers(), 0);

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE, _sign(SIGNER_PK, alice, h3, bg, NONCE));
        assertEq(router.totalClaims(), 1);
        assertEq(router.uniqueClaimers(), 1);

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE + 1, _sign(SIGNER_PK, alice, h3, bg, NONCE + 1));
        assertEq(router.totalClaims(), 2);
        assertEq(router.uniqueClaimers(), 1);

        vm.prank(bob);
        router.claimAll(h3, bg, NONCE + 2, _sign(SIGNER_PK, bob, h3, bg, NONCE + 2));
        assertEq(router.totalClaims(), 3);
        assertEq(router.uniqueClaimers(), 2);
    }

    function test_emitsClaimSettled() public {
        uint256[] memory h3 = _twoHexes();
        uint256[] memory bg = _twoBadges();

        vm.expectEmit(true, true, false, true, address(router));
        emit MiniKlaimClaimRouter.ClaimAllSettled(alice, NONCE, 2, 2);

        vm.prank(alice);
        router.claimAll(h3, bg, NONCE, _sign(SIGNER_PK, alice, h3, bg, NONCE));
    }

    // --- wiring --------------------------------------------------------------------

    function test_exposesTargetContracts() public view {
        assertEq(address(router.hexes()), address(hexes));
        assertEq(address(router.badges()), address(badges));
    }

    function test_adminHoldsAdminRole() public view {
        assertTrue(router.hasRole(router.DEFAULT_ADMIN_ROLE(), admin));
    }
}
