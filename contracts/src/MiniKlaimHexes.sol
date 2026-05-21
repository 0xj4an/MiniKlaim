// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {Strings} from "openzeppelin-contracts/contracts/utils/Strings.sol";

/// @title MiniKlaimHexes
/// @notice Each captured H3 hex (resolution 12) is an ERC-721 token whose id equals the
///         H3 cell index. Players cannot transfer tokens directly; the contract moves
///         ownership when a hex is recaptured by another player.
contract MiniKlaimHexes is ERC721, AccessControl {
    bytes32 public constant CAPTURER_ROLE = keccak256("CAPTURER_ROLE");

    string private _baseUri;

    /// @dev Emitted when a brand new hex is claimed for the first time.
    event HexClaimed(address indexed player, uint256 indexed h3Id);
    /// @dev Emitted when an existing hex is recaptured from another player.
    event HexRecaptured(address indexed from, address indexed to, uint256 indexed h3Id);

    error TransfersDisabled();

    constructor(address admin, string memory baseUri)
        ERC721("MiniKlaim Hexes", "MKHEX")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CAPTURER_ROLE, admin);
        _baseUri = baseUri;
    }

    /// @notice Mint or transfer a single hex to `player`. Mints if unowned, transfers
    ///         from the current owner otherwise.
    function capture(address player, uint256 h3Id) external onlyRole(CAPTURER_ROLE) {
        _capture(player, h3Id);
    }

    /// @notice Same as `capture` but for many hexes in one tx. Used at run-finish.
    function captureBatch(address player, uint256[] calldata h3Ids)
        external
        onlyRole(CAPTURER_ROLE)
    {
        for (uint256 i = 0; i < h3Ids.length; i++) {
            _capture(player, h3Ids[i]);
        }
    }

    function _capture(address player, uint256 h3Id) internal {
        address current = _ownerOf(h3Id);
        if (current == address(0)) {
            _mint(player, h3Id);
            emit HexClaimed(player, h3Id);
        } else if (current != player) {
            // Use the internal transfer so the role check above is enough. We do not
            // require the previous owner to approve.
            _safeTransfer(current, player, h3Id, "");
            emit HexRecaptured(current, player, h3Id);
        }
        // If `current == player`, no-op: they already own it.
    }

    /// @notice Block all player-initiated transfers. Only the contract's own `_safeTransfer`
    ///         call inside `_capture` is allowed.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        // Allow:
        //   - mint (from == 0)
        //   - moves triggered by `_capture` (auth == address(0), no msg.sender check)
        // Block:
        //   - any transfer that came through approve/transferFrom from a regular EOA
        if (from != address(0) && auth != address(0)) {
            revert TransfersDisabled();
        }
        return super._update(to, tokenId, auth);
    }

    /// @notice Per-token URI. Returns `<baseUri>/<h3Id>`. The backend resolves that to a
    ///         JSON with name + image + lat/lng.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseUri, Strings.toString(tokenId));
    }

    function setBaseURI(string calldata newBase) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseUri = newBase;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
