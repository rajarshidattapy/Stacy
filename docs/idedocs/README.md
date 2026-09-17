# Stacy IDE — Developer Onboarding Docs

This folder is the **single entry point** for understanding how the in-browser IDE in `components/ide/` is built and how it talks to chat AI, the Monaco editor, the sandbox, the agent, and the VS Code extension host.

Read in this order:

1. **[01-architecture.md](./01-architecture.md)** — high-level picture. What lives where, how data flows.
2. **[02-tech-stack.md](./02-tech-stack.md)** — every library used, and *what role each plays*.
3. **[03-state-and-reducer.md](./03-state-and-reducer.md)** — `WorkspaceState` shape and the reducer actions that mutate it.
4. **[04-ide-workspace.md](./04-ide-workspace.md)** — `IdeWorkspace.tsx` walkthrough (the root IDE shell).
5. **[05-monaco-editor.md](./05-monaco-editor.md)** — Monaco mount, themes, JSX support, sync to state, AI selection popup.
6. **[06-file-explorer-tabs.md](./06-file-explorer-tabs.md)** — file tree, editor tabs, breadcrumbs, activity bar.
7. **[07-search-panel.md](./07-search-panel.md)** — find / find-and-replace across files.
8. **[08-chat-and-assistant-ui.md](./08-chat-and-assistant-ui.md)** — `assistant-ui` runtime, Thread, Composer, AI streaming, `/api/chat`.
9. **[09-action-panels.md](./09-action-panels.md)** — manual `ActionPanel` (compile/deploy) vs agentic `AgentActionPanel`.
10. **[10-logs-terminal.md](./10-logs-terminal.md)** — `LogDock` parser, terminal command execution.
11. **[11-extensions-system.md](./11-extensions-system.md)** — VS Code-style extension host, vscode-api shim, marketplace + Open VSX, Monaco theme extensions.
12. **[12-sandbox-and-agent.md](./12-sandbox-and-agent.md)** — sandbox lifecycle, agent signals, phase grouping, file sync.
13. **[13-hooks.md](./13-hooks.md)** — every hook in `hooks/` and what state it owns.
14. **[14-contexts.md](./14-contexts.md)** — React contexts (Sandbox, Chat, BuilderPass, GitHub).
15. **[15-routing-and-pages.md](./15-routing-and-pages.md)** — Next.js pages, `/generate` entry point, `/api/*` routes.
16. **[16-common-tasks.md](./16-common-tasks.md)** — "if a junior dev wants to fix X, look here" recipe book.
17. **[17-glossary.md](./17-glossary.md)** — every acronym, jargon, file path quick-lookup.

## TL;DR mental model

```
app/generate/page.tsx
  └─ components/generate/Generate.tsx        (page-level orchestrator: useReducer × 2, useStellarIDE, agent state)
       ├─ GlobalTopBar / HomeSidebar         (chrome)
       ├─ ChatPanel                           (assistant-ui Thread, /api/chat streaming)
       └─ IdeWorkspace                        (the IDE itself)
             ├─ IdeHeader                     (file search Cmd+Shift+P, preview toggle, etc.)
             ├─ ActivityBar                   (3 tabs: Explorer / Search / Extensions)
             ├─ FileExplorer | SearchPanel | ExtensionsPanel  (one of, sidebar)
             ├─ EditorTabs + Monaco Editor    (with CodeSelectionPopup → AI actions)
             ├─ LogDock                       (logs + terminal)
             └─ ActionPanel | AgentActionPanel (right panel by interaction mode)
```

State lives in **two reducers** (`contractState`, `frontendState`) inside `Generate.tsx`. All file ops (`OPEN_FILE`, `UPDATE_FILE`, `ADD_FILE`, etc.) flow through `dispatch`. Monaco is the *view*; reducer state is the *truth* — they sync both ways via `syncMonacoToWorkspace`.
