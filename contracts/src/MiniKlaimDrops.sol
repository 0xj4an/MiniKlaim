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

/// @title MiniKlaimDrops
/// @notice Treasures hidden in map blocks, paid in an allowed ERC-20 (USDT, COPm).
///         A drop pays `amount` to each of up to `maxWinners` players, one prize
///         per player. The block is committed onchain as
///         `keccak256(abi.encode(dropId, uint64 h3, bytes32 salt))` and can be
///         revealed after the drop closes, so anyone can check it never moved.
/// @dev UUPS behind an ERC1967 proxy, same pattern as MiniKlaimRewards.
///
///      Funds: anyone can `fund` an allowed token. An open drop reserves
///      `amount * (maxWinners - winners)` in `committed[token]`, and creating or
///      growing a drop reverts when the free balance (`balance - committed`)
///      cannot cover it. So a leaked REWARDER key can at most pay out what open
///      drops already reserve, and only the free balance can be withdrawn.
///
///      Editing: `updateDrop` changes the prize and the number of winners of an
///      open drop; the reservation follows. It never touches prizes already paid.
///
///      Claims: `claimDropsFor` is permissionless and always pays `player`, never
///      `msg.sender`. The backend relayer submits it in practice (MiniPay cannot
///      sign messages, so the player signs nothing). A drop this player already
///      claimed, or one whose winners are all paid, is skipped instead of
///      reverting, so one stale id does not fail the rest of a voucher.
contract MiniKlaimDrops is
    Initializable,
    AccessControlUpgradeable,
    EIP712Upgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant REWARDER_ROLE = keccak256("REWARDER_ROLE");

    bytes32 private constant CLAIM_DROPS_TYPEHASH =
        keccak256("ClaimDrops(address player,uint256[] dropIds,uint256 nonce,uint256 deadline)");

    enum Status {
        None,
        Open,
        /// Every winner slot is paid.
        Claimed,
        /// Closed by the operator before every slot was paid.
        Expired
    }

    struct Drop {
        address token;
        uint128 amount;
        uint32 maxWinners;
        uint32 winners;
        Status status;
        bytes32 commitment;
    }

    mapping(address token => bool) public allowedToken;
    mapping(address token => uint256) public committed;
    mapping(uint256 dropId => Drop) private _drops;
    mapping(uint256 dropId => mapping(address player => bool)) public hasClaimed;
    mapping(uint256 nonce => bool) public usedNonces;

    /// @dev Storage gap for safe future upgrades.
    uint256[44] private __gap;

    event TokenAllowed(address indexed token, bool allowed);
    event Funded(address indexed from, address indexed token, uint256 amount);
    event Withdrawn(address indexed to, address indexed token, uint256 amount);
    event DropCreated(
        uint256 indexed dropId, address indexed token, uint256 amount, uint256 maxWinners, bytes32 commitment
    );
    event DropUpdated(uint256 indexed dropId, uint256 amount, uint256 maxWinners);
    event DropClaimed(address indexed player, uint256 indexed dropId, address indexed token, uint256 amount);
    event DropExpired(uint256 indexed dropId);
    event DropRevealed(uint256 indexed dropId, uint64 h3, bytes32 salt);

    error TokenNotAllowed(address token);
    error ZeroAmount();
    error ZeroWinners();
    error AmountTooLarge();
    error DropExists(uint256 dropId);
    error DropNotOpen(uint256 dropId);
    error DropStillOpen(uint256 dropId);
    error WinnersBelowPaid(uint256 dropId);
    error InsufficientFreeBalance();
    error InvalidVoucher();
    error NonceAlreadyUsed();
    error VoucherExpired();
    error EmptyDrops();
    error BadReveal();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param admin    Gets DEFAULT_ADMIN_ROLE: upgrade, allowlist, withdraw, pause, roles.
    /// @param rewarder Gets REWARDER_ROLE: create, edit and expire drops, sign vouchers.
    ///                 Usually the backend relayer key.
    /// @param tokens   Initial token allowlist.
    function initialize(address admin, address rewarder, address[] calldata tokens) external initializer {
        if (admin == address(0) || rewarder == address(0)) revert ZeroAddress();
        __AccessControl_init();
        __EIP712_init("MiniKlaimDrops", "1");
        __Pausable_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REWARDER_ROLE, rewarder);
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) revert ZeroAddress();
            allowedToken[tokens[i]] = true;
            emit TokenAllowed(tokens[i], true);
        }
    }

    // --- views -------------------------------------------------------------------

    function getDrop(uint256 dropId) external view returns (Drop memory) {
        return _drops[dropId];
    }

    /// @notice True once every winner slot is paid.
    function isClaimed(uint256 dropId) external view returns (bool) {
        return _drops[dropId].status == Status.Claimed;
    }

    /// @notice Balance of `token` not reserved by open drops.
    function freeBalance(address token) public view returns (uint256) {
        uint256 bal = IERC20(token).balanceOf(address(this));
        uint256 c = committed[token];
        return bal > c ? bal - c : 0;
    }

    function _reserved(Drop storage d) private view returns (uint256) {
        return uint256(d.amount) * (d.maxWinners - d.winners);
    }

    // --- funding -----------------------------------------------------------------

    function setAllowedToken(address token, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        allowedToken[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    /// @notice Top up. Caller must approve `amount` first.
    function fund(address token, uint256 amount) external {
        if (!allowedToken[token]) revert TokenNotAllowed(token);
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, token, amount);
    }

    /// @notice Withdraw from the free balance only. Open drops stay covered.
    function withdraw(address token, uint256 amount, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount > freeBalance(token)) revert InsufficientFreeBalance();
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(to, token, amount);
    }

    // --- drops -------------------------------------------------------------------

    /// @param amount     Prize per winner, in the token's base units.
    /// @param maxWinners How many players can win this drop, one prize each.
    function createDrop(uint256 dropId, address token, uint256 amount, uint256 maxWinners, bytes32 commitment)
        external
        onlyRole(REWARDER_ROLE)
    {
        if (!allowedToken[token]) revert TokenNotAllowed(token);
        if (amount == 0) revert ZeroAmount();
        if (maxWinners == 0) revert ZeroWinners();
        if (amount > type(uint128).max || maxWinners > type(uint32).max) revert AmountTooLarge();
        if (_drops[dropId].status != Status.None) revert DropExists(dropId);
        uint256 reserve = amount * maxWinners;
        if (reserve > freeBalance(token)) revert InsufficientFreeBalance();

        committed[token] += reserve;
        _drops[dropId] = Drop({
            token: token,
            amount: uint128(amount),
            maxWinners: uint32(maxWinners),
            winners: 0,
            status: Status.Open,
            commitment: commitment
        });
        emit DropCreated(dropId, token, amount, maxWinners, commitment);
    }

    /// @notice Change the prize per winner and the number of winners of an open
    ///         drop. Applies to winners not paid yet. Setting `maxWinners` to the
    ///         number already paid closes the drop.
    function updateDrop(uint256 dropId, uint256 amount, uint256 maxWinners) external onlyRole(REWARDER_ROLE) {
        Drop storage d = _drops[dropId];
        if (d.status != Status.Open) revert DropNotOpen(dropId);
        if (amount == 0) revert ZeroAmount();
        if (maxWinners < d.winners) revert WinnersBelowPaid(dropId);
        if (amount > type(uint128).max || maxWinners > type(uint32).max) revert AmountTooLarge();

        uint256 oldReserve = _reserved(d);
        uint256 newReserve = amount * (maxWinners - d.winners);
        if (newReserve > oldReserve && newReserve - oldReserve > freeBalance(d.token)) {
            revert InsufficientFreeBalance();
        }
        committed[d.token] = committed[d.token] - oldReserve + newReserve;
        d.amount = uint128(amount);
        d.maxWinners = uint32(maxWinners);
        if (d.winners == d.maxWinners) d.status = d.winners == 0 ? Status.Expired : Status.Claimed;
        emit DropUpdated(dropId, amount, maxWinners);
    }

    /// @notice Close an open drop and release what it still reserves.
    function expireDrop(uint256 dropId) external onlyRole(REWARDER_ROLE) {
        Drop storage d = _drops[dropId];
        if (d.status != Status.Open) revert DropNotOpen(dropId);
        committed[d.token] -= _reserved(d);
        d.status = Status.Expired;
        emit DropExpired(dropId);
    }

    /// @notice Publish the hidden block of a closed drop. Anyone can call.
    function reveal(uint256 dropId, uint64 h3, bytes32 salt) external {
        Drop storage d = _drops[dropId];
        if (d.status == Status.None) revert DropNotOpen(dropId);
        if (d.status == Status.Open) revert DropStillOpen(dropId);
        if (keccak256(abi.encode(dropId, h3, salt)) != d.commitment) revert BadReveal();
        emit DropRevealed(dropId, h3, salt);
    }

    /// @notice Pay `player` one prize from each drop in a backend voucher. Permissionless.
    /// @return paid Number of prizes paid (skipped drops are not counted).
    function claimDropsFor(
        address player,
        uint256[] calldata dropIds,
        uint256 nonce,
        uint256 deadline,
        bytes calldata sig
    ) external whenNotPaused returns (uint256 paid) {
        if (player == address(0)) revert ZeroAddress();
        if (dropIds.length == 0) revert EmptyDrops();
        if (block.timestamp > deadline) revert VoucherExpired();
        if (usedNonces[nonce]) revert NonceAlreadyUsed();

        bytes32 structHash =
            keccak256(abi.encode(CLAIM_DROPS_TYPEHASH, player, keccak256(abi.encodePacked(dropIds)), nonce, deadline));
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        if (!hasRole(REWARDER_ROLE, signer)) revert InvalidVoucher();
        usedNonces[nonce] = true;

        for (uint256 i = 0; i < dropIds.length; i++) {
            uint256 id = dropIds[i];
            Drop storage d = _drops[id];
            if (hasClaimed[id][player] || d.status == Status.Claimed) continue;
            if (d.status != Status.Open) revert DropNotOpen(id);
            hasClaimed[id][player] = true;
            d.winners += 1;
            committed[d.token] -= d.amount;
            if (d.winners == d.maxWinners) d.status = Status.Claimed;
            paid++;
            emit DropClaimed(player, id, d.token, d.amount);
            IERC20(d.token).safeTransfer(player, d.amount);
        }
    }

    // --- admin -------------------------------------------------------------------

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
