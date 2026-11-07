// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MiniKlaimHexes} from "../src/MiniKlaimHexes.sol";
import {MiniKlaimHexesV1} from "./legacy/MiniKlaimHexesV1.sol";

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
    bytes32 constant MINT_TOKENS_TYPEHASH = keccak256(
        "MintTokens(address player,uint256[] h3Ids,uint256 nonce,uint256 deadline)"
    );

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

    // Since v2 captures are recorded, not minted. Tokens come from mintTokens.

    function test_captureRecordsWithoutMinting() public {
        vm.prank(admin);
        hexes.capture(alice, HEX_A);
        assertEq(hexes.balanceOf(alice), 0);
        vm.expectRevert();
        hexes.ownerOf(HEX_A);
        assertEq(hexes.totalCaptures(), 1);
        assertEq(hexes.capturesByPlayer(alice), 1);
        assertEq(hexes.uniquePlayers(), 1);
    }

    function test_batchEmitsOneRecordedEvent() public {
        uint256[] memory ids = _twoHexes();
        vm.expectEmit(true, false, false, true, address(hexes));
        emit MiniKlaimHexes.HexesRecorded(alice, ids);
        vm.prank(admin);
        hexes.captureBatch(alice, ids);
        assertEq(hexes.totalCaptures(), 2);
        assertEq(hexes.balanceOf(alice), 0);
    }

    function test_recaptureMovesAnExistingToken() public {
        _mintFor(alice, _twoHexes(), 1);
        assertEq(hexes.ownerOf(HEX_A), alice);

        uint256[] memory one = new uint256[](1);
        one[0] = HEX_A;
        vm.expectEmit(true, true, true, false, address(hexes));
        emit MiniKlaimHexes.HexRecaptured(alice, bob, HEX_A);
        vm.prank(admin);
        hexes.captureBatch(bob, one);

        assertEq(hexes.ownerOf(HEX_A), bob);
        assertEq(hexes.ownerOf(HEX_B), alice);
        assertEq(hexes.balanceOf(alice), 1);
        assertEq(hexes.capturesByPlayer(bob), 1);
    }

    function test_recordingATokenYouHoldCountsNothing() public {
        _mintFor(alice, _twoHexes(), 1);
        uint256 before = hexes.totalCaptures();
        vm.prank(admin);
        hexes.captureBatch(alice, _twoHexes());
        assertEq(hexes.totalCaptures(), before);
    }

    function test_onlyCapturerRoleCanCapture() public {
        vm.expectRevert();
        vm.prank(alice);
        hexes.capture(alice, HEX_A);
    }

    function test_playerCannotTransfer() public {
        _mintFor(alice, _twoHexes(), 1);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimHexes.TransfersDisabled.selector);
        hexes.transferFrom(alice, bob, HEX_A);
    }

    function test_playerCannotTransferAfterApprove() public {
        _mintFor(alice, _twoHexes(), 1);

        vm.prank(alice);
        hexes.approve(bob, HEX_A);

        vm.prank(bob);
        vm.expectRevert(MiniKlaimHexes.TransfersDisabled.selector);
        hexes.transferFrom(alice, bob, HEX_A);
    }

    function test_tokenUriReflectsBase() public {
        _mintFor(alice, _twoHexes(), 1);
        string memory uri = hexes.tokenURI(HEX_A);
        // HEX_A in decimal:
        assertEq(uri, "https://miniklaim.fun/api/hexes/631246145620247551");
    }

    function test_adminCanUpdateBaseUri() public {
        _mintFor(alice, _twoHexes(), 1);

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

        assertEq(hexes.balanceOf(alice), 0);
        assertEq(hexes.capturesByPlayer(alice), 2);
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

    // --- mintTokens (player-paid, voucher-gated) -----------------------------------

    function _signMint(uint256 pk, address player, uint256[] memory h3Ids, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(MINT_TOKENS_TYPEHASH, player, keccak256(abi.encodePacked(h3Ids)), nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _mintFor(address player, uint256[] memory ids, uint256 nonce) internal {
        uint256 deadline = block.timestamp + 600;
        bytes memory sig = _signMint(SIGNER_PK, player, ids, nonce, deadline);
        vm.prank(player);
        hexes.mintTokens(ids, nonce, deadline, sig);
    }

    function test_mintTokensMintsToCallerWithoutRecounting() public {
        vm.prank(admin);
        hexes.captureBatch(alice, _twoHexes());
        _mintFor(alice, _twoHexes(), 9);
        assertEq(hexes.ownerOf(HEX_A), alice);
        assertEq(hexes.ownerOf(HEX_B), alice);
        assertEq(hexes.totalTokensMinted(), 2);
        assertEq(hexes.totalCaptures(), 2);
    }

    function test_mintTokensSkipsExistingTokens() public {
        uint256[] memory one = new uint256[](1);
        one[0] = HEX_A;
        _mintFor(bob, one, 1);
        // A stale voucher naming HEX_A for alice cannot take bob's token.
        _mintFor(alice, _twoHexes(), 2);
        assertEq(hexes.ownerOf(HEX_A), bob);
        assertEq(hexes.ownerOf(HEX_B), alice);
        assertEq(hexes.totalTokensMinted(), 2);
    }

    function test_mintTokensRejectsExpiredVoucher() public {
        uint256[] memory ids = _twoHexes();
        uint256 deadline = block.timestamp + 60;
        bytes memory sig = _signMint(SIGNER_PK, alice, ids, 1, deadline);
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(MiniKlaimHexes.VoucherExpired.selector);
        hexes.mintTokens(ids, 1, deadline, sig);
    }

    function test_mintTokensRejectsForgedSignerOtherPlayerAndReplay() public {
        uint256[] memory ids = _twoHexes();
        uint256 deadline = block.timestamp + 60;

        bytes memory forged = _signMint(0xBAD, alice, ids, 1, deadline);
        vm.prank(alice);
        vm.expectRevert(MiniKlaimHexes.InvalidVoucher.selector);
        hexes.mintTokens(ids, 1, deadline, forged);

        bytes memory bobs = _signMint(SIGNER_PK, bob, ids, 2, deadline);
        vm.prank(alice);
        vm.expectRevert(MiniKlaimHexes.InvalidVoucher.selector);
        hexes.mintTokens(ids, 2, deadline, bobs);

        bytes memory good = _signMint(SIGNER_PK, alice, ids, 3, deadline);
        vm.prank(alice);
        hexes.mintTokens(ids, 3, deadline, good);
        vm.prank(alice);
        vm.expectRevert(MiniKlaimHexes.NonceAlreadyUsed.selector);
        hexes.mintTokens(ids, 3, deadline, good);
    }

    // --- UUPS upgrade from the live v1 ---------------------------------------------

    function test_upgradeFromV1KeepsTokensAndCounters() public {
        MiniKlaimHexesV1 v1impl = new MiniKlaimHexesV1();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(v1impl), abi.encodeCall(MiniKlaimHexesV1.initialize, (admin, "u/"))
        );
        MiniKlaimHexesV1 v1 = MiniKlaimHexesV1(address(proxy));
        vm.prank(admin);
        v1.captureBatch(alice, _twoHexes());
        assertEq(v1.balanceOf(alice), 2);

        MiniKlaimHexes v2impl = new MiniKlaimHexes();
        vm.prank(admin);
        v1.upgradeToAndCall(address(v2impl), "");
        MiniKlaimHexes v2 = MiniKlaimHexes(address(proxy));

        // Everything minted on v1 survives.
        assertEq(v2.ownerOf(HEX_A), alice);
        assertEq(v2.ownerOf(HEX_B), alice);
        assertEq(v2.totalCaptures(), 2);
        assertEq(v2.uniquePlayers(), 1);
        assertEq(v2.capturesByPlayer(alice), 2);
        assertEq(v2.totalTokensMinted(), 0);

        // A v1 token recaptured on v2 moves; a new hex is only recorded.
        uint256[] memory ids = new uint256[](2);
        ids[0] = HEX_A;
        ids[1] = 0x8c2a306638785ff;
        vm.prank(admin);
        v2.captureBatch(bob, ids);
        assertEq(v2.ownerOf(HEX_A), bob);
        assertEq(v2.balanceOf(bob), 1);
        assertEq(v2.totalCaptures(), 4);
        assertEq(v2.uniquePlayers(), 2);
    }

    function test_nonAdminCannotUpgrade() public {
        MiniKlaimHexes impl = new MiniKlaimHexes();
        vm.prank(alice);
        vm.expectRevert();
        hexes.upgradeToAndCall(address(impl), "");
    }
}
