---
name: solidity-production
description: Production-grade Solidity patterns for Foundry projects. Use when writing or refactoring contracts that will be deployed to a public testnet or mainnet — covers SPDX, NatSpec, custom errors, checks-effects-interactions, access control, events, and immutability.
---

# solidity-production

## Overview

Standards for production Solidity in this repo's Foundry project (`/workspace/contracts`).

## Required on every contract

1. **License + pragma** — `// SPDX-License-Identifier: MIT` (or UNLICENSED if matching repo). Pin pragma to `^0.8.x` matching the existing repo. Do not bump.
2. **NatSpec** — `/// @title`, `/// @notice`, `/// @dev` on contract; `/// @notice` + `/// @param` + `/// @return` on every public/external function.
3. **Custom errors** — `error InsufficientBalance(uint256 have, uint256 need);` not `require(... , "msg")`. Cheaper + structured.
4. **Events** on every state-changing external/public function. Include indexed `address` topics for filtering.
5. **Visibility** — explicit `public` / `external` / `internal` / `private` on every function and state var.
6. **Mutability** — `view` / `pure` correctly. State vars `immutable` if set in constructor only; `constant` if compile-time literal.
7. **Reentrancy** — for any function that calls external + writes state, follow checks-effects-interactions, or use OpenZeppelin's `ReentrancyGuard` (only if already in `lib/`).

## Forbidden

- `tx.origin` for auth (use `msg.sender`).
- `selfdestruct` (deprecated; gas refunds removed).
- Unchecked `(bool ok, ) = addr.call{value: amount}("");` without verifying `ok` and adding a NatSpec comment justifying the low-level call.
- Inline string revert messages (use custom errors).
- Untyped `uint`, `int` (use `uint256`, `int256`).
- `block.timestamp` for randomness or strict timing (>15s drift tolerance is OK).

## Access control

- Single-owner: import `lib/openzeppelin-contracts/contracts/access/Ownable.sol` ONLY if already vendored. Otherwise write a minimal `error NotOwner()` + `modifier onlyOwner()` pattern.
- Multi-role: `AccessControl` from OpenZeppelin (only if vendored).
- Always emit `OwnershipTransferred` or role events.

## Math

- 0.8.x has built-in overflow checks. Use `unchecked { ++i; }` only inside well-bounded loops, with a comment.
- For division-by-zero, validate explicitly and revert with a custom error.

## Tests (Foundry)

- Every public/external function has a `test_<Name>_HappyPath`, `test_<Name>_Reverts_<Reason>`, and at least one `testFuzz_<Name>` if it takes parameters.
- `setUp()` deploys fresh state per test.
- Use `vm.expectRevert(MyContract.MyError.selector)` for custom errors.
- Use `vm.prank(addr)` for caller spoofing; `vm.deal(addr, value)` to fund.

## Deployment scripts

- Inherit `Script`, wrap deploy in `vm.startBroadcast()` / `vm.stopBroadcast()`.
- Read configuration with `vm.envAddress`, `vm.envUint`, never with hard-coded testnet keys.
- Emit a `console2.log` line with the deployed address so it appears in stdout AND in `broadcast/<Script>.s.sol/<chain>/run-latest.json`.

## Pre-merge checklist

Before reporting "done":

- [ ] `forge fmt --check` passes
- [ ] `forge build --sizes` passes (no contract over 24KB unless intentional)
- [ ] `forge test -vvv` passes with no skipped tests
- [ ] Every external/public function has NatSpec
- [ ] Every state-mutating function emits an event
- [ ] No revert strings remain (only custom errors)

## Useful one-liners

```bash
forge build --sizes
forge test -vvv
forge fmt --check
forge snapshot
forge inspect <Contract> abi
forge inspect <Contract> bytecode
forge inspect <Contract> storageLayout
```
