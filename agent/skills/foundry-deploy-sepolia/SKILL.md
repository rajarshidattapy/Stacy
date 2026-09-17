---
name: foundry-deploy-sepolia
description: Deploy a Foundry contract to the Sepolia testnet using credentials in /workspace/contracts/.env. Use when the user asks to deploy, broadcast, or push a contract on-chain. Always preferred over hand-rolled forge script commands.
---

# foundry-deploy-sepolia

## When to use

User wants to deploy a contract to **Sepolia** (chainId `11155111`). This is the only supported chain for the smart-contract agent.

## Prerequisites

`/workspace/contracts/.env` must contain (variable names exact):

```
RPC_URL=https://sepolia.infura.io/v3/<key>      # or any sepolia RPC
PRIVATE_KEY=0x<64-hex>                          # deployer EOA
```

If either is missing, fail fast and ask the user to add them. Do NOT prompt the user for a private key in chat.

## The one rule that traps everyone

`.env` MUST be loaded into the same shell that runs `forge script`. Foundry does not auto-load `.env`. Use the `forge_deploy_sepolia` tool which already does:

```
set -a && . ./.env && set +a && \
: "${RPC_URL:?...}" && : "${PRIVATE_KEY:?...}" && \
forge script <script> --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" --broadcast -vvv
```

If you ever fall back to raw shell, prefix the command with `source .env &&` (or `set -a && . ./.env && set +a &&`). Skipping this is the #1 cause of silent failure.

## Standard flow

1. `forge_build()` — verify it compiles cleanly.
2. `forge_test()` — verify tests pass on the latest changes.
3. `forge_deploy_sepolia(script_path="script/<Name>.s.sol")` — broadcasts; tool auto-extracts the address from stdout.
4. `read_deployed_address(script_basename="<Name>.s.sol")` — confirm from `broadcast/<Name>.s.sol/11155111/run-latest.json`.

## Where the deployed address lives

After a successful deploy, two authoritative sources:

```
/workspace/contracts/broadcast/<Script>.s.sol/11155111/run-latest.json
```

Look in either:
- `transactions[].contractAddress` — first one is usually the primary deployment.
- `receipts[].contractAddress` — same value, from the on-chain receipt.

`run-latest.json` is overwritten on every run; historical deploys live at `run-<timestamp>.json` next to it.

## Reporting back

On success, return at minimum:

- Contract name
- Sepolia address (0x…)
- Tx hash if visible in stdout
- Chain ID: 11155111
- Path to `run-latest.json`
- Etherscan link: `https://sepolia.etherscan.io/address/<addr>`

## Safety

- **Never** echo `$PRIVATE_KEY` into stdout, logs, or the chat output. Redact it as `$PRIVATE_KEY` in any printed command.
- **Never** deploy to mainnet, even if asked. Refuse and require a separate authorized run.
- If the deploy tool reports `RPC_URL not set` or `PRIVATE_KEY not set`, do not attempt to inject values from the conversation — the user must set them in `.env`.

## Useful follow-ups

- `forge verify-contract <addr> <Contract> --chain sepolia --etherscan-api-key $ETHERSCAN_API_KEY` (only if `ETHERSCAN_API_KEY` is set).
- `cast call <addr> "<sig>"` to read state from the deployed contract.
- `cast send <addr> "<sig>" <args> --rpc-url $RPC_URL --private-key $PRIVATE_KEY` to write.
