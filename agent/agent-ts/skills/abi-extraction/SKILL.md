---
name: abi-extraction
description: Extract a clean ABI JSON from a Foundry build artifact. Use whenever the frontend needs the ABI of a deployed contract or before generating wagmi typed hooks. Covers `forge build && jq '.abi'` and `forge inspect` patterns.
---

# abi-extraction

## When to use

Frontend needs a contract's ABI for wagmi/viem. Source is the Foundry artifact, not handwritten files. Run after any change to the contract's external surface (functions, events, errors).

## Where Foundry puts the ABI

After `forge build`, every contract gets an artifact at:

```
/workspace/contracts/out/<ContractFile>.sol/<ContractName>.json
```

For `src/Counter.sol` with `contract Counter`:

```
/workspace/contracts/out/Counter.sol/Counter.json
```

The artifact is a large object with bytecode, sourcemap, etc. The ABI is one key inside it: `.abi`.

> If contract name ≠ file name (rare), the path uses the **file name** for the directory and the **contract name** for the JSON file. Example: `src/Tokens.sol` containing `contract MyToken {}` → `out/Tokens.sol/MyToken.json`.

## Extraction recipes

### Recipe A — preferred: `extract_abi` tool

Call directly:

```
extract_abi("Counter.sol", "Counter")
```

Writes `/workspace/contracts/.deployments/Counter.abi.json`. Always runs `forge build --silent` first.

### Recipe B — `forge inspect`

```bash
forge inspect Counter abi
```

Streams ABI JSON to stdout (no file written). Useful for piping. No build required if artifacts fresh.

### Recipe C — raw shell with `jq`

```bash
cd /workspace/contracts
forge build --silent
mkdir -p .deployments
jq '.abi' out/Counter.sol/Counter.json > .deployments/Counter.abi.json
```

## Discovering contracts dynamically

When the contract name isn't known up-front:

```bash
# List all compiled contracts
ls out/
# Each subdir is <File>.sol/, contains <Contract>.json files
find out -maxdepth 2 -name '*.json' ! -name '*.metadata.json'
```

Or call the `list_contracts()` tool which parses `src/**/*.sol` for `contract X` declarations.

## Generating typed wagmi hooks

For wagmi v2 + TypeScript, the ABI must be a `const` assertion so types are inferred:

```ts
// frontend/src/abi/Counter.ts
export const counterAbi = [
  /* ...ABI contents... */
] as const;
```

Then in a component:

```ts
import { useReadContract } from 'wagmi';
import { counterAbi } from '../abi/Counter';
import { addresses } from '../lib/addresses';

const SEPOLIA = 11155111 as const;

export function CurrentNumber() {
  const { data, isLoading } = useReadContract({
    abi: counterAbi,
    address: addresses[SEPOLIA].Counter,
    functionName: 'number',
  });
  if (isLoading) return <span>...</span>;
  return <span>{String(data)}</span>;
}
```

The Integration agent's `sync_abi_to_frontend(contractName)` tool handles the JSON copy. If you also want the typed `as const` TS file, write it explicitly.

## When to refresh

Re-run extraction after:
- Adding/removing a function
- Changing a function signature (params, return, mutability)
- Adding/removing an event
- Adding/removing a custom error
- Changing a public variable (auto-generates a getter)

Internal-only refactors (private/internal functions) do not need ABI refresh.

## Verifying the ABI

Quick sanity check:

```bash
jq 'length, [.[] | .type] | unique' .deployments/Counter.abi.json
# Expect numbers + ["constructor","error","event","function"]
```

Function-only count:

```bash
jq '[.[] | select(.type=="function")] | length' .deployments/Counter.abi.json
```

## Common mistakes

- **Forgetting `as const`** — without it, wagmi cannot type-narrow `functionName` and you lose autocomplete + safety.
- **Reading from `out/<File>.sol/<File>.json` for the WRONG name** — use the contract name, not the filename, for the JSON file (e.g., `out/Tokens.sol/MyToken.json`, not `Tokens.json`).
- **Stale ABI** — after editing the contract, re-run `forge build` (or the `extract_abi` tool) before using the ABI. The frontend will silently send wrong calldata otherwise.
- **Committing `out/`** — that directory is build output. It's gitignored. Only the extracted ABI under `.deployments/` (or the frontend `abi/`) should be committed.
- **Using `--force`** — `forge build --force` recompiles everything. Don't use unless you suspect cache corruption; it's slow.
- **Running from wrong cwd** — `forge build` must run inside `/workspace/contracts/`. From elsewhere it errors with "no foundry.toml".
