---
name: audit-checklist
description: Comprehensive audit walkthrough — external calls, access control, arithmetic, storage, oracles, time/randomness, DoS, MEV, reentrancy, signature replay. Use as the structured checklist when auditing any contract.
---

# audit-checklist

## When to use

Performing a security audit on `/workspace/contracts/`. Walk through each category. For every "look for" item, locate matching code; if found, write a finding with severity.

## Severity calibration

| Severity | Definition |
|---|---|
| Critical | Funds at immediate risk; trivially exploitable |
| High | Funds at risk under realistic conditions; or full takeover |
| Medium | Limited fund risk; or significant trust assumption broken |
| Low | Best-practice violations; non-economic impact |
| Informational | Code clarity, gas, style |

## 1. External calls

Look for:
- Low-level: `.call`, `.delegatecall`, `.staticcall`. Each is a callout boundary.
- High-level: `IExternal(addr).foo()`. Trust assumption on `addr`.
- Token interactions: `IERC20.transfer/transferFrom/approve`. ERC777 hooks can re-enter.
- ETH sends: `transfer()`, `send()` (gas-limited, may break smart wallets), `call{value:}` (preferred + CEI/guard).

Findings:
- Check return value: `(bool ok,) = addr.call(...); require(ok);`. Discarded return = silent failure (HIGH).
- Forwarded gas: `call{gas: 100_000}(...)` may underprice complex callees (MEDIUM).
- Untrusted target with `delegatecall` = full takeover (CRITICAL).
- `address(0)` checks on external recipients (LOW).

## 2. Access control

Look for:
- `onlyOwner`, `onlyRole`, custom modifiers. Confirm every privileged function has one.
- Public/external functions that mutate state. Each must have justification for being callable by anyone.
- `tx.origin` — almost always wrong; phishable (HIGH).
- Setters for critical params (fees, oracle addresses, admin) — gated and ideally timelocked.
- `renounceOwnership` available — risk of permanent lockout (MEDIUM if intentional, otherwise comment).

Findings:
- Missing modifier on a setter (HIGH).
- `Ownable` instead of `Ownable2Step` — wrong-address transfer risk (LOW-MEDIUM).
- Single-step admin transfer with no recovery (MEDIUM).
- Initializer not protected (`initializer` modifier missing) (HIGH for upgradeable).

## 3. Arithmetic

Look for:
- 0.8+ checked math is default. `unchecked` blocks bypass — verify safety per-block.
- Division before multiplication (precision loss): `(a / b) * c` vs `(a * c) / b`.
- Casting truncation: `uint128(largeUint256)` silently truncates.
- Mul-then-div with potential overflow in intermediate.
- Fixed-point precision: `1e18`, `1e6` — mixing decimals between tokens.

Findings:
- `unchecked` on user-controlled input without bounds check (HIGH).
- `(amount / total) * shares` instead of `(amount * shares) / total` (MEDIUM).
- Implicit downcast losing data (HIGH if value-bearing).

## 4. Storage

Look for:
- Uninitialized storage (proxies without `initialize` call) → anyone can claim ownership (CRITICAL).
- Struct packing assumptions in upgradeable contracts (MEDIUM if breaks layout).
- Storage gaps in upgradeable contracts (`uint256[50] __gap`). Missing = upgrade-time collision (MEDIUM-HIGH).
- Mappings inside structs (not copied — reference semantics).
- Public state variables auto-generate getters; treat as part of external surface.

Findings:
- Missing `__gap` (MEDIUM).
- Reordered storage between V1 and V2 (CRITICAL if deployed).
- Initializer callable multiple times (HIGH).

## 5. Oracles

Look for:
- Single-source price (e.g., reading Uniswap V2 spot reserves without TWAP) → manipulable (HIGH).
- Stale price acceptance: Chainlink `latestAnswer()` without `updatedAt` check.
- Heartbeat tolerance: oracle silent for >24h still trusted (MEDIUM).
- Oracle decimals confusion (Chainlink USD feeds = 8 decimals).
- L2 sequencer uptime checks missing on L2-deployed oracles.

Findings:
- Spot-price oracle for borrow accounting (CRITICAL).
- No staleness check (HIGH).
- Single-oracle dependency for liquidations (MEDIUM-HIGH).

## 6. Time & randomness

