# 14 — React Contexts (`contexts/`) — Deep Dive

Four contexts. Each has a Provider component + `useXContext()` consumer hook that throws if used outside the provider.

---

## 1. `SandboxContext.tsx` (~31 lines)

Wraps `useStellarIDE().sandbox` so deeply-nested components can read it without prop drilling.

```ts
import { createContext, useContext } from "react";
import { StellarIDEHook } from "@/hooks/useStellarIDE";

type SandboxContextType = StellarIDEHook["sandbox"];
const SandboxContext = createContext<SandboxContextType | undefined>(undefined);

export function SandboxProvider({ children, sandbox }: {
  children: React.ReactNode;
  sandbox: SandboxContextType;
}) {
  return <SandboxContext.Provider value={sandbox}>{children}</SandboxContext.Provider>;
}

export function useSandboxContext() {
  const ctx = useContext(SandboxContext);
  if (ctx === undefined) throw new Error("useSandboxContext must be used within a SandboxProvider");
  return ctx;
}
```

Mounted in `Generate.tsx:1960`:
```tsx
<SandboxProvider sandbox={stellarIDE.sandbox}>
  ...entire IDE tree...
</SandboxProvider>
```

Consumers:
- `ChatPanel.tsx:39` — reads `isFrontendMode` and could trigger sandbox actions on send.
- Any future component (e.g., a custom message-part UI for AI tool calls that need to know sandbox status).

The context value is **the same reference per render** unless `useStellarIDE` returns a new sandbox object. `useSandbox` rebuilds its return on each render (object literal), so consumers re-render whenever the page re-renders. If this becomes a perf issue, memoize via `useMemo` inside `useSandbox`.

## 2. `ChatContext.tsx` (~85 lines)

Holds chat session metadata + a `pendingPrompt` slot for cross-component prompt injection.

```ts
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

interface PendingPrompt { content: string; timestamp: number }

interface ChatContextType {
  messages: ChatMessage[];
  addMessage: (m: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setMessages: (m: ChatMessage[]) => void;
  pendingPrompt: PendingPrompt | null;
  setPendingPrompt: (p: PendingPrompt | null) => void;
  chatSessionId: string;     // generated once per mount
}

function generateSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const WELCOME = {
  id: 'welcome', role: 'assistant',
  content: `Welcome to Stacy, I'm your AI assistant. I'm ready to help you build Stellar smart contracts and frontends.`,
  timestamp: Date.now(),
};

export function ChatProvider({ children }) {
  const [messages, setMessagesState] = useState<ChatMessage[]>([WELCOME]);
  const [chatSessionId] = useState(generateSessionId);
  const [pendingPrompt, setPendingPromptState] = useState<PendingPrompt | null>(null);

  const addMessage = useCallback((m) => {
    setMessagesState(prev => [...prev, { ...m, id: `msg-${Date.now()}-...`, timestamp: Date.now() }]);
  }, []);

  const clearMessages   = useCallback(() => setMessagesState([WELCOME]), []);
  const setMessages     = useCallback((m: ChatMessage[]) => setMessagesState(m), []);
  const setPendingPrompt= useCallback((p) => setPendingPromptState(p), []);

  return <ChatContext.Provider value={{ messages, addMessage, clearMessages, setMessages, pendingPrompt, setPendingPrompt, chatSessionId }}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (ctx === undefined) throw new Error('useChatContext must be used within a ChatProvider');
  return ctx;
}
```

### Status today

- `messages`/`addMessage`/`clearMessages`/`setMessages` — **legacy**. The visible chat is owned by the `assistant-ui` runtime (in-memory thread store) inside `<AssistantRuntimeProvider>`. This array is a parallel mirror used by:
  - `AgentActionPanel.<StepCard>.handleRepeat` — calls `addMessage` to push "Re-run: …" into this legacy array. Doesn't actually trigger an assistant response unless wired to the runtime.
