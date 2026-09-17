---
name: metamask-connection
description: Detect and connect injected wallet providers (MetaMask, others) via EIP-6963 and wagmi connectors. Handle chain switching and reconnection. Use when building wallet UI.
---

# metamask-connection

## When to use

Building a connect button. Handling chain switches when user is on wrong network. Reconnecting after page reload. Supporting multiple wallets (not just MetaMask).

## EIP-6963 vs `window.ethereum`

`window.ethereum` (legacy): the first wallet to inject sets it. With multiple wallets installed, only one wins, others are invisible.

EIP-6963 (preferred): wallets announce themselves via DOM events. The app discovers ALL injected wallets and lets the user pick.

```ts
// EIP-6963 raw discovery (no library)
const providers: any[] = [];
window.addEventListener('eip6963:announceProvider', (e: any) => {
  providers.push(e.detail);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
// Each provider: { info: { name, icon, rdns, uuid }, provider: EIP1193Provider }
```

In practice, use wagmi — it handles EIP-6963 automatically.

## wagmi setup with multiple connectors

```ts
import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected, metaMask, walletConnect, coinbaseWallet } from 'wagmi/connectors';

export const config = createConfig({
  chains: [sepolia],
  connectors: [
    injected(),                     // EIP-6963 + window.ethereum (catches all generic injects)
    metaMask(),                     // explicit MetaMask SDK (mobile deep-linking)
    coinbaseWallet({ appName: 'YourApp' }),
    walletConnect({ projectId: 'YOUR_PROJECT_ID' }),
  ],
  transports: { [sepolia.id]: http() },
});
```

`injected()` covers most cases. Add `metaMask()` for mobile MetaMask deep-linking. Add WalletConnect for QR-code-based mobile wallets.

## Connect button — multi-wallet aware

```tsx
import { useConnect, useAccount, useDisconnect } from 'wagmi';

export function ConnectButton() {
  const { connect, connectors, isPending, error } = useConnect();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div>
        <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
        <button onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  return (
    <div>
      {connectors.map((c) => (
        <button
          key={c.uid}
          disabled={isPending}
          onClick={() => connect({ connector: c })}
        >
          {c.icon && <img src={c.icon} alt="" className="h-5 w-5" />}
          {c.name}
        </button>
      ))}
      {error && <p className="text-red-500">{error.message}</p>}
    </div>
  );
}
```

`connectors` is the deduplicated list including EIP-6963 discoveries. `c.uid` is the stable React key.

## Detecting if wallet is installed

```ts
import { useConnect } from 'wagmi';

const { connectors } = useConnect();
const hasMetaMask = connectors.some(c => c.name === 'MetaMask');
```

If no wallet is installed, link to download:

```tsx
{!hasMetaMask && (
  <a href="https://metamask.io/download/">Install MetaMask</a>
)}
```

## Chain switching

User connected on Mainnet but app needs Sepolia:

```tsx
import { useAccount, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';

export function NetworkGate({ children }: { children: React.ReactNode }) {
  const { chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  if (chainId !== sepolia.id) {
    return (
      <div className="rounded border border-yellow-300 bg-yellow-50 p-4">
        <p>Wrong network. App requires Sepolia.</p>
        <button disabled={isPending} onClick={() => switchChain({ chainId: sepolia.id })}>
          {isPending ? 'Switching...' : 'Switch to Sepolia'}
        </button>
        {error && <p className="text-red-500">{error.message}</p>}
      </div>
    );
  }

  return <>{children}</>;
}
```

If the wallet doesn't have Sepolia configured, `switchChain` first prompts to add it (wagmi handles via `wallet_addEthereumChain`).

## Adding Sepolia manually

If wagmi's auto-add fails for an exotic wallet:

```ts
await window.ethereum.request({
  method: 'wallet_addEthereumChain',
  params: [{
    chainId: '0xaa36a7',  // 11155111 hex
    chainName: 'Sepolia',
    nativeCurrency: { name: 'SepoliaETH', symbol: 'SEP', decimals: 18 },
    rpcUrls: ['https://sepolia.infura.io/v3/YOUR_KEY'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  }],
});
```

## Reconnect on page load

In wagmi config:

```ts
createConfig({
  ...,
  ssr: false,           // for Vite (true for Next.js SSR)
});
```

In your app entry:

```tsx
import { reconnect } from '@wagmi/core';
import { config } from './lib/wagmi';

reconnect(config);
```

This restores the previous connection from localStorage on page load.

## Handling account changes

The user can switch accounts in MetaMask. wagmi automatically picks this up via `useAccount()`:

```tsx
const { address } = useAccount();
useEffect(() => {
  // address changed — refetch user-specific data
  if (address) refetchUserBalance();
}, [address]);
```

## Disconnect doesn't always disconnect

`disconnect()` clears wagmi's state but the user's wallet may still be "connected" to the site (MetaMask shows it in connected sites). True disconnection requires the user to revoke in their wallet — frame this clearly in UI.

## Common mistakes

- **Polling `window.ethereum.selectedAddress`** — race conditions on page load. Use `useAccount()`.
- **Calling `window.ethereum.request` directly when wagmi is configured** — bypasses wagmi's state. Use the hooks.
- **Not handling rejection** — user closes the wallet popup → throws an error. Catch and show "Cancelled" not "Error".
- **Hardcoding MetaMask only** — modern users have multiple wallets. Use EIP-6963 discovery.
- **Forgetting `chainId` checks** — user on Mainnet sees writes silently fail or send tx to wrong network. Gate with `NetworkGate`.
- **Confusing wallet "connected" with "session active"** — wallet ↔ site connection persists; app should still verify connection on every action.
- **WalletConnect without a real `projectId`** — placeholder breaks the QR flow. Get a free projectId from cloud.walletconnect.com.
