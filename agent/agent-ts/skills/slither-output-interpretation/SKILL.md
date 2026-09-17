---
name: slither-output-interpretation
description: Reference for Slither detector output — what each common detector means, common false positives, severity calibration, and the JSON output schema. Use when reading `slither` output during an audit.
---

# slither-output-interpretation

## When to use

Reading `slither` output (text or JSON). Triaging which findings are real vs noise. Suppressing false positives correctly.

## Run modes

```bash
cd /workspace/contracts
slither .                        # default: text output to stdout
slither . --json -               # JSON to stdout
slither . --json slither.json    # JSON to file
slither src/Counter.sol          # one file
slither . --filter-paths "test/|lib/"  # exclude paths
slither . --exclude naming-convention,solc-version  # disable detectors
```

## JSON output schema

```json
{
  "success": true,
  "results": {
    "detectors": [
      {
        "check": "reentrancy-eth",
        "impact": "High",
        "confidence": "Medium",
        "description": "Reentrancy in Vault.withdraw() ...",
        "elements": [
          { "type": "function", "name": "withdraw", "source_mapping": { "filename_relative": "src/Vault.sol", "lines": [42, 50] } }
        ],
        "id": "0xabcd..."
      }
    ]
  }
}
```

Key fields:
- `check` — detector name (use this to filter or suppress).
- `impact` — High / Medium / Low / Informational / Optimization.
- `confidence` — High / Medium / Low (Slither's certainty).
- `description` — multi-line human text.
- `elements` — affected source locations.

## Detector reference (common)

### High-impact

| Detector | Means | Common false positive |
|---|---|---|
| `reentrancy-eth` | External call before state change involving ETH | Reentrancy already prevented by `nonReentrant` guard — Slither doesn't always detect modifiers |
| `reentrancy-no-eth` | Same pattern without ETH (e.g., token reentry) | Same as above |
| `arbitrary-send` | ETH sent to user-controlled address | Intended (e.g., user withdraws to themselves) |
| `controlled-delegatecall` | `delegatecall` to user-controlled address | Almost always real — investigate carefully |
| `suicidal` | `selfdestruct` callable by anyone | Intentional in some patterns; otherwise CRITICAL |
| `unprotected-upgrade` | UUPS upgrade function with no auth | Almost always real |
| `delegatecall-loop` | `delegatecall` inside a loop | Often a real gas/auth issue |

### Medium-impact

| Detector | Means | Notes |
|---|---|---|
| `reentrancy-events` | Events emitted after external call (could mislead off-chain consumers) | Often informational; CEI on state changes is what matters |
| `reentrancy-benign` | State change after call but no economic impact | Style — fix when easy |
| `divide-before-multiply` | `(a / b) * c` precision loss | Real if values are economically meaningful |
| `dangerous-strict-equalities` | `==` on balance / state subject to change | Investigate — often real |
| `incorrect-equality` | Strict `==` on `block.timestamp` etc. | Use `>=` instead |
| `locked-ether` | Contract receives ETH but no withdraw path | Often intentional (escrow); confirm |
| `tx-origin` | `tx.origin` used in auth | Phishable; replace with `msg.sender` |
| `timestamp` | `block.timestamp` used in critical comparison | Acceptable for windows >15s; flag if used for randomness |
| `weak-prng` | `keccak256` of block data used for randomness | Real if value-bearing |
| `unused-return` | External call's return value ignored | May hide failures; check intent |
| `costly-loop` | Storage write inside a loop | Real if loop is unbounded |
| `boolean-cst` | `if (true)` or similar dead code | Code smell |
| `incorrect-modifier` | Modifier doesn't always run (e.g., conditional `_;`) | Investigate semantics |

### Low-impact / informational

| Detector | Means | Notes |
|---|---|---|
| `naming-convention` | Variable not lowerCamelCase, etc. | Style; suppress for legacy code |
| `solc-version` | Compiler version old / pinned strangely | Audit-time decision |
| `low-level-calls` | Use of `.call()` | Informational; ensure return value checked |
| `pragma` | Multiple pragma versions across files | Real for build hygiene |
| `assembly` | Inline assembly used | Audit assembly carefully |
| `external-function` | Public function could be external | Gas opt |
| `dead-code` | Unused private function | Cleanup |
| `unused-state` | State variable never read | Cleanup |

## Reading the text output

```
INFO:Detectors:
Reentrancy in Vault.withdraw() (src/Vault.sol#42-55):
        External calls:
        - msg.sender.call{value: amount}() (src/Vault.sol#48)
        State variables written after the call(s):
        - balances[msg.sender] = 0 (src/Vault.sol#50)
Reference: https://github.com/crytic/slither/wiki/Detector-Documentation#reentrancy-vulnerabilities
```

Parse:
- `Reentrancy in <function>` — the detector name + scope.
- `External calls:` — the trigger.
- `State variables written after` — the violation.
- `Reference:` — link to docs (always cite in audit reports).

## Common false positives

### `reentrancy-*` when `nonReentrant` is used

Slither matches by AST pattern; sometimes misses that a modifier prevents the issue. Verify manually:

```solidity
function withdraw() external nonReentrant {  // Slither may still flag
    (bool ok,) = msg.sender.call{value: balances[msg.sender]}("");
    require(ok);
    balances[msg.sender] = 0;
}
```

Suppress with comment:

```solidity
// slither-disable-next-line reentrancy-eth
// Justification: nonReentrant modifier prevents reentry; state change after call OK.
function withdraw() external nonReentrant {
    ...
}
```

### `timestamp` for long windows

```solidity
require(block.timestamp >= startTime, "Not started");  // 1-week window
```

Slither flags but miner manipulation (±15s) is irrelevant. Suppress with justification.

### `arbitrary-send` when destination is `msg.sender`

```solidity
function withdraw() external {
    payable(msg.sender).transfer(balance);   // Slither: arbitrary-send
}
```

Sending to `msg.sender` is "arbitrary" from Slither's view (could be any caller) but is intentional withdrawal. Suppress with justification.

## Suppressing detectors

Per-line:

```solidity
// slither-disable-next-line reentrancy-eth
function withdraw() external nonReentrant { ... }
```

Per-file (top of file):

```solidity
// slither-disable-start reentrancy-eth
contract Foo { ... }
// slither-disable-end reentrancy-eth
```

Globally — `slither.config.json`:

```json
{
  "detectors_to_exclude": "naming-convention,solc-version,timestamp"
}
```

ALWAYS document why a detector is suppressed — auditors will look for unjustified suppressions.

## Severity translation for the audit report

Slither's `impact` field maps roughly to:

| Slither | Audit report severity |
|---|---|
| High | High or Critical (judge based on exploitability) |
| Medium | Medium or Low |
| Low | Low or Informational |
| Informational | Informational |
| Optimization | Informational (gas section) |

Don't blindly translate — Slither tags conservatively. A `reentrancy-eth` on a function that's behind a `nonReentrant` guard is Informational, not High.

## Workflow

1. Run `slither . --json slither.json`.
2. Filter by `impact: "High"` first; manually verify each.
3. Then `Medium`, `Low`. Discard with justification or include.
4. Cross-reference with the audit-checklist skill for issues Slither doesn't catch (oracle manipulation, MEV, business logic).
5. Cite Slither findings in the audit report with `check` name and source location for traceability.

## Common mistakes

- **Treating Slither output as the audit** — Slither catches mechanical bugs. Logic bugs, oracle manipulation, economic exploits are out of scope.
- **Suppressing without justification** — looks like the auditor is hiding issues.
- **Ignoring `Informational` findings** — gas opts and naming are style but accumulate.
- **Trusting Slither over manual review** — Slither has known false negatives (cross-function reentrancy, complex inheritance).
- **Running Slither without the contract being compiled** — `slither` needs the build artifacts. Run `forge build` first or let Slither invoke it.
- **Forgetting `--filter-paths "test/|lib/"`** — noise from test contracts and dependencies floods the output.
