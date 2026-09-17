---
name: forge-deployment-troubleshooting
description: Diagnose and recover from `forge script ... --broadcast` failures on Sepolia. Covers env loading, RPC errors, gas/nonce issues, broadcast file recovery, and partial-deploy resumption.
---

# forge-deployment-troubleshooting

## When to use

A `forge script` deploy failed, partially succeeded, or behaved unexpectedly. Or you're about to deploy and want to avoid the common traps.

## Pre-flight checklist

Before invoking the deploy:

1. `cd /workspace/contracts` — `forge script` resolves paths relative to project root.
2. Confirm `.env` exists with `RPC_URL` and `PRIVATE_KEY`.
3. Source it: `source .env` (NOT `. .env` from a subshell — `forge script` sees the env of its parent shell).
4. Sanity-check funds: `cast balance $(cast wallet address $PRIVATE_KEY) --rpc-url $RPC_URL`.
5. Verify chain: `cast chain-id --rpc-url $RPC_URL` → expect `11155111` for Sepolia.

## Standard deploy invocation

```bash
cd /workspace/contracts
source .env
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  -vvvv
```

Add `--verify --etherscan-api-key $ETHERSCAN_API_KEY` when verification on Etherscan is wanted.

## Failure mode — `.env not sourced`

Symptom: `Error: missing rpc url` or `EmptyAccount`.

Fix: Always `source .env` in the same shell as `forge script`. If using the `bash` tool, the command must be `cd contracts && source .env && forge script ...` — chained, not separate calls.

## Failure mode — RPC errors

Symptom: `error sending request for url`, `connection closed`, `503`, `gateway timeout`.

Diagnose:

```bash
cast block-number --rpc-url $RPC_URL
```

If that hangs or errors, the RPC endpoint is the problem. Try a fallback (Alchemy / Infura / public Sepolia RPC). Public RPCs rate-limit aggressively — use a personal API key URL.

## Failure mode — gas too low

Symptom: `transaction underpriced` or `replacement transaction underpriced`.

Fix: Add `--gas-price <wei>` or `--with-gas-price <wei>` (script-level). Sepolia base fee is usually < 10 gwei but spikes happen. Query current:

```bash
cast gas-price --rpc-url $RPC_URL
```

Then bump 1.5× when retrying.

## Failure mode — nonce mismatch

Symptom: `nonce too low` or `nonce too high`.

Cause: A previous deploy partially broadcast, or another tx sent from the same key, and the local nonce is stale.

Fix: Let foundry re-fetch nonce by adding `--slow` (sequential, awaits each tx). Or explicitly:

```bash
cast nonce $(cast wallet address $PRIVATE_KEY) --rpc-url $RPC_URL
```

Compare against what `forge script` is using (visible with `-vvvv`).

## Reading broadcast files

After a `--broadcast` run (full or partial), Foundry writes:

```
/workspace/contracts/broadcast/<Script>.s.sol/<chainId>/run-latest.json
/workspace/contracts/broadcast/<Script>.s.sol/<chainId>/run-<timestamp>.json
```

Structure (truncated):

```json
{
  "transactions": [
    {
      "hash": "0x...",
      "transactionType": "CREATE",
      "contractName": "Counter",
      "contractAddress": "0xabc...",
      "function": null,
      "arguments": []
    }
  ],
  "receipts": [
    { "transactionHash": "0x...", "status": "0x1", "blockNumber": "0x..." }
  ]
}
```

To extract a deployed address by name:

```bash
jq -r '.transactions[] | select(.contractName=="Counter") | .contractAddress' \
  broadcast/Deploy.s.sol/11155111/run-latest.json
```

A receipt with `"status": "0x0"` means the tx reverted on-chain — even though it was mined, the deploy failed.

## Failure mode — partial deploy

The script was running multiple deploys; the first succeeded, the second reverted.

Recovery:

1. Inspect the broadcast file: which transactions have receipts, which don't.
2. The transactions with receipts are on-chain — their addresses are real and persisted.
3. For the rest, fix the script (e.g., constructor arg) and re-run with `--resume`:

```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $RPC_URL --private-key $PRIVATE_KEY \
  --broadcast --resume
```

`--resume` re-uses the latest broadcast file, skipping txs that already succeeded.

## Persisting addresses

After successful deploy, persist to a deterministic location:

```bash
mkdir -p .deployments
jq -r '.transactions[] | select(.contractName=="Counter") | .contractAddress' \
  broadcast/Deploy.s.sol/11155111/run-latest.json > .deployments/Counter.address
```

Or use the `read_deployed_address("Counter")` tool which does this.

## Verification on Etherscan

Add to deploy:

```
--verify --etherscan-api-key $ETHERSCAN_API_KEY
```

If verification fails post-deploy, retry standalone:

```bash
forge verify-contract <address> src/Counter.sol:Counter \
  --chain-id 11155111 \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

Constructor args matter — pass via `--constructor-args $(cast abi-encode "constructor(uint256)" 42)`.

## Common mistakes

- **Logging `PRIVATE_KEY`** — never `echo $PRIVATE_KEY` or include in stdout. Treat as secret.
- **Hardcoding network in script** — use `block.chainid` or pass via env. Don't bake mainnet/sepolia choice into script literals.
- **Forgetting `vm.startBroadcast()`** in the script — without it, `forge script` simulates only, no transactions sent.
- **`--broadcast` to mainnet by accident** — always `cast chain-id --rpc-url $RPC_URL` first. Sepolia is `11155111`. Mainnet is `1`.
- **Re-running without `--resume`** — re-deploys everything fresh, wasting funds and producing duplicate contract addresses.
- **Sourcing `.env` in subshell** — `( source .env && forge script ... )` works; `source .env; forge script ...` works; `bash -c 'source .env && ...'` works. But `source .env` in one tool call and `forge script` in the next does NOT — env is lost.
