---
name: storage-layout
description: How EVM storage slots map to Solidity declarations — packing, mappings, arrays, upgradeable storage gaps. Use when designing storage, planning upgrades, or debugging storage with `cast storage`.
---

# storage-layout

## When to use

Designing a contract with non-trivial storage (multiple variables, structs, mappings). Planning an upgradeable contract. Debugging an unexpected value at a slot. Considering a struct reorder.

## The basics

EVM storage = a key-value map of `bytes32 → bytes32`. Solidity assigns each state variable a slot starting at 0, in declaration order.

```solidity
contract Layout {
    uint256 a;       // slot 0
    uint256 b;       // slot 1
    address c;       // slot 2 (20 bytes, slot has 12 unused)
    uint96 d;        // slot 2 (packed with c — 20 + 12 = 32)
    uint256 e;       // slot 3 (couldn't fit in slot 2)
}
```

Inspect:

```bash
forge inspect Layout storage
```

Output (truncated):
```json
{
  "storage": [
    { "label": "a", "offset": 0, "slot": "0", "type": "uint256" },
    { "label": "b", "offset": 0, "slot": "1", "type": "uint256" },
    { "label": "c", "offset": 0, "slot": "2", "type": "address" },
    { "label": "d", "offset": 20, "slot": "2", "type": "uint96" },
    { "label": "e", "offset": 0, "slot": "3", "type": "uint256" }
  ]
}
```

## Packing rules

A new variable shares the prior slot iff:
1. The prior slot has enough free bytes.
2. The variable's size ≤ remaining bytes.
3. The variable type allows packing (value types only — no `mapping`, no dynamic `bytes`/`string`).

Reorder for packing:

```solidity
// Bad (3 slots)
uint256 a;
bool b;
uint256 c;

// Good (2 slots)
uint256 a;       // slot 0
uint256 c;       // slot 1
bool b;          // slot 2 — wait, this is 3
// Actually:
uint256 a;       // slot 0
bool b;          // slot 1, byte 0
uint256 c;       // slot 2 — bool didn't help here

// Best (1 slot saved by reordering uints+bool):
bool b;          // slot 0, byte 0
uint96 small;    // slot 0, bytes 1-12
// ... only when the reorganization actually saves slots
```

Packing helps only when small types fit alongside something. A lone `bool` between two `uint256`s wastes 31 bytes per slot.

## Mappings

```solidity
mapping(address => uint256) balances;     // declared at slot N
```

Storage location of `balances[user]`:
```
keccak256(abi.encodePacked(user, N))
```

Nested:
```solidity
mapping(address => mapping(uint256 => uint256)) allowances;
// allowances[user][id] is at:
// keccak256(abi.encode(id, keccak256(abi.encode(user, N))))
```

Read directly:

```bash
cast storage <addr> $(cast index uint256 1 0)   # slot for index 1 in mapping at slot 0
```

## Dynamic arrays

```solidity
uint256[] data;     // slot N stores LENGTH
                    // data[i] at: keccak256(N) + i
```

Static arrays are inlined (use slots directly):

```solidity
uint256[3] fixed;   // occupies slots N, N+1, N+2
```

## Strings and bytes

Short (≤31 bytes): packed into the slot with length encoded.
Long (≥32 bytes): slot stores `(length * 2 + 1)`; data at `keccak256(slot) + i`.

Reading is non-trivial; use `cast call <addr> "str()(string)"` instead of raw slot reads.

## Inheritance

Layout is parent-first:

```solidity
contract A { uint256 x; }       // x at slot 0
contract B is A { uint256 y; }  // y at slot 1
contract C is B { uint256 z; }  // z at slot 2
```

Diamond inheritance (multiple parents): C3 linearization. `forge inspect C storage` is authoritative.

## Upgradeable contracts — storage gaps

For UUPS / TransparentProxy patterns, the implementation contract's storage layout becomes the proxy's. Adding storage in a new implementation MUST extend, never reorder:

```solidity
contract V1 {
    uint256 a;   // slot 0
    address b;   // slot 1
    uint256[50] private __gap;  // reserves slots 2..51
}

contract V2 is V1 {
    // Allowed: add new storage, but only by consuming the gap
    uint256 c;             // slot 2
    uint256[49] private __gap_v2;  // shrink gap by what we used
}
```

Gap convention: `uint256[50] private __gap` at end of every upgradeable contract. New variables added to next version must shrink the gap by the same number of slots used.

OpenZeppelin's upgradeable contracts ship with gaps. Check:
```bash
forge inspect MyContract storageLayout | jq '.storage[] | select(.label=="__gap")'
```

## Reading slots from a deployed contract

```bash
# Single slot
cast storage 0xDEADBEEF... 0 --rpc-url $RPC_URL

# Slot by mapping index
SLOT=$(cast index address 0xUserAddress 5)   # mapping at slot 5, key=user
cast storage 0xDEADBEEF... $SLOT --rpc-url $RPC_URL
```

`cast index` computes the keccak256 derivation for you.

## Storage collisions in proxies

Proxy and implementation share storage. ERC-1967 reserves specific slots for `implementation`, `admin`, `beacon` (computed as `bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)`). Never declare state vars at conflicting positions — use the OZ proxy contracts which handle this.

For Diamond Proxy (EIP-2535), each facet stores in a unique namespace via `keccak256("namespace.struct")` to avoid collision.

## Common mistakes

- **Reordering storage in an upgradeable contract** — corrupts existing data. Only append (within gap), never reorder.
- **Forgetting the gap** — first upgrade tries to add a variable; collides with whatever the inheriting contract's storage was.
- **Assuming small types always pack** — only adjacent declarations pack. `uint256 a; uint8 b; uint256 c;` wastes 31 bytes.
- **Reading mapping slots without `cast index`** — manual `keccak256` of wrong-encoded args (use `abi.encode`, NOT `abi.encodePacked` for value types in nested keys past v0.8 conventions). When in doubt, use `cast index`.
- **Initializing immutable in the constructor of an upgradeable contract** — proxy doesn't call constructor; immutable stays at compiled value (or zero). Use storage + `initialize()` instead.
- **Putting `mapping` inside a struct in storage and expecting it to copy** — mappings can't be copied, only referenced. Use `storage` pointer.
- **Trusting `forge inspect storage` output for proxies** — it shows the implementation's layout. The proxy may have different ERC-1967 slots active. Use `cast storage` on the proxy address directly.
