// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title MiniKlaimBadges
/// @notice Soulbound ERC-1155 achievement badges. Each badge id is a unique
///         achievement. A player holds either balance 0 (locked) or 1 (unlocked).
///         Tokens cannot be transferred, only minted.
/// @dev UUPS-upgradeable (ERC1967 proxy; upgrades gated by DEFAULT_ADMIN_ROLE).
///      Two mint paths: relayer `mint`/`mintBatch` (MINTER_ROLE, sponsored
///      fallback) and player-submitted `claimBadges` gated by an EIP-712 voucher,
///      so the player is the on-chain msg.sender (attribution).
contract MiniKlaimBadges is
    Initializable,
    ERC1155Upgradeable,
    AccessControlUpgradeable,
    EIP712Upgradeable,
    UUPSUpgradeable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @dev keccak256("ClaimBadges(address player,uint256[] badgeIds,uint256 nonce)")
    bytes32 private constant CLAIM_BADGES_TYPEHASH =
        keccak256("ClaimBadges(address player,uint256[] badgeIds,uint256 nonce)");

    string private _baseUri;

    // --- Reportable on-chain metrics -------------------------------------------------
    /// @notice Total badges ever unlocked.
    uint256 public totalBadgesMinted;
    /// @notice Number of player-submitted `claimBadges` transactions.
    uint256 public totalClaimTxns;
    /// @notice Distinct players holding at least one badge.
    uint256 public uniqueHolders;
    mapping(address => bool) private _hasAnyBadge;

    /// @dev Each voucher nonce can be redeemed once.
    mapping(uint256 => bool) public usedNonces;

    /// @dev Storage gap for safe future upgrades.
    uint256[45] private __gap;

    /// @dev Emitted when a badge is minted to a player for the first time.
    event BadgeUnlocked(address indexed player, uint256 indexed badgeId);
    /// @dev Emitted once per successful player-submitted badge claim.
    event BadgesClaimed(address indexed player, uint256 indexed nonce, uint256 count);

    error TransfersDisabled();
    error NonceAlreadyUsed();
    error InvalidVoucher();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, string memory baseUri) external initializer {
        __ERC1155_init("");
        __AccessControl_init();
        __EIP712_init("MiniKlaimBadges", "1");
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _baseUri = baseUri;
    }

    /// @notice Relayer mint of a single badge (sponsored fallback).
    function mint(address player, uint256 badgeId) external onlyRole(MINTER_ROLE) {
        _unlock(player, badgeId);
    }

    /// @notice Relayer mint of many badges (skips already-held).
    function mintBatch(address player, uint256[] calldata badgeIds)
        external
        onlyRole(MINTER_ROLE)
    {
        for (uint256 i = 0; i < badgeIds.length; i++) {
            _unlock(player, badgeIds[i]);
        }
    }

    /// @notice Player-submitted claim. The caller unlocks `badgeIds` for themselves,
    ///         gated by an EIP-712 voucher signed by a MINTER_ROLE key. The backend
    ///         issues the voucher only for badges the player actually earned.
    function claimBadges(uint256[] calldata badgeIds, uint256 nonce, bytes calldata sig)
        external
    {
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        usedNonces[nonce] = true;

        bytes32 structHash = keccak256(
            abi.encode(CLAIM_BADGES_TYPEHASH, msg.sender, keccak256(abi.encodePacked(badgeIds)), nonce)
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        if (!hasRole(MINTER_ROLE, signer)) revert InvalidVoucher();

        totalClaimTxns++;
        for (uint256 i = 0; i < badgeIds.length; i++) {
            _unlock(msg.sender, badgeIds[i]);
        }
        emit BadgesClaimed(msg.sender, nonce, badgeIds.length);
    }

    /// @notice One-time migration helper: re-mint existing badge holdings from the
    ///         app DB. Admin-only. Unlocks `badgeIds[i]` for `players[i]`.
    function adminImport(address[] calldata players, uint256[] calldata badgeIds)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(players.length == badgeIds.length, "length mismatch");
        for (uint256 i = 0; i < badgeIds.length; i++) {
            _unlock(players[i], badgeIds[i]);
        }
    }

    function _unlock(address player, uint256 badgeId) internal {
        if (balanceOf(player, badgeId) > 0) return; // already held, no-op
        if (!_hasAnyBadge[player]) {
            _hasAnyBadge[player] = true;
            uniqueHolders++;
        }
        _mint(player, badgeId, 1, "");
        totalBadgesMinted++;
        emit BadgeUnlocked(player, badgeId);
    }

    /// @notice Block every transfer that isn't a fresh mint from address(0).
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        if (from != address(0)) revert TransfersDisabled();
        super._update(from, to, ids, values);
    }

    function uri(uint256 id) public view override returns (string memory) {
        return string.concat(_baseUri, Strings.toString(id));
    }

    function setBaseURI(string calldata newBase) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseUri = newBase;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}
}
