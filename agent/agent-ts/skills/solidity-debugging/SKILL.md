---
name: solidity-debugging
description: Read `forge test` output and diagnose common Solidity failure modes — reverts, stack-too-deep, OOG, division-by-zero, custom-error decoding. Use when a test fails or a deploy reverts and the cause is unclear.
---

# solidity-debugging

## When to use

A `forge test` fails, a deploy reverts, or behavior diverges from expectation. First instinct should be to re-run with `-vvvv` and read the trace, not to guess.

## Verbosity flags

```bash
forge test                       # pass/fail counts only
forge test -vv                   # show emit + console.log
forge test -vvv                  # add per-call traces for failing tests
forge test -vvvv                 # full traces for ALL tests (use to debug specific test)
forge test --match-test test_X -vvvv  # focus on one test
```

`-vvvv` is the sharpest tool. Use with `--match-test` so the trace stays readable.

## Trace anatomy

```
[FAIL. Reason: Unauthorized()] test_OnlyOwnerReset() (gas: 24531)
Traces:
  [24531] CounterTest::test_OnlyOwnerReset()
    ├─ [0] VM::prank(alice: [0x...])
    │   └─ ← [Return]
    ├─ [2300] Counter::reset()
    │   └─ ← [Revert] Unauthorized()
    └─ ← [Revert] Unauthorized()
```

Read top-down: each `├─` is a call; the bottom of each branch shows return value or revert. The first revert from the bottom is the root cause.

## Custom error decoding

Foundry decodes custom errors automatically when the contract is in the build:

```
[Revert] InsufficientBalance(100, 50)
```

If you see raw selector bytes like `[Revert] 0xf4d678b8`, the trace can't resolve the error. Decode manually:

```bash
cast 4byte 0xf4d678b8
```

Returns matching error signatures from the public selector database.

## `console.log` from contracts

```solidity
import {console} from "forge-std/console.sol";

function increment() public {
    console.log("number before:", number);
    number++;
    console.log("number after:", number);
}
```

Visible at `-vv` and above. Overloads exist for `string`, `uint256`, `int256`, `address`, `bool`, `bytes`, plus combinations (`console.log("addr=%s val=%s", addr, val)`).

Strip `console` before deploy — it costs gas and bloats bytecode.

## Common failure patterns

### Stack too deep

```
CompilerError: Stack too deep, try removing local variables.
```

Cause: function uses too many local variables (>16 stack slots).

Fixes:
- Extract a struct: pack 4-5 locals into one struct, pass by reference.
- Split function into helpers.
- Use `unchecked` blocks where safe — they're slightly more stack-efficient.
- Enable `via_ir = true` in `foundry.toml` (slower compile, smarter codegen).

### Revert without reason

```
[Revert]
```

No string, no error name. Causes:
- Low-level `call` returned false and you didn't propagate the reason.
- Out-of-gas inside an external call (capped by 63/64 rule).
- Division by zero, modulo by zero (panic 0x12).
- Array out-of-bounds (panic 0x32).
- Arithmetic over/underflow in 0.8+ (panic 0x11).

`-vvvv` usually shows the panic code. Decode:

| Code | Meaning |
|---|---|
| 0x01 | `assert(false)` |
| 0x11 | Arithmetic over/underflow |
| 0x12 | Division/modulo by zero |
| 0x21 | Invalid enum cast |
| 0x22 | Storage byte array invariant broken |
| 0x31 | `pop()` on empty array |
| 0x32 | Array index out of bounds |
| 0x41 | Memory allocation too large |
| 0x51 | Call to zero-initialized internal function pointer |

### Out of gas

```
[OutOfGas]
```

Causes:
- Infinite or very long loop.
- Recursive call.
- Test default gas limit too low — bump in `foundry.toml`:

```toml
[profile.default]
gas_limit = 18446744073709551615
```

Or per-call: there isn't a per-call cheat for gas in tests; rewrite the loop.

### Division by zero

Panic 0x12. Always guard:

```solidity
if (denominator == 0) revert ZeroDenominator();
result = numerator / denominator;
```

## Debug stepping

For really stuck tests:

```bash
forge debug --debug script/Counter.s.sol --sig "run()" --rpc-url $RPC_URL
```

Opens an interactive opcode-level debugger. Heavy; use only when traces aren't enough.

## Diff testing against a reference

When porting logic, run both implementations on fuzzed inputs and `assertEq` outputs. Cheap way to catch off-by-one and rounding bugs.

```solidity
function testFuzz_MatchesReference(uint256 x) public {
    assertEq(myImpl(x), referenceImpl(x));
}
```

## Common mistakes

- **Reading the trace top-down for the cause** — the trigger is at the top, but the cause is at the deepest revert. Read the leaf first.
- **Ignoring `-vvvv` because it's verbose** — combine with `--match-test`. The verbosity is the point.
- **Leaving `console.log` in production contracts** — costs gas and increases deployed size.
- **Catching reverts with try/catch and discarding the reason** — at minimum re-emit the bytes for diagnosis.
- **Assuming `revert` strings are free** — they cost ~50-100 gas per char. Prefer custom errors (4 bytes selector + args).
- **Using `assert` for input validation** — `assert` is for invariants; `assert(false)` panics with 0x01 and consumes all gas. Use `require` or `revert CustomError()` for normal validation.
