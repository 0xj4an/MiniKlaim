// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title MiniKlaimHexes
/// @notice Each captured H3 hex (resolution 12) is an ERC-721 token whose id equals the
///         H3 cell index. Players cannot transfer tokens directly; the contract moves
///         ownership when a hex is recaptured by another player.
/// @dev UUPS-upgradeable (deployed behind an ERC1967 proxy; upgrades gated by DEFAULT_ADMIN_ROLE).
///      Two capture paths exist:
///      - `capture` / `captureBatch`: called by the backend relayer (CAPTURER_ROLE). Used as a
///        sponsored fallback when the player cannot pay gas (no balance / unsupported wallet).
///      - `claimRun`: called by the *player* from their own wallet, gated by an EIP-712 voucher
///        signed by a CAPTURER_ROLE key. This makes the player the on-chain `msg.sender`, so each
///        player counts as a unique active wallet, while the backend stays the anti-cheat authority.
contract MiniKlaimHexes is
    Initializable,
    ERC721Upgradeable,
    AccessControlUpgradeable,
    EIP712Upgradeable,
    UUPSUpgradeable
{
    bytes32 public constant CAPTURER_ROLE = keccak256("CAPTURER_ROLE");

    /// @dev keccak256("ClaimRun(address player,uint256[] h3Ids,uint256 nonce)")
    bytes32 private constant CLAIM_RUN_TYPEHASH =
        keccak256("ClaimRun(address player,uint256[] h3Ids,uint256 nonce)");

    string private _baseUri;

    // --- Reportable on-chain metrics -------------------------------------------------
    /// @notice Total hexes ever captured (first mint + every recapture).
    uint256 public totalCaptures;
    /// @notice Number of player-submitted `claimRun` transactions.
    uint256 public totalClaimRuns;
    /// @notice Distinct players that have ever captured at least one hex.
    uint256 public uniquePlayers;
    /// @notice Per-player lifetime capture count.
    mapping(address => uint256) public capturesByPlayer;
    mapping(address => bool) private _seenPlayer;

    /// @dev Each voucher nonce can be redeemed once.
    mapping(uint256 => bool) public usedNonces;

    /// @dev Storage gap for safe future upgrades (append new state above, shrink the gap).
    uint256[45] private __gap;

    /// @dev Emitted when a brand new hex is claimed for the first time.
    event HexClaimed(address indexed player, uint256 indexed h3Id);
    /// @dev Emitted when an existing hex is recaptured from another player.
    event HexRecaptured(address indexed from, address indexed to, uint256 indexed h3Id);
    /// @dev Emitted once per successful player-submitted run claim.
    event RunClaimed(address indexed player, uint256 indexed nonce, uint256 count);

    error TransfersDisabled();
    error NonceAlreadyUsed();
    error InvalidVoucher();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, string memory baseUri) external initializer {
        __ERC721_init("MiniKlaim Hexes", "MKHEX");
        __AccessControl_init();
        __EIP712_init("MiniKlaimHexes", "1");
        __UUPSUpgradeable_init();
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

    /// @notice Player-submitted claim. The caller captures `h3Ids` to themselves, but only if
    ///         `sig` is a valid EIP-712 voucher signed by a CAPTURER_ROLE key authorizing exactly
    ///         this `(player, h3Ids, nonce)`. The backend issues the voucher after validating the
    ///         run, so the player cannot claim hexes they did not earn.
    /// @param h3Ids The hexes the backend authorized for this run.
    /// @param nonce A unique, single-use voucher nonce issued by the backend.
    /// @param sig   The backend's EIP-712 signature over (msg.sender, h3Ids, nonce).
    function claimRun(uint256[] calldata h3Ids, uint256 nonce, bytes calldata sig) external {
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        usedNonces[nonce] = true;

        bytes32 structHash = keccak256(
            abi.encode(CLAIM_RUN_TYPEHASH, msg.sender, keccak256(abi.encodePacked(h3Ids)), nonce)
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        if (!hasRole(CAPTURER_ROLE, signer)) revert InvalidVoucher();

        totalClaimRuns++;
        for (uint256 i = 0; i < h3Ids.length; i++) {
            _capture(msg.sender, h3Ids[i]);
        }
        emit RunClaimed(msg.sender, nonce, h3Ids.length);
    }

    /// @notice One-time migration helper: re-mint existing ownership into this contract from a
    ///         trusted off-chain source (the app DB, which is the canonical ownership list).
    ///         Admin-only. `players[i]` becomes the owner of `h3Ids[i]`.
    function adminImport(address[] calldata players, uint256[] calldata h3Ids)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(players.length == h3Ids.length, "length mismatch");
        for (uint256 i = 0; i < h3Ids.length; i++) {
            _capture(players[i], h3Ids[i]);
        }
    }

    function _capture(address player, uint256 h3Id) internal {
        if (!_seenPlayer[player]) {
            _seenPlayer[player] = true;
            uniquePlayers++;
        }
        address current = _ownerOf(h3Id);
        if (current == address(0)) {
            _mint(player, h3Id);
            totalCaptures++;
            capturesByPlayer[player]++;
            emit HexClaimed(player, h3Id);
        } else if (current != player) {
            // Use the internal transfer so the role check above is enough. We do not
            // require the previous owner to approve.
            _safeTransfer(current, player, h3Id, "");
            totalCaptures++;
            capturesByPlayer[player]++;
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
        override(ERC721Upgradeable, AccessControlUpgradeable)
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
