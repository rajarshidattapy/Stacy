"use client";
import { useState, useReducer, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SandboxProvider } from "@/contexts/SandboxContext";
import dynamic from "next/dynamic";

const GlobalTopBar = dynamic(
  () => import("@/components/ide/GlobalTopBar").then((mod) => mod.GlobalTopBar),
  { ssr: false },
);
const HomeSidebar = dynamic(
  () => import("@/components/ide/HomeSidebar").then((mod) => mod.HomeSidebar),
  { ssr: false },
);

import { ChatPanel } from "@/components/ide/ChatPanel";
import { IdeWorkspace } from "@/components/ide/IdeWorkspace";
import {
  IdeMode,
  WorkspaceState,
  DeployedContract,
  ChatContext,
  ChatTargetMode,
  FileNode,
} from "@/types/ide";
import { useStellarIDE } from "@/hooks/useStellarIDE";
import { useAgentState } from "@/hooks/useAgentState";
import {
  transformFilesForBackend,
  getActiveContractName,
} from "@/lib/fileTransform";
import {
  addFileToTree,
  addFolderToTree,
  renameNodeInTree,
  deleteNodeFromTree,
  ensureFilePathInTree,
  getAllFilePaths,
  pathExists,
} from "@/lib/fileTreeUtils";
import { FileTreeSyncData, FileContentSyncData } from "@/hooks/useSandbox";
import { ProjectsModal } from "@/components/ide/ProjectsModal";
import { VersionsModal } from "@/components/ide/VersionsModal";
import { EnvConfigModal } from "@/components/ide/EnvConfigModal";
import { SaveProjectDialog } from "@/components/ide/SaveProjectDialog";

// --- Initial State Mock Data ---

// Soroban contract structure:
// hello_world/
// ├── contracts/
// │   └── hello_world/
// │       ├── src/
// │       │   └── lib.rs
// │       └── Cargo.toml
// └── Cargo.toml (root workspace)

// Empty initial states — file tree and contents are populated from the sandbox on connect.
const INITIAL_CONTRACT_STATE: WorkspaceState = {
  mode: "contract",
  fileTree: [],
  openFiles: [],
  activeFile: null,
  recentFiles: [],
  fileContents: {},
  terminalLogs: ["Contract workspace ready. Waiting for sandbox..."],
  terminalStatus: "idle",
  ui: {
    isFileExplorerOpen: true,
    isActionPanelOpen: true,
    isTerminalOpen: true,
    isPreviewMode: false,
  },
};

// Initial frontend state — populated from sandbox on connect.
const INITIAL_FRONTEND_CONTENTS: Record<string, string> = {
  "app/page.tsx": `import ContractDemo from "@/components/ContractDemo";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
            Stellar App
          </h1>
          <p className="text-gray-400">
            Built with Stacy IDE - Your AI-powered Stellar development environment
          </p>
        </div>

        {/* Contract Interaction Demo */}
        <ContractDemo />

        {/* Instructions */}
        <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
          <h2 className="text-xl font-semibold mb-4">Getting Started</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Deploy your smart contract from the Contract Mode</li>
            <li>Click &quot;Generate Bindings&quot; in the Frontend Mode action panel</li>
            <li>The AI will generate TypeScript bindings and integration code</li>
            <li>Use the ContractDemo component above to test your contract</li>
          </ol>
        </div>

        {/* Status */}
        <div className="text-center text-sm text-gray-500">
          <p>Live Preview • Hot Reload Enabled</p>
        </div>
      </div>
    </main>
  );
}`,
  "app/layout.tsx": `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stellar App",
  description: "Built with Stacy IDE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-950 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}`,
  "app/globals.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #030712;
  --foreground: #f9fafb;
}

body {
  color: var(--foreground);
  background: var(--background);
}`,
  "components/ContractDemo.tsx": `'use client';

import { useState } from 'react';

