// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {MiniKlaimDrops} from "../src/MiniKlaimDrops.sol";

contract MockToken is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory sym, uint8 dec_) ERC20(sym, sym) {
        _dec = dec_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MiniKlaimDropsTest is Test {
    MiniKlaimDrops drops;
    MockToken usdt; // 6 decimals
    MockToken copm; // 18 decimals
    MockToken other;

    address admin = address(0xA11CE);
    address alice = address(0x1111);
    address bob = address(0x2222);
    address relayer = address(0x3333);

    uint256 constant REWARDER_PK = 0xB0B5;
    address rewarder;

    bytes32 constant CLAIM_DROPS_TYPEHASH =
        keccak256("ClaimDrops(address player,uint256[] dropIds,uint256 nonce,uint256 deadline)");

    uint64 constant H3_A = 0x8c2a100d2c4a3ff;
    bytes32 constant SALT_A = keccak256("salt-a");

    function setUp() public {
        usdt = new MockToken("USDT", 6);
        copm = new MockToken("COPm", 18);
        other = new MockToken("OTHER", 18);

        address[] memory tokens = new address[](2);
        tokens[0] = address(usdt);
        tokens[1] = address(copm);

        rewarder = vm.addr(REWARDER_PK);
        MiniKlaimDrops impl = new MiniKlaimDrops();
        bytes memory initData = abi.encodeCall(MiniKlaimDrops.initialize, (admin, rewarder, tokens));
        drops = MiniKlaimDrops(address(new ERC1967Proxy(address(impl), initData)));
    }

    // --- helpers -----------------------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("MiniKlaimDrops")),
                keccak256(bytes("1")),
                block.chainid,
                address(drops)
            )
        );
    }

    function _sign(uint256 pk, address player, uint256[] memory ids, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash =
            keccak256(abi.encode(CLAIM_DROPS_TYPEHASH, player, keccak256(abi.encodePacked(ids)), nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _fund(MockToken t, uint256 amount) internal {
        t.mint(address(this), amount);
        t.approve(address(drops), amount);
        drops.fund(address(t), amount);
    }

    function _create(uint256 id, MockToken t, uint256 amount) internal {
        _createN(id, t, amount, 1);
    }

    function _createN(uint256 id, MockToken t, uint256 amount, uint256 winners) internal {
        vm.prank(rewarder);
        drops.createDrop(id, address(t), amount, winners, keccak256(abi.encode(id, H3_A, SALT_A)));
    }

    function _ids(uint256 a) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = a;
    }

    function _ids(uint256 a, uint256 b) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
    }

    function _claim(address player, uint256[] memory ids, uint256 nonce) internal returns (uint256) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(REWARDER_PK, player, ids, nonce, deadline);
        vm.prank(relayer);
        return drops.claimDropsFor(player, ids, nonce, deadline, sig);
    }

    // --- initialize / allowlist ----------------------------------------------------

    function test_initialize_rolesAndAllowlist() public view {
        assertTrue(drops.hasRole(drops.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(drops.hasRole(drops.REWARDER_ROLE(), rewarder));
        // Split on purpose: the server key cannot upgrade, withdraw or pause.
        assertFalse(drops.hasRole(drops.REWARDER_ROLE(), admin));
        assertFalse(drops.hasRole(drops.DEFAULT_ADMIN_ROLE(), rewarder));
        assertTrue(drops.allowedToken(address(usdt)));
        assertTrue(drops.allowedToken(address(copm)));
        assertFalse(drops.allowedToken(address(other)));
    }

    function test_initialize_cannotReinit() public {
        vm.expectRevert();
        drops.initialize(admin, rewarder, new address[](0));
    }

    function test_setAllowedToken_adminOnly() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, drops.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(alice);
        drops.setAllowedToken(address(other), true);

        vm.prank(admin);
        drops.setAllowedToken(address(other), true);
        assertTrue(drops.allowedToken(address(other)));
    }

    function test_fund_rejectsUnlistedToken() public {
        other.mint(address(this), 1e18);
        other.approve(address(drops), 1e18);
        vm.expectRevert(abi.encodeWithSelector(MiniKlaimDrops.TokenNotAllowed.selector, address(other)));
        drops.fund(address(other), 1e18);
    }

    // --- createDrop --------------------------------------------------------------

    function test_createDrop_reservesPrize() public {
        _fund(usdt, 5e6);
        _create(1, usdt, 1e6);
        assertEq(drops.committed(address(usdt)), 1e6);
        assertEq(drops.freeBalance(address(usdt)), 4e6);
        MiniKlaimDrops.Drop memory d = drops.getDrop(1);
        assertEq(d.token, address(usdt));
        assertEq(d.amount, 1e6);
        assertEq(uint8(d.status), uint8(MiniKlaimDrops.Status.Open));
    }

    function test_createDrop_needsFreeBalance() public {
        _fund(usdt, 1e6);
        _create(1, usdt, 1e6);
        vm.expectRevert(MiniKlaimDrops.InsufficientFreeBalance.selector);
        _create(2, usdt, 1);
    }

    function test_createDrop_rejectsDuplicate() public {
        _fund(usdt, 2e6);
        _create(1, usdt, 1e6);
        vm.expectRevert(abi.encodeWithSelector(MiniKlaimDrops.DropExists.selector, 1));
        _create(1, usdt, 1e6);
    }

    function test_createDrop_rejectsUnlistedAndZero() public {
        vm.startPrank(rewarder);
        vm.expectRevert(abi.encodeWithSelector(MiniKlaimDrops.TokenNotAllowed.selector, address(other)));
        drops.createDrop(1, address(other), 1, 1, bytes32(0));
        vm.expectRevert(MiniKlaimDrops.ZeroAmount.selector);
        drops.createDrop(1, address(usdt), 0, 1, bytes32(0));
        vm.expectRevert(MiniKlaimDrops.ZeroWinners.selector);
        drops.createDrop(1, address(usdt), 1, 0, bytes32(0));
        vm.stopPrank();
    }

    function test_createDrop_rewarderOnly() public {
        _fund(usdt, 1e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, drops.REWARDER_ROLE()
            )
        );
        vm.prank(alice);
        drops.createDrop(1, address(usdt), 1e6, 1, bytes32(0));
    }

    // --- claimDropsFor -------------------------------------------------------------

    function test_claim_paysPlayerNotSender_mixedTokens() public {
        _fund(usdt, 1e6);
        _fund(copm, 5000e18);
        _create(1, usdt, 1e6);
        _create(2, copm, 5000e18);

        uint256 paid = _claim(alice, _ids(1, 2), 7);

        assertEq(paid, 2);
        assertEq(usdt.balanceOf(alice), 1e6);
        assertEq(copm.balanceOf(alice), 5000e18);
        assertEq(usdt.balanceOf(relayer), 0);
        assertEq(drops.committed(address(usdt)), 0);
        assertEq(drops.committed(address(copm)), 0);
        assertTrue(drops.isClaimed(1));
        assertTrue(drops.isClaimed(2));
    }

    function test_claim_skipsAlreadyClaimed() public {
        _fund(usdt, 2e6);
        _create(1, usdt, 1e6);
        _create(2, usdt, 1e6);

        _claim(alice, _ids(1), 1);
        uint256 paid = _claim(alice, _ids(1, 2), 2);

        assertEq(paid, 1);
        assertEq(usdt.balanceOf(alice), 2e6);
    }

    function test_claim_singleWinnerDropPaysNobodyElse() public {
        _fund(usdt, 1e6);
        _create(1, usdt, 1e6);
        _claim(alice, _ids(1), 1);
        uint256 paid = _claim(bob, _ids(1), 2);
        assertEq(paid, 0);
        assertEq(usdt.balanceOf(bob), 0);
    }

    function test_claim_nonceSingleUse() public {
        _fund(usdt, 2e6);
        _create(1, usdt, 1e6);
        _create(2, usdt, 1e6);
        _claim(alice, _ids(1), 9);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(REWARDER_PK, alice, _ids(2), 9, deadline);
        vm.expectRevert(MiniKlaimDrops.NonceAlreadyUsed.selector);
        drops.claimDropsFor(alice, _ids(2), 9, deadline, sig);
    }

    function test_claim_rejectsWrongSigner() public {
        _fund(usdt, 1e6);
        _create(1, usdt, 1e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(0xBAD, alice, _ids(1), 1, deadline);
        vm.expectRevert(MiniKlaimDrops.InvalidVoucher.selector);
        drops.claimDropsFor(alice, _ids(1), 1, deadline, sig);
    }

    function test_claim_voucherBoundToPlayer() public {
        _fund(usdt, 1e6);
        _create(1, usdt, 1e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(REWARDER_PK, alice, _ids(1), 1, deadline);
        vm.expectRevert(MiniKlaimDrops.InvalidVoucher.selector);
        drops.claimDropsFor(bob, _ids(1), 1, deadline, sig);
    }

    function test_claim_rejectsExpiredVoucher() public {
        _fund(usdt, 1e6);
        _create(1, usdt, 1e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(REWARDER_PK, alice, _ids(1), 1, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(MiniKlaimDrops.VoucherExpired.selector);
        drops.claimDropsFor(alice, _ids(1), 1, deadline, sig);
    }

    function test_claim_rejectsUnknownOrExpiredDrop() public {
        vm.expectRevert(abi.encodeWithSelector(MiniKlaimDrops.DropNotOpen.selector, 42));
        _claim(alice, _ids(42), 1);

        _fund(usdt, 1e6);
        _create(1, usdt, 1e6);
        vm.prank(rewarder);
        drops.expireDrop(1);
        vm.expectRevert(abi.encodeWithSelector(MiniKlaimDrops.DropNotOpen.selector, 1));
        _claim(alice, _ids(1), 2);
    }

    function test_claim_paused() public {
        _fund(usdt, 1e6);
        _create(1, usdt, 1e6);
        vm.prank(admin);
        drops.pause();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(REWARDER_PK, alice, _ids(1), 1, deadline);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        drops.claimDropsFor(alice, _ids(1), 1, deadline, sig);
    }

    function test_claim_rejectsEmpty() public {
        vm.expectRevert(MiniKlaimDrops.EmptyDrops.selector);
        _claim(alice, new uint256[](0), 1);
    }

    // --- expire / withdraw ----------------------------------------------------------

    function test_expire_releasesReservation() public {
        _fund(usdt, 1e6);
        _create(1, usdt, 1e6);
        assertEq(drops.freeBalance(address(usdt)), 0);
        vm.prank(rewarder);
        drops.expireDrop(1);
        assertEq(drops.committed(address(usdt)), 0);
        assertEq(drops.freeBalance(address(usdt)), 1e6);
        vm.expectRevert(abi.encodeWithSelector(MiniKlaimDrops.DropNotOpen.selector, 1));
        vm.prank(rewarder);
        drops.expireDrop(1);
    }

    function test_withdraw_onlyFreeBalance() public {
        _fund(usdt, 3e6);
        _create(1, usdt, 1e6);
        vm.prank(admin);
        vm.expectRevert(MiniKlaimDrops.InsufficientFreeBalance.selector);
        drops.withdraw(address(usdt), 3e6, admin);

        vm.prank(admin);
        drops.withdraw(address(usdt), 2e6, admin);
        assertEq(usdt.balanceOf(admin), 2e6);
        assertEq(usdt.balanceOf(address(drops)), 1e6);
    }

    function test_withdraw_adminOnly() public {
        _fund(usdt, 1e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, rewarder, drops.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(rewarder);
        drops.withdraw(address(usdt), 1e6, rewarder);
    }

    // --- reveal ------------------------------------------------------------------

    function test_reveal_afterClaim() public {
        _fund(usdt, 1e6);
        _create(1, usdt, 1e6);

        vm.expectRevert(abi.encodeWithSelector(MiniKlaimDrops.DropStillOpen.selector, 1));
        drops.reveal(1, H3_A, SALT_A);

        _claim(alice, _ids(1), 1);

        vm.expectRevert(MiniKlaimDrops.BadReveal.selector);
        drops.reveal(1, H3_A + 1, SALT_A);

        vm.expectEmit(true, false, false, true);
        emit MiniKlaimDrops.DropRevealed(1, H3_A, SALT_A);
        drops.reveal(1, H3_A, SALT_A);
    }

    // --- upgrade -----------------------------------------------------------------

    function test_upgrade_adminOnly() public {
        MiniKlaimDrops next = new MiniKlaimDrops();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, rewarder, drops.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(rewarder);
        drops.upgradeToAndCall(address(next), "");

        vm.prank(admin);
        drops.upgradeToAndCall(address(next), "");
    }

    // --- several winners --------------------------------------------------------------

    function test_multiWinner_onePrizeEach_thenClosed() public {
        _fund(usdt, 3e6);
        _createN(1, usdt, 1e6, 3);
        assertEq(drops.committed(address(usdt)), 3e6);

        assertEq(_claim(alice, _ids(1), 1), 1);
        // Same player again: skipped, not paid twice.
        assertEq(_claim(alice, _ids(1), 2), 0);
        assertEq(_claim(bob, _ids(1), 3), 1);
        assertFalse(drops.isClaimed(1));
        assertEq(_claim(address(0x4444), _ids(1), 4), 1);
        assertTrue(drops.isClaimed(1));
        // Full: a fourth player gets nothing.
        assertEq(_claim(address(0x5555), _ids(1), 5), 0);

        assertEq(usdt.balanceOf(alice), 1e6);
        assertEq(usdt.balanceOf(bob), 1e6);
        assertEq(drops.committed(address(usdt)), 0);
        MiniKlaimDrops.Drop memory d = drops.getDrop(1);
        assertEq(d.winners, 3);
        assertTrue(drops.hasClaimed(1, alice));
    }

    function test_multiWinner_needsFullReserve() public {
        _fund(usdt, 2e6);
        vm.expectRevert(MiniKlaimDrops.InsufficientFreeBalance.selector);
        _createN(1, usdt, 1e6, 3);
    }

    // --- updateDrop --------------------------------------------------------------------

    function test_update_raisesPrizeForRemainingWinners() public {
        _fund(usdt, 10e6);
        _createN(1, usdt, 1e6, 3);
        _claim(alice, _ids(1), 1);
        assertEq(drops.committed(address(usdt)), 2e6);

        vm.prank(rewarder);
        drops.updateDrop(1, 2e6, 3);
        assertEq(drops.committed(address(usdt)), 4e6);

        _claim(bob, _ids(1), 2);
        assertEq(usdt.balanceOf(alice), 1e6); // paid before the change, untouched
        assertEq(usdt.balanceOf(bob), 2e6);
    }

    function test_update_lowersPrizeAndAddsWinners() public {
        _fund(usdt, 2e6);
        _createN(1, usdt, 2e6, 1);
        vm.prank(rewarder);
        drops.updateDrop(1, 1e6, 2);
        assertEq(drops.committed(address(usdt)), 2e6);
        assertEq(drops.freeBalance(address(usdt)), 0);
    }

    function test_update_growthNeedsFreeBalance() public {
        _fund(usdt, 2e6);
        _createN(1, usdt, 1e6, 2);
        vm.prank(rewarder);
        vm.expectRevert(MiniKlaimDrops.InsufficientFreeBalance.selector);
        drops.updateDrop(1, 1e6, 3);
        _fund(usdt, 1e6);
        vm.prank(rewarder);
        drops.updateDrop(1, 1e6, 3);
        assertEq(drops.committed(address(usdt)), 3e6);
    }

    function test_update_cannotGoBelowPaidAndClosesAtPaid() public {
        _fund(usdt, 3e6);
        _createN(1, usdt, 1e6, 3);
        _claim(alice, _ids(1), 1);

        vm.prank(rewarder);
        vm.expectRevert(abi.encodeWithSelector(MiniKlaimDrops.WinnersBelowPaid.selector, 1));
        drops.updateDrop(1, 1e6, 0);

        vm.prank(rewarder);
        drops.updateDrop(1, 1e6, 1);
        assertTrue(drops.isClaimed(1));
        assertEq(drops.committed(address(usdt)), 0);
        assertEq(drops.freeBalance(address(usdt)), 2e6);
    }

    function test_update_onlyOpenAndRewarder() public {
        _fund(usdt, 1e6);
        _create(1, usdt, 1e6);
        bytes32 role = drops.REWARDER_ROLE();
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        vm.prank(alice);
        drops.updateDrop(1, 2e6, 1);

        vm.prank(rewarder);
        drops.expireDrop(1);
        vm.prank(rewarder);
        vm.expectRevert(abi.encodeWithSelector(MiniKlaimDrops.DropNotOpen.selector, 1));
        drops.updateDrop(1, 2e6, 1);
    }

    function test_expire_releasesOnlyUnpaidSlots() public {
        _fund(usdt, 3e6);
        _createN(1, usdt, 1e6, 3);
        _claim(alice, _ids(1), 1);
        vm.prank(rewarder);
        drops.expireDrop(1);
        assertEq(drops.committed(address(usdt)), 0);
        assertEq(drops.freeBalance(address(usdt)), 2e6);
    }

    // --- fuzz: accounting holds --------------------------------------------------------

    function testFuzz_committedNeverExceedsBalance(uint96 a, uint96 b, bool claimFirst) public {
        vm.assume(a > 0 && b > 0);
        _fund(copm, uint256(a) + uint256(b));
        _create(1, copm, a);
        _create(2, copm, b);
        if (claimFirst) _claim(alice, _ids(1), 1);
        vm.prank(rewarder);
        drops.expireDrop(2);
        assertLe(drops.committed(address(copm)), copm.balanceOf(address(drops)));
        assertEq(drops.committed(address(copm)), claimFirst ? 0 : a);
    }
}
