---
name: wagmi-hooks-patterns
description: wagmi v2 hook patterns — useReadContract, useWriteContract, useSimulateContract, useWaitForTransactionReceipt, error/loading states. Use when wiring frontend to a deployed contract.
---

# wagmi-hooks-patterns

## When to use

Reading contract state, sending transactions, watching events from a React component. Building loading and error UIs around blockchain interactions.

## Setup recap

```tsx
// src/lib/wagmi.ts
import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, metaMask } from 'wagmi/connectors';

export const config = createConfig({
  chains: [sepolia],
  connectors: [injected(), metaMask()],
  transports: { [sepolia.id]: http(import.meta.env.VITE_RPC_URL) },
});
```

```tsx
// src/main.tsx
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

<WagmiProvider config={config}>
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
</WagmiProvider>
```

`@tanstack/react-query` is mandatory for wagmi v2.

## ABI must be `as const`

```ts
// src/abi/Counter.ts
export const counterAbi = [/* ... */] as const;
```

Without `as const`, wagmi cannot infer types for `functionName`, `args`, return values.

## useReadContract

```tsx
import { useReadContract } from 'wagmi';
import { counterAbi } from '../abi/Counter';
import { addresses } from '../lib/addresses';

const SEPOLIA = 11155111 as const;

export function CurrentCount() {
  const { data, isLoading, isError, error, refetch } = useReadContract({
    abi: counterAbi,
    address: addresses[SEPOLIA].Counter,
    functionName: 'number',
  });

  if (isLoading) return <span>Loading...</span>;
  if (isError) return <span className="text-red-500">{error.message}</span>;
  return <span>{String(data)}</span>;
}
```

`data` is typed correctly when `as const` is set on the ABI. `refetch()` re-reads on demand.

## With args

```tsx
const { data: balance } = useReadContract({
  abi: erc20Abi,
  address: tokenAddress,
  functionName: 'balanceOf',
  args: [userAddress],
  query: { enabled: !!userAddress },     // skip until args ready
});
```

`query.enabled` controls whether the hook fires; useful when an arg comes from another async source.

## useWriteContract

```tsx
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

export function IncrementButton() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  return (
    <>
      <button
        disabled={isPending || isConfirming}
        onClick={() => writeContract({
          abi: counterAbi,
          address: addresses[SEPOLIA].Counter,
          functionName: 'increment',
        })}
      >
        {isPending ? 'Confirm in wallet...' : isConfirming ? 'Confirming...' : 'Increment'}
      </button>
      {isConfirmed && <p>✓ Done</p>}
      {error && <p className="text-red-500">{error.message}</p>}
    </>
  );
}
```

States:
- `isPending` — wallet popup waiting for signature.
- `isConfirming` — tx submitted, waiting for receipt.
- `isConfirmed` — receipt received with success status.

## useSimulateContract — pre-flight

Simulates the call against current state to predict revert without spending gas:

```tsx
import { useSimulateContract, useWriteContract } from 'wagmi';

export function SafeIncrement() {
  const { data: simulation, error: simError } = useSimulateContract({
    abi: counterAbi,
    address: addresses[SEPOLIA].Counter,
    functionName: 'reset',     // would revert for non-owner
  });
  const { writeContract } = useWriteContract();

  if (simError) return <p>Cannot reset: {simError.message}</p>;
  return <button onClick={() => writeContract(simulation!.request)}>Reset</button>;
}
```

Pass `simulation.request` to `writeContract` — types are perfectly preserved.

## useAccount

```tsx
import { useAccount } from 'wagmi';

const { address, isConnected, chainId, status } = useAccount();
// status: 'connecting' | 'reconnecting' | 'connected' | 'disconnected'
```

Always check `isConnected` before calling write hooks. Use the optional chain: `address?.toLowerCase()`.

## useConnect / useDisconnect

```tsx
import { useConnect, useDisconnect, useAccount } from 'wagmi';

export function ConnectButton() {
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { isConnected, address } = useAccount();

  if (isConnected) {
    return <button onClick={() => disconnect()}>Disconnect ({address?.slice(0, 6)}...)</button>;
  }
  return (
    <div>
      {connectors.map(c => (
        <button key={c.uid} disabled={isPending} onClick={() => connect({ connector: c })}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
```

## Error handling

wagmi error objects expose:

```tsx
const { error } = useWriteContract();
// error?.message — generic
// error?.cause — the underlying viem error
// error?.shortMessage — concise UI-friendly version
```

For revert messages from custom errors:

```tsx
import { decodeErrorResult } from 'viem';

if (error?.cause?.data) {
  try {
    const decoded = decodeErrorResult({ abi: counterAbi, data: error.cause.data });
    console.log(decoded.errorName, decoded.args);
  } catch { /* unrecognized */ }
}
```

## Optimistic updates

For UX snappiness, update local state immediately and reconcile after receipt:

```tsx
const [optimisticCount, setOptimisticCount] = useState<number | null>(null);
const { data: actual } = useReadContract({ ... });

useWriteContract({
  mutation: {
    onMutate: () => setOptimisticCount(Number(actual ?? 0n) + 1),
    onSettled: () => setOptimisticCount(null),
  },
});

const display = optimisticCount ?? actual;
```

## Polling vs manual refresh

By default, `useReadContract` doesn't poll. Refresh patterns:

```tsx
// Refetch every 5s
useReadContract({ ..., query: { refetchInterval: 5000 } });

// Refetch on event
const { refetch } = useReadContract({ ... });
useWatchContractEvent({ ..., onLogs: () => refetch() });
```

## Common mistakes

- **Forgetting `as const` on ABI** — types collapse to `any`, no autocomplete, runtime works but devex suffers.
- **Calling `writeContract` without checking `isConnected`** — wagmi throws. Gate the button.
- **Skipping `useWaitForTransactionReceipt`** — UI shows "Done" while tx is still pending. Always wait for the receipt.
- **Reading on every render with no caching key** — react-query caches by `(abi, address, functionName, args)`. Stable args = cache hits. Inline objects break the cache.
- **Using `BigInt` directly in JSX** — React errors. Convert: `String(value)` or `value?.toString()`.
- **Ignoring `chainId` mismatch** — user on Mainnet, app expects Sepolia. Use `useSwitchChain` to prompt.
- **Overriding wagmi's loading/error states with custom global state** — duplication and bugs. Trust wagmi's per-hook flags.
