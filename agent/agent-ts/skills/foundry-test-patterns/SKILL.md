---
name: foundry-test-patterns
description: Reference for writing and running Foundry tests — `setUp`, prank/deal/warp cheats, fuzz/invariant/fork modes, and assertions. Use when authoring or debugging `forge test` files.
---

# foundry-test-patterns

## When to use

Writing new tests for a Solidity contract. Debugging failing tests. Adding fuzz/invariant coverage. Forking mainnet/Sepolia state in tests.

## Test file shape

```solidity
// test/Counter.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";

contract CounterTest is Test {
    Counter counter;
    address alice = makeAddr("alice");
    address owner = makeAddr("owner");

    function setUp() public {
        vm.prank(owner);
        counter = new Counter();
    }

    function test_Increment() public {
        counter.increment();
        assertEq(counter.number(), 1);
    }
}
```

`setUp()` (camelCase exact) runs before each test. Misspelled `setup()` or `Setup()` is silently a regular function, not the hook.

## Naming conventions

- `test_X` — standard test
- `testFuzz_X(uint256 a)` — fuzzed (also: `test_X(uint256)` works but the `Fuzz` prefix makes intent clear)
- `testFork_X` — uses `vm.createSelectFork`
- `invariant_X` — invariant test, called repeatedly with random sequences
- `test_RevertWhen_X` / `test_RevertIf_X` — when paired with `vm.expectRevert`

## Cheats — addresses and balances

```solidity
address bob = makeAddr("bob");        // deterministic, labels in traces
vm.deal(bob, 10 ether);                // give bob ETH
deal(token, bob, 1000e18);             // give bob ERC20 (forge-std/StdCheats)
```

## Cheats — pranks

```solidity
vm.prank(alice);                       // next call from alice (one shot)
counter.increment();

vm.startPrank(alice);                  // every call from alice until stopPrank
counter.increment();
counter.increment();
vm.stopPrank();

vm.prank(alice, alice);                // msg.sender = alice AND tx.origin = alice
```

## Cheats — time/block

```solidity
vm.warp(block.timestamp + 1 days);     // jump time forward
vm.roll(block.number + 100);           // jump blocks forward
vm.fee(50 gwei);                       // set basefee
vm.chainId(11155111);                  // simulate Sepolia chainId
```

## Cheats — reverts

```solidity
// String require
vm.expectRevert("Not owner");
counter.reset();

// Custom error (selector)
vm.expectRevert(Counter.Unauthorized.selector);
counter.reset();

// Custom error with args
vm.expectRevert(abi.encodeWithSelector(Counter.InvalidAmount.selector, 0));
counter.set(0);

// Any revert
vm.expectRevert();
counter.boom();
```

`expectRevert` MUST be the line immediately before the call that should revert. Anything in between makes it match the wrong call.

## Cheats — events

```solidity
vm.expectEmit(true, true, false, true);  // (topic1, topic2, topic3, data)
emit Counter.NumberSet(alice, 42);
counter.set(42);
```

The "expected" emit is declared before the call, then the call is made.

## Fuzz tests

```solidity
function testFuzz_SetThenGet(uint256 x) public {
    vm.assume(x < type(uint128).max);   // discard impossible inputs
    counter.set(x);
    assertEq(counter.number(), x);
}
```

Tune fuzz runs in `foundry.toml`:

```toml
[fuzz]
runs = 1000
```

## Invariant tests

```solidity
contract CounterInvariant is Test {
    Counter counter;
    function setUp() public { counter = new Counter(); }
    function invariant_AlwaysNonNegative() public view {
        assertGe(counter.number(), 0);
    }
}
```

Configure handlers and target contracts via `targetContract(...)` for stateful invariants. Defaults to all calls on the test contract.

## Fork tests

```solidity
function setUp() public {
    vm.createSelectFork(vm.envString("RPC_URL"), 5_000_000);  // pin block
}

function testFork_RealUSDC() public {
    IERC20 usdc = IERC20(0xA0b8...c);
    address whale = 0x...;
    vm.prank(whale);
    usdc.transfer(alice, 100e6);
    assertEq(usdc.balanceOf(alice), 100e6);
}
```

Pinning the block makes the test deterministic. Forks honor `vm.prank` — pretend any address.

## Assertions

```solidity
assertEq(a, b);                    // ==
assertEq(a, b, "label on fail");
assertNotEq(a, b);
assertGt(a, b); assertGe(a, b);
assertLt(a, b); assertLe(a, b);
assertTrue(cond); assertFalse(cond);
assertApproxEqAbs(a, b, 100);      // |a-b| <= 100
assertApproxEqRel(a, b, 1e16);     // 1% rel
```

For arrays/bytes, `assertEq` overloads handle them.

## Running tests

```bash
forge test                           # all tests
forge test -vv                       # show emit + console.log
forge test -vvvv                     # show traces (most useful for debugging)
forge test --match-test test_Inc     # filter by name
forge test --match-contract Counter  # filter by contract
forge test --gas-report              # gas usage table
forge test --watch                   # rerun on change (dev only)
```

## Coverage

```bash
forge coverage --report lcov
```

Slow on large suites. Use `--match-contract` to scope.

## Common mistakes

- **`setup()` instead of `setUp()`** — silently not run as the hook. Tests will see uninitialized state.
- **`expectRevert` not directly before the call** — the cheat consumes the next external call only. A `console.log` in between can break it.
- **Forgetting `as` decimal suffix** — `1 ether` ≠ `1`. Use `1e18` or `1 ether`.
- **Asserting on `block.timestamp` without `vm.warp`** — default block time may be 1, not now.
- **Fuzz test with no `vm.assume`** — accepts inputs that overflow / are nonsensical, then "fails" on irrelevant edge cases.
- **Fork test without pinned block** — non-deterministic; passes one day, fails the next.
- **Re-deploying in every test** instead of `setUp()` — slower but sometimes necessary; just be intentional.
