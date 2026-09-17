---
name: foundry-security-audit
description: Run a structured security audit on Solidity contracts in /workspace/contracts. Combines forge tests, slither static analysis, and a manual reentrancy/access-control/oracle/math checklist with severity-labeled findings.
---

# foundry-security-audit

## When to use

User asks for a security audit, vulnerability scan, "review for bugs", or wants to harden a contract before deploy.

## Audit pipeline

1. **Baseline tests** — `forge_test(verbosity=3)`. If anything fails, stop and fix first; auditing flaky tests gives noise.
2. **Static analysis** — `slither_audit()`. Tool installs slither lazily on first run. Capture and triage every finding.
3. **Manual review** — go through the checklist below for every external/public function.
4. **Report** — emit a single audit document, severity-labeled.

## Severity rubric

| Severity | Definition |
|---|---|
| CRITICAL | Drains funds, bricks contract, lets anyone become owner |
| HIGH | Steals from a specific user, locks user funds, breaks core invariant |
| MEDIUM | Griefing, gas DoS, partial loss, missing access check w/ low impact |
| LOW | Best-practice violation, suboptimal gas, missing event |
| INFO | Style, NatSpec, naming |

## Manual checklist (apply per external/public function)

### Reentrancy
- Does the function make any external call (`.call`, `.transfer`, `.send`, ERC-20 `transfer`, ERC-721 `safeTransferFrom`, callback hooks)?
- If yes: are state updates done **before** the external call? (checks-effects-interactions)
- If still risky: is `nonReentrant` (OpenZeppelin) or a manual mutex applied?

### Access control
- Is the caller checked? (`onlyOwner`, role check, signature check)
- Is the check `msg.sender`, NOT `tx.origin`?
- Does `transferOwnership` use a two-step pattern, or is it single-step (risk of typo'd address)?

### Integer math
- Solidity 0.8.x has built-in overflow checks. Are any `unchecked { }` blocks present? If yes, audit each one — comment must justify.
- Division: any chance of div-by-zero? Validate explicitly.
- Casting: `uint256` → `uint128` truncates silently — is the value guaranteed to fit?

### External calls
- Any `.call{value: x}("")` whose return value is ignored? That's a bug.
- Any callback (ERC-721 receive, ERC-1155 receive, custom hook) — does it trust the caller? Should it?
- Cross-contract calls: does the called contract have a known interface, or could it be a malicious proxy?

### Oracle / time / block deps
- `block.timestamp` for randomness? Bad.
- `block.number` for time? Bad on L2 (block times vary).
- Single-source price oracle? Should be Chainlink + heartbeat check.

### Upgradeability
- If proxy pattern: is the implementation locked? (constructor `_disableInitializers()` for OZ Initializable.)
- Storage layout: any state vars added in a non-final position that would shift slots in v2?

### Signature replay
- Any `ecrecover` or EIP-712 sig verification?
- Are nonces tracked? Is `chainid` in the digest? Is the signature scoped to a specific contract address?

### DoS & gas
- Any unbounded loop over user-supplied arrays? Cap the input or paginate.
- Sending ETH to a list of addresses where one can revert?

## Slither focus areas

After `slither_audit()`, prioritize:
- `reentrancy-eth`, `reentrancy-no-eth`, `reentrancy-events`
- `arbitrary-send-eth`, `controlled-delegatecall`, `delegatecall-loop`
- `unchecked-transfer`, `unchecked-send`, `unchecked-lowlevel`
- `tx-origin`, `suicidal`
- `incorrect-equality`, `dangerous-strict-equalities`

## Report format

```
# Audit: <Contract>.sol — <date>

## Summary
- Tests: <n> passed, <m> failed
- Slither: <n> findings (C:0 H:1 M:2 L:5 I:11)
- Manual: <n> issues

## Findings

### [HIGH-1] <Title>
- File: src/Foo.sol:42
- Description: ...
- Impact: ...
- Recommendation: ...
- Suggested fix: <code block>

(... repeat per finding, sorted by severity)

## Recommendations
- <highest-leverage hardening steps>
```