export default function ContractDemo() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callContract = async () => {
    if (!input.trim()) {
      setError('Please enter a value');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(\`/api/contract/hello?name=\${encodeURIComponent(input)}\`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || \`HTTP \${response.status}\`);
      }

      const data = await response.json();

      if (Array.isArray(data.result)) {
        setResult(data.result.join(' '));
      } else if (typeof data.result === 'object') {
        setResult(JSON.stringify(data.result, null, 2));
      } else {
        setResult(String(data.result ?? data.greeting ?? 'Success'));
      }
    } catch (err) {
      console.error('Contract call failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to call contract');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
        <h2 className="text-xl font-semibold">Contract Interaction</h2>
      </div>

      <p className="text-gray-400 text-sm">
        Test your deployed smart contract. Enter a parameter and click "Call Contract".
      </p>

      <div className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter parameter value..."
          disabled={loading}
          className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg
                     text-white placeholder-gray-500 focus:outline-none focus:ring-2
                     focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
        />
        <button
          onClick={callContract}
          disabled={loading}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800
                     disabled:cursor-not-allowed text-white font-medium rounded-lg
                     transition-colors"
        >
          {loading ? 'Calling...' : 'Call Contract'}
        </button>
      </div>

      {result && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <span className="text-green-400 font-medium text-sm">Success: </span>
          <pre className="text-green-300 font-mono text-sm">{result}</pre>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <span className="text-red-400 font-medium text-sm">Error: </span>
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}`,
  "app/api/contract/hello/route.ts": `import { NextResponse } from 'next/server';

// NOTE: Imports will be available after running "Generate Bindings"
// import { Client, networks } from '@/bindings/src';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name') || 'World';

    // Placeholder response until bindings are generated
    return NextResponse.json({
      result: ['Hello', name],
      success: true,
      note: 'This is a placeholder. Generate bindings to enable real contract calls.'
    });

  } catch (error) {
    console.error('Contract call error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error', success: false },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { params } = body;

    return NextResponse.json({
      success: true,
      note: 'POST handler placeholder. Implement after generating bindings.',
      receivedParams: params
    });

  } catch (error) {
    console.error('Contract call error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error', success: false },
      { status: 500 }
    );
  }
}`,
  "package.json": `{
  "name": "sandbox-nextjs",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.21",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@stellar/stellar-sdk": "^13.1.0"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5",
    "tailwindcss": "^3.4.1",
    "postcss": "^8",
    "autoprefixer": "^10.0.1"
  }
}`,
  "tailwind.config.ts": `import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
} satisfies Config;`,
  "tsconfig.json": `{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`,
  "next.config.mjs": `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
};

export default nextConfig;`,
  "postcss.config.mjs": `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;`,
};

// Initial frontend state — populated from sandbox on connect.
const INITIAL_FRONTEND_STATE: WorkspaceState = {
  mode: "frontend",
  fileTree: [],
  openFiles: [],
  activeFile: null,
  recentFiles: [],
  fileContents: {},
  terminalLogs: ["Frontend workspace ready. Waiting for sandbox..."],
  terminalStatus: "idle",
  ui: {
    isFileExplorerOpen: true,
    isActionPanelOpen: true,
    isTerminalOpen: true,
    isPreviewMode: false,
  },
};

// --- Reducer ---

type Action =
  | { type: "OPEN_FILE"; payload: string }
  | { type: "CLOSE_FILE"; payload: string }
  | {
      type: "UPDATE_FILE";
      payload: {
        path: string;
        content: string;
        source?: "editor" | "ai" | "system";
      };
    }
  | { type: "TOGGLE_EXPLORER" }
  | { type: "TOGGLE_ACTION_PANEL" }
  | { type: "TOGGLE_TERMINAL" }
  | { type: "TOGGLE_PREVIEW" }
  | { type: "SET_TERMINAL_STATUS"; payload: WorkspaceState["terminalStatus"] }
  | { type: "ADD_LOG"; payload: string }
  | { type: "CLEAR_LOGS" }
  | { type: "ADD_BINDINGS_FILE"; payload: { name: string; content: string } }
  | {
      type: "ADD_FILE";
      payload: { parentPath: string; fileName: string; content?: string };
    }
  | { type: "ADD_FOLDER"; payload: { parentPath: string; folderName: string } }
  | { type: "RENAME_FILE"; payload: { oldPath: string; newName: string } }
  | { type: "DELETE_FILE"; payload: { path: string } }
  | { type: "SYNC_FILE_TREE"; payload: FileNode[] }
  | { type: "SYNC_FILE_CONTENT"; payload: { path: string; content: string } }
  | { type: "MARK_FILE_LOADING"; payload: string }
  | { type: "LOAD_PROJECT"; payload: WorkspaceState }
  | { type: "RESET_IDE"; payload: { mode: IdeMode } };

function workspaceReducer(
  state: WorkspaceState,
  action: Action,
): WorkspaceState {
  switch (action.type) {
    case "LOAD_PROJECT":
      const fallbackRecentFiles = action.payload.activeFile
        ? [
            action.payload.activeFile,
            ...action.payload.openFiles.filter(
              (file) => file !== action.payload.activeFile,
            ),
          ]
        : action.payload.openFiles;
      return {
        ...action.payload,
        recentFiles: action.payload.recentFiles ?? fallbackRecentFiles,
      };
    case "RESET_IDE":
      return action.payload.mode === "contract"
        ? { ...INITIAL_CONTRACT_STATE }
        : { ...INITIAL_FRONTEND_STATE };
    case "OPEN_FILE": {
      const path = action.payload;
      const recentFiles = [
        path,
        ...(state.recentFiles ?? []).filter((file) => file !== path),
      ].slice(0, 20);

      if (!state.openFiles.includes(path)) {
        return {
          ...state,
          recentFiles,
          openFiles: [...state.openFiles, path],
          activeFile: path,
        };
      }
      return { ...state, recentFiles, activeFile: path };
    }
    case "CLOSE_FILE":
      const newOpen = state.openFiles.filter((f) => f !== action.payload);
      return {
        ...state,
        openFiles: newOpen,
        activeFile:
          state.activeFile === action.payload
            ? newOpen[newOpen.length - 1] || null
            : state.activeFile,
      };
    case "UPDATE_FILE":
      return {
        ...state,
        fileContents: {
          ...state.fileContents,
          [action.payload.path]: action.payload.content,
        },
      };
    case "TOGGLE_EXPLORER":
      return {
        ...state,
        ui: { ...state.ui, isFileExplorerOpen: !state.ui.isFileExplorerOpen },
      };
    case "TOGGLE_ACTION_PANEL":
      return {
        ...state,
        ui: { ...state.ui, isActionPanelOpen: !state.ui.isActionPanelOpen },
      };
    case "TOGGLE_TERMINAL":
      return {
        ...state,
        ui: { ...state.ui, isTerminalOpen: !state.ui.isTerminalOpen },
      };
    case "TOGGLE_PREVIEW":
      return {
        ...state,
        ui: { ...state.ui, isPreviewMode: !state.ui.isPreviewMode },
      };
    case "SET_TERMINAL_STATUS":
      return { ...state, terminalStatus: action.payload };
    case "ADD_LOG":
      return {
        ...state,
        terminalLogs: [...state.terminalLogs, action.payload],
      };
    case "CLEAR_LOGS":
      return { ...state, terminalLogs: ["Console cleared."] };
    case "ADD_BINDINGS_FILE": {
      const filePath = action.payload.name;
      const isAlreadyOpen = state.openFiles.includes(filePath);
      const updatedTree = ensureFilePathInTree(state.fileTree, filePath);
      const recentFiles = [
        filePath,
        ...(state.recentFiles ?? []).filter((file) => file !== filePath),
      ].slice(0, 20);

      return {
        ...state,
        fileTree: updatedTree,
        recentFiles,
        fileContents: {
          ...state.fileContents,
          [filePath]: action.payload.content,
        },
        openFiles: isAlreadyOpen
          ? state.openFiles
          : [...state.openFiles, filePath],
        activeFile: filePath,
      };
    }
    case "ADD_FILE": {
      const newTree = addFileToTree(
        state.fileTree,
        action.payload.parentPath,
        action.payload.fileName,
      );
      const newFilePath = action.payload.parentPath
        ? `${action.payload.parentPath}/${action.payload.fileName}`
        : action.payload.fileName;
      const recentFiles = [
        newFilePath,
        ...(state.recentFiles ?? []).filter((file) => file !== newFilePath),
      ].slice(0, 20);

      return {
        ...state,
        fileTree: newTree,
        recentFiles,
        fileContents: {
          ...state.fileContents,
          [newFilePath]: action.payload.content || "",
        },
        openFiles: state.openFiles.includes(newFilePath)
          ? state.openFiles
          : [...state.openFiles, newFilePath],
        activeFile: newFilePath,
      };
    }
    case "ADD_FOLDER": {
      const newTree = addFolderToTree(
        state.fileTree,
        action.payload.parentPath,
        action.payload.folderName,
      );
      return {
        ...state,
        fileTree: newTree,
      };
    }
    case "RENAME_FILE": {
      const pathParts = action.payload.oldPath.split("/").filter(Boolean);
      pathParts[pathParts.length - 1] = action.payload.newName;
      const newPath = pathParts.join("/");

      const newTree = renameNodeInTree(
        state.fileTree,
        action.payload.oldPath,
        action.payload.newName,
      );

      // Update fileContents keys
      const newFileContents = { ...state.fileContents };
      if (action.payload.oldPath in newFileContents) {
        newFileContents[newPath] = newFileContents[action.payload.oldPath];
        delete newFileContents[action.payload.oldPath];
      }

      // Update openFiles
      const newOpenFiles = state.openFiles.map((f) =>
        f === action.payload.oldPath ? newPath : f,
      );
      const newRecentFiles = (state.recentFiles ?? []).map((file) =>
        file === action.payload.oldPath ? newPath : file,
      );

      return {
        ...state,
        fileTree: newTree,
        fileContents: newFileContents,
        recentFiles: newRecentFiles,
        openFiles: newOpenFiles,
        activeFile:
          state.activeFile === action.payload.oldPath
            ? newPath
            : state.activeFile,
      };
    }
    case "DELETE_FILE": {
      const newTree = deleteNodeFromTree(state.fileTree, action.payload.path);

      // Remove from fileContents - also remove all files in deleted folder
      const newFileContents = { ...state.fileContents };
      delete newFileContents[action.payload.path];

      // If it's a folder, remove all files that start with the folder path
      Object.keys(newFileContents).forEach((filePath) => {
        if (filePath.startsWith(action.payload.path + "/")) {
          delete newFileContents[filePath];
        }
      });

      // Remove from openFiles - also remove all files in deleted folder
      const newOpenFiles = state.openFiles.filter((f) => {
        return (
          f !== action.payload.path && !f.startsWith(action.payload.path + "/")
        );
      });
      const newRecentFiles = (state.recentFiles ?? []).filter((file) => {
        return (
          file !== action.payload.path && !file.startsWith(action.payload.path + "/")
        );
      });

      // If deleted file/folder was active, switch to another file
      const newActiveFile =
        state.activeFile === action.payload.path ||
        (state.activeFile &&
          state.activeFile.startsWith(action.payload.path + "/"))
          ? newOpenFiles[newOpenFiles.length - 1] || null
          : state.activeFile;

      return {
        ...state,
        fileTree: newTree,
        fileContents: newFileContents,
        recentFiles: newRecentFiles,
        openFiles: newOpenFiles,
        activeFile: newActiveFile,
      };
    }
    // Sync entire file tree from sandbox container
    case "SYNC_FILE_TREE": {
      const newTree = action.payload;
      const validPaths = new Set(getAllFilePaths(newTree));
      const reconciledOpen = state.openFiles.filter((path) =>
        validPaths.has(path),
      );
      const reconciledRecent = (state.recentFiles ?? []).filter((path) =>
        validPaths.has(path),
      );
      const reconciledActive =
        state.activeFile && validPaths.has(state.activeFile)
          ? state.activeFile
          : reconciledOpen[reconciledOpen.length - 1] || null;

      return {
        ...state,
        fileTree: newTree,
        recentFiles: reconciledRecent,
        openFiles: reconciledOpen,
        activeFile: reconciledActive,
      };
    }
    // Sync file content from sandbox container (lazy loading)
    case "SYNC_FILE_CONTENT": {
      return {
        ...state,
        fileContents: {
          ...state.fileContents,
          [action.payload.path]: action.payload.content,
        },
      };
    }
    // Mark a file as loading (placeholder while fetching content)
    case "MARK_FILE_LOADING": {
      // Only set loading placeholder if content not already cached
      if (state.fileContents[action.payload] !== undefined) {
        return state;
      }
      return {
        ...state,
        fileContents: {
          ...state.fileContents,
          [action.payload]: "// Loading file content...",
        },
      };
    }
    default:
      return state;
  }
}

// --- Main Page Component ---

function GeneratePageContent() {
  const searchParams = useSearchParams();
  const initialInteractionMode = searchParams.get("interactionMode") as "agentic" | "manual" || "manual";
  
  // Stellar IDE Hook - provides wallet, compiler, deployer
  const stellarIDE = useStellarIDE();
  const agentState = useAgentState();

  const [interactionMode, setInteractionMode] = useState<"agentic" | "manual">(initialInteractionMode);
  const [ideMode, setIdeMode] = useState<IdeMode>("contract");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);
  const [isVersionsModalOpen, setIsVersionsModalOpen] = useState(false);
  const [isEnvConfigOpen, setIsEnvConfigOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [projectSessionKey, setProjectSessionKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isHomeSidebarOpen, setIsHomeSidebarOpen] = useState(false);
  const [deployedContracts, setDeployedContracts] = useState<
    DeployedContract[]
  >([]);

  // Independent Workspace States
  const [contractState, dispatchContract] = useReducer(
    workspaceReducer,
    INITIAL_CONTRACT_STATE,
  );
  const [frontendState, dispatchFrontend] = useReducer(
    workspaceReducer,
    INITIAL_FRONTEND_STATE,
  );

  // When switching back to manual mode, exit preview so the editor is visible
  useEffect(() => {
    if (interactionMode === "manual") {
      if (contractState.ui.isPreviewMode) {
        dispatchContract({ type: "TOGGLE_PREVIEW" });
      }
      if (frontendState.ui.isPreviewMode) {
        dispatchFrontend({ type: "TOGGLE_PREVIEW" });
      }
    }
  }, [interactionMode]);

  // Ref to track file contents without causing re-renders (fixes infinite loop)
  const fileContentsRef = useRef(frontendState.fileContents);

  // Keep ref in sync with state
  useEffect(() => {
    fileContentsRef.current = frontendState.fileContents;
  }, [frontendState.fileContents]);

  // Ref to track contract file contents for fresh state in handleCompile
  const contractFileContentsRef = useRef(contractState.fileContents);

  // Keep contract ref in sync with state
  useEffect(() => {
    contractFileContentsRef.current = contractState.fileContents;
    console.log(
      "[State] contractFileContentsRef updated, keys:",
      Object.keys(contractState.fileContents),
    );
  }, [contractState.fileContents]);

  // Chat Context State
  const [targetMode, setTargetMode] = useState<ChatTargetMode>("auto");

  // Selection state for AI actions (Explain/Debug)
  const [codeSelection, setCodeSelection] = useState<{
    file: string;
    startLine: number;
    endLine: number;
    text: string;
    intent?: "explain" | "debug";
  } | null>(null);

  // Track pending AI-generated file changes (synced on preview)
  const [pendingAIChanges, setPendingAIChanges] = useState<
    Array<{
      path: string;
      action: "create" | "update" | "delete";
      content?: string;
    }>
  >([]);
  const hasPendingChanges = pendingAIChanges.length > 0;

  // Track last synced log index to avoid duplicates
  const lastSyncedLogIndex = useRef(0);

  // Ref to store Monaco sync function (syncs Monaco content back to workspace state)
  const monacoSyncRef = useRef<(() => void) | null>(null);

  // Callback to receive Monaco sync function from IdeWorkspace
  const handleMonacoSyncReady = useCallback((syncFn: () => void) => {
    monacoSyncRef.current = syncFn;
    console.log("[Generate] Monaco sync function registered");
  }, []);

  // Ref to store force-set model content function (pushes content into a Monaco model directly)
  const forceModelContentRef = useRef<((path: string, content: string) => void) | null>(null);

  const handleForceModelContentReady = useCallback((fn: (path: string, content: string) => void) => {
    forceModelContentRef.current = fn;
  }, []);

  // Sync stellarIDE logs to the correct terminal based on log prefix.
  // [cargo]/[compile]/[deploy]/[bindings] → contract terminal
  // [next] → dropped (npm run dev noise, not user-facing)
  // [cmd]/default → active mode's terminal
  useEffect(() => {
    const newLogs = stellarIDE.allLogs.slice(lastSyncedLogIndex.current);
    if (newLogs.length > 0) {
      newLogs.forEach((log) => {
        if (/^\[next\]/i.test(log)) {
          // Drop npm run dev logs — not user-facing
          return;
        }
        if (/^\[(cargo|compile|deploy|bindings)\]/i.test(log)) {
          dispatchContract({ type: "ADD_LOG", payload: log });
        } else {
          // Default: route to current active mode
          if (ideMode === "contract") {
            dispatchContract({ type: "ADD_LOG", payload: log });
          } else {
            dispatchFrontend({ type: "ADD_LOG", payload: log });
          }
        }
      });
      lastSyncedLogIndex.current = stellarIDE.allLogs.length;
    }
  }, [stellarIDE.allLogs, ideMode]);

  // Update terminal status based on compiler/deployer
  useEffect(() => {
    if (stellarIDE.isCompiling) {
      dispatchContract({ type: "SET_TERMINAL_STATUS", payload: "compiling" });
    } else if (stellarIDE.isDeploying) {
      dispatchContract({ type: "SET_TERMINAL_STATUS", payload: "deploying" });
    } else if (
      stellarIDE.compiler.status === "SUCCESS" ||
      stellarIDE.deployer.status === "SUCCESS"
    ) {
      dispatchContract({ type: "SET_TERMINAL_STATUS", payload: "success" });
    } else if (
      stellarIDE.compiler.status === "ERROR" ||
      stellarIDE.deployer.status === "ERROR"
    ) {
      dispatchContract({ type: "SET_TERMINAL_STATUS", payload: "error" });
    } else {
      dispatchContract({ type: "SET_TERMINAL_STATUS", payload: "idle" });
    }
  }, [
    stellarIDE.isCompiling,
    stellarIDE.isDeploying,
    stellarIDE.compiler.status,
    stellarIDE.deployer.status,
  ]);

  // Add deployed contract to list when deployment succeeds
  useEffect(() => {
    if (
      stellarIDE.deployer.status === "SUCCESS" &&
      stellarIDE.deployer.contractId
    ) {
      const activeContractName = getActiveContractName(
        contractState.activeFile,
      );
      const newContract: DeployedContract = {
        id: stellarIDE.deployer.contractId,
        name:
          activeContractName.charAt(0).toUpperCase() +
          activeContractName.slice(1) +
          "Contract",
        address: stellarIDE.deployer.contractId,
        deployedAt: new Date().toISOString(),
        network: "testnet",
        wasmHash: stellarIDE.deployer.wasmHash || undefined,
      };
      setDeployedContracts((prev) => {
        // Avoid duplicates
        if (prev.some((c) => c.id === newContract.id)) return prev;
        return [newContract, ...prev];
      });
    }
  }, [stellarIDE.deployer.status, stellarIDE.deployer.contractId]);

  // --- Sandbox File Sync ---

  // Track pending file reads to avoid duplicate requests
  const pendingFileReads = useRef<Set<string>>(new Set());

  // Set up file tree sync handler — filter tree by mode before dispatching
  useEffect(() => {
    stellarIDE.sandbox.setOnFileTreeSync((data: FileTreeSyncData) => {
      // Filter nodes for contract mode: contracts/ prefix or root Cargo.toml
      const contractNodes = data.tree.filter(
        (node) => node.id.startsWith("contracts/") || node.id === "Cargo.toml"
      );
      // Filter nodes for frontend mode: frontend/ prefix
      const frontendNodes = data.tree.filter(
        (node) => node.id.startsWith("frontend/")
      );

      dispatchContract({ type: "SYNC_FILE_TREE", payload: contractNodes });
      dispatchFrontend({ type: "SYNC_FILE_TREE", payload: frontendNodes });

      dispatchContract({
        type: "ADD_LOG",
        payload: `[sync] Contract tree synced: ${contractNodes.length} items`,
      });
      dispatchFrontend({
        type: "ADD_LOG",
        payload: `[sync] Frontend tree synced: ${frontendNodes.length} items`,
      });
    });

    stellarIDE.sandbox.setOnFileContentSync((data: FileContentSyncData) => {
      // Remove from pending reads
      pendingFileReads.current.delete(data.path);
      // Route content to the correct workspace based on path prefix
      if (data.path.startsWith("contracts/") || data.path === "Cargo.toml") {
        dispatchContract({ type: "SYNC_FILE_CONTENT", payload: data });
      } else {
        dispatchFrontend({ type: "SYNC_FILE_CONTENT", payload: data });
      }
    });
  }, [stellarIDE.sandbox]);

  // Auto-trigger file tree sync when sandbox connects
  useEffect(() => {
    if (stellarIDE.isSandboxConnected) {
      stellarIDE.sandbox.syncFileTree();
    }
  }, [stellarIDE.isSandboxConnected]);

  // NOTE: Auto-sync on connect removed - sync happens when user clicks Preview

  // Fetch file content when opening a file that doesn't have cached content
  const fetchFileContent = useCallback(
    (filePath: string) => {
      if (!stellarIDE.isSandboxConnected) return;
      if (pendingFileReads.current.has(filePath)) return;

      // Use ref to avoid dependency loop
      const currentContents = fileContentsRef.current;
      if (
        currentContents[filePath] !== undefined &&
        currentContents[filePath] !== "// Loading file content..."
      ) {
        return; // Already have content
      }

      pendingFileReads.current.add(filePath);
      dispatchFrontend({ type: "MARK_FILE_LOADING", payload: filePath });
      stellarIDE.sandbox.readFile(filePath);
    },
    [stellarIDE.isSandboxConnected, stellarIDE.sandbox],
  );

  // Sync file content to sandbox when user edits a file
  const syncFileToSandbox = useCallback(
    (filePath: string, content: string) => {
      if (!stellarIDE.isSandboxConnected) return;
      stellarIDE.sandbox.writeFile(filePath, content);
    },
    [stellarIDE.isSandboxConnected, stellarIDE.sandbox],
  );

  // Computed Chat Context
  const resolvedMode = targetMode === "auto" ? ideMode : targetMode;
  const activeWorkspace =
    resolvedMode === "contract" ? contractState : frontendState;

  const chatContext: ChatContext = {
    targetMode,
    resolvedMode,
    activeFilePath: activeWorkspace.activeFile || undefined,
    selection: codeSelection
      ? {
          startLine: codeSelection.startLine,
          endLine: codeSelection.endLine,
          selectedText: codeSelection.text,
        }
      : undefined,
    intent: codeSelection?.intent || "general",
  };

  // --- Handlers ---

  const handleModeChange = (newMode: IdeMode) => {
    setIdeMode(newMode);
  };

  // Handle code action (Explain/Debug) from inline toolbar
  const handleCodeAction = useCallback(
    (
      action: "debug" | "explain",
      selection: {
        file: string;
        startLine: number;
        endLine: number;
        text: string;
      },
    ) => {
      console.log("[CodeAction] Action triggered:", action, selection);
      // Set selection state with intent - this will trigger auto-send in ChatPanel
      setCodeSelection({
        ...selection,
        intent: action,
      });

      // Clear intent after a delay (keeps selection for context, but clears intent badge)
      // This prevents the intent badge from persisting after the message is sent
      setTimeout(() => {
        setCodeSelection((prev) =>
          prev ? { ...prev, intent: undefined } : null,
        );
      }, 2000);
    },
    [],
  );

  const handleCompile = useCallback(() => {
    // Diagnostic logging to debug stale state issues
    console.log("[Compile] ============================================");
    console.log("[Compile] handleCompile CALLED");
    console.log("[Compile] ============================================");

    // CRITICAL: Sync Monaco content to workspace state before compiling
    // This ensures we compile the latest content from Monaco (source of truth)
    if (monacoSyncRef.current) {
      console.log(
        "[Compile] Syncing Monaco to workspace state before compile...",
      );
      monacoSyncRef.current();
    }

    // Use ref to get fresh state (fixes stale closure issue)
    const freshFileContents = contractFileContentsRef.current;

    console.log("[Compile] Using contractFileContentsRef for fresh state");
    console.log(
      "[Compile] freshFileContents keys:",
      Object.keys(freshFileContents),
    );
    console.log(
      "[Compile] lib.rs content preview:",
      freshFileContents["contracts/hello_world/src/lib.rs"]?.substring(0, 300),
    );
    console.log("[Compile] activeFile:", contractState.activeFile);

    // Get active contract name from file path
    const activeContractName = getActiveContractName(contractState.activeFile);
    console.log("[Compile] activeContractName:", activeContractName);

    // Transform files for backend using fresh state from ref
    const files = transformFilesForBackend(
      freshFileContents,
      activeContractName,
    );
    console.log(
      "[Compile] Files being sent to compiler:",
      files.map((f) => ({
        path: f.path,
        contentPreview: f.content.substring(0, 100),
      })),
    );

    // Clear ALL logs - terminal and hook logs
    dispatchContract({ type: "CLEAR_LOGS" });
    stellarIDE.clearAllLogs();
    lastSyncedLogIndex.current = 0; // Reset sync index

    dispatchContract({
      type: "ADD_LOG",
      payload: `[COMPILE] Starting build for: ${activeContractName}`,
    });

    // Use the real compiler
    stellarIDE.compiler.compile(files);
    console.log("[Compile] ============================================");
  }, [contractState.activeFile, stellarIDE.compiler, stellarIDE.clearAllLogs]);

  const handleDeploy = useCallback(async () => {
    if (!stellarIDE.isWalletConnected) {
      dispatchContract({
        type: "ADD_LOG",
        payload: "[ERROR] Please connect your wallet first",
      });
      return;
    }

    if (!stellarIDE.hasCompiledWasm) {
      dispatchContract({
        type: "ADD_LOG",
        payload: "[ERROR] Please compile the contract first",
      });
      return;
    }

    dispatchContract({
      type: "ADD_LOG",
      payload: "[DEPLOY] Starting deployment...",
    });

    // Use the real deployer
    await stellarIDE.deployer.deploy();
  }, [
    stellarIDE.isWalletConnected,
    stellarIDE.hasCompiledWasm,
    stellarIDE.deployer,
  ]);

  const handleGenerateBindings = async (contractId: string) => {
    console.log("[Generate] ============================================");
    console.log("[Generate] GENERATE_BINDINGS CALLED");
    console.log("[Generate] ============================================");
    console.log("[Generate] Contract ID:", contractId);
    console.log("[Generate] Sandbox connected:", stellarIDE.isSandboxConnected);
    console.log("[Generate] Timestamp:", new Date().toISOString());

    // Find contract by ID or use the passed contractId directly (for latest deployed)
    const contract = deployedContracts.find(
      (c) => c.id === contractId || c.address === contractId,
    );
    const finalContractId = contract?.address || contractId;

    console.log(
      "[Generate] Resolved contract:",
      contract
        ? { id: contract.id, address: contract.address, name: contract.name }
        : "not found",
    );
    console.log("[Generate] Final contract ID:", finalContractId);

    if (!finalContractId) {
      const errorMsg = "[bindings] Error: No contract ID provided";
      console.error("[Generate]", errorMsg);
      dispatchFrontend({ type: "ADD_LOG", payload: errorMsg });
      return;
    }

    // Check if sandbox is connected for real bindings generation
    if (stellarIDE.isSandboxConnected) {
      // Copy active contract code to frontend file tree
      const activeFile = contractState.activeFile;
      if (activeFile) {
        const parts = activeFile.split('/');
        const fileName = parts.pop() || activeFile;
        const content = contractState.fileContents[activeFile];
        if (content !== undefined) {
          dispatchFrontend({
            type: "ADD_FILE",
            payload: {
              parentPath: "contracts",
              fileName: fileName,
              content: content,
            },
          });
          dispatchFrontend({
            type: "ADD_LOG",
            payload: `[sync] Copied ${fileName} to frontend contracts folder`,
          });
        }
      }

      const logMsg = `[bindings] Generating TS bindings for ${finalContractId} on ${stellarIDE.deployer.network}...`;
      console.log("[Generate]", logMsg);
      dispatchFrontend({ type: "ADD_LOG", payload: logMsg });

      // Use sandbox to generate bindings - track changes instead of applying immediately
      console.log("[Generate] Setting up bindings response handler...");
      stellarIDE.sandbox.generateBindings(finalContractId, (changes) => {
        console.log("[Generate] ============================================");
        console.log("[Generate] BINDINGS GENERATION RESPONSE RECEIVED");
        console.log("[Generate] ============================================");
        console.log("[Generate] Changes received:", changes.length);
        console.log(
          "[Generate] Change details:",
          changes.map((c) => ({
            path: c.path,
            action: c.action,
            size: c.content?.length || 0,
          })),
        );

        // Add changes to tracker (will be applied when user clicks Preview)
        setPendingAIChanges((prev) => {
          const updated = [...prev, ...changes];
          console.log("[Generate] Total pending changes:", updated.length);
          return updated;
        });

        const bindingsFileCount = changes.filter((c) =>
          c.path.startsWith("bindings/"),
        ).length;
        const successMsg = `[bindings] ✓ ${changes.length} files generated (${bindingsFileCount} bindings files) - click Preview to sync`;
        console.log("[Generate]", successMsg);
        dispatchFrontend({
          type: "ADD_LOG",
          payload: successMsg,
        });

        // Auto-refresh file tree to show the new bindings folder
        // The bindings folder already exists in the container, we just need to refresh the view
        console.log(
          "[Generate] Auto-refreshing file tree to show bindings folder...",
        );
        if (stellarIDE.isSandboxConnected) {
          // Try multiple times with increasing delays to ensure the refresh works
          const refreshAttempts = [500, 1500, 3000];
          refreshAttempts.forEach((delay, index) => {
            setTimeout(() => {
              console.log(
                `[Generate] File tree refresh attempt ${index + 1}/${refreshAttempts.length} (delay: ${delay}ms)`,
              );
              handleRefreshFileTree();
              if (index === 0) {
                dispatchFrontend({
                  type: "ADD_LOG",
                  payload: `[bindings] Refreshing file tree to show bindings folder...`,
                });
              }
            }, delay);
          });
        } else {
          console.warn(
            "[Generate] Cannot refresh file tree - sandbox not connected",
          );
        }

        console.log("[Generate] ============================================");
        console.log("[Generate] BINDINGS HANDLER COMPLETE");
        console.log("[Generate] ============================================");
      });
    } else {
      // Fallback: Generate mock bindings locally
      dispatchFrontend({
        type: "ADD_LOG",
        payload: `[bindings] Generating mock bindings for ${finalContractId}...`,
      });
      dispatchFrontend({
        type: "ADD_LOG",
        payload: "[bindings] Note: Start sandbox for real Stellar CLI bindings",
      });

      setTimeout(() => {
        const contractName = contract?.name || "Contract";
        const bindingsContent = `// TypeScript Bindings for ${contractName}
// Contract ID: ${finalContractId}
// Network: ${stellarIDE.deployer.network}
//
// NOTE: These are mock bindings. Start a sandbox for real Stellar CLI generated bindings.

import * as StellarSdk from '@stellar/stellar-sdk';

export const CONTRACT_ID = '${finalContractId}';
export const NETWORK = '${stellarIDE.deployer.network}';
export const NETWORK_PASSPHRASE = '${stellarIDE.deployer.network === "mainnet" ? "Public Global Stellar Network ; September 2015" : "Test SDF Network ; September 2015"}';

export interface ${contractName}Client {
  contractId: string;
  // Add your contract methods here
  hello(to: string): Promise<string[]>;
}

export function create${contractName}Client(publicKey: string): ${contractName}Client {
  return {
    contractId: CONTRACT_ID,
    async hello(to: string) {
      // Implement contract call logic
      console.log('Calling hello with:', to);
      return ['Hello', to];
    }
  };
}
`;
        dispatchFrontend({
          type: "ADD_BINDINGS_FILE",
          payload: { name: "lib/bindings.ts", content: bindingsContent },
        });
        dispatchFrontend({
          type: "ADD_LOG",
          payload: "✓ Mock bindings generated at lib/bindings.ts",
        });
      }, 1000);
    }
  };

  // Sandbox handlers
  const handleSpawnSandbox = useCallback(() => {
    dispatchFrontend({
      type: "ADD_LOG",
      payload: "[sandbox] Spawning development sandbox...",
    });
    stellarIDE.sandbox.spawn({
      GROQ_API_KEY: process.env.NEXT_PUBLIC_GROQ_API_KEY || "",
      AI_PROVIDER: "groq",
    });
  }, [stellarIDE.sandbox]);

  const handleStopSandbox = useCallback(() => {
    dispatchFrontend({
      type: "ADD_LOG",
      payload: "[sandbox] Stopping sandbox...",
    });
    stellarIDE.sandbox.stop();
  }, [stellarIDE.sandbox]);

  // Refresh file tree from sandbox
  const handleRefreshFileTree = useCallback(() => {
    if (stellarIDE.isSandboxConnected) {
      dispatchFrontend({
        type: "ADD_LOG",
        payload: "[sync] Refreshing file tree from container...",
      });
      stellarIDE.sandbox.syncFileTree();
    }
  }, [stellarIDE.isSandboxConnected, stellarIDE.sandbox]);

  // Handler for applying editor changes from AI responses
  const handleApplyEditorChanges = useCallback(
    (
      changes: Array<{
        path: string;
        action: "create" | "update" | "delete";
        content: string;
      }>,
    ) => {
      console.log("[AI] ============================================");
      console.log("[AI] handleApplyEditorChanges CALLED");
      console.log("[AI] ============================================");
      console.log(`[AI] Received ${changes.length} change(s)`);
      console.log(`[AI] Mode: ${resolvedMode}`);
      console.log(
        "[AI] Changes:",
        changes.map((c) => ({
          path: c.path,
          action: c.action,
          contentLength: c.content?.length || 0,
        })),
      );

      const activeWorkspace =
        resolvedMode === "contract" ? contractState : frontendState;
      const activeDispatch =
        resolvedMode === "contract" ? dispatchContract : dispatchFrontend;
      const isFrontendMode = resolvedMode === "frontend";

      changes.forEach((change) => {
        // Validate content is provided for create/update
        if (
          (change.action === "create" || change.action === "update") &&
          !change.content
        ) {
          activeDispatch({
            type: "ADD_LOG",
            payload: `[AI] Error: ${change.action} action requires content for ${change.path}`,
          });
          return;
        }

        if (change.action === "create") {
          // Validate content is not empty
          if (!change.content || change.content.trim().length === 0) {
            activeDispatch({
              type: "ADD_LOG",
              payload: `[AI] Error: Cannot create empty file: ${change.path}`,
            });
            return;
          }

          // In contract mode: check if a file with the same filename already exists.
          // The AI only sees filenames (not full paths) in the file tree, so it may
          // return "create" with a partial path like "src/lib.rs" when the actual
          // file is at "contracts/hello_world/src/lib.rs". Redirect to update.
          const requestedFileName = change.path.split("/").pop() || change.path;
          const existingPath = !isFrontendMode
            ? Object.keys(activeWorkspace.fileContents).find(
                (p) => p.split("/").pop() === requestedFileName,
              )
            : undefined;

          if (existingPath) {
            console.log(`[AI] "create" redirected to update: "${change.path}" → "${existingPath}"`);

            activeDispatch({
              type: "UPDATE_FILE",
              payload: {
                path: existingPath,
                content: change.content,
                source: "ai",
              },
            });
            forceModelContentRef.current?.(existingPath, change.content);

            if (activeWorkspace.activeFile !== existingPath) {
              activeDispatch({ type: "OPEN_FILE", payload: existingPath });
            }

            activeDispatch({
              type: "ADD_LOG",
              payload: `[AI] ✓ Updated existing file (create→update): ${existingPath} (${change.content.length} chars)`,
            });
          } else {
          // Extract parent path and file name
          const pathParts = change.path.split("/");
          const fileName = pathParts.pop() || change.path;
          const parentPath = pathParts.join("/");

          activeDispatch({
            type: "ADD_FILE",
            payload: {
              parentPath,
              fileName,
              content: change.content,
            },
          });

          console.log(`[AI] Created and opened file: ${change.path}`);

          // Track for sandbox sync on preview (frontend mode only)
          if (isFrontendMode && stellarIDE.isSandboxConnected) {
            setPendingAIChanges((prev) => [...prev, change]);
          }

          activeDispatch({
            type: "ADD_LOG",
            payload: `[AI] ✓ Created file: ${change.path} (${change.content.length} chars)`,
          });
          }
        } else if (change.action === "update") {
          // Validate content is not empty
          if (!change.content || change.content.trim().length === 0) {
            activeDispatch({
              type: "ADD_LOG",
              payload: `[AI] Error: Cannot update file with empty content: ${change.path}`,
            });
            return;
          }

          // Check if file exists in fileContents
          if (activeWorkspace.fileContents[change.path] !== undefined) {
            // Diagnostic logging for AI changes
            console.log("[AI] ============================================");
            console.log("[AI] UPDATE_FILE action");
            console.log("[AI] ============================================");
            console.log(
              `[AI] Applying to ${resolvedMode} mode: ${change.path}`,
            );
            console.log(
              `[AI] Content preview (first 300 chars): ${change.content?.substring(0, 300)}`,
            );
            console.log(`[AI] Content length: ${change.content?.length} chars`);
            console.log(
              "[AI] activeWorkspace keys before update:",
              Object.keys(activeWorkspace.fileContents),
            );

            // Update existing file with FULL content
            activeDispatch({
              type: "UPDATE_FILE",
              payload: {
                path: change.path,
                content: change.content,
                source: "ai",
              },
            });
            // Push directly into Monaco's model so stale cached models don't overwrite the AI content
            forceModelContentRef.current?.(change.path, change.content);

            // Ensure the file is opened and active in the editor so changes are visible
            // OPEN_FILE will both open it and set it as active
            if (activeWorkspace.activeFile !== change.path) {
              activeDispatch({
                type: "OPEN_FILE",
                payload: change.path,
              });
              console.log(
                `[AI] Opened and activated file in editor: ${change.path}`,
              );
            }

            console.log("[AI] UPDATE_FILE dispatched successfully");
            console.log("[AI] ============================================");

            // Track for sandbox sync on preview (frontend mode only)
            if (isFrontendMode && stellarIDE.isSandboxConnected) {
              setPendingAIChanges((prev) => [...prev, change]);
            }

            activeDispatch({
              type: "ADD_LOG",
              payload: `[AI] ✓ Updated file: ${change.path} (${change.content.length} chars)`,
            });
          } else {
            // In contract mode only: try to find the file by filename to handle AI path mismatches (e.g. src/lib.rs vs contracts/hello/src/lib.rs)
            const requestedFileName = change.path.split("/").pop() || change.path;
            const matchedPath = !isFrontendMode
              ? Object.keys(activeWorkspace.fileContents).find(
                  (p) => p.split("/").pop() === requestedFileName,
                )
              : undefined;

            if (matchedPath) {
              // Resolved existing file under a different path — update in place
              console.log(`[AI] Path mismatch resolved: "${change.path}" → "${matchedPath}"`);

              activeDispatch({
                type: "UPDATE_FILE",
                payload: {
                  path: matchedPath,
                  content: change.content,
                  source: "ai",
                },
              });
              forceModelContentRef.current?.(matchedPath, change.content);

              if (activeWorkspace.activeFile !== matchedPath) {
                activeDispatch({ type: "OPEN_FILE", payload: matchedPath });
              }

              activeDispatch({
                type: "ADD_LOG",
                payload: `[AI] ✓ Updated file (path resolved): ${matchedPath} (${change.content.length} chars)`,
              });
            } else {
              // File doesn't exist, create it instead
              console.log("[AI] ============================================");
              console.log("[AI] FILE NOT FOUND - Creating new file instead");
              console.log("[AI] ============================================");
              console.log(`[AI] Requested path: ${change.path}`);
              console.log(`[AI] Mode: ${resolvedMode}`);
              console.log(
                `[AI] Available files in activeWorkspace:`,
                Object.keys(activeWorkspace.fileContents),
              );
              console.log("[AI] ============================================");

              const pathParts = change.path.split("/");
              const fileName = pathParts.pop() || change.path;
              const parentPath = pathParts.join("/");

              activeDispatch({
                type: "ADD_FILE",
                payload: {
                  parentPath,
                  fileName,
                  content: change.content,
                },
              });

              // Track for sandbox sync on preview (frontend mode only)
              if (isFrontendMode && stellarIDE.isSandboxConnected) {
                setPendingAIChanges((prev) => [
                  ...prev,
                  { ...change, action: "create" as const },
                ]);
              }

              activeDispatch({
                type: "ADD_LOG",
                payload: `[AI] ✓ Created file (via update): ${change.path} (${change.content.length} chars)`,
              });
            }
          }
        } else if (change.action === "delete") {
          activeDispatch({
            type: "DELETE_FILE",
            payload: { path: change.path },
          });

          // Track for sandbox sync on preview (frontend mode only)
          if (isFrontendMode && stellarIDE.isSandboxConnected) {
            setPendingAIChanges((prev) => [...prev, change]);
          }

          activeDispatch({
            type: "ADD_LOG",
            payload: `[AI] ✓ Deleted file: ${change.path}`,
          });
        }
      });

      // Notify user about pending changes
      if (
        isFrontendMode &&
        stellarIDE.isSandboxConnected &&
        changes.length > 0
      ) {
        dispatchFrontend({
          type: "ADD_LOG",
          payload: `[sync] ${changes.length} changes pending - click Preview to sync with sandbox`,
        });
      }

      // CRITICAL: Sync Monaco editor content back to workspace state
      // This ensures Monaco (view layer) is the source of truth after AI edits
      // Monaco might have unsaved changes or might not have synced yet
      if (monacoSyncRef.current) {
        console.log("[AI] Syncing Monaco content to workspace state...");
        // Small delay to ensure Monaco has updated from workspace state changes
        setTimeout(() => {
          if (monacoSyncRef.current) {
            monacoSyncRef.current();
            console.log("[AI] Monaco sync completed");
          }
        }, 150);
      } else {
        console.warn(
          "[AI] Monaco sync function not available - workspace state may be out of sync",
        );
      }

      console.log("[AI] ============================================");
      console.log("[AI] handleApplyEditorChanges COMPLETE");
      console.log(
        `[AI] Processed ${changes.length} change(s) for ${resolvedMode} mode`,
      );
      console.log("[AI] ============================================");
    },
    [
      resolvedMode,
      contractState,
      frontendState,
      dispatchContract,
      dispatchFrontend,
      stellarIDE.isSandboxConnected,
    ],
  );

  // Determine which workspace is currently VISIBLE in the IDE pane
  const currentVisibleWorkspace =
    ideMode === "contract" ? contractState : frontendState;

  // Delete file in sandbox
  const deleteFileInSandbox = useCallback(
    (filePath: string) => {
      if (!stellarIDE.isSandboxConnected) return;
      stellarIDE.sandbox.deleteFile(filePath);
    },
    [stellarIDE.isSandboxConnected, stellarIDE.sandbox],
  );

  // Wrapped dispatch for frontend mode — intercepts file mutations and syncs to sandbox
  const wrappedFrontendDispatch = useCallback(
    (action: Action) => {
      const isPreviewMode = frontendState.ui.isPreviewMode;

      // Intercept OPEN_FILE to fetch content from sandbox
      if (
        action.type === "OPEN_FILE" &&
        stellarIDE.isSandboxConnected &&
        !isPreviewMode
      ) {
        const filePath = action.payload;
        const isKnownPath = pathExists(frontendState.fileTree, filePath);
        const currentContents = fileContentsRef.current;
        const shouldFetchContent =
          isKnownPath &&
          (currentContents[filePath] === undefined ||
            currentContents[filePath] === "// Loading file content...");
        if (shouldFetchContent) fetchFileContent(filePath);
      }

      // Intercept UPDATE_FILE to write back to sandbox
      if (
        action.type === "UPDATE_FILE" &&
        stellarIDE.isSandboxConnected &&
        !isPreviewMode
      ) {
        const source = action.payload.source || "editor";
        if (source === "editor" || source === "ai") {
          syncFileToSandbox(action.payload.path, action.payload.content);
        }
      }

      // Intercept DELETE_FILE
      if (
        action.type === "DELETE_FILE" &&
        stellarIDE.isSandboxConnected &&
        !isPreviewMode
      ) {
        deleteFileInSandbox(action.payload.path);
      }

      // Intercept ADD_FILE
      if (
        action.type === "ADD_FILE" &&
        stellarIDE.isSandboxConnected &&
        !isPreviewMode
      ) {
        const filePath = action.payload.parentPath
          ? `${action.payload.parentPath}/${action.payload.fileName}`
          : action.payload.fileName;
        syncFileToSandbox(filePath, action.payload.content || "");
      }

      dispatchFrontend(action);
    },
    [
      stellarIDE.isSandboxConnected,
      fetchFileContent,
      syncFileToSandbox,
      deleteFileInSandbox,
      frontendState.fileTree,
      frontendState.ui.isPreviewMode,
    ],
  );

  // Wrapped dispatch for contract mode — mirrors wrappedFrontendDispatch so manual
  // contract edits are also written back to /workspace/contracts/... in the sandbox.
  const wrappedContractDispatch = useCallback(
    (action: Action) => {
      // Intercept OPEN_FILE to fetch content from sandbox
      if (action.type === "OPEN_FILE" && stellarIDE.isSandboxConnected) {
        const filePath = action.payload;
        const isKnownPath = pathExists(contractState.fileTree, filePath);
        const currentContents = contractFileContentsRef.current;
        const shouldFetchContent =
          isKnownPath &&
          (currentContents[filePath] === undefined ||
            currentContents[filePath] === "// Loading file content...");
        if (shouldFetchContent) {
          pendingFileReads.current.add(filePath);
          stellarIDE.sandbox.readFile(filePath);
        }
      }

      // Intercept UPDATE_FILE to write back to sandbox
      if (action.type === "UPDATE_FILE" && stellarIDE.isSandboxConnected) {
        const source = action.payload.source || "editor";
        if (source === "editor" || source === "ai") {
          syncFileToSandbox(action.payload.path, action.payload.content);
        }
      }

      // Intercept DELETE_FILE
      if (action.type === "DELETE_FILE" && stellarIDE.isSandboxConnected) {
        deleteFileInSandbox(action.payload.path);
      }

      // Intercept ADD_FILE
      if (action.type === "ADD_FILE" && stellarIDE.isSandboxConnected) {
        const filePath = action.payload.parentPath
          ? `${action.payload.parentPath}/${action.payload.fileName}`
          : action.payload.fileName;
        syncFileToSandbox(filePath, action.payload.content || "");
      }

      dispatchContract(action);
    },
    [
      stellarIDE.isSandboxConnected,
      syncFileToSandbox,
      deleteFileInSandbox,
      contractState.fileTree,
    ],
  );

  const currentDispatch =
    ideMode === "contract" ? wrappedContractDispatch : wrappedFrontendDispatch;

  // Handle preview toggle - syncs pending changes when switching to preview mode
  // Helper: flush all pending AI changes to the sandbox immediately
  const flushPendingChangesToSandbox = useCallback(
    (changes: typeof pendingAIChanges) => {
      if (changes.length === 0) return;
      if (!stellarIDE.isSandboxConnected) return;

      dispatchFrontend({
        type: "ADD_LOG",
        payload: `[sync] Syncing ${changes.length} pending changes to sandbox...`,
      });

      changes.forEach((change) => {
        if (change.action === "create" || change.action === "update") {
          stellarIDE.sandbox.writeFile(change.path, change.content || "");
        } else if (change.action === "delete") {
          stellarIDE.sandbox.deleteFile(change.path);
        }
      });

      setPendingAIChanges([]);
      dispatchFrontend({
        type: "ADD_LOG",
        payload: "[sync] ✓ Changes synced to sandbox",
      });
    },
    [stellarIDE.isSandboxConnected, stellarIDE.sandbox],
  );

  // Auto-sync: when new AI changes arrive WHILE already in preview mode,
  // push them to the sandbox immediately so the preview stays live.
  // We use a ref to detect a rising edge (0 → N) to avoid re-syncing on every render.
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPendingLengthRef = useRef(0);
  useEffect(() => {
    const newLength = pendingAIChanges.length;
    const prevLength = prevPendingLengthRef.current;
    prevPendingLengthRef.current = newLength;

    // Auto-sync only when we're already in preview mode, sandbox is ready,
    // and the pending queue just grew (new changes arrived).
    if (
      frontendState.ui.isPreviewMode &&
      stellarIDE.isSandboxConnected &&
      newLength > prevLength
    ) {
      // Debounce: wait a short time so the AI can finish streaming its whole batch
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = setTimeout(() => {
        // Read the latest snapshot via a functional updater so we don't close
        // over a stale pendingAIChanges value, then flush and clear in one step.
        setPendingAIChanges((current) => {
          if (current.length === 0) return current;
          // Write each change directly (bypass flushPendingChangesToSandbox
          // to avoid the extra setPendingAIChanges call inside it).
          if (stellarIDE.isSandboxConnected) {
            dispatchFrontend({
              type: "ADD_LOG",
              payload: `[sync] Auto-syncing ${current.length} pending changes to sandbox...`,
            });
            current.forEach((change) => {
              if (change.action === "create" || change.action === "update") {
                stellarIDE.sandbox.writeFile(change.path, change.content || "");
              } else if (change.action === "delete") {
                stellarIDE.sandbox.deleteFile(change.path);
              }
            });
            dispatchFrontend({
              type: "ADD_LOG",
              payload: "[sync] ✓ Auto-sync complete",
            });
          }
          return [];
        });
      }, 600);
    }

    return () => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    };
  }, [
    pendingAIChanges.length,
    frontendState.ui.isPreviewMode,
    stellarIDE.isSandboxConnected,
    flushPendingChangesToSandbox,
  ]);

  const handlePreviewToggle = useCallback(() => {
    // If switching TO preview mode and sandbox is connected, flush any pending changes first
    if (!frontendState.ui.isPreviewMode && stellarIDE.isSandboxConnected) {
      flushPendingChangesToSandbox(pendingAIChanges);

      // Sync file tree from sandbox
      stellarIDE.sandbox.syncFileTree();
    }

    // Toggle preview mode
    dispatchFrontend({ type: "TOGGLE_PREVIEW" });
  }, [
    frontendState.ui.isPreviewMode,
    stellarIDE.isSandboxConnected,
    pendingAIChanges,
    flushPendingChangesToSandbox,
    stellarIDE.sandbox,
  ]);

  const handleSaveProject = useCallback(async (projectName?: string) => {
    if (!currentProjectId && !projectName) {
      setIsSaveDialogOpen(true);
      return;
    }
    const finalName = projectName || currentProjectName || "Untitled Project";
    setCurrentProjectName(finalName);
    setLastSavedAt(new Date().toISOString());
    setIsSaveDialogOpen(false);
    dispatchFrontend({ type: "ADD_LOG", payload: `[project] Project "${finalName}" saved (mock mode)` });
  }, [currentProjectId, currentProjectName]);

  const handleSelectProject = useCallback((project: any) => {
    setCurrentProjectId(project.id);
    setCurrentProjectName(project.name || "Untitled Project");
    setLastSavedAt(project.updated_at || null);

    // Ensure we have a safe active file for both workspaces
    const pickActiveFile = (state: WorkspaceState | undefined | null) => {
      if (!state) return null;
      return (
        state.activeFile ||
        state.openFiles?.[0] ||
        getAllFilePaths(state.fileTree)[0] ||
        null
      );
    };

    const nextContractActive = pickActiveFile(project.contract_state);
    const nextFrontendActive = pickActiveFile(project.frontend_state);

    dispatchContract({ type: "LOAD_PROJECT", payload: project.contract_state });
    dispatchFrontend({ type: "LOAD_PROJECT", payload: project.frontend_state });

    if (nextContractActive) {
      dispatchContract({ type: "OPEN_FILE", payload: nextContractActive });
    }
    if (nextFrontendActive) {
      dispatchFrontend({ type: "OPEN_FILE", payload: nextFrontendActive });
    }

    setProjectSessionKey((k) => k + 1);
    setIsProjectsModalOpen(false);
    dispatchFrontend({
      type: "ADD_LOG",
      payload: `[project] Loaded project: ${project.name}`,
    });
  }, []);

  const handleSyncToSandbox = useCallback(() => {
    if (!stellarIDE.isSandboxConnected) {
      alert("Please start the sandbox first");
      return;
    }

    // Sync Monaco to workspace first
    if (monacoSyncRef.current) {
      monacoSyncRef.current();
    }

    const activeWorkspace = ideMode === "contract" ? contractState : frontendState;
    const files = activeWorkspace.fileContents;
    const filePaths = Object.keys(files);

    const activeDispatch = ideMode === "contract" ? dispatchContract : dispatchFrontend;
    activeDispatch({
      type: "ADD_LOG",
      payload: `[sync] Syncing ${filePaths.length} files to sandbox...`,
    });

    // Write all files to sandbox
    filePaths.forEach((path) => {
      stellarIDE.sandbox.writeFile(path, files[path]);
    });

    activeDispatch({
      type: "ADD_LOG",
      payload: "[sync] ✓ All files synced to sandbox",
    });
  }, [stellarIDE.isSandboxConnected, stellarIDE.sandbox, ideMode, contractState, frontendState]);

  return (
    <SandboxProvider sandbox={stellarIDE.sandbox}>
      <div className="flex flex-col h-screen bg-[#050505] text-zinc-100 overflow-hidden font-sans">
        <GlobalTopBar
          ideMode={ideMode}
          onIdeModeChange={handleModeChange}
          interactionMode={interactionMode}
          onInteractionModeChange={setInteractionMode}
          walletAddress={stellarIDE.wallet.address}
          walletStatus={stellarIDE.wallet.status}
          onConnectWallet={stellarIDE.wallet.connect}
          onDisconnectWallet={stellarIDE.wallet.disconnect}
          currentProjectId={currentProjectId}
          currentProjectName={currentProjectName}
          onSaveProject={() => setIsSaveDialogOpen(true)}
          onOpenProjects={() => setIsProjectsModalOpen(true)}
          onOpenVersions={() => setIsVersionsModalOpen(true)}
          isSaving={isSaving}
          onToggleHomeSidebar={() => setIsHomeSidebarOpen(!isHomeSidebarOpen)}
          onOpenEnvConfig={() => setIsEnvConfigOpen(true)}
        />

        <HomeSidebar
          isOpen={isHomeSidebarOpen}
          onClose={() => setIsHomeSidebarOpen(false)}
          onToggle={() => setIsHomeSidebarOpen(true)}
          walletAddress={stellarIDE.wallet.address}
          walletStatus={stellarIDE.wallet.status}
        />

        {/* Left edge hover detector for HomeSidebar */}
        {!isHomeSidebarOpen && (
          <div
            className="fixed left-0 top-0 bottom-0 w-1.5 z-[100] cursor-e-resize"
            onMouseEnter={() => setIsHomeSidebarOpen(true)}
          />
        )}

        <div className="flex-1 flex min-h-0">
          {/* Left: Chat Panel with Icon Rail */}
          {!isChatCollapsed && (
            <ChatPanel
              chatContext={chatContext}
              onTargetModeChange={setTargetMode}
              onSendMessage={(msg, model) => {
                // Mock backend interaction - log which model is being used
                const activeLogDispatch =
                  resolvedMode === "contract"
                    ? dispatchContract
                    : dispatchFrontend;
                activeLogDispatch({
                  type: "ADD_LOG",
                  payload: `> AI (${model}): Processing request for ${resolvedMode}...`,
                });
              }}
              fileTree={activeWorkspace.fileTree}
              fileContents={activeWorkspace.fileContents}
              onApplyEditorChanges={handleApplyEditorChanges}
              onDisconnectWallet={stellarIDE.wallet.disconnect}
              walletAddress={stellarIDE.wallet.address}
              walletStatus={stellarIDE.wallet.status}
            />
          )}

          {/* Right: IDE Workspace (Swappable) - Takes remaining space */}
          <IdeWorkspace
            key={ideMode}
            mode={ideMode}
            interactionMode={interactionMode}
            workspace={currentVisibleWorkspace}
            deployedContracts={deployedContracts}
            dispatch={currentDispatch}
            onCompile={handleCompile}
            onDeploy={handleDeploy}
            onGenerateBindings={handleGenerateBindings}
            // Toggles
            onToggleFileExplorer={() =>
              currentDispatch({ type: "TOGGLE_EXPLORER" })
            }
            onToggleActionPanel={() =>
              currentDispatch({ type: "TOGGLE_ACTION_PANEL" })
            }
            onToggleTerminal={() =>
              currentDispatch({ type: "TOGGLE_TERMINAL" })
            }
            onExecuteCommand={(command) =>
              stellarIDE.sandbox.executeCommand(
                command,
                ideMode === "contract" ? "/workspace/contracts" : "/workspace/frontend"
              )
            }
            onOpenEnvConfig={() => setIsEnvConfigOpen(true)}
            // Compile/Deploy Status
            compilerStatus={stellarIDE.compiler.status}
            deployerStatus={stellarIDE.deployer.status}
            wasmHex={stellarIDE.compiler.wasmHex}
            latestContractId={stellarIDE.deployer.contractId}
            isWalletConnected={stellarIDE.isWalletConnected}
            // Network Selection
            network={stellarIDE.deployer.network}
            onNetworkChange={stellarIDE.deployer.setNetwork}
            explorerUrl={stellarIDE.deployer.explorerUrl}
            // Sandbox
            sandboxPreviewUrl={stellarIDE.sandbox.previewUrl}
            isSandboxRunning={stellarIDE.isSandboxRunning}
            // Code Actions (Explain/Debug)
            onCodeAction={handleCodeAction}
            sandboxStatus={stellarIDE.sandbox.status}
            onSpawnSandbox={handleSpawnSandbox}
            onStopSandbox={handleStopSandbox}
            bindingsStatus={stellarIDE.sandbox.bindingsStatus}
            // File sync
            onRefreshFileTree={handleRefreshFileTree}
            isSandboxConnected={stellarIDE.isSandboxConnected}
            // Preview sync
            onTogglePreview={handlePreviewToggle}
            hasPendingChanges={hasPendingChanges}
            // Monaco sync
            onMonacoSyncReady={handleMonacoSyncReady}
            onForceModelContentReady={handleForceModelContentReady}
            onSyncToSandbox={handleSyncToSandbox}
            editorSessionKey={projectSessionKey}
            agentPhaseGroups={agentState.phaseGroups}
            agentLastAction={agentState.lastAction}
            onClearAgentSession={agentState.clearSession}
            isChatCollapsed={isChatCollapsed}
            onToggleChat={() => setIsChatCollapsed(!isChatCollapsed)}
          />
        </div>

        <SaveProjectDialog
          isOpen={isSaveDialogOpen}
          onClose={() => setIsSaveDialogOpen(false)}
          onSave={handleSaveProject}
          defaultName={currentProjectName || ""}
          isSaving={isSaving}
          lastSavedAt={lastSavedAt}
        />

        <EnvConfigModal
          isOpen={isEnvConfigOpen}
          onClose={() => setIsEnvConfigOpen(false)}
        />

        <ProjectsModal
          isOpen={isProjectsModalOpen}
          onClose={() => setIsProjectsModalOpen(false)}
          onSelectProject={handleSelectProject}
          currentProjectId={currentProjectId}
        />

        <VersionsModal
          isOpen={isVersionsModalOpen}
          onClose={() => setIsVersionsModalOpen(false)}
          projectId={currentProjectId}
          sessionId={stellarIDE.sandbox.sandboxInfo?.sessionId}
          onRestoreComplete={() => {
             stellarIDE.sandbox.syncFileTree();
          }}
        />
      </div>
    </SandboxProvider>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Loading...</div>}>
      <GeneratePageContent />
    </Suspense>
  );
}
