# 02 — Tech Stack (Deep Dive)

Every dep in `package.json`, what role it plays in the IDE, where it's imported. Source of truth: `package.json`, `bun.lock`.

---

## 1. Framework / runtime

| Package                           | Version  | Where used                                                | Role                                              |
|-----------------------------------|----------|-----------------------------------------------------------|---------------------------------------------------|
| `next`                            | 16.0.10  | `app/*`                                                   | App Router, server routes, dynamic imports.       |
| `react`                           | 19.2.0   | everywhere                                                | UI runtime.                                       |
| `react-dom`                       | 19.2.0   | render entry                                              | DOM renderer.                                     |
| `next-themes`                     | ^0.4.6   | `app/layout.tsx` provider                                 | Light/dark theme switcher.                        |
| `@vercel/analytics`               | 1.3.1    | landing                                                   | Page-view analytics.                              |

`next.config.mjs` is minimal — no custom webpack/server tweaks.

## 2. Editor — Monaco

| Package                  | Version  | Imported by                                              |
|--------------------------|----------|----------------------------------------------------------|
| `monaco-editor`          | ^0.55.1  | indirectly via wrapper                                    |
| `@monaco-editor/react`   | ^4.7.0   | `components/ide/IdeWorkspace.tsx` (`Editor`, `OnMount`)   |
| `monaco-themes`          | ^0.4.8   | reference for `lib/monacoThemes/*.json`                   |

`IdeWorkspace.tsx` wires:
- `monaco.languages.typescript.{ts,js}Defaults.setCompilerOptions(...)` — JSX support.
- `monaco.languages.typescript.typescriptDefaults.addExtraLib(jsxRuntimeLib, "react/jsx-runtime.d.ts")` — ambient JSX runtime decl.
- `editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyF, () => editor.getAction("actions.find")?.run())` — find shortcut.
- `editor.onDidChangeCursorSelection(...)` — selection-driven AI popup.
- `monacoApi.editor.defineTheme(name, themeData)` + `setTheme(name)` — theme application.

## 3. assistant-ui (chat)

| Package                              | Version  | Role                                              |
|--------------------------------------|----------|---------------------------------------------------|
| `@assistant-ui/react`                | ^0.12.28 | Headless primitives (`ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`, `ActionBarPrimitive`, `ErrorPrimitive`, `AuiIf`, `useScrollLock`, `useAuiState`). |
| `@assistant-ui/react-ai-sdk`         | ^1.3.21  | `useChatRuntime` adapter to Vercel AI SDK transport. |
| `@assistant-ui/react-markdown`       | ^0.12.11 | `MarkdownTextPrimitive`, `useIsMarkdownCodeBlock`, `unstable_memoizeMarkdownComponents`. CSS file `styles/dot.css`. |

Runtime mounted in `ChatPanel.tsx`:
```ts
const runtime = useChatRuntime({ transport: new DefaultChatTransport({ api: "/api/chat" }) });
<AssistantRuntimeProvider runtime={runtime}>...</AssistantRuntimeProvider>
```

## 4. AI SDK (server-side streaming)

| Package                | Version  | Used in                          | Role                               |
|------------------------|----------|----------------------------------|------------------------------------|
| `ai`                   | ^6.0.174 | `app/api/chat/route.ts`, `ChatPanel.tsx` | `streamText`, `convertToModelMessages`, `UIMessage` type, `DefaultChatTransport`. |
| `@ai-sdk/openai`       | ^3.0.58  | `app/api/chat/route.ts`          | `createOpenAI({ baseURL, apiKey })` — OpenAI-compatible client pointed at OpenRouter. |
| `@ai-sdk/google`       | ^3.0.67  | (available, unused yet)          | `createGoogleGenerativeAI(...)` for Gemini. |

`/api/chat`:
```ts
const openrouter = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: env.OPENROUTER_API_KEY, headers: { "HTTP-Referer": SITE_URL, "X-Title": "My App" } });
const result = streamText({ model: openrouter("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"), messages: await convertToModelMessages(messages) });
return result.toUIMessageStreamResponse();
```

## 5. Radix UI primitives

Each `@radix-ui/react-*` is one accessible primitive. The codebase wraps each in `components/ui/<name>.tsx` styled via Tailwind + `class-variance-authority`.

