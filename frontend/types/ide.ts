export type IdeMode = "contract" | "frontend";
export type TerminalStatus = "idle" | "compiling" | "deploying" | "success" | "error";
export type ChatTargetMode = "auto" | "contract" | "frontend";

export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  isOpen?: boolean;
}

export interface DeployedContract {
  id: string;
  name: string;
  address: string;
  deployedAt: string;
  network: "testnet";
  wasmHash?: string;
}

export interface WorkspaceState {
  mode: IdeMode;
  fileTree: FileNode[];
  openFiles: string[];
  activeFile: string | null;
  recentFiles?: string[];
  fileContents: Record<string, string>;
  terminalLogs: string[];
  terminalStatus: TerminalStatus;
  ui: {
    isFileExplorerOpen: boolean;
    isActionPanelOpen: boolean;
    isTerminalOpen: boolean;
    isPreviewMode: boolean;
  };
}

export interface ChatContext {
  targetMode: ChatTargetMode;
  resolvedMode: IdeMode;
  activeFilePath?: string;
  selection?: {
    startLine: number;
    endLine: number;
    selectedText: string;
  };
  intent?: "general" | "fix" | "explain" | "optimize" | "debug";
}
