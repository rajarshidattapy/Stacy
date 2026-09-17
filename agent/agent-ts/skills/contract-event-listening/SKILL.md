---
name: contract-event-listening
description: Listen to contract events with wagmi/viem — useWatchContractEvent, getLogs, polling vs WebSocket, debouncing. Use when UI needs to update on on-chain events.
---

# contract-event-listening

## When to use

UI must reflect on-chain state changes (new mints, transfers, settled trades). Indexing a slice of history. Building a feed or activity log.

## Three patterns

| Pattern | Tool | Use case |
|---|---|---|
| Live (push) | `useWatchContractEvent` (WebSocket) | UI updates as events happen |
| Live (poll) | `useWatchContractEvent` (HTTP) | Same, but without WS |
| Historical | `publicClient.getLogs` | Backfill or one-time query |

## Live listening — wagmi hook

```tsx
import { useWatchContractEvent } from 'wagmi';
import { counterAbi } from '../abi/Counter';
import { addresses } from '../lib/addresses';

const SEPOLIA = 11155111 as const;

export function CountWatcher() {
  useWatchContractEvent({
    address: addresses[SEPOLIA].Counter,
    abi: counterAbi,
    eventName: 'NumberSet',
    onLogs: (logs) => {
      logs.forEach(log => {
        console.log('NumberSet by', log.args.by, '=', log.args.value);
      });
    },
  });
  return null;
}
```

Each `log` is decoded; `log.args` is typed via the `as const` ABI.

### Filtering by indexed args

```tsx
useWatchContractEvent({
  address: addresses[SEPOLIA].Counter,
  abi: counterAbi,
  eventName: 'Transfer',
  args: { from: userAddress },     // only events where from = userAddress
  onLogs: (logs) => { ... },
});
```

Only `indexed` event params can be filtered server-side.

## WebSocket vs HTTP transport

If wagmi's transport is `http(...)`, watching polls (every block, ~12s on mainnet, ~12s on Sepolia). Latency-sensitive UIs feel sluggish.

Switch to WebSocket:

```ts
// src/lib/wagmi.ts
import { webSocket } from 'wagmi';

createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: webSocket('wss://sepolia.infura.io/ws/v3/YOUR_KEY') },
});
```

Or fallback (WS preferred, http as backup):

```ts
import { http, webSocket, fallback } from 'wagmi';

transports: {
  [sepolia.id]: fallback([
    webSocket('wss://...'),
    http('https://...'),
  ]),
}
```

Many providers (Alchemy, Infura) require explicit WS endpoint URLs separate from HTTP.

## Historical — getLogs

For backfill or one-shot history queries:

```ts
import { publicClient } from './lib/viem';
import { counterAbi } from './abi/Counter';

const logs = await publicClient.getLogs({
  address: '0xabc...',
  event: counterAbi.find(x => x.type === 'event' && x.name === 'NumberSet') as any,
  fromBlock: 5_000_000n,
  toBlock: 'latest',
});
```

Or with viem's `parseAbiItem`:

```ts
import { parseAbiItem } from 'viem';

const logs = await publicClient.getLogs({
  address: '0xabc...',
  event: parseAbiItem('event NumberSet(address indexed by, uint256 value)'),
  fromBlock: 5_000_000n,
  toBlock: 'latest',
});
```

### Block range limits

Public RPCs typically cap `getLogs` at 10k blocks per request. For larger spans, chunk:

```ts
async function getLogsChunked(from: bigint, to: bigint, chunk = 10000n) {
  const all = [];
  for (let start = from; start <= to; start += chunk) {
    const end = start + chunk - 1n > to ? to : start + chunk - 1n;
    all.push(...await publicClient.getLogs({ address, event, fromBlock: start, toBlock: end }));
  }
  return all;
}
```

## Decoding without a hook

```ts
import { decodeEventLog } from 'viem';

const decoded = decodeEventLog({
  abi: counterAbi,
  data: log.data,
  topics: log.topics,
});
// decoded.eventName, decoded.args
```

Useful when you have raw logs from `getLogs` with multiple event types.

## Debouncing

Bursts of events (e.g., a batch transfer) trigger many onLogs callbacks in quick succession. Debounce UI updates:

```tsx
import { useDebounce } from '../hooks/useDebounce';

const [latestLogs, setLatestLogs] = useState<Log[]>([]);
const debouncedLogs = useDebounce(latestLogs, 500);

useWatchContractEvent({
  ...,
  onLogs: (logs) => setLatestLogs(prev => [...prev, ...logs]),
});

useEffect(() => {
  // run once per debounced batch
  updateUI(debouncedLogs);
}, [debouncedLogs]);
```

Or aggregate in `onLogs` and trigger a single `refetch()` on the affected `useReadContract`.

## Reorg handling

Recent blocks can re-organize. For UX-critical state (balance, NFT ownership), wait N confirmations before treating as final:

```ts
const { data: receipt } = useWaitForTransactionReceipt({
  hash,
  confirmations: 3,        // wait 3 blocks
});
```

For event watching, no built-in reorg detection. If users report stale UI, check whether your event logic is rebroadcasting reorged events.

## When to skip listening — use an indexer

For >100 historical events, complex aggregations, or cross-contract queries, build an indexer (Postgres + a worker calling `getLogs` in a loop). On-the-fly listening at scale degrades UX:

- Latency on every page load while events backfill.
- RPC rate limits hit fast.
- No SQL access for filtering/sorting.

For v0, on-the-fly listening is fine. Indexer is a Phase 2+ concern.

## Server-side listening

Same as browser, but with viem directly:

```ts
import { createPublicClient, webSocket } from 'viem';
import { sepolia } from 'viem/chains';

const client = createPublicClient({ chain: sepolia, transport: webSocket('wss://...') });

client.watchContractEvent({
  address: '0x...',
  abi: counterAbi,
  eventName: 'NumberSet',
  onLogs: (logs) => writeToDatabase(logs),
});
```

## Common mistakes

- **No cleanup on unmount** — `useWatchContractEvent` cleans up automatically. If using vanilla viem `client.watchContractEvent`, capture the unsubscribe and call it on cleanup.
- **`getLogs` with `fromBlock: 0`** on a busy contract — request times out or returns 100k logs. Always chunk.
- **Treating a fresh log as final** — on reorg, the log can disappear. For high-value flows, add confirmation buffer.
- **Polling AND listening** — duplicates work. Pick one strategy per use case.
- **Forgetting `as const` on ABI** — `log.args` types collapse to `unknown`.
- **Depending on event order across providers** — different RPCs may deliver logs in slightly different orders. Sort by `(blockNumber, logIndex)` if order matters.
- **Listening to events from WRONG address** — when redeploying, update the address constant immediately or watcher binds to the dead address forever.
