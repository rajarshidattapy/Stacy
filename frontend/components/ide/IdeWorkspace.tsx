"use client";
import { WorkspaceState, DeployedContract, IdeMode } from "@/types/ide";
import { cn } from "@/lib/utils";
import { IdeHeader, OPEN_FILE_SEARCH_EVENT } from "./IdeHeader";
import { FileExplorer } from "./FileExplorer";
import { ActionPanel } from "./ActionPanel";
import { AgentActionPanel } from "./AgentActionPanel";
import { ActivityBar, SidebarPanel } from "./ActivityBar";
import { SearchPanel } from "./SearchPanel";
import { ExtensionsPanel, IDEExtension } from "./ExtensionsPanel";
import { ExtensionDetailView } from "./ExtensionDetailView";
import { EmptyEditorView } from "./EmptyEditorView";
import { EditorTabs } from "./EditorTabs";
import type { PhaseGroup, StepEntry } from "@/hooks/useAgentState";
import { LogDock } from "./LogsDock";
import {
  CodeSelectionPopup,
  AIAction,
} from "@/components/ui/CodeSelectionPopup";
import {
  DEFAULT_MONACO_THEME,
  MONACO_THEME_CHANGE_EVENT,
  MonacoThemeName,
  getStoredMonacoTheme,
  isMonacoThemeName,
  loadMonacoThemeData,
} from "@/lib/monacoTheme";
import Editor, { OnMount } from "@monaco-editor/react";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";

interface IdeWorkspaceProps {
  mode: IdeMode;
  interactionMode?: "agentic" | "manual";
  workspace: WorkspaceState;
  deployedContracts: DeployedContract[];
  dispatch: (action: any) => void;
  onCompile: () => void;
  onDeploy: () => void;
  onGenerateBindings: (id: string) => void;
  onToggleFileExplorer: () => void;
  onToggleActionPanel: () => void;
  onToggleTerminal: () => void;
  onCodeAction?: (
    action: AIAction,
    selection: {
      file: string;
      startLine: number;
      endLine: number;
      text: string;
    },
  ) => void;
  // Compile/Deploy status props
  compilerStatus?: "IDLE" | "QUEUED" | "COMPILING" | "SUCCESS" | "ERROR";
  deployerStatus?: "IDLE" | "UPLOADING" | "INSTANTIATING" | "SUCCESS" | "ERROR";
  wasmHex?: string | null;
  latestContractId?: string | null;
  isWalletConnected?: boolean;
  // Network selection
  network?: "testnet" | "mainnet";
  onNetworkChange?: (network: "testnet" | "mainnet") => void;
  explorerUrl?: string | null;
  // Sandbox props
  sandboxPreviewUrl?: string | null;
  isSandboxRunning?: boolean;
  sandboxStatus?:
  | "idle"
  | "spawning"
  | "preview_starting"
  | "running"
  | "stopping"
  | "error";
  onSpawnSandbox?: () => void;
  onStopSandbox?: () => void;
  bindingsStatus?: "idle" | "generating" | "success" | "error";
  // File sync
  onRefreshFileTree?: () => void;
  isSandboxConnected?: boolean;
  // Preview sync
  onTogglePreview?: () => void;
  hasPendingChanges?: boolean;
  // Monaco sync callback - called to sync Monaco content to workspace state
  onMonacoSyncReady?: (syncFn: () => void) => void;
  // Callback to receive a function that force-pushes content into a Monaco model by path (for AI updates on closed files)
  onForceModelContentReady?: (fn: (path: string, content: string) => void) => void;
  // File sync
  onSyncToSandbox?: () => void;
  // Editor session reset when loading projects
  editorSessionKey?: number;
  onExecuteCommand?: (command: string) => void;
  // Agentic panel props
  agentPhaseGroups?: PhaseGroup[];
  agentLastAction?: StepEntry | null;
  onClearAgentSession?: () => void;
  onOpenEnvConfig?: () => void;
  isChatCollapsed?: boolean;
  onToggleChat?: () => void;
}