| Package                              | Used for                                         |
|--------------------------------------|--------------------------------------------------|
| `@radix-ui/react-accordion`          | Collapsible accordions (FAQ on landing).         |
| `@radix-ui/react-alert-dialog`       | Destructive-confirm dialogs (Delete file).       |
| `@radix-ui/react-aspect-ratio`       | Embed aspect ratio.                               |
| `@radix-ui/react-avatar`             | User avatar in `AccountsDialog`.                  |
| `@radix-ui/react-checkbox`           | Form checkboxes.                                  |
| `@radix-ui/react-collapsible`        | Reasoning blocks (`Reasoning.tsx` uses Radix Collapsible). |
| `@radix-ui/react-context-menu`       | Right-click menus (alternative to custom in `FileExplorer`). |
| `@radix-ui/react-dialog`             | Modal dialogs (`SaveProjectDialog`, `EnvConfigModal`, `DeployDialog`, `AccountsDialog`). |
| `@radix-ui/react-dropdown-menu`      | Dropdowns in top bar.                             |
| `@radix-ui/react-hover-card`         | Hover info cards.                                 |
| `@radix-ui/react-label`              | Form labels.                                      |
| `@radix-ui/react-menubar`            | Menubar (unused so far in IDE).                   |
| `@radix-ui/react-navigation-menu`    | Landing nav.                                      |
| `@radix-ui/react-popover`            | Popovers (deploy network selector).               |
| `@radix-ui/react-progress`           | Progress bars.                                    |
| `@radix-ui/react-radio-group`        | Radio inputs.                                     |
| `@radix-ui/react-scroll-area`        | Custom scrollbars.                                |
| `@radix-ui/react-select`             | Select dropdowns (env config dropdowns).          |
| `@radix-ui/react-separator`          | Dividers.                                         |
| `@radix-ui/react-slider`             | Sliders.                                          |
| `@radix-ui/react-slot`               | `asChild` pattern (`<TooltipIconButton asChild>`). |
| `@radix-ui/react-switch`             | Toggle switches (preview mode toggle uses custom). |
| `@radix-ui/react-tabs`               | Tabs (Extension detail, Env config sections).     |
| `@radix-ui/react-toast`              | Toast notifications.                              |
| `@radix-ui/react-toggle`/`toggle-group` | Toggle button groups.                          |
| `@radix-ui/react-tooltip`            | Tooltips on every icon button (`TooltipProvider` wraps Thread). |

`radix-ui` (umbrella) gives unified access without 30 separate imports.

## 6. Styling

| Package                  | Version  | Role                                                      |
|--------------------------|----------|-----------------------------------------------------------|
| `tailwindcss`            | ^4.1.9   | Utility CSS. Tokens via CSS vars in `app/globals.css`.    |
| `@tailwindcss/postcss`   | ^4.1.9   | PostCSS plugin (Tailwind v4 way).                          |
| `postcss`                | ^8.5     | Required by Tailwind.                                      |
| `autoprefixer`           | ^10.4.20 | Vendor prefixing.                                          |
| `tailwindcss-animate`    | ^1.0.7   | Animation utilities (shadcn-style).                        |
| `tw-animate-css`         | 1.3.3    | Extra animate utilities.                                    |
| `tw-shimmer`             | ^0.4.11  | Loading shimmer (skeleton screens).                         |
| `class-variance-authority` | ^0.7.1 | CVA for variant components (`buttonVariants`, etc.).        |
| `clsx` + `tailwind-merge`| ^2.1.1 / ^3.4.0 | `cn(...args)` in `lib/utils.ts`.                  |
| `framer-motion`          | ^12.27.5 | Animated layouts (`FileExplorer` rename input, modal entrances). |
| `lenis`                  | ^1.3.17  | Smooth scroll on landing (`<ReactLenis root>`).             |

`lib/utils.ts:1-5`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

## 7. Forms / validation

| Package                       | Role                                              |
|-------------------------------|---------------------------------------------------|
| `react-hook-form`             | Form state (login form, save dialog).             |
| `@hookform/resolvers`         | Bridges to schema validators.                     |
| `zod`                         | Schemas; also used as `tools` parameter validator if AI tool calling is wired. |

## 8. Icons / charts / utility UI

