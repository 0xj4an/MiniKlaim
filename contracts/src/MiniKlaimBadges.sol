// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "openzeppelin-contracts/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";

/// @title MiniKlaimBadges
/// @notice Soulbound ERC-1155 achievement badges. Each badge id is a unique
///         achievement (First steps, Five blocks, ...). A player holds either
///         balance 0 (locked) or 1 (unlocked). Tokens cannot be transferred,
///         only minted (and never burned by the player).
contract MiniKlaimBadges is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    string private _baseUri;

    /// @dev Emitted when a badge is minted to a player for the first time.
    event BadgeUnlocked(address indexed player, uint256 indexed badgeId);

    error AlreadyUnlocked();
    error TransfersDisabled();

    constructor(address admin, string memory baseUri) ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _baseUri = baseUri;
    }

    /// @notice Mint a single badge to `player`. Reverts if the player already
    ///         holds it; idempotency must be enforced upstream by the server.
    function mint(address player, uint256 badgeId) external onlyRole(MINTER_ROLE) {
        if (balanceOf(player, badgeId) > 0) revert AlreadyUnlocked();
        _mint(player, badgeId, 1, "");
        emit BadgeUnlocked(player, badgeId);
    }

    /// @notice Mint many badges to the same player in one tx. Skips any badge
    ///         the player already holds (so the server can call with a fresh
    ///         "candidates" list without dedupe).
    function mintBatch(address player, uint256[] calldata badgeIds)
        external
        onlyRole(MINTER_ROLE)
    {
        for (uint256 i = 0; i < badgeIds.length; i++) {
            uint256 id = badgeIds[i];
            if (balanceOf(player, id) > 0) continue;
            _mint(player, id, 1, "");
            emit BadgeUnlocked(player, id);
        }
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
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
