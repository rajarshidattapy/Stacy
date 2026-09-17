---
name: access-control-patterns
description: Compare Ownable, Ownable2Step, AccessControl, and custom modifiers. Use when designing privileged functions, admin paths, or role-based authorization.
---

# access-control-patterns

## When to use

Any function that should not be callable by everyone — admin setters, upgrades, treasury withdrawals, mints. The choice of pattern affects auditability, future flexibility, and operational risk.

## Decision flow

| Need | Use |
|---|---|
| One owner, simple project | `Ownable2Step` |
| Multiple distinct roles | `AccessControl` |
| Custom logic (e.g., on-chain governance) | Custom modifier |
| Single immutable owner (no transfer) | `immutable owner` + custom modifier |

Default to `Ownable2Step`. Upgrade to `AccessControl` when you have ≥2 roles.

## Ownable (avoid)

OpenZeppelin's `Ownable` allows single-step transfer:

```solidity
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
contract Foo is Ownable {
    constructor(address initialOwner) Ownable(initialOwner) {}
    function setFee(uint256 fee) external onlyOwner { ... }
}
```

Risk: `transferOwnership(typo)` permanently locks the contract. Several incidents (e.g., wrong-network transfers) have lost contracts this way.

## Ownable2Step (preferred for single-owner)

```solidity
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
contract Foo is Ownable2Step {
    constructor(address initialOwner) Ownable(initialOwner) {}
    function setFee(uint256 fee) external onlyOwner { ... }
}
```

Transfer is two steps:
1. Current owner: `transferOwnership(newOwner)` — sets `pendingOwner`.
2. New owner: `acceptOwnership()` — actually becomes owner.

If `newOwner` is wrong, the old owner can simply transfer to a different address before the wrong one accepts.

## AccessControl (multiple roles)

```solidity
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract Foo is AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mint(address to, uint256 id) external onlyRole(MINTER_ROLE) { ... }
    function pause() external onlyRole(PAUSER_ROLE) { ... }
}
```

`DEFAULT_ADMIN_ROLE` (`bytes32(0)`) can grant/revoke any role. Each role can independently have its admin role set via `_setRoleAdmin`.

For two-step admin transfer with AccessControl, use `AccessControlDefaultAdminRules` (OZ v4.9+).

## Custom modifier — when

When the gating logic isn't role membership:

```solidity
modifier onlyTimeWindow() {
    require(block.timestamp >= startTime && block.timestamp <= endTime, "Closed");
    _;
}

modifier onlyHolder() {
    require(token.balanceOf(msg.sender) > 0, "Not a holder");
    _;
}
```

Avoid for plain "is this address X?" — use `Ownable2Step` instead.

## Multisig considerations

Owner is often a Gnosis Safe in production. Implications:

- Owner = a contract address. `tx.origin == owner` is FALSE. Always use `msg.sender`.
- Multisig calls are asynchronous (signature collection takes time). Don't gate on `block.timestamp` tightly.
- Test with a real multisig setup on testnet — not just an EOA.

## Renouncing ownership — pitfalls

`renounceOwnership()` sets owner to `address(0)`. Permanent. Privileged functions become uncallable.

If the contract has `onlyOwner` upgrade or fee functions, renouncing locks them forever. Sometimes desirable (decentralization signal), often catastrophic. Decide deliberately.

## Initialization vs constructor (proxies)

For proxy-deployed contracts, `Ownable`'s constructor doesn't run. Use the upgradeable variants:

```solidity
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

function initialize(address owner) public initializer {
    __Ownable_init(owner);
}
```

Plain `Ownable` in a proxy = no owner = anyone can call.

## Per-function vs per-contract gating

Per-function (preferred):
```solidity
function setFee(uint256 fee) external onlyOwner { ... }
function setRecipient(address r) external onlyOwner { ... }
```

Per-contract via `Pausable` for emergency stops:
```solidity
contract Foo is Pausable {
    function trade() external whenNotPaused { ... }
    function pause() external onlyOwner { _pause(); }
}
```

`Pausable` ≠ access control; combine with one.

## Common mistakes

- **Using `tx.origin` for auth** — exploitable via callback. Use `msg.sender`.
- **`onlyOwner` on a proxy with uninitialized owner** — anyone can call. Initialize on deploy.
- **`Ownable.transferOwnership` to a contract that can't accept** — locked. Use `Ownable2Step`.
- **Many roles with `DEFAULT_ADMIN_ROLE` shared** — admin can grant any role to itself. Compartmentalize via `_setRoleAdmin`.
- **Hardcoding owner in storage and skipping events** — emit `OwnershipTransferred` on every change for off-chain indexers and auditors.
- **Mixing `Ownable` and `AccessControl` haphazardly** — pick one. If you need both (e.g., `Ownable` for emergency, `AccessControl` for ops), document why.
- **Assuming `address(0)` checks are enough** — also reject `address(this)`, `address(treasury)`, etc., per context. Whitelist > blacklist.
- **Setting an owner to `msg.sender` in a constructor without parameter** — when the deployer is a factory or script, `msg.sender` is the wrong address. Pass `initialOwner` as constructor arg.