| Package                       | Role                                              |
|-------------------------------|---------------------------------------------------|
| `lucide-react`                | Icons (every `<XIcon/>` import).                   |
| `recharts`                    | Charts (any future analytics).                    |
| `cmdk`                        | Command palette primitives (kept for future Cmd+Shift+P implementation). |
| `vaul`                        | Drawer (mobile-style sliding).                    |
| `embla-carousel-react`        | Landing carousel.                                 |
| `react-day-picker`            | Date inputs.                                      |
| `date-fns`                    | Date utilities.                                   |
| `input-otp`                   | OTP input.                                        |
| `react-resizable-panels`      | Splitter panels (the IDE itself uses custom resizers, package available). |
| `sonner`                      | Toast notifications (alternative to Radix Toast). |

## 9. Speech / extras

| Package                       | Role                                     |
|-------------------------------|------------------------------------------|
| `react-speech-recognition`    | Voice input → `useSpeechRecognition.ts`. |
| `@types/react-speech-recognition` | Types.                               |
| `regenerator-runtime`         | Required by speech-recognition.          |
| `@paper-design/shaders`       | Decorative WebGL shaders on landing.     |
| `unicornstudio-react`         | Embeddable design tool, landing decor.    |
| `buffer`                      | Browser polyfill for `Buffer`.           |

## 10. State management

| Package      | Role                                                       |
|--------------|------------------------------------------------------------|
| `zustand`    | Available, not yet used in IDE core. Reducers + contexts cover current needs. Reach for if cross-route state (e.g., a global toast store) emerges. |

## 11. Markdown / streaming render

| Package         | Role                                                |
|-----------------|-----------------------------------------------------|
| `react-markdown`| Markdown rendering.                                 |
| `remark-gfm`    | Tables, task lists, strikethrough, autolinks.       |

`MarkdownText` uses `MarkdownTextPrimitive` from `@assistant-ui/react-markdown` which wraps `react-markdown` internally — so `react-markdown`/`remark-gfm` are loaded transitively, not directly imported in chat.

## 12. Dev tooling

| Package              | Role                                          |
|----------------------|-----------------------------------------------|
| `typescript` ^5.9.3  | Type check.                                   |
| `@types/node` ^22.19 | Node type defs.                               |
| `@types/react` ^19.2 | React type defs.                              |
| `@types/react-dom`   | DOM type defs.                                |

`tsconfig.json` enables `strict`, `target: ESNext`, `moduleResolution: bundler`, JSX `preserve`, paths `@/* → ./*`. `tsconfig.tsbuildinfo` (430k) is incremental cache — git-ignored typically.

## 13. Why each library, not another

| Choice                                | Reason                                                                                          |
|---------------------------------------|-------------------------------------------------------------------------------------------------|
| `assistant-ui` over rolling own       | Streaming UI, message parts, action bar, attachments, runtime abstraction free.                  |
| Vercel `ai` SDK                       | Provider-agnostic streaming; `toUIMessageStreamResponse()` matches `useChatRuntime` byte-for-byte.|
| Monaco                                | Same engine as VS Code → reuse VS Code themes (`monaco-themes` JSON), TypeScript IntelliSense.   |
| Radix                                 | Accessible-by-default; no `aria-*` reinvention.                                                  |
| Tailwind v4                           | Single source of styles; CSS-var theme tokens.                                                   |
| `framer-motion` over CSS-only         | Layout animations (file rename, modal slides) need spring physics + AnimatePresence.             |
| `lenis` (landing only)                | Smooth-scroll feel; not used in IDE (jank concerns inside Monaco/iframe).                        |
| OpenRouter via OpenAI SDK             | One key, dozens of models. Model swap = string change.                                           |
| `bun` lock (`bun.lock`)               | Fast install in CI/dev. `npm`/`pnpm` would still work via standard `package.json`.               |

## 14. Build / run scripts (`package.json`)

```json
"scripts": {
  "build": "next build",
  "dev":   "next dev",
  "lint":  "eslint .",
  "start": "next start"
}
```

Local: `bun install && bun run dev` → `http://localhost:3000` → IDE at `/generate`. Set `OPENROUTER_API_KEY` in `.env.local` for chat to stream.

## 15. Total dep count

~40 `dependencies` + 7 `devDependencies`. No god-libraries — each plays a single role.
