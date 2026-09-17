---
name: viem-client-config
description: Configure viem clients — public/wallet, transports, chains, accounts. Use when setting up direct viem usage (server-side, scripts, or non-React contexts). For React, prefer wagmi hooks.
---

# viem-client-config

## When to use

Server-side scripts that read or write the chain. Non-React frontends. Background workers. Inside wagmi for advanced cases. For typical React UI, wagmi's hooks wrap viem and are the higher-level path.

## Why viem (over ethers)

- Tree-shakable: import only what you use; small bundles.
- Strong TypeScript: `as const` ABI inference everywhere.
- Modular: separate `publicClient` (read) and `walletClient` (write) clients.
- Modern: built around viem's transport + chain abstractions.

## Public client (read-only)

```ts
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http('https://sepolia.infura.io/v3/YOUR_KEY'),
});

const blockNumber = await publicClient.getBlockNumber();
const balance = await publicClient.getBalance({ address: '0x...' });
```

`http()` is the default transport. It batches RPC calls for efficiency.

## Wallet client (sign + write)

Two flavors: with a private key (server-side) or with an injected provider (browser).

### Private key (server)

```ts
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

const account = privateKeyToAccount('0xabc...');

export const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http('https://sepolia.infura.io/v3/YOUR_KEY'),
});

const hash = await walletClient.sendTransaction({
  to: '0xrecipient...',
  value: parseEther('0.01'),
});
```

NEVER hardcode the key. Read from env: `process.env.PRIVATE_KEY`.

### Browser injected (window.ethereum)

```ts
import { createWalletClient, custom } from 'viem';
import { sepolia } from 'viem/chains';

export const walletClient = createWalletClient({
  chain: sepolia,
  transport: custom(window.ethereum!),
});

const [account] = await walletClient.getAddresses();
```

For wagmi-managed apps, this is handled internally; don't create your own walletClient.

## Transports

```ts
import { http, webSocket, fallback } from 'viem';

http('https://...')                              // default polling
http('https://...', { batch: true })             // batch multiple calls per HTTP request
webSocket('wss://...')                           // event subscriptions
fallback([http('https://primary'), http('https://backup')])   // failover
```

For event-heavy apps (lots of `useWatchContractEvent`), prefer `webSocket`. For one-off reads, `http`.

## Chain config

Use built-in chains:

```ts
import { mainnet, sepolia, base, optimism, arbitrum } from 'viem/chains';
```

Custom chain (e.g., local Anvil):

```ts
import { defineChain } from 'viem';

export const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://localhost:8545'] } },
});
```

## Reading contract data

```ts
import { counterAbi } from './abi/Counter';

const count = await publicClient.readContract({
  address: '0xabc...',
  abi: counterAbi,
  functionName: 'number',
});
// count: bigint (typed via `as const` ABI)
```

## Writing to a contract

```ts
const hash = await walletClient.writeContract({
  address: '0xabc...',
  abi: counterAbi,
  functionName: 'increment',
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(receipt.status); // 'success' | 'reverted'
```

`writeContract` returns the tx hash immediately. Use `waitForTransactionReceipt` to confirm.

## Simulation

```ts
const { request } = await publicClient.simulateContract({
  account,
  address: '0xabc...',
  abi: counterAbi,
  functionName: 'increment',
});

// request is a typed transaction object — pass to writeContract
const hash = await walletClient.writeContract(request);
```

`simulate` runs the call against current state; throws on revert. Catches issues before broadcasting.

## Decoding events

```ts
import { decodeEventLog } from 'viem';

const logs = await publicClient.getLogs({
  address: '0xabc...',
  event: {
    type: 'event',
    name: 'NumberSet',
    inputs: [{ type: 'address', indexed: true, name: 'by' }, { type: 'uint256', name: 'value' }],
  },
  fromBlock: 5_000_000n,
  toBlock: 'latest',
});

for (const log of logs) {
  const decoded = decodeEventLog({
    abi: counterAbi,
    data: log.data,
    topics: log.topics,
  });
  console.log(decoded.eventName, decoded.args);
}
```

## Units

```ts
import { parseEther, formatEther, parseUnits, formatUnits } from 'viem';

parseEther('0.01')              // bigint: 10000000000000000n
formatEther(10000000000000000n) // '0.01'
parseUnits('100', 6)            // bigint for USDC (6 decimals)
formatUnits(100000000n, 6)      // '100'
```

Always use these for ETH/token math. Never use `Number()` on big values.

## Encoding / decoding

```ts
import { encodeAbiParameters, decodeAbiParameters, encodeFunctionData } from 'viem';

const calldata = encodeFunctionData({
  abi: counterAbi,
  functionName: 'set',
  args: [42n],
});
// calldata: 0x...
```

Useful for batched/multicall transactions.

## Common mistakes

- **Mixing `bigint` and `number`** — viem returns `bigint` for uint256. `Number(huge)` loses precision past 2^53.
- **Reusing one `walletClient` across multiple chains** — clients are chain-scoped. Create per-chain.
- **No error handling on `waitForTransactionReceipt`** — receipts can have `status: 'reverted'` and you'll silently treat as success unless checked.
- **Using public RPC endpoints in production** — rate limits hit fast. Use a key-gated provider.
- **Forgetting `account` on `simulateContract`** — without an account, simulation runs as `address(0)`, which may pass auth checks unrealistically.
- **Hardcoding chain IDs** — use the chain object's `.id` (`sepolia.id` = `11155111`).
- **Not importing `as const` ABIs** — types collapse, autocomplete breaks.
- **Using `eth_sendTransaction` directly via custom transport** — bypasses viem's typing. Use `walletClient.writeContract` or `sendTransaction`.
