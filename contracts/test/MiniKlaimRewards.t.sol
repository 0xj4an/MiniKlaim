// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {MiniKlaimRewards} from "../src/MiniKlaimRewards.sol";

/// @dev Minimal ERC-20 used to stand in for USDm in tests. `mint` is public so
///      the test can seed balances at will.
contract MockUSDm is ERC20 {
    constructor() ERC20("USDm Mock", "USDm") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MiniKlaimRewardsTest is Test {
    MiniKlaimRewards rewards;
    MockUSDm usdm;

    address admin = address(0xA11CE);
    address alice = address(0x1111);
    address bob = address(0x2222);

    uint256 constant REWARDER_PK = 0xB0B5;
    address rewarder;

    bytes32 constant CLAIM_REWARDS_TYPEHASH =
        keccak256("ClaimRewards(address player,uint256[] badgeIds,uint256 nonce)");

    uint256 constant BADGE_FIRST_STEPS = 1;
    uint256 constant BADGE_FIVE_BLOCKS = 2;
    uint256 constant BADGE_TEN_BLOCKS = 3;

    uint256 constant REWARD_FIRST_STEPS = 0.05e18;
    uint256 constant REWARD_FIVE_BLOCKS = 0.10e18;
    uint256 constant REWARD_TEN_BLOCKS = 0.20e18;

    function setUp() public {
        usdm = new MockUSDm();

        MiniKlaimRewards impl = new MiniKlaimRewards();
        bytes memory initData =
            abi.encodeCall(MiniKlaimRewards.initialize, (admin, address(usdm)));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        rewards = MiniKlaimRewards(address(proxy));

        rewarder = vm.addr(REWARDER_PK);
        bytes32 rewarderRole = rewards.REWARDER_ROLE();
        vm.prank(admin);
        rewards.grantRole(rewarderRole, rewarder);
    }

    // --- helpers -------------------------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("MiniKlaimRewards")),
                keccak256(bytes("1")),
                block.chainid,
                address(rewards)
            )
        );
    }

    function _signVoucher(uint256 pk, address player, uint256[] memory ids, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(CLAIM_REWARDS_TYPEHASH, player, keccak256(abi.encodePacked(ids)), nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _oneBadge(uint256 id) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = id;
    }

    function _threeBadges() internal pure returns (uint256[] memory ids) {
        ids = new uint256[](3);
        ids[0] = BADGE_FIRST_STEPS;
        ids[1] = BADGE_FIVE_BLOCKS;
        ids[2] = BADGE_TEN_BLOCKS;
    }

    function _configureThreeBadges() internal {
        vm.startPrank(admin);
        rewards.setRewardAmount(BADGE_FIRST_STEPS, REWARD_FIRST_STEPS);
        rewards.setRewardAmount(BADGE_FIVE_BLOCKS, REWARD_FIVE_BLOCKS);
        rewards.setRewardAmount(BADGE_TEN_BLOCKS, REWARD_TEN_BLOCKS);
        vm.stopPrank();
    }

    function _fund(uint256 amount) internal {
        usdm.mint(address(this), amount);
        usdm.approve(address(rewards), amount);
        rewards.fund(amount);
    }

    // --- initialize ----------------------------------------------------------------

    function test_initialize_setsRolesAndToken() public view {
        assertTrue(rewards.hasRole(rewards.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(rewards.hasRole(rewards.REWARDER_ROLE(), admin));
        assertEq(address(rewards.rewardToken()), address(usdm));
    }

    // --- setRewardAmount / batch ---------------------------------------------------

    function test_setRewardAmount_onlyAdmin() public {
        vm.expectRevert();
        vm.prank(alice);
        rewards.setRewardAmount(BADGE_FIRST_STEPS, REWARD_FIRST_STEPS);

        vm.expectEmit(true, false, false, true, address(rewards));
        emit MiniKlaimRewards.RewardConfigured(BADGE_FIRST_STEPS, REWARD_FIRST_STEPS);
        vm.prank(admin);
        rewards.setRewardAmount(BADGE_FIRST_STEPS, REWARD_FIRST_STEPS);

        assertEq(rewards.rewardAmount(BADGE_FIRST_STEPS), REWARD_FIRST_STEPS);
    }

    function test_setRewardAmountsBatch_lengthMismatch_reverts() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100;

        vm.prank(admin);
        vm.expectRevert(MiniKlaimRewards.LengthMismatch.selector);
        rewards.setRewardAmountsBatch(ids, amounts);
    }

    function test_setRewardAmountsBatch_setsAll() public {
        uint256[] memory ids = _threeBadges();
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = REWARD_FIRST_STEPS;
        amounts[1] = REWARD_FIVE_BLOCKS;
        amounts[2] = REWARD_TEN_BLOCKS;

        vm.prank(admin);
        rewards.setRewardAmountsBatch(ids, amounts);

        assertEq(rewards.rewardAmount(BADGE_FIRST_STEPS), REWARD_FIRST_STEPS);
        assertEq(rewards.rewardAmount(BADGE_FIVE_BLOCKS), REWARD_FIVE_BLOCKS);
        assertEq(rewards.rewardAmount(BADGE_TEN_BLOCKS), REWARD_TEN_BLOCKS);
    }

    // --- fund ----------------------------------------------------------------------

    function test_fund_transfersAndEmits() public {
        uint256 amount = 100e18;
        usdm.mint(address(this), amount);
        usdm.approve(address(rewards), amount);

        vm.expectEmit(true, false, false, true, address(rewards));
        emit MiniKlaimRewards.Funded(address(this), amount);
        rewards.fund(amount);

        assertEq(usdm.balanceOf(address(rewards)), amount);
    }

    // --- claimRewards --------------------------------------------------------------

    function test_claimRewards_happyPath_singleBadge() public {
        _configureThreeBadges();
        _fund(10e18);

        uint256[] memory ids = _oneBadge(BADGE_FIRST_STEPS);
        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 1);

        vm.expectEmit(true, true, false, true, address(rewards));
        emit MiniKlaimRewards.RewardClaimed(alice, BADGE_FIRST_STEPS, REWARD_FIRST_STEPS);
        vm.prank(alice);
        rewards.claimRewards(ids, 1, sig);

        assertEq(usdm.balanceOf(alice), REWARD_FIRST_STEPS);
        assertTrue(rewards.claimed(alice, BADGE_FIRST_STEPS));
        assertEq(rewards.totalDistributed(), REWARD_FIRST_STEPS);
        assertEq(rewards.totalClaimCount(), 1);
        assertTrue(rewards.usedNonces(1));
    }

    function test_claimRewards_happyPath_multipleBadges() public {
        _configureThreeBadges();
        _fund(10e18);

        uint256[] memory ids = _threeBadges();
        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 42);

        vm.prank(alice);
        rewards.claimRewards(ids, 42, sig);

        uint256 expected = REWARD_FIRST_STEPS + REWARD_FIVE_BLOCKS + REWARD_TEN_BLOCKS;
        assertEq(usdm.balanceOf(alice), expected);
        assertTrue(rewards.claimed(alice, BADGE_FIRST_STEPS));
        assertTrue(rewards.claimed(alice, BADGE_FIVE_BLOCKS));
        assertTrue(rewards.claimed(alice, BADGE_TEN_BLOCKS));
        assertEq(rewards.totalDistributed(), expected);
        assertEq(rewards.totalClaimCount(), 1);
    }

    function test_claimRewards_revertsOnEmptyBadges() public {
        uint256[] memory ids = new uint256[](0);
        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 1);
        vm.prank(alice);
        vm.expectRevert(MiniKlaimRewards.EmptyBadges.selector);
        rewards.claimRewards(ids, 1, sig);
    }

    function test_claimRewards_revertsOnDoubleClaim_sameCall() public {
        _configureThreeBadges();
        _fund(10e18);

        uint256[] memory ids = new uint256[](2);
        ids[0] = BADGE_FIRST_STEPS;
        ids[1] = BADGE_FIRST_STEPS;
        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MiniKlaimRewards.AlreadyClaimed.selector, BADGE_FIRST_STEPS)
        );
        rewards.claimRewards(ids, 1, sig);
    }

    function test_claimRewards_revertsOnDoubleClaim_separateCalls() public {
        _configureThreeBadges();
        _fund(10e18);

        uint256[] memory ids = _oneBadge(BADGE_FIRST_STEPS);
        bytes memory sig1 = _signVoucher(REWARDER_PK, alice, ids, 1);
        vm.prank(alice);
        rewards.claimRewards(ids, 1, sig1);

        bytes memory sig2 = _signVoucher(REWARDER_PK, alice, ids, 2);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MiniKlaimRewards.AlreadyClaimed.selector, BADGE_FIRST_STEPS)
        );
        rewards.claimRewards(ids, 2, sig2);
    }

    function test_claimRewards_revertsOnNoRewardConfigured() public {
        _fund(10e18);
        uint256[] memory ids = _oneBadge(BADGE_FIRST_STEPS);
        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                MiniKlaimRewards.NoRewardConfigured.selector, BADGE_FIRST_STEPS
            )
        );
        rewards.claimRewards(ids, 1, sig);
    }

    function test_claimRewards_revertsOnInsufficientBalance() public {
        _configureThreeBadges();
        // Do NOT fund. Vault balance is zero.
        uint256[] memory ids = _oneBadge(BADGE_FIRST_STEPS);
        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 1);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimRewards.InsufficientBalance.selector);
        rewards.claimRewards(ids, 1, sig);
    }

    function test_claimRewards_revertsOnInvalidSignature() public {
        _configureThreeBadges();
        _fund(10e18);

        uint256[] memory ids = _oneBadge(BADGE_FIRST_STEPS);
        // Sign with a key that has no REWARDER_ROLE.
        bytes memory sig = _signVoucher(0xBAD, alice, ids, 1);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimRewards.InvalidVoucher.selector);
        rewards.claimRewards(ids, 1, sig);
    }

    function test_claimRewards_revertsOnWrongPlayerInVoucher() public {
        _configureThreeBadges();
        _fund(10e18);

        uint256[] memory ids = _oneBadge(BADGE_FIRST_STEPS);
        // Voucher is for `bob`, but `alice` submits.
        bytes memory sig = _signVoucher(REWARDER_PK, bob, ids, 1);

        vm.prank(alice);
        vm.expectRevert(MiniKlaimRewards.InvalidVoucher.selector);
        rewards.claimRewards(ids, 1, sig);
    }

    function test_claimRewards_revertsOnNonceReuse() public {
        _configureThreeBadges();
        _fund(10e18);

        uint256[] memory ids = _oneBadge(BADGE_FIRST_STEPS);
        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 7);
        vm.prank(alice);
        rewards.claimRewards(ids, 7, sig);

        // Second call reuses nonce 7 (badgeId irrelevant, nonce is checked first).
        uint256[] memory ids2 = _oneBadge(BADGE_FIVE_BLOCKS);
        bytes memory sig2 = _signVoucher(REWARDER_PK, alice, ids2, 7);
        vm.prank(alice);
        vm.expectRevert(MiniKlaimRewards.NonceAlreadyUsed.selector);
        rewards.claimRewards(ids2, 7, sig2);
    }

    // --- pause ---------------------------------------------------------------------

    function test_pause_blocksClaim() public {
        _configureThreeBadges();
        _fund(10e18);

        vm.prank(admin);
        rewards.pause();

        uint256[] memory ids = _oneBadge(BADGE_FIRST_STEPS);
        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 1);

        vm.prank(alice);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        rewards.claimRewards(ids, 1, sig);

        vm.prank(admin);
        rewards.unpause();

        vm.prank(alice);
        rewards.claimRewards(ids, 1, sig);
        assertEq(usdm.balanceOf(alice), REWARD_FIRST_STEPS);
    }

    // --- emergencyWithdraw ---------------------------------------------------------

    function test_emergencyWithdraw_onlyAdmin() public {
        _fund(5e18);

        vm.prank(alice);
        vm.expectRevert();
        rewards.emergencyWithdraw(alice, 5e18);

        vm.prank(admin);
        rewards.emergencyWithdraw(bob, 5e18);
        assertEq(usdm.balanceOf(bob), 5e18);
        assertEq(usdm.balanceOf(address(rewards)), 0);
    }

    // --- UUPS upgradeability -------------------------------------------------------

    function test_upgrade_onlyAdmin() public {
        _configureThreeBadges();
        _fund(10e18);

        MiniKlaimRewardsV2 v2impl = new MiniKlaimRewardsV2();

        vm.prank(alice);
        vm.expectRevert();
        rewards.upgradeToAndCall(address(v2impl), "");

        vm.prank(admin);
        rewards.upgradeToAndCall(address(v2impl), "");

        // State persists.
        assertEq(rewards.rewardAmount(BADGE_FIRST_STEPS), REWARD_FIRST_STEPS);
        assertEq(usdm.balanceOf(address(rewards)), 10e18);
        // New behavior available.
        assertEq(MiniKlaimRewardsV2(address(rewards)).version(), 2);
    }

    // --- gas snapshots (informational, always pass) --------------------------------

    function test_gas_claimRewards_single() public {
        _configureThreeBadges();
        _fund(100e18);
        uint256[] memory ids = _oneBadge(BADGE_FIRST_STEPS);
        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 1);
        vm.prank(alice);
        uint256 g0 = gasleft();
        rewards.claimRewards(ids, 1, sig);
        uint256 used = g0 - gasleft();
        emit log_named_uint("gas claimRewards single", used);
    }

    function test_gas_claimRewards_batch5() public {
        uint256[] memory ids = new uint256[](5);
        uint256[] memory amounts = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            ids[i] = 100 + i;
            amounts[i] = 0.05e18;
        }
        vm.prank(admin);
        rewards.setRewardAmountsBatch(ids, amounts);
        _fund(100e18);

        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 1);
        vm.prank(alice);
        uint256 g0 = gasleft();
        rewards.claimRewards(ids, 1, sig);
        uint256 used = g0 - gasleft();
        emit log_named_uint("gas claimRewards batch5", used);
    }

    function test_gas_claimRewards_batch10() public {
        uint256[] memory ids = new uint256[](10);
        uint256[] memory amounts = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            ids[i] = 200 + i;
            amounts[i] = 0.05e18;
        }
        vm.prank(admin);
        rewards.setRewardAmountsBatch(ids, amounts);
        _fund(100e18);

        bytes memory sig = _signVoucher(REWARDER_PK, alice, ids, 1);
        vm.prank(alice);
        uint256 g0 = gasleft();
        rewards.claimRewards(ids, 1, sig);
        uint256 used = g0 - gasleft();
        emit log_named_uint("gas claimRewards batch10", used);
    }
}

/// @dev Minimal V2 used only to prove the upgrade path works and storage persists.
contract MiniKlaimRewardsV2 is MiniKlaimRewards {
    function version() external pure returns (uint256) {
        return 2;
    }
}
