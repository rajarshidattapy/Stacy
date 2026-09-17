# 15 — Routing & Pages (Deep Dive)

Next.js 16 App Router (`app/`).

---

## 1. Route table

| Path                            | File                                                               | Render mode | Purpose                              |
|---------------------------------|--------------------------------------------------------------------|-------------|--------------------------------------|
| `/`                             | `app/page.tsx`                                                     | server      | Landing page                          |
| `/generate`                     | `app/generate/page.tsx` → `components/generate/Generate.tsx`       | client      | The IDE                              |
| `/generate` (loading)           | `app/generate/loading.tsx`                                         | server      | Skeleton during async                |
| `/thinking`                     | `app/thinking/*`                                                   | mixed       | Demo / showcase                       |
| `/api/chat`                     | `app/api/chat/route.ts`                                            | edge/Node   | POST → AI streaming                   |
| `/api/extensions`               | `app/api/extensions/route.ts`                                      | Node        | GET → federated extension list        |
| `/api/extensions/detail`        | `app/api/extensions/detail/route.ts`                               | Node        | GET → extension detail                |
| `/api/extensions/assets/[folder]` | `app/api/extensions/assets/[folder]/route.ts`                    | Node        | GET → extension asset proxy           |
| `/api/extensions/monaco-theme`  | `app/api/extensions/monaco-theme/route.ts`                         | Node        | GET → Monaco theme JSON               |

## 2. `app/layout.tsx`

Root layout. Wraps `<html>` / `<body>`, mounts the `next-themes` provider, fonts, analytics. Reading the file is the only way to confirm whether `<ChatProvider>`, `<BuilderPassProvider>`, etc. are global or page-level — current code mounts most providers inside `Generate.tsx`.

## 3. `app/page.tsx` — landing

```tsx
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { IntentBox } from "@/components/landing/IntentBox";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Logos } from "@/components/landing/Marquee";
import StacyBentoGrid from "@/components/landing/BentoGrid";
import FAQ from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";
import { ReactLenis } from 'lenis/react';

export default function LandingPage() {
  return (
    <ReactLenis root>
      <main className="flex flex-col w-full min-h-screen bg-[#fbe1b1] text-[#354230]">
        <Navbar/>
        <div className="relative z-10 flex flex-col items-center w-full min-h-screen px-6 pt-[10vh] pb-20 overflow-hidden">
          <Hero/>
          <IntentBox/>
        </div>
        <Logos/>
        <StacyBentoGrid/>
        <HowItWorks/>
        <FAQ/>
        <Footer/>
      </main>
    </ReactLenis>
  );
}
```

`<ReactLenis root>` enables smooth scroll page-wide. Mostly server-rendered (only IntentBox+Hero have client interactivity).

## 4. `app/generate/page.tsx` — IDE entry

```tsx
import GeneratePage from "@/components/generate/Generate";

async function getData() {
  await new Promise((r) => setTimeout(r, 1500));
  return { ok: true };
}

export default async function Generate() {
    const data = await getData();
    return <GeneratePage />;
}
```

The `await getData()` is a synthetic 1.5 s delay. Lets `loading.tsx` flash a skeleton, masking the actual client-side IDE bootstrap (Monaco, assistant-ui runtime). Real work happens client-side inside `<GeneratePage/>`.

`loading.tsx` (~875 bytes) shows a placeholder during the wait.

## 5. `components/generate/Generate.tsx` overview

(Full deep dive in [03-state-and-reducer.md](./03-state-and-reducer.md), [01-architecture.md](./01-architecture.md).)

Client-only (`"use client"` at top). Uses `useSearchParams()` to read `?interactionMode=`:

```ts
const searchParams = useSearchParams();
const initialInteractionMode = (searchParams.get("interactionMode") as "agentic" | "manual") || "manual";
```

Component is wrapped in a `<Suspense>` boundary because `useSearchParams` requires it under React 19 / Next 16.

Heavy chrome dynamic-imports:

