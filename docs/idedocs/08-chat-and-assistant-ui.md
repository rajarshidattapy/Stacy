# 08 — Chat & assistant-ui (Deep Dive)

The chat panel uses `@assistant-ui/react` headless primitives for rendering and `@assistant-ui/react-ai-sdk` to bridge to the Vercel AI SDK transport. Streaming, message parts (text/tool/reasoning/source), attachments, action bar, and cancel-mid-stream all come for free.

---

## 1. Files map

| File                                                  | Role                                                              |
|-------------------------------------------------------|-------------------------------------------------------------------|
| `components/ide/ChatPanel.tsx`                        | Mounts `<AssistantRuntimeProvider/>` over `<Thread/>`.            |
| `components/assistant-ui/thread-ide.tsx`              | The `Thread` UI tuned for the IDE theme.                          |
| `components/assistant-ui/thread.tsx`                  | Generic `Thread` (used elsewhere).                                |
| `components/assistant-ui/markdown-text.tsx`           | Streaming markdown renderer (GFM + code-block toolbar).           |
| `components/assistant-ui/reasoning.tsx`               | Collapsible reasoning blocks (chain-of-thought).                  |
| `components/assistant-ui/sources.tsx`                 | Citation / source rendering.                                      |
| `components/assistant-ui/tool-fallback.tsx`           | Default UI for tool calls without a custom component.             |
| `components/assistant-ui/attachment.tsx`              | Composer attachments + dropzone.                                  |
| `components/assistant-ui/badge.tsx`                   | Small reusable badge.                                             |
| `components/assistant-ui/tooltip-icon-button.tsx`     | Helper button used inside thread/composer.                        |
| `components/ide/chat/ChatComposer.tsx`                | Legacy composer (assistant-ui's ComposerPrimitive owns input now).|
| `components/ide/chat/ChatMessages.tsx`                | Legacy.                                                           |
| `components/ide/chat/ChatContextStrip.tsx`            | Strip above composer showing active file + selection chip.         |
| `components/ide/chat/ChatIconRail.tsx`                | Rail with new chat / history / settings icons.                     |
| `components/ide/chat/chat-types.ts`                   | `EditorChange` type, etc.                                         |
| `app/api/chat/route.ts`                               | Server-side streaming endpoint (OpenRouter).                       |

## 2. Runtime wiring (`ChatPanel.tsx`)

```tsx
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { DefaultChatTransport } from "ai";

export function ChatPanel(props: ChatPanelProps) {
  const runtime = useChatRuntime({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatPanelInner {...props} />
    </AssistantRuntimeProvider>
  );
}
```

- `useChatRuntime` constructs an in-memory thread store and a transport that POSTs `{ messages }` to the configured endpoint.
- `AssistantRuntimeProvider` puts the runtime into React context. Every primitive and `useThread*`/`useMessage*`/`useComposer*` hook below it consumes it.
- `DefaultChatTransport` from `ai` package converts streaming Server-Sent style chunks into UIMessage parts.

`ChatPanelInner` is the visible UI: `AccountsDialog`, `PricingModal`, the resizable container holding the `<Thread/>`. Width state:

```ts
chatWidth = useState(470)
isResizing = useRef(false)
chatPanelRef = useRef<HTMLDivElement>()

handleResizeMouseDown(e) → isResizing.current=true; body.cursor="col-resize"
useEffect mousemove → if isResizing: chatWidth = clamp(e.clientX - panelLeft, 280, 600)
useEffect mouseup   → isResizing.current=false
```

`useSandboxContext()` is read inside but currently only feeds `isFrontendMode = chatContext.resolvedMode === "frontend"` — left there for future chat-side actions like "tell sandbox to install package X".

## 3. `Thread` (`thread-ide.tsx`)

```tsx
<TooltipProvider>
  <ThreadPrimitive.Root
    className="flex h-full flex-col bg-[#050505] text-zinc-100 text-sm"
    style={{
      "--thread-max-width": "44rem",
      "--accent-color":      "#4ee06a",
      "--accent-foreground": "#000000",
    } as React.CSSProperties}
  >
    <ThreadPrimitive.Viewport turnAnchor="top" className="...overflow-y-auto scroll-smooth">
      <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }}/>

      <ThreadPrimitive.ViewportFooter className="sticky bottom-0 ...">
        <ThreadScrollToBottom/>
        <Composer/>
      </ThreadPrimitive.ViewportFooter>
    </ThreadPrimitive.Viewport>
  </ThreadPrimitive.Root>
</TooltipProvider>
```

- `turnAnchor="top"` keeps the latest user message pinned at the top of the viewport when the assistant streams in (instead of pinning bottom and pushing the user prompt off-screen).
- CSS variables (`--accent-color`) are consumed by `Composer.Send` button etc. — change them once here to re-skin.

### `UserMessage` (lines 148-163)
```tsx
<MessagePrimitive.Root data-role="user" className="grid w-full max-w-[var(--thread-max-width)] grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 py-3">
  <UserMessageAttachments/>
  <div className="col-start-2 ...">
    <div className="rounded-2xl bg-zinc-800/50 border border-white/[0.05] px-4 py-2.5 break-words text-zinc-100 shadow-sm">
      <MessagePrimitive.Parts/>
    </div>
  </div>
</MessagePrimitive.Root>
```
Simple bubble with attachments preview above.

### `AssistantMessage` (lines 165-198)
```tsx
<MessagePrimitive.Root data-role="assistant" className="relative ...">
  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
    <BotIcon className="size-4"/>
  </div>
  <div className="break-words px-2 leading-relaxed text-foreground">
    <MessagePrimitive.Parts components={{
      Text: MarkdownText,
      tools: { Fallback: ToolFallback },
      Reasoning,
      ReasoningGroup,
      Source: Sources,
    }}/>
    <MessageError/>
    <AuiIf condition={(s) => s.thread.isRunning && s.message.content.length === 0}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin"/>
        <span className="text-sm">Thinking...</span>
      </div>
    </AuiIf>
  </div>
  <div className="mt-1 ml-2 flex min-h-6 items-center">
    <AssistantActionBar/>
  </div>
</MessagePrimitive.Root>
```

- `MessagePrimitive.Parts components={...}` is **the seam** for adding new part types. Provide a key like `tools.my_tool` (per-tool override), `Text`, `Reasoning`, `ReasoningGroup`, `Source`, etc. The runtime emits parts; assistant-ui dispatches each to your component.
- `MessageError` (line 200-208) renders streaming errors via `ErrorPrimitive.Root` / `ErrorPrimitive.Message`.
- `<AuiIf condition>` is a primitive that subscribes to `(s) => s.message.content.length === 0` and `s.thread.isRunning`. Re-renders only when those scoped values change.

### `Composer` (lines 70-87)
```tsx
<ComposerPrimitive.Root>
  <ComposerPrimitive.AttachmentDropzone className="...rounded-2xl border bg-zinc-900/30 ... has-[textarea:focus-visible]:ring-2 ... data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50">
    <ComposerAttachments/>
    <ComposerPrimitive.Input
      placeholder="Send a message..."
      className="mb-1 max-h-72 min-h-14 w-full resize-none ..."
      rows={1} autoFocus aria-label="Message input"
    />
    <ComposerAction/>
  </ComposerPrimitive.AttachmentDropzone>
</ComposerPrimitive.Root>
```

`ComposerAction` (lines 89-132) swaps Send vs Cancel via `<AuiIf condition={(s) => !s.thread.isRunning}>`:

```tsx
{!running && <ComposerPrimitive.Send asChild><TooltipIconButton tooltip="Send"><ArrowUpIcon/></TooltipIconButton></ComposerPrimitive.Send>}
{ running && <ComposerPrimitive.Cancel asChild><Button><SquareIcon/></Button></ComposerPrimitive.Cancel>}
```

`Send` calls `runtime.thread.append({ role: "user", content: ... })` internally; `Cancel` aborts the in-flight request.

### `AssistantActionBar` (lines 210-243)
```tsx
<ActionBarPrimitive.Root hideWhenRunning autohide="not-last">
  <ActionBarPrimitive.Copy asChild>...                  // toggles CopyIcon ↔ CheckIcon via s.message.isCopied
  <ActionBarPrimitive.ExportMarkdown asChild>...        // download .md
  <ActionBarPrimitive.FeedbackPositive asChild>...      // ThumbsUp
  <ActionBarPrimitive.FeedbackNegative asChild>...      // ThumbsDown
</ActionBarPrimitive.Root>
```

`hideWhenRunning` hides the bar mid-stream; `autohide="not-last"` means only the most recent message keeps its bar always visible.

### `ThreadScrollToBottom` (lines 134-146)
```tsx
<ThreadPrimitive.ScrollToBottom asChild>
  <TooltipIconButton ...><ArrowDownIcon/></TooltipIconButton>
</ThreadPrimitive.ScrollToBottom>
```
Auto-hidden when scroll is at bottom.

## 4. `MarkdownText` (`markdown-text.tsx`)

```tsx
import "@assistant-ui/react-markdown/styles/dot.css";
import { MarkdownTextPrimitive, useIsMarkdownCodeBlock,
         unstable_memoizeMarkdownComponents as memoizeMarkdownComponents } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";

const MarkdownTextImpl = () => (
  <MarkdownTextPrimitive remarkPlugins={[remarkGfm]} className="aui-md" components={defaultComponents}/>
);
export const MarkdownText = memo(MarkdownTextImpl);
```

`defaultComponents` (further down in the file) provides:
- A `pre` override that renders the `CodeHeader` (language label + Copy button — `useCopyToClipboard` hook below).
- Standard tag mappings (`h1`-`h6`, `code`, `a`, `ul`, `ol`, `li`, `blockquote`, `table`, etc.) styled via Tailwind.

`useIsMarkdownCodeBlock()` reads runtime state to decide whether the wrapping element is *inside* a fenced code block (vs inline backticks) — used to conditionally apply the syntax-highlight styles.

## 5. `Reasoning` (`reasoning.tsx`)

A collapsible block for `Reasoning` parts:

```tsx
const reasoningVariants = cva("aui-reasoning-root mb-4 w-full", {
  variants: { variant: { outline: "rounded-lg border px-3 py-2", ghost: "", muted: "rounded-lg bg-muted/50 px-3 py-2" }},
  defaultVariants: { variant: "outline" },
});

function ReasoningRoot({ open, onOpenChange, defaultOpen=false, ...props }) {
  // Controlled or uncontrolled via Collapsible (Radix)
  // useScrollLock(ref, ANIMATION_DURATION=200) prevents content-jump while expanding
}
```

`ReasoningGroup` is the parent grouping container exported by assistant-ui — passed as `components.ReasoningGroup` so multiple consecutive `Reasoning` parts collapse together.

## 6. `Sources` (`sources.tsx`)

Renders citations attached to assistant messages — each with title, host, URL chip, optional excerpt.

## 7. `ToolFallback` (`tool-fallback.tsx`)

Generic UI for any tool call when no specific component is provided. Shows tool name, args (collapsed JSON), and result with a copy button. Use this as the template when writing per-tool components.

## 8. `attachment.tsx`

Three exports: `ComposerAddAttachment`, `ComposerAttachments`, `UserMessageAttachments`. Each maps to a primitive from assistant-ui's attachment API. Drop a file into the composer dropzone → preview chip appears → on send, attachment payload travels with the message.

## 9. Server route — `app/api/chat/route.ts`

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

Why each line matters:
- `createOpenAI({ baseURL, apiKey })` — the AI SDK accepts any OpenAI-compatible endpoint. OpenRouter routes to dozens of models from one API.
- The two custom headers are OpenRouter etiquette: `HTTP-Referer` for analytics, `X-Title` for app attribution in their dashboard.
- `convertToModelMessages(messages)` — UIMessage type carries multi-part content (text, attachments, tool calls); the model expects flat `{ role, content }`. This converter normalizes.
- `streamText({ model, messages })` returns a stream object.
- `result.toUIMessageStreamResponse()` emits exactly the format `useChatRuntime` consumes (text deltas, finish events, optional tool deltas, optional reasoning deltas).

### Swap providers

```ts
import { createGoogleGenerativeAI } from "@ai-sdk/google";
const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
streamText({ model: google("gemini-1.5-pro-latest"), messages: ... });
```

Or use a different OpenRouter model id as a string — single line change.

### Pass tools

```ts
streamText({
  model: openrouter("anthropic/claude-3.5-sonnet"),
  messages,
  tools: {
    write_file: tool({
      description: "Write a file to the workspace",
      parameters: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => { /* dispatch to sandbox */ return { ok: true }; },
    }),
  },
});
```

The streamed tool calls + results land as `tools.<name>` parts in `MessagePrimitive.Parts`. Provide a custom UI by passing `components={{ tools: { write_file: WriteFileToolUI, Fallback: ToolFallback } }}`.

## 10. Chat-context bridging (selection → composer)

`ChatPanel` props include `chatContext: ChatContext` (built in `Generate.tsx:982-994`):

```ts
const chatContext: ChatContext = {
  targetMode,
  resolvedMode,
  activeFilePath: activeWorkspace.activeFile || undefined,
  selection: codeSelection
    ? { startLine, endLine, selectedText: codeSelection.text }
    : undefined,
  intent: codeSelection?.intent || "general",
};
```

`ChatContextStrip.tsx` (in `components/ide/chat/`) renders this above the composer — file pill, selected lines preview, intent badge.

When a user clicks an AI action in Monaco (`Explain` / `Debug` / `Fix` / `Optimize`):

1. `IdeWorkspace.handleAIAction(action)` → `props.onCodeAction(action, sel)`.
2. `Generate.tsx:1003-1029` → `setCodeSelection({ ...sel, intent: action })`.
3. The intent badge appears in `ChatContextStrip`.
4. After 2 seconds, `setTimeout` clears `intent` (line 1022-1026) so the badge fades but the file/selection context stays.

To **auto-send** the prompt, push it via the runtime's composer API in an effect that watches `codeSelection.intent`:

```ts
useEffect(() => {
  if (!codeSelection?.intent) return;
  const text = `${codeSelection.intent.toUpperCase()}:\n\`\`\`\n${codeSelection.text}\n\`\`\``;
  runtime.thread.append({ role: "user", content: text });   // assistant-ui runtime API
}, [codeSelection?.intent]);
```

(Wiring exists in legacy `ChatComposer`; new flow uses `runtime.thread.append`.)

## 11. Message parts you'll see

| Part type    | Where it comes from                              | Component                       |
|--------------|---------------------------------------------------|---------------------------------|
| `Text`       | Plain text deltas (default)                      | `MarkdownText` (markdown + GFM) |
| `tools`      | Tool calls in `streamText({ tools })`            | per-tool override or `ToolFallback` |
| `Reasoning`  | Reasoning deltas (`<thinking>` tokens, etc.)     | `Reasoning` + `ReasoningGroup`  |
| `Source`     | Citation deltas                                  | `Sources`                        |
| `Attachment` | Files sent with user messages                    | `UserMessageAttachments` etc.    |

## 12. Cancel mid-stream

`<ComposerPrimitive.Cancel>` calls `runtime.thread.cancel()` internally. The in-flight `fetch` is aborted via the `AbortController` the transport holds. `streamText` on the server will see the controller signal and stop generating (provider-dependent).

## 13. Common gotchas

- **No streaming, just a single chunk** — verify the route returns `result.toUIMessageStreamResponse()`, not `Response.json(result)`.
- **`Thinking...` never disappears** — provider isn't emitting any text deltas. Check logs at the API; some models emit only `tool_use` chunks until done.
- **`AssistantRuntimeProvider not found`** — calling `useChatRuntime` outside the provider, or rendering a primitive outside the provider tree.
- **Re-render storm on every keystroke** — keep memoized markdown via `memo(MarkdownTextImpl)`. Don't pass new object identities into `MessagePrimitive.Parts components` on every render — define the components map once at module scope.
