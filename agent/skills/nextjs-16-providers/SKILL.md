---
name: nextjs-16-providers
description: Provider topology for the Next.js 16 + wagmi + RainbowKit + tanstack-query frontend. Use when adding new global state, debugging hydration errors, or structuring layout.tsx.
---

# nextjs-16-providers

## When to use

You're touching `app/layout.tsx`, `app/providers.tsx`, or `wagmi.ts`. Or hitting hydration errors. Or adding a new global provider.

## This is Next.js 16, not 13/14/15

Next.js 16 has breaking changes. Read `node_modules/next/dist/docs/` before assuming anything. Two especially relevant differences:

- React 19 only. No more `<head>` in components — use `metadata` exports.
- Stable App Router; no `pages/` router in this project.

## Required tree

```
app/
  layout.tsx       (server component)
  providers.tsx    ('use client'; wraps the wagmi/query/rainbowkit stack)
  page.tsx         (server or client; can use ConnectButton from rainbowkit if 'use client')
  globals.css      (Tailwind v4 imports + custom layers)
wagmi.ts           (server-safe config; ssr: true)
```

`layout.tsx` (server) renders `<Providers>{children}</Providers>` where `Providers` is the only client boundary at the top of the tree. Everything that needs wagmi/query/rainbowkit hooks must be a descendant of `Providers` AND marked `'use client'`.

## providers.tsx contract

```tsx
'use client';
import type React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { config } from '../wagmi';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

Order matters: `WagmiProvider` outside `QueryClientProvider` outside `RainbowKitProvider`. RainbowKit reads from both.

## wagmi.ts contract

```ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, polygon, optimism, arbitrum, base, sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'YourApp',
  projectId: '<walletconnect-project-id>',
  chains: [
    mainnet, polygon, optimism, arbitrum, base,
    ...(process.env.NEXT_PUBLIC_ENABLE_TESTNETS === 'true' ? [sepolia] : []),
  ],
  ssr: true,
});
```

Keep `ssr: true`. It's why hydration works under Next 16 RSC.

To enable Sepolia in dev:

```
# frontend/.env.local
NEXT_PUBLIC_ENABLE_TESTNETS=true
```

## layout.tsx contract

```tsx
import type { Metadata } from "next";
import "./globals.css";
import '@rainbow-me/rainbowkit/styles.css';
import { Providers } from "./providers";

export const metadata: Metadata = { title: "...", description: "..." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`'@rainbow-me/rainbowkit/styles.css'` belongs at the root layout. Importing it deeper causes flicker.

## Common errors

- **`Hydration failed`** — almost always: a client hook (`useAccount`, `useTheme`) used in a component without `'use client'`, or rendering wallet state on the server.
- **`useContext is not a function`** — `WagmiProvider`/`QueryClientProvider` not above the consumer in the tree.
- **`Module not found: 'pino-pretty'`** — wagmi optional dep. Suppress in `next.config.ts` with `webpack: (config) => { config.externals.push('pino-pretty', 'lokijs', 'encoding'); return config; }` only if it's actually a build blocker.

## Adding a new provider

If you need to add e.g. `ThemeProvider`, nest it INSIDE `RainbowKitProvider` (so RainbowKit's theme tokens are available downstream) or OUTSIDE all of them (rare). Don't introduce a new client boundary lower in the tree if the existing `Providers` component will do.