```ts
const GlobalTopBar = dynamic(() => import("@/components/ide/GlobalTopBar").then(m => m.GlobalTopBar), { ssr: false });
const HomeSidebar  = dynamic(() => import("@/components/ide/HomeSidebar").then(m => m.HomeSidebar),  { ssr: false });
```

`ssr: false` skips server render — relevant only for components with browser-only APIs (window, localStorage on mount).

## 6. `app/api/chat/route.ts`

```ts
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey:  process.env.OPENROUTER_API_KEY,
  headers: {
    "HTTP-Referer": process.env.SITE_URL ?? "http://localhost:3000",
    "X-Title":      "My App",
  },
});

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = streamText({
    model:    openrouter("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),
    messages: await convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
```

Runs as a Node route by default. To run on Edge runtime, add `export const runtime = "edge"` at top — Edge has shorter startup but smaller deps (no Node-specific APIs). For this route, Edge is fine since OpenRouter is a `fetch` call.

## 7. `app/api/extensions/route.ts`

`export const dynamic = "force-dynamic"` — bypass caching. Reasons:
- Marketplace data changes constantly.
- Local extension folder reads must run per request (filesystem state).

Full logic walked in [11-extensions-system.md](./11-extensions-system.md).

## 8. `app/api/extensions/detail/route.ts` (~13k)

Returns extended detail per extension: README HTML, changelog, version list, asset URLs. Used by `<ExtensionDetailView/>` to populate its detail page.

## 9. `app/api/extensions/assets/[folder]/route.ts`

Proxies asset (icon, image) fetches for **local** extensions out of the `components/ide/extensions/<folder>/` subtree. Implementation reads the file from disk, returns with appropriate `Content-Type`.

## 10. `app/api/extensions/monaco-theme/route.ts`

Reads `lib/monacoThemes/${name}.json` and returns parsed JSON. Consumed by `loadMonacoThemeData` in `lib/monacoTheme.ts`. Path validated against directory traversal (`../`, absolute paths).

## 11. App-level state hand-off

The URL query string is the only durable state passed between `/` and `/generate`:

```
/generate?interactionMode=agentic
```

Project loading (when user picks a saved project from the modal) is purely client-side; no route change. State is hydrated via `dispatch({ type: "LOAD_PROJECT", payload: state })`.

## 12. Env vars

| Var                  | Used by                            | Purpose                                       |
|----------------------|------------------------------------|-----------------------------------------------|
| `OPENROUTER_API_KEY` | `app/api/chat/route.ts`            | Auth header for OpenRouter.                    |
| `SITE_URL`           | `app/api/chat/route.ts` (HTTP-Referer) | OpenRouter analytics.                      |
| `NEXT_PUBLIC_*`      | client-exposed                     | Public Stellar config etc., as needed.        |
| Supabase env         | `useSupabaseSession` / GitHub auth | (depends on impl).                            |

## 13. Build commands

```
bun install
bun run dev       → http://localhost:3000
bun run build     → next build
bun run start     → next start (production)
bun run lint      → eslint .
```

## 14. Bug-trace

| Symptom                                              | Look at                                                                |
|------------------------------------------------------|------------------------------------------------------------------------|
| `/generate` 1.5 s blank flash                         | `getData` synthetic delay. Remove if no longer needed.                 |
| Search params not reading                             | `useSearchParams` requires Suspense boundary. Wrap caller.             |
| `/api/chat` 401                                       | `OPENROUTER_API_KEY` missing in `.env.local`.                          |
| `/api/extensions` slow                                | Marketplace API latency. Add per-instance cache with TTL if needed.    |
| Monaco theme 404                                      | `name` query param missing; or theme file not in `lib/monacoThemes/`.  |
| Extension assets 404                                  | Folder mismatch. Confirm `components/ide/extensions/<folder>/` exists.|
| Edge runtime crash on chat                           | If you switched to `runtime: "edge"`, ensure no Node APIs (`fs`, `path`) used in the route. |
