// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IMiniKlaimHexes {
    function captureBatch(address player, uint256[] calldata h3Ids) external;
}

interface IMiniKlaimBadges {
    function mintBatch(address player, uint256[] calldata badgeIds) external;
}

/// @title MiniKlaimClaimRouter
/// @notice Settles a finished run in a single transaction: the player's hexes and
///         any badges they just unlocked, behind one wallet approval.
/// @dev Why this contract exists: MiniPay injects a plain EIP-1193 provider with no
///      EIP-5792 (`wallet_sendCalls`), so there is no wallet-level way to bundle
///      calls. One approval therefore means one transaction, and a run settles
///      across two contracts. Calling `MiniKlaimHexes.claimRun` and
///      `MiniKlaimBadges.claimBadges` directly cannot be bundled because both bind
///      the recipient to `msg.sender`, which would be this router. Instead the
///      router holds CAPTURER_ROLE on Hexes and MINTER_ROLE on Badges and uses
///      their relayer entry points, which take the recipient explicitly, always
///      passing the caller.
///
///      Deliberately NOT upgradeable. This is the only contract besides the
///      backend signer key that holds mint authority, so its logic is fixed at
///      deploy time: no admin can repoint it at a different recipient. To retire
///      it, revoke its two roles (that alone disables it) and deploy a
///      replacement. Nothing here is a trust assumption beyond "the backend
///      signer decides what a player earned", which was already true.
contract MiniKlaimClaimRouter is AccessControl, EIP712 {
    /// @notice Held by the backend key whose EIP-712 vouchers this router accepts.
    bytes32 public constant VOUCHER_SIGNER_ROLE = keccak256("VOUCHER_SIGNER_ROLE");

    /// @dev keccak256("ClaimAll(address player,uint256[] h3Ids,uint256[] badgeIds,uint256 nonce)")
    bytes32 private constant CLAIM_ALL_TYPEHASH = keccak256(
        "ClaimAll(address player,uint256[] h3Ids,uint256[] badgeIds,uint256 nonce)"
    );

    IMiniKlaimHexes public immutable hexes;
    IMiniKlaimBadges public immutable badges;

    /// @dev Each voucher nonce can be redeemed once. This is gas hygiene rather
    ///      than a safety boundary: `_capture` and `_unlock` on the target
    ///      contracts are both no-ops for something the player already has, so a
    ///      replayed voucher mints nothing extra.
    mapping(uint256 => bool) public usedNonces;

    // --- Reportable on-chain metrics -------------------------------------------------
    /// @notice Combined claims settled through this router.
    /// @dev The target contracts only count their own player-submitted entry points
    ///      (`totalClaimRuns`, `totalClaimTxns`), which this path bypasses by design.
    ///      Read this alongside those so /stats does not undercount.
    uint256 public totalClaims;
    /// @notice Distinct players that have settled at least one claim here.
    uint256 public uniqueClaimers;
    mapping(address => bool) private _seenClaimer;

    /// @dev Emitted once per settled combined claim.
    event ClaimAllSettled(
        address indexed player, uint256 indexed nonce, uint256 hexCount, uint256 badgeCount
    );

    error NonceAlreadyUsed();
    error InvalidVoucher();
    error NothingToClaim();

    constructor(address admin, address hexes_, address badges_)
        EIP712("MiniKlaimClaimRouter", "1")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        hexes = IMiniKlaimHexes(hexes_);
        badges = IMiniKlaimBadges(badges_);
    }

    /// @notice Settle a run: capture `h3Ids` and unlock `badgeIds` for the caller in
    ///         one transaction, gated by a single EIP-712 voucher.
    /// @dev The voucher binds `msg.sender`, so one player's voucher is useless to
    ///      another, and both id lists are hashed into it, so neither can be padded.
    ///      Either list may be empty (a run with no new badges, or badges earned
    ///      without new territory), but not both.
    /// @param h3Ids    Hexes the backend authorized for this run.
    /// @param badgeIds Badges the backend confirmed the player earned.
    /// @param nonce    Single-use voucher nonce issued by the backend.
    /// @param sig      Backend EIP-712 signature over (msg.sender, h3Ids, badgeIds, nonce).
    function claimAll(
        uint256[] calldata h3Ids,
        uint256[] calldata badgeIds,
        uint256 nonce,
        bytes calldata sig
    ) external {
        if (h3Ids.length == 0 && badgeIds.length == 0) revert NothingToClaim();
        if (usedNonces[nonce]) revert NonceAlreadyUsed();
        usedNonces[nonce] = true;

        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_ALL_TYPEHASH,
                msg.sender,
                keccak256(abi.encodePacked(h3Ids)),
                keccak256(abi.encodePacked(badgeIds)),
                nonce
            )
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        if (!hasRole(VOUCHER_SIGNER_ROLE, signer)) revert InvalidVoucher();

        if (!_seenClaimer[msg.sender]) {
            _seenClaimer[msg.sender] = true;
            uniqueClaimers++;
        }
        totalClaims++;

        if (h3Ids.length > 0) hexes.captureBatch(msg.sender, h3Ids);
        if (badgeIds.length > 0) badges.mintBatch(msg.sender, badgeIds);

        emit ClaimAllSettled(msg.sender, nonce, h3Ids.length, badgeIds.length);
    }
}
