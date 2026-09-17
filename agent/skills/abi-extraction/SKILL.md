---
name: abi-extraction
description: Extract a clean ABI JSON from a Foundry build artifact. Use whenever the frontend needs the ABI of a deployed contract or before generating wagmi typed hooks. Covers the standard `forge build && jq '.abi' out/<C>.sol/<C>.json` pattern.
---

# abi-extraction

## When to use

The frontend needs a contract's ABI for wagmi/viem. Source is the Foundry artifact, not handwritten files.

## Where Foundry puts the ABI

After `forge build`, every contract gets an artifact at:

```
/workspace/contracts/out/<ContractFile>.sol/<ContractName>.json
```

For `src/Counter.sol` with contract `Counter`:

```
/workspace/contracts/out/Counter.sol/Counter.json
```

The artifact is a large object with bytecode, sourcemap, etc. The ABI is one key inside it: `.abi`.

> If the contract name and file name differ (rare), the path uses the **file name** for the directory and the **contract name** for the JSON file. Example: `src/Tokens.sol` containing `contract MyToken {}` → `out/Tokens.sol/MyToken.json`.

## Extraction recipes

### Recipe A — preferred: `extract_abi` / `sync_abi_to_frontend` tools

If you're an agent, just call:

- `extract_abi("Counter")` → writes `/workspace/contracts/abi/Counter.json`
- `sync_abi_to_frontend("Counter")` → writes BOTH `/workspace/frontend/abi/Counter.json` AND `/workspace/frontend/abi/Counter.ts` (with a `counterAbi` const + `as const` for wagmi typing)

These tools always run `forge build --silent` first.

### Recipe B — raw shell

```bash
cd /workspace/contracts
forge build --silent
jq '.abi' out/Counter.sol/Counter.json > abi/Counter.json
```

### Recipe C — `forge inspect`

```bash
forge inspect Counter abi
```

Streams ABI JSON to stdout (no file written). Useful for piping into another tool.

## Generating typed wagmi hooks

For wagmi v2 + TypeScript, the ABI must be a `const` assertion so types are inferred:

```ts
// frontend/abi/Counter.ts (auto-written by sync_abi_to_frontend)
export const counterAbi = [
  /* ...ABI... */
] as const;
```

Then in a component:

```ts
'use client';
import { useReadContract } from 'wagmi';
import { counterAbi } from '../abi/Counter';
import { CONTRACT_ADDRESSES } from '../lib/contracts';

const SEPOLIA = 11155111 as const;

export function CurrentNumber() {
  const { data, isLoading } = useReadContract({
    abi: counterAbi,
    address: CONTRACT_ADDRESSES[SEPOLIA].Counter,
    functionName: 'number',
  });
  if (isLoading) return <span>...</span>;
  return <span>{String(data)}</span>;
}
```

## Common mistakes

- **Forgetting `as const`** — without it, wagmi cannot type-narrow `functionName` and you lose autocomplete + safety.
- **Reading from `out/<File>.sol/<File>.json` for the WRONG name** — use the contract name, not the filename, for the JSON file.
- **Stale ABI** — if you change the contract's external surface, re-run `forge build` (or `sync_abi_to_frontend`) before the frontend rebuild.
- **Committing `out/`** — that directory is build output, not source; it's gitignored. Only the extracted ABI under `frontend/abi/` should be committed.
