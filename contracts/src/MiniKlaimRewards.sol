// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title MiniKlaimRewards
/// @notice USDm vault that pays players a configurable per-badge reward the first time
///         they claim each badge. Redemption is gated by an EIP-712 voucher signed by
///         a REWARDER_ROLE key (the backend), same pattern as MiniKlaimHexes.claimRun.
/// @dev UUPS-upgradeable (deployed behind an ERC1967 proxy; upgrades gated by
///      DEFAULT_ADMIN_ROLE). The reward token is set once at initialize time and is
///      not mutable afterwards; the contract holds a USDm balance funded by anyone
///      via `fund` and pays it out on `claimRewards`.
///
///      Each `(player, badgeId)` pair is claimable exactly once. Each voucher nonce
///      is redeemable exactly once. The backend is expected to verify on-chain badge
///      holdings and the already-claimed set before signing, so the contract stays
///      trustful of the voucher signer (same trust model as the sibling contracts).
contract MiniKlaimRewards is
    Initializable,
    AccessControlUpgradeable,
    EIP712Upgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant REWARDER_ROLE = keccak256("REWARDER_ROLE");

    /// @dev keccak256("ClaimRewards(address player,uint256[] badgeIds,uint256 nonce)")
    bytes32 private constant CLAIM_REWARDS_TYPEHASH =
        keccak256("ClaimRewards(address player,uint256[] badgeIds,uint256 nonce)");

    /// @notice The ERC-20 paid out as reward. USDm on Celo mainnet
    ///         (0x765DE816845861e75A25fCA122bb6898B8B1282a). Set once at initialize
    ///         and treated as immutable afterwards.
    IERC20 public rewardToken;

    /// @notice Configured reward for each badge id, denominated in the token's own
    ///         base units (wei for an 18-decimal token like USDm).
    mapping(uint256 badgeId => uint256 amountWei) public rewardAmount;

    /// @notice `claimed[player][badgeId]` is true after the player has received the
    ///         reward for that badge. Enforces one-shot redemption per pair.
    mapping(address player => mapping(uint256 badgeId => bool)) public claimed;

    /// @notice Each voucher nonce can be redeemed once.
    mapping(uint256 nonce => bool) public usedNonces;

    /// @notice Total amount of `rewardToken` paid out through `claimRewards`.
    uint256 public totalDistributed;

    /// @notice Number of successful `claimRewards` transactions.
    uint256 public totalClaimCount;

    /// @dev Storage gap for safe future upgrades (append new state above, shrink the gap).
    uint256[45] private __gap;

    /// @dev Emitted once per badge inside a successful claim.
    event RewardClaimed(address indexed player, uint256 indexed badgeId, uint256 amount);
    /// @dev Emitted whenever a per-badge reward amount is set (including zero).
    event RewardConfigured(uint256 indexed badgeId, uint256 amount);
    /// @dev Emitted when someone tops up the vault via `fund`.
    event Funded(address indexed from, uint256 amount);

    error AlreadyClaimed(uint256 badgeId);
    error InsufficientBalance();
    error InvalidVoucher();
    error NoRewardConfigured(uint256 badgeId);
    error NonceAlreadyUsed();
    error EmptyBadges();
    error LengthMismatch();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the proxy. Grants DEFAULT_ADMIN_ROLE and REWARDER_ROLE to
    ///         `admin` and pins the reward token to `token`.
    /// @param admin Address that receives admin and rewarder roles at bootstrap.
    /// @param token The ERC-20 paid out as reward (USDm on Celo mainnet).
    function initialize(address admin, address token) external initializer {
        __AccessControl_init();
        __EIP712_init("MiniKlaimRewards", "1");
        __Pausable_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REWARDER_ROLE, admin);
        rewardToken = IERC20(token);
    }

    /// @notice Player-submitted claim. Pays out the sum of configured rewards for
    ///         every badge in `badgeIds` to `msg.sender`, gated by an EIP-712 voucher
    ///         signed by a REWARDER_ROLE key authorizing exactly this
    ///         `(msg.sender, badgeIds, nonce)` tuple.
    /// @param badgeIds Badge ids the backend authorized for this claim.
    /// @param nonce    Unique, single-use voucher nonce issued by the backend.
    /// @param sig      Backend's EIP-712 signature over (msg.sender, badgeIds, nonce).
    function claimRewards(uint256[] calldata badgeIds, uint256 nonce, bytes calldata sig)
        external
        whenNotPaused
    {
        if (badgeIds.length == 0) revert EmptyBadges();
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        usedNonces[nonce] = true;

        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_REWARDS_TYPEHASH,
                msg.sender,
                keccak256(abi.encodePacked(badgeIds)),
                nonce
            )
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        if (!hasRole(REWARDER_ROLE, signer)) revert InvalidVoucher();

        uint256 total;
        for (uint256 i = 0; i < badgeIds.length; i++) {
            uint256 badgeId = badgeIds[i];
            if (claimed[msg.sender][badgeId]) revert AlreadyClaimed(badgeId);
            uint256 amount = rewardAmount[badgeId];
            if (amount == 0) revert NoRewardConfigured(badgeId);
            claimed[msg.sender][badgeId] = true;
            total += amount;
            emit RewardClaimed(msg.sender, badgeId, amount);
        }

        if (rewardToken.balanceOf(address(this)) < total) revert InsufficientBalance();

        totalDistributed += total;
        totalClaimCount++;

        rewardToken.safeTransfer(msg.sender, total);
    }

    /// @notice Set the reward paid out for a single badge. Passing zero effectively
    ///         disables the badge (claims for it will revert `NoRewardConfigured`).
    function setRewardAmount(uint256 badgeId, uint256 amountWei)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        rewardAmount[badgeId] = amountWei;
        emit RewardConfigured(badgeId, amountWei);
    }

    /// @notice Batch version of `setRewardAmount`. Lengths must match.
    function setRewardAmountsBatch(uint256[] calldata badgeIds, uint256[] calldata amounts)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (badgeIds.length != amounts.length) revert LengthMismatch();
        for (uint256 i = 0; i < badgeIds.length; i++) {
            rewardAmount[badgeIds[i]] = amounts[i];
            emit RewardConfigured(badgeIds[i], amounts[i]);
        }
    }

    /// @notice Top up the vault. Anyone can call. The caller must have approved
    ///         this contract to pull `amount` of `rewardToken` first.
    function fund(uint256 amount) external {
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    /// @notice Pause `claimRewards`. Admin escape hatch.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Resume `claimRewards`.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Rescue tokens from the vault. Admin-only.
    /// @param to     Destination address.
    /// @param amount Amount of `rewardToken` to send.
    function emergencyWithdraw(address to, uint256 amount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        rewardToken.safeTransfer(to, amount);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}
}