interface SelectionState {
  isVisible: boolean;
  position: { x: number; y: number };
  text: string;
  startLine: number;
  endLine: number;
}

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    rs: "rust",
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    css: "css",
    scss: "scss",
    json: "json",
    md: "markdown",
    toml: "toml",
    yaml: "yaml",
    yml: "yaml",
    html: "html",
    sh: "shell",
  };

  return map[ext] ?? "plaintext";
}

export function IdeWorkspace({
  mode,
  workspace,
  deployedContracts,
  dispatch,
  onCompile,
  onDeploy,
  onGenerateBindings,
  onToggleFileExplorer,
  onToggleActionPanel,
  onToggleTerminal,
  onCodeAction,
  compilerStatus,
  deployerStatus,
  wasmHex,
  latestContractId,
  isWalletConnected,
  network,
  onNetworkChange,
  explorerUrl,
  sandboxPreviewUrl,
  isSandboxRunning,
  sandboxStatus,
  onSpawnSandbox,
  onStopSandbox,
  bindingsStatus,
  onRefreshFileTree,
  isSandboxConnected,
  onTogglePreview,
  hasPendingChanges,
  onMonacoSyncReady,
  onForceModelContentReady,
  onSyncToSandbox,
  editorSessionKey,
  onExecuteCommand,
  interactionMode,
  agentPhaseGroups = [],
  agentLastAction = null,
  onClearAgentSession,
  onOpenEnvConfig,
  isChatCollapsed,
  onToggleChat,
}: IdeWorkspaceProps) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [editorTheme, setEditorTheme] =
    useState<MonacoThemeName>(DEFAULT_MONACO_THEME);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<SidebarPanel>("explorer");
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedExtension, setSelectedExtension] = useState<IDEExtension | null>(null);

  const handleOpenFile = useCallback(
    (file: string) => {
      setSelectedExtension(null);
      dispatch({ type: "OPEN_FILE", payload: file });
    },
    [dispatch],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const containerLeft = workspaceRef.current?.getBoundingClientRect().left ?? 0;
      const relativeWidth = e.clientX - containerLeft;

      if (relativeWidth < 50) {
        setSidebarWidth(260);
        setIsResizing(false);
        onToggleFileExplorer();
        return;
      }

      setSidebarWidth(Math.max(160, Math.min(600, relativeWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
    } else {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "default";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Track preview key to force-reload iframe after changes are synced
  const [previewKey, setPreviewKey] = useState(0);

  const openFileSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent(OPEN_FILE_SEARCH_EVENT));
  }, []);

  const openFindInFiles = useCallback(() => {
    if (!workspace.ui.isFileExplorerOpen) {
      onToggleFileExplorer();
    }

    setActiveSidebarPanel("search");
  }, [onToggleFileExplorer, workspace.ui.isFileExplorerOpen]);

  const openCommandPalette = useCallback(() => {
    openFileSearch();
  }, [openFileSearch]);

  useEffect(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "f") {
        event.preventDefault();
        openFindInFiles();
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "p") {
        event.preventDefault();
        openCommandPalette();
      }
    };

    document.addEventListener("keydown", handleGlobalShortcuts);
    return () => document.removeEventListener("keydown", handleGlobalShortcuts);
  }, [openCommandPalette, openFindInFiles]);
  const prevHasPendingChanges = useRef(hasPendingChanges);
  const prevIsPreviewMode = useRef(workspace.ui.isPreviewMode);

  // Auto-reload the iframe when:
  //   1. We just switched INTO preview mode, OR
  //   2. hasPendingChanges just flipped false→true→false (sync completed) while in preview mode
  useEffect(() => {
    const justEnteredPreview =
      !prevIsPreviewMode.current && workspace.ui.isPreviewMode;
    const syncCompleted =
      workspace.ui.isPreviewMode &&
      prevHasPendingChanges.current === true &&
      !hasPendingChanges;

    if (justEnteredPreview || syncCompleted) {
      setPreviewKey((k) => k + 1);
    }

    prevIsPreviewMode.current = workspace.ui.isPreviewMode;
    prevHasPendingChanges.current = hasPendingChanges;
  }, [workspace.ui.isPreviewMode, hasPendingChanges]);

  const handleRefreshPreview = useCallback(() => {
    setPreviewKey((k) => k + 1);
  }, []);

  const [selection, setSelection] = useState<SelectionState>({
    isVisible: false,
    position: { x: 0, y: 0 },
    text: "",
    startLine: 0,
    endLine: 0,
  });

  useEffect(() => {
    setEditorTheme(getStoredMonacoTheme());
  }, []);

  const applyEditorTheme = useCallback(
    async (themeName: MonacoThemeName, monacoInstance?: any) => {
      const monacoApi = monacoInstance || monacoRef.current;
      if (!monacoApi) return;

      if (themeName === "v0-dark") {
        monacoApi.editor.defineTheme("v0-dark", {
          base: "vs-dark",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": "#09090b",
            "editor.lineHighlightBackground": "#18181b",
            "editorLineNumber.foreground": "#52525b",
            "editor.selectionBackground": "#3b0764",
          },
        });
      } else {
        const themeData = await loadMonacoThemeData(themeName);
        monacoApi.editor.defineTheme(themeName, themeData);
      }

      monacoApi.editor.setTheme(themeName);
    },
    [],
  );

  useEffect(() => {
    if (!monacoRef.current) return;
    void applyEditorTheme(editorTheme);
  }, [editorTheme, applyEditorTheme]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: string }>;
      const nextTheme = customEvent.detail?.theme;

      if (nextTheme && isMonacoThemeName(nextTheme)) {
        setEditorTheme(nextTheme);
      } else {
        setEditorTheme(getStoredMonacoTheme());
      }
    };

    window.addEventListener(MONACO_THEME_CHANGE_EVENT, handleThemeChange);
    return () => {
      window.removeEventListener(MONACO_THEME_CHANGE_EVENT, handleThemeChange);
    };
  }, []);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    void applyEditorTheme(editorTheme, monaco);

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      void editor.getAction("actions.find")?.run();
    });

    // Configure TypeScript and JavaScript defaults for JSX support
    const compilerOptions = {
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      target: monaco.languages.typescript.ScriptTarget.Latest,
      allowJs: true,
      checkJs: false,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    };

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
      compilerOptions,
    );
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
      compilerOptions,
    );

    // Register react/jsx-runtime declaration (only once, cleanup-safe)
    const jsxRuntimeLib = `
      declare module "react/jsx-runtime" {
        export function jsx(type: any, props: any, key?: any): any;
        export function jsxs(type: any, props: any, key?: any): any;
        export function Fragment(props: { children?: any }): any;
      }
    `;

    // Check if already registered to avoid duplicates
    const existingLibs =
      monaco.languages.typescript.typescriptDefaults.getExtraLibs();
    if (!existingLibs || !existingLibs["react/jsx-runtime.d.ts"]) {
      const disposable =
        monaco.languages.typescript.typescriptDefaults.addExtraLib(
          jsxRuntimeLib,
          "react/jsx-runtime.d.ts",
        );
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        jsxRuntimeLib,
        "react/jsx-runtime.d.ts",
      );
      // Store disposable in monacoRef for potential cleanup
      if (!monacoRef.current._jsxRuntimeDisposable) {
        monacoRef.current._jsxRuntimeDisposable = disposable;
      }
    }

    // Listen for selection changes
    editor.onDidChangeCursorSelection((e: any) => {
      const sel = editor.getSelection();
      if (!sel || sel.isEmpty()) {
        setSelection((prev) => ({ ...prev, isVisible: false }));
        return;
      }

      const model = editor.getModel();
      if (!model) {
        setSelection((prev) => ({ ...prev, isVisible: false }));
        return;
      }

      // Expand partial line selections to full lines
      let startLine = sel.startLineNumber;
      let endLine = sel.endLineNumber;
      let expandedStartColumn = sel.startColumn;
      let expandedEndColumn = sel.endColumn;

      // Check if selection is on a single line and doesn't span the full line
      if (startLine === endLine) {
        const lineContent = model.getLineContent(startLine);
        const lineLength = lineContent.length;

        // If selection doesn't start at column 1 or doesn't end at the line's end, expand to full line
        if (sel.startColumn !== 1 || sel.endColumn !== lineLength + 1) {
          // Expand to full line
          expandedStartColumn = 1;
          expandedEndColumn = lineLength + 1;
        }
      } else {
        // Multi-line selection: expand each line to full lines
        const firstLineLength = model.getLineContent(startLine).length;
        const lastLineLength = model.getLineContent(endLine).length;

        // Expand start line to beginning if not already
        if (sel.startColumn !== 1) {
          expandedStartColumn = 1;
        }
        // Expand end line to end if not already
        if (sel.endColumn !== lastLineLength + 1) {
          expandedEndColumn = lastLineLength + 1;
        }
      }

      // Create expanded range using Monaco's Range API
      // Monaco Range is available on the monaco global object
      const Range = monaco.Range;
      const expandedSel = new Range(
        startLine,
        expandedStartColumn,
        endLine,
        expandedEndColumn,
      );

      // Get text from expanded selection
      const selectedText = model.getValueInRange(expandedSel) || "";
      if (selectedText.trim().length < 3) {
        setSelection((prev) => ({ ...prev, isVisible: false }));
        return;
      }

      // Get position for popup (near end of selection)
      const endPos = expandedSel.getEndPosition();
      const coords = editor.getScrolledVisiblePosition(endPos);
      const editorDom = editor.getDomNode();

      if (coords && editorDom) {
        const rect = editorDom.getBoundingClientRect();
        setSelection({
          isVisible: true,
          position: {
            x: rect.left + coords.left,
            y: rect.top + coords.top + 24,
          },
          text: selectedText,
          startLine: startLine,
          endLine: endLine,
        });
      }
    });
  };

  const handleAIAction = useCallback(
    (action: AIAction) => {
      if (!workspace.activeFile) return;

      // Close popup
      setSelection((prev) => ({ ...prev, isVisible: false }));

      // Call parent handler if provided - this will trigger chat message
      if (onCodeAction) {
        onCodeAction(action, {
          file: workspace.activeFile,
          startLine: selection.startLine,
          endLine: selection.endLine,
          text: selection.text,
        });
      }
    },
    [workspace.activeFile, selection, onCodeAction],
  );

  const activeContent = (() => {
    if (!workspace.activeFile) return "";
    const content = workspace.fileContents[workspace.activeFile];
    if (content === undefined) {
      console.warn("[Monaco] Missing content for", workspace.activeFile);
      return "// Loading from project…";
    }
    return content;
  })();

  // Function to sync Monaco editor content back to workspace state
  // This ensures Monaco (view layer) content is the source of truth after AI edits
  const syncMonacoToWorkspace = useCallback(
    (source: "editor" | "system" = "system") => {
      if (!editorRef.current || !workspace.activeFile) {
        return;
      }

      // GUARD: Validate Monaco model exists and is not disposed
      const model = editorRef.current.getModel();
      if (!model || model.isDisposed()) {
        console.warn("[Monaco] Model is disposed or missing, skipping sync");
        return;
      }

      try {
        const monacoContent = editorRef.current.getValue();
        const workspaceContent =
          workspace.fileContents[workspace.activeFile] || "";

        // GUARD: Never sync empty content (likely from unmount/disposal)
        if (
          monacoContent.trim().length === 0 &&
          workspaceContent.trim().length > 0
        ) {
          console.warn(
            "[Monaco] Refusing to sync empty content over existing content",
          );
          return;
        }

        // Only sync if content differs (avoid unnecessary updates)
        if (monacoContent !== workspaceContent) {
          console.log("[Monaco] Syncing Monaco content to workspace state:", {
            file: workspace.activeFile,
            monacoLength: monacoContent.length,
            workspaceLength: workspaceContent.length,
            source,
          });

          dispatch({
            type: "UPDATE_FILE",
            payload: {
              path: workspace.activeFile,
              content: monacoContent,
              source, // Use provided source (editor for compile, system for auto-sync)
            },
          });
        }
      } catch (error) {
        console.error("[Monaco] Error syncing Monaco to workspace:", error);
      }
    },
    [workspace.activeFile, workspace.fileContents, dispatch],
  );

  // Expose sync function to parent component
  useEffect(() => {
    if (onMonacoSyncReady) {
      onMonacoSyncReady(syncMonacoToWorkspace);
    }
  }, [onMonacoSyncReady, syncMonacoToWorkspace]);

  // Force-push content into a Monaco model by path (used by AI when updating a closed file)
  const forceSetModelContent = useCallback((path: string, content: string) => {
    if (!monacoRef.current) return;
    const model = monacoRef.current.editor.getModels().find((m: any) => {
      const uriStr = m.uri.toString();
      return uriStr.endsWith(path) || uriStr.includes(path);
    });
    if (model && !model.isDisposed()) {
      model.setValue(content);
    }
  }, []);

  useEffect(() => {
    if (onForceModelContentReady) {
      onForceModelContentReady(forceSetModelContent);
    }
  }, [onForceModelContentReady, forceSetModelContent]);

  // Sync Monaco to workspace when active file changes (ensures we capture any unsaved changes)
  // GUARD: Only sync when NOT in preview mode
  useEffect(() => {
    if (
      workspace.activeFile &&
      editorRef.current &&
      !workspace.ui.isPreviewMode
    ) {
      // Small delay to ensure Monaco has updated
      const timer = setTimeout(() => {
        syncMonacoToWorkspace();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [workspace.activeFile, syncMonacoToWorkspace, workspace.ui.isPreviewMode]);

  return (
    <div className="h-full w-full bg-[#050505] p-2.5 flex overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 bg-[#09090b] rounded-2xl border border-white/[0.12] overflow-hidden relative shadow-2xl shadow-black/50">
        {/* Code Selection Popup */}
        <CodeSelectionPopup
          isVisible={selection.isVisible}
          position={selection.position}
          onAction={handleAIAction}
          onClose={() => setSelection((prev) => ({ ...prev, isVisible: false }))}
        />

        {/* IDE Top Bar - Always visible */}
        <IdeHeader
          workspace={workspace}
          onToggleFileExplorer={onToggleFileExplorer}
          onToggleActionPanel={onToggleActionPanel}
          onToggleTerminal={onToggleTerminal}
          onCloseFile={(file) => dispatch({ type: "CLOSE_FILE", payload: file })}
          onSelectFile={handleOpenFile}
          onTogglePreview={
            onTogglePreview || (() => dispatch({ type: "TOGGLE_PREVIEW" }))
          }
          previewMode={workspace.ui.isPreviewMode}
          interactionMode={interactionMode}
          sandboxPreviewUrl={sandboxPreviewUrl}
          isSandboxRunning={isSandboxRunning}
          hasPendingChanges={hasPendingChanges}
          onOpenEnvConfig={onOpenEnvConfig}
          isChatCollapsed={isChatCollapsed}
          onToggleChat={onToggleChat}
        />

        {/* Full Preview Mode - Covers entire workspace */}
        {workspace.ui.isPreviewMode ? (
          <div className="flex-1 bg-[#09090b] flex flex-col">
            {workspace.mode === "contract" ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.05] border border-white/[0.12] flex items-center justify-center">
                  <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <p>Smart Contract compilation and deployment happen automatically in the background.</p>
                <p className="text-sm">Click the <strong>Code</strong> button above to view and edit your contracts.</p>
              </div>
            ) : sandboxPreviewUrl &&
              isSandboxRunning &&
              sandboxStatus !== "preview_starting" ? (
              // Live sandbox preview iframe
              <div className="flex-1 relative flex flex-col">
                {/* Browser-style address bar */}
                <div className="h-10 bg-[#0c0c0e] border-b border-white/[0.12] flex items-center gap-2 px-3 shrink-0 z-10">
                  {/* Status dot */}
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />

                  {/* Refresh button */}
                  <button
                    onClick={handleRefreshPreview}
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                    title="Reload preview"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>

                  {/* URL bar */}
                  <div className="flex-1 flex items-center bg-white/[0.05] border border-white/[0.12] rounded-md px-3 h-6 min-w-0">
                    <span className="text-xs text-zinc-400 font-mono truncate">
                      {sandboxPreviewUrl}
                    </span>
                  </div>

                  {/* Open in new tab */}
                  <button
                    onClick={() => window.open(sandboxPreviewUrl, "_blank")}
                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                    title="Open in new tab"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </button>
                </div>

                {/* iframe — key forces remount on reload */}
                <iframe
                  key={previewKey}
                  ref={iframeRef}
                  src={sandboxPreviewUrl}
                  className="flex-1 w-full border-0"
                  title="Sandbox Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              </div>
            ) : (
              // Placeholder when sandbox not running
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="text-zinc-600 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-white/[0.05] border border-white/[0.12] flex items-center justify-center">
                    {sandboxStatus === "spawning" ||
                      sandboxStatus === "preview_starting" ? (
                      <svg
                        className="w-10 h-10 text-[#4ee06a] animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <svg
                        className="w-10 h-10 text-[#4ee06a]/50"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium text-zinc-400">
                      {sandboxStatus === "spawning"
                        ? "Starting Sandbox..."
                        : sandboxStatus === "preview_starting"
                          ? "Starting Dev Server…"
                          : "Live Preview"}
                    </p>
                    <p className="text-sm text-zinc-600 max-w-[280px] mt-1">
                      {sandboxStatus === "spawning"
                        ? "Setting up your development environment"
                        : sandboxStatus === "preview_starting"
                          ? "Next.js dev server is booting up, this takes ~30 seconds…"
                          : "Start a sandbox to preview your frontend in real-time"}
                    </p>
                  </div>
                  {sandboxStatus !== "spawning" &&
                    sandboxStatus !== "preview_starting" &&
                    onSpawnSandbox && (
                      <button
                        onClick={onSpawnSandbox}
                        className="mt-4 px-4 py-2 rounded-lg bg-[#4ee06a] hover:bg-[#4ee06a] text-white text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        Start Sandbox
                      </button>
                    )}
                  {!onSpawnSandbox && (
                    <div className="mt-4 px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.12] text-xs text-zinc-500">
                      Click the <span className="text-[#4ee06a]">Code</span>{" "}
                      button to return to editor
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Main Workspace Body */}
            <div ref={workspaceRef} className="flex-1 flex min-h-0 relative">
              <div className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden">
                <div className="flex-1 flex min-h-0 relative">
                  {workspace.ui.isFileExplorerOpen && (
                    <div
                      className="flex flex-col shrink-0 border-r border-white/[0.12] bg-[#09090b] relative group"
                      style={{ width: `${sidebarWidth}px` }}
                    >
                      <ActivityBar
                        activePanel={activeSidebarPanel}
                        onPanelSelect={(panel) => {
                          if (panel) {
                            setActiveSidebarPanel(panel);
                          } else {
                            onToggleFileExplorer();
                          }
                        }}
                      />
                      <div className="flex-1 min-h-0">
                        {activeSidebarPanel === "explorer" && (
                          <FileExplorer
                            files={workspace.fileTree}
                            activeFile={workspace.activeFile}
                            onSelectFile={handleOpenFile}
                            isOpen={true}
                            onAddFile={(parentPath, fileName) =>
                              dispatch({
                                type: "ADD_FILE",
                                payload: { parentPath, fileName },
                              })
                            }
                            onAddFolder={(parentPath, folderName) =>
                              dispatch({
                                type: "ADD_FOLDER",
                                payload: { parentPath, folderName },
                              })
                            }
                            onRename={(oldPath, newName) =>
                              dispatch({ type: "RENAME_FILE", payload: { oldPath, newName } })
                            }
                            onDelete={(path) =>
                              dispatch({ type: "DELETE_FILE", payload: { path } })
                            }
                            onRefresh={onRefreshFileTree}
                            showRefresh={mode === "frontend" && isSandboxConnected}
                          />
                        )}
                        {activeSidebarPanel === "search" && (
                          <SearchPanel
                            files={workspace.fileTree}
                            fileContents={workspace.fileContents}
                            onSelectFile={handleOpenFile}
                            dispatch={dispatch}
                          />
                        )}
                        {activeSidebarPanel === "extensions" && (
                          <ExtensionsPanel
                            activeExtensionId={selectedExtension?.id}
                            onSelectExtension={setSelectedExtension}
                          />
                        )}
                      </div>

                      {/* Resizer Handle */}
                      <div
                        onMouseDown={handleMouseDown}
                        onDoubleClick={() => setSidebarWidth(260)}
                        className={cn(
                          "absolute top-0 right-0 w-[4px] -mr-[2px] h-full cursor-col-resize z-50 transition-colors flex items-center justify-center group/resizer",
                          isResizing ? "bg-[#4ade80]" : "hover:bg-zinc-700 bg-transparent"
                        )}
                      >
                        <div className={cn(
                          "w-[2px] h-8 rounded-full transition-colors",
                          isResizing ? "bg-white/50" : "bg-zinc-800 group-hover/resizer:bg-zinc-500"
                        )} />
                      </div>
                    </div>
                  )}

                  {/* Center Editor Area */}
                  <div className="flex-1 flex flex-col min-w-0 bg-transparent">
                    {!selectedExtension && workspace.activeFile && (
                      <EditorTabs
                        openFiles={workspace.openFiles}
                        activeFile={workspace.activeFile}
                        onSelectFile={handleOpenFile}
                        onCloseFile={(file) => dispatch({ type: "CLOSE_FILE", payload: file })}
                      />
                    )}
                    <div className="flex-1 relative">
                      {selectedExtension ? (
                        <ExtensionDetailView
                          extension={selectedExtension}
                          onClose={() => setSelectedExtension(null)}
                        />
                      ) : workspace.activeFile ? (
                        <Editor
                          height="100%"
                          defaultLanguage={getLanguage(workspace.activeFile)}
                          key={editorSessionKey}
                          path={workspace.activeFile}
                          value={activeContent}
                          theme={editorTheme}
                          onMount={handleEditorMount}
                          onChange={(val) =>
                            dispatch({
                              type: "UPDATE_FILE",
                              payload: {
                                path: workspace.activeFile,
                                content: val,
                                source: "editor",
                              },
                            })
                          }
                          options={{
                            minimap: { autohide: "scroll" },
                            fontSize: 13,
                            fontFamily: "JetBrains Mono, monospace",
                            padding: { top: 16 },
                            scrollBeyondLastLine: false,
                            smoothScrolling: true,
                            cursorBlinking: "smooth",
                            lineNumbersMinChars: 4,
                            find: {
                              addExtraSpaceOnTop: false,
                              autoFindInSelection: "never",
                              seedSearchStringFromSelection: "always",
                            },
                          }}
                        />
                      ) : (
                        <EmptyEditorView
                          onGoToFile={openFileSearch}
                          onFindInFiles={openFindInFiles}
                          onCommandPalette={openCommandPalette}
                          onToggleTerminal={onToggleTerminal}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Terminal Dock - Covers Sidebar + Editor */}
                <LogDock
                  isOpen={workspace.ui.isTerminalOpen}
                  logs={workspace.terminalLogs}
                  status={workspace.terminalStatus}
                  onClear={() => dispatch({ type: "CLEAR_LOGS" })}
                  onToggle={onToggleTerminal}
                  onExecuteCommand={onExecuteCommand}
                />
              </div>

              {/* Right Panel - Full Height */}
              {interactionMode === "agentic" ? (
                <AgentActionPanel
                  isOpen={workspace.ui.isActionPanelOpen}
                  phaseGroups={agentPhaseGroups}
                  lastAction={agentLastAction}
                  onClearSession={onClearAgentSession ?? (() => { })}
                />
              ) : (
                <ActionPanel
                  mode={mode}
                  isOpen={workspace.ui.isActionPanelOpen}
                  terminalStatus={workspace.terminalStatus}
                  deployedContracts={deployedContracts}
                  onCompile={onCompile}
                  onDeploy={onDeploy}
                  onGenerateBindings={onGenerateBindings}
                  compilerStatus={compilerStatus}
                  deployerStatus={deployerStatus}
                  wasmHex={wasmHex}
                  latestContractId={latestContractId}
                  isWalletConnected={isWalletConnected}
                  network={network}
                  onNetworkChange={onNetworkChange}
                  explorerUrl={explorerUrl}
                  sandboxStatus={sandboxStatus}
                  isSandboxConnected={isSandboxRunning}
                  onSpawnSandbox={onSpawnSandbox}
                  onStopSandbox={onStopSandbox}
                  bindingsStatus={bindingsStatus}
                  onSyncToSandbox={onSyncToSandbox}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