Look for:
- `block.timestamp` for short windows (<15 min) — miner can adjust ±15s (LOW; HIGH if used as randomness).
- `block.number` as proxy for time — varies by chain (1s on Base, 12s on Mainnet).
- On-chain RNG: `keccak256(block.timestamp, block.difficulty, ...)` — predictable (HIGH if value-bearing).
- Use VRF (Chainlink) or commit-reveal for randomness.

Findings:
- Pseudo-RNG in NFT mint (CRITICAL — predictable rare outputs).
- Time-window logic with miner-manipulable buffer (varies).

## 7. DoS vectors

Look for:
- Unbounded loops over user-controllable arrays. Push-style payouts iterating over recipients = blockable.
- Gas griefing: a malicious recipient reverts on `transfer`, halting batch.
- Storage growth without cleanup (gas costs grow over time).
- External calls inside loops without try/catch.

Findings:
- Push payment loop with no per-recipient gas isolation (HIGH).
- Auction extension loop callable by anyone, no max iterations (HIGH).
- Mass-action whitelist iterated on every call (MEDIUM).

## 8. Front-running / MEV

Look for:
- Slippage protection on swaps/swaps-equivalent (`amountOutMin`).
- Auctions / mints without commit-reveal — sandwich opportunity.
- `permit` signatures consumed atomically (no separate `permit` then `transferFrom`).
- Approve race condition (`approve(B, X)` while pending `approve(B, Y)`); use `increaseAllowance` or set to 0 first.

Findings:
- No `amountOutMin` on swap (HIGH).
- Mint price discovery without anti-sandwich (MEDIUM).

## 9. Reentrancy

Look for:
- Functions with external calls that mutate state AFTER. CEI violation.
- `nonReentrant` missing on functions with `.call{value:}`.
- Cross-function reentrancy: state shared between functions, not all guarded.
- Read-only reentrancy: view functions consumed by other contracts mid-callback.
- ERC777 / fee-on-transfer tokens triggering callbacks.

Findings:
- Withdraw without CEI and without guard (CRITICAL).
- ERC721 `safeMint` callback used in mint logic (HIGH if not guarded).
- View function returning stale price during callback (HIGH if consumed by lending).

## 10. Signature replay

Look for:
- EIP-712 domain separator including `chainid` and `address(this)`.
- Nonce per signer to prevent re-use.
- `deadline` field with `block.timestamp` check.
- Replay across chains (missing `chainid`) or across contracts (missing `address(this)`).

Findings:
- `permit` without deadline (HIGH).
- Domain separator without chainid (HIGH — replayable across forks).
- Static nonce or no nonce (CRITICAL).

## 11. Initialization (proxies)

Look for:
- `initialize()` callable by anyone first time → race in mempool (HIGH).
- `_disableInitializers()` in implementation constructor.
- Reinitialization gates (`reinitializer(2)`).

## 12. Upgrade safety

Look for:
- UUPS without `_authorizeUpgrade` override (anyone upgrades) (CRITICAL).
- Storage gap correctness across versions.
- Old logic still callable on proxy (no `selfdestruct` allowed post-Cancun).

## 13. Token-specific (if ERC20/721/1155)

ERC20:
- Approve race (above).
- Fee-on-transfer token assumptions (use balance-after-balance-before).
- Decimals = 18 assumption (USDC = 6).

ERC721:
- `_mint` vs `_safeMint` (`safe` invokes callback → reentrancy vector).
- `tokenURI` returning data accidentally exposing private info.

ERC1155:
- Batch transfer atomicity.

## 14. General code smells

- TODOs/FIXMEs in production code.
- Dead code / unreachable branches.
- Magic numbers without `constant` declarations.
- Functions >200 lines (refactor or audit harder).
- Missing events for state changes (monitoring gaps).

## Final report structure

For each finding:
- Title
- Severity
- Location (file:line)
- Impact (what an attacker can do)
- Recommendation (concrete fix)
- Severity rationale

Conclude with a methodology section listing tools used (slither, manual review, scope/exclusions).

## Common mistakes (auditor-side)

- **Stopping at the first issue** — high-severity bugs often cluster. Continue the full pass.
- **Trusting the README** — it describes intent. Audit verifies actual code.
- **Skipping test files** — tests sometimes reveal known-but-unfixed assumptions.
- **Marking everything critical** — calibrate vs realistic exploit cost. Inflated severity erodes trust.
- **Manual-only or tool-only** — use both. Slither catches mechanical issues; humans catch business-logic issues.
- **Auditing without the protocol's threat model** — what's centrally controlled vs decentralized affects severity.
