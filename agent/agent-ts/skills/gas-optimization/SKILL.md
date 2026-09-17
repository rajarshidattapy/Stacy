---
name: gas-optimization
description: Practical gas optimization patterns for Solidity 0.8+ — packing, custom errors, calldata vs memory, immutable, unchecked. Use only when a function is on a measured hot path. Avoid premature optimization.
---

# gas-optimization

## When to use

Optimize when a function is called frequently or expensively (mints, swaps, batch ops). Do NOT optimize cold paths or admin functions — readability matters more there. Always measure first with `forge snapshot` or `forge test --gas-report`.

## Measuring

```bash
forge snapshot                              # writes .gas-snapshot, diff next run
forge snapshot --diff .gas-snapshot         # show changes
forge test --gas-report                     # per-function table
```

Snapshot before refactor, after refactor, eyeball the diff. Don't trust intuition.

## Storage packing

EVM storage is 32-byte slots. Variables ≤32 bytes can share a slot if declared adjacently and totals fit.

Bad (3 slots):
```solidity
uint256 a;
bool b;
uint256 c;
```

Good (2 slots — `b` packs with `c` if you reorder, or `a` and `b` if you swap):
```solidity
uint256 a;     // slot 0
uint128 c;     // slot 1, bytes 0-15
uint8 b;       // slot 1, byte 16
// remaining 15 bytes of slot 1 free
```

Inside structs, packing also matters:

```solidity
struct Bad {
    uint256 amount;   // slot 0
    address owner;    // slot 1
    uint256 deadline; // slot 2
}                     // 3 slots

struct Good {
    address owner;    // slot 0, bytes 0-19
    uint96 amount;    // slot 0, bytes 20-31  (cap of 2^96-1, often plenty)
    uint256 deadline; // slot 1
}                     // 2 slots
```

A storage write is 20k gas (cold) or 2.9k (warm). Saving a slot saves a SSTORE.

## `calldata` vs `memory`

For external function params that won't be modified, use `calldata`:

```solidity
// Good
function process(uint256[] calldata items) external { ... }

// Bad (copies to memory, ~1 gas per byte)
function process(uint256[] memory items) external { ... }
```

`memory` is required when:
- The function is `internal` or `public` and called internally.
- You need to mutate the array.

## Custom errors over require strings

```solidity
// Bad — every revert string costs storage
require(msg.sender == owner, "Only owner can call this");

// Good — 4-byte selector
error Unauthorized(address caller);
if (msg.sender != owner) revert Unauthorized(msg.sender);
```

Saves both deployment gas and per-revert gas.

## `immutable` vs `constant`

```solidity
uint256 constant FEE = 100;              // baked into bytecode at compile, free at runtime
address immutable owner;                  // set in constructor, baked into bytecode after deploy
uint256 storedFee;                        // SLOAD per read (~2.1k gas)

constructor(address _owner) {
    owner = _owner;                       // immutable
}
```

Use `constant` for compile-time literals. `immutable` for constructor-set values that never change. Both avoid SLOAD.

## Unchecked blocks

Solidity 0.8+ checks every arithmetic op for over/underflow (~30 gas each). When you've already verified safety, skip the check:

```solidity
function increment(uint256 x) internal pure returns (uint256) {
    unchecked { return x + 1; }     // safe if x < type(uint256).max
}

// Loop counter — i can never overflow if length fits in uint256
for (uint256 i = 0; i < items.length;) {
    process(items[i]);
    unchecked { ++i; }
}
```

ONLY use `unchecked` when the operation cannot overflow given prior checks. Document why.

## `++i` vs `i++`

In 0.8+, irrelevant for non-loop locals (compiler optimizes both). In loop counters in `unchecked` blocks, `++i` saves ~5 gas per iteration vs `i++` because no temporary is created.

## Storage refs

Reading a storage struct member-by-member is one SLOAD per access. Cache as a storage pointer:

```solidity
// Bad — 3 SLOADs
function check(uint256 id) external view {
    uint256 amount = positions[id].amount;
    address owner = positions[id].owner;
    uint256 deadline = positions[id].deadline;
}

// Good — same SLOADs but compiler may optimize, and code is clearer
Position storage p = positions[id];
uint256 amount = p.amount;
address owner = p.owner;
uint256 deadline = p.deadline;
```

For multiple writes, storage refs are unambiguously cheaper.

## Batch operations

If callers will repeatedly invoke a function, expose a batch version:

```solidity
function batchIncrement(uint256 n) external {
    for (uint256 i = 0; i < n;) {
        increment();
        unchecked { ++i; }
    }
}
```

Saves the per-tx fixed cost (21k gas) and per-call CALLDATACOPY.

## Short-circuit ordering

```solidity
// Cheap check first, expensive check second
require(amount > 0 && externalContract.canTransfer(msg.sender), "...");
```

If `amount == 0`, `canTransfer` is never called.

## Avoid `payable` if not needed

`payable` functions are slightly cheaper (~21 gas) because the runtime skips a `callvalue` check. Don't add `payable` to a non-payable function for this reason — it changes semantics.

## Common mistakes

- **Optimizing without measuring** — many "optimizations" are wash or worse on a real workload.
- **Reordering struct fields without testing** — packing requires fields to be ≤32 bytes total per slot AND adjacent. A struct in storage that already exists in production cannot be reordered (storage layout breaks). Plan before deploy.
- **`uint8` everywhere** — uint256 is the EVM word size; smaller types in memory or as locals incur extra masking ops. Smaller types help only when packed.
- **`unchecked` on user input** — only safe when you've verified bounds. `unchecked { x - y }` with `x < y` underflows silently and creates a huge number.
- **Mass-applying patterns to admin functions** — admin paths are called rarely. Readability + auditability win.
- **Using `delete` thinking it refunds gas** — refunds were neutered post-EIP-3529. `delete` clears storage but no longer pays back.