- `pendingPrompt` — bridge for "user clicked AI action on selection" → composer pre-fill. Effects can watch this and call `runtime.thread.append(...)`.
- `chatSessionId` — surfaces a stable id per page load for analytics or server-side correlation.

### Used by

- `AgentActionPanel.tsx:48` — `useChatContext().addMessage`.
- Anywhere else that wants to surface a system message into chat history without going through the AI.

If you remove the legacy array, also drop the `addMessage` import in `AgentActionPanel`.

## 3. `BuilderPassContext.tsx` (~30 lines)

Tiny provider for the user's premium entitlement.

```ts
interface BuilderPassContextType {
  hasPass: boolean;
  // additional fields (expiresAt?, plan?) per implementation
}

export const BuilderPassContext = createContext<BuilderPassContextType | undefined>(undefined);

export function BuilderPassProvider({ children }) {
  // fetch entitlement from Supabase or similar
  return <BuilderPassContext.Provider value={...}>{children}</BuilderPassContext.Provider>;
}

export function useBuilderPassContext() {
  const ctx = useContext(BuilderPassContext);
  if (ctx === undefined) throw new Error('useBuilderPassContext must be used within a BuilderPassProvider');
  return ctx;
}
```

Wrapped by `useBuilderPass()` in `hooks/`. Used by `PricingModal` and chat upgrade CTAs.

## 4. `GitHubContext.tsx` (~50 lines)

Holds OAuth-acquired GitHub state for "Save to GitHub" / "Open from GitHub" flows.

```ts
interface GitHubContextType {
  token: string | null;
  user:  { login: string; avatar_url: string } | null;
  selectedRepo: { owner: string; name: string } | null;
  setToken, setUser, setSelectedRepo
  isAuthenticated: boolean
}
```

OAuth flow lives outside the context (server route or popup flow); this context just stores the resulting token/user for the UI.

## 5. Context-vs-prop decision tree

| Question                                                            | Use                                |
|---------------------------------------------------------------------|------------------------------------|
| Does only one subtree need this state?                              | Plain prop drilling.                |
| Multiple distant siblings need it?                                  | Context.                            |
| Does the value change frequently and would re-render expensive trees?| Split into multiple contexts. Or use Zustand/Jotai. |
| Is it ephemeral to one render?                                      | useState in the parent.             |
| Is it owned by an external lib (assistant-ui, monaco)?              | Read directly via lib's own hooks. |

## 6. Provider mounting order in `Generate.tsx`

```
<SandboxProvider>            ← lowest (deps on stellarIDE which is page-level state)
  ... rest of tree...
</SandboxProvider>
```

`<ChatProvider>`, `<BuilderPassProvider>`, `<GitHubProvider>` are typically mounted higher (e.g., in `app/layout.tsx`) so login/landing routes also see them. Verify in the actual `app/layout.tsx` file before assuming.

## 7. Why `useContext` throws on misuse

```ts
if (ctx === undefined) throw new Error("...");
```

Default value is `undefined`; consumer outside the provider gets `undefined` and the throw turns a silent bug into a loud one. Pattern in all four contexts.

## 8. Bug-trace

| Symptom                                                  | Look at                                                                 |
|----------------------------------------------------------|-------------------------------------------------------------------------|
| `useSandboxContext must be used within a SandboxProvider`| Component rendered above `<SandboxProvider>` boundary, or in a portal that escapes it. |
| Repeat button in agent panel does nothing               | `addMessage` mutates legacy ChatContext only, not assistant-ui runtime. Wire to `runtime.thread.append`. |
| Welcome message shows after clearing                    | `clearMessages()` reseeds with `WELCOME` (intentional).                  |
| `chatSessionId` changes mid-session                     | `useState(generateSessionId)` gets the function form — runs once. If you see changes, someone added it to deps array.|
| BuilderPass entitlement stale                           | Re-fetch on auth change in `BuilderPassProvider`. Subscribe to Supabase auth events.|
