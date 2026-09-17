"use client";
import { cn } from "@/lib/utils";
import {
  PanelLeft,
  PanelRight,
  Eye,
  Code2,
  FileCode2,
  Search,
  Maximize2,
  SlidersHorizontal,
  Terminal,
  ChevronsLeft,
  ChevronsRight,
  Files,
} from "lucide-react";
import { WorkspaceState } from "@/types/ide";
import { getAllFilePaths, pathExists } from "@/lib/fileTreeUtils";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const OPEN_FILE_SEARCH_EVENT = "stacy:open-file-search";

interface IdeHeaderProps {
  workspace: WorkspaceState;
  onToggleFileExplorer: () => void;
  onToggleActionPanel: () => void;
  onToggleTerminal: () => void;
  onTogglePreview?: () => void;
  previewMode?: boolean;
  interactionMode?: "agentic" | "manual";
  onCloseFile: (fileId: string) => void;
  onSelectFile: (fileId: string) => void;
  sandboxPreviewUrl?: string | null;
  isSandboxRunning?: boolean;
  hasPendingChanges?: boolean;
  onOpenEnvConfig?: () => void;
  isChatCollapsed?: boolean;
  onToggleChat?: () => void;
}

export function IdeHeader({
  workspace,
  onToggleFileExplorer,
  onToggleActionPanel,
  onToggleTerminal,
  onTogglePreview,
  previewMode = false,
  onCloseFile,
  onSelectFile,
  sandboxPreviewUrl,
  isSandboxRunning,
  hasPendingChanges = false,
  interactionMode = "manual",
  onOpenEnvConfig,
  isChatCollapsed,
  onToggleChat,
}: IdeHeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allFiles = useMemo(() => {
    const treeFiles = getAllFilePaths(workspace.fileTree);
    const contentFiles = Object.keys(workspace.fileContents);
    return Array.from(new Set([...treeFiles, ...contentFiles]));
  }, [workspace.fileTree, workspace.fileContents]);

  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      const recentFiles = (workspace.recentFiles ?? []).filter((file) =>
        allFiles.includes(file),
      );
      return (recentFiles.length > 0 ? recentFiles : allFiles).slice(0, 8);
    }

    return allFiles
      .filter((file) => file.toLowerCase().includes(query))
      .sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        const aExact = aLower === query || aLower.endsWith("/" + query);
        const bExact = bLower === query || bLower.endsWith("/" + query);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return a.length - b.length;
      })
      .slice(0, 10);
  }, [allFiles, searchQuery, workspace.recentFiles]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredFiles]);

  const handleSearchSelect = useCallback(
    (selectedPath: string) => {
      const contentExists = selectedPath in workspace.fileContents;
      const treeExists = pathExists(workspace.fileTree, selectedPath);

      if (!contentExists && !treeExists) {
        console.warn("[Search] Selected path not found in workspace:", selectedPath);
        setSearchQuery("");
        setIsSearchOpen(false);
        return;
      }

      onSelectFile(selectedPath);
      setSearchQuery("");
      setIsSearchOpen(false);
    },
    [onSelectFile, workspace.fileContents, workspace.fileTree],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isSearchOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (filteredFiles.length === 0) return;
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredFiles.length - 1),
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          if (filteredFiles.length === 0) return;
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredFiles.length === 0) return;
          if (filteredFiles[selectedIndex]) {
            handleSearchSelect(filteredFiles[selectedIndex]);
          }
          break;
        case "Escape":
          setSearchQuery("");
          setIsSearchOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [filteredFiles, handleSearchSelect, isSearchOpen, selectedIndex],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if ((e.metaKey || e.ctrlKey) && key === "p") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsSearchOpen(true);
      }

      if ((e.metaKey || e.ctrlKey) && key === "`") {
        e.preventDefault();
        onToggleTerminal();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [onToggleTerminal]);

  useEffect(() => {
    const handleOpenSearch = () => {
      inputRef.current?.focus();
      setIsSearchOpen(true);
    };

    window.addEventListener(OPEN_FILE_SEARCH_EVENT, handleOpenSearch);
    return () => window.removeEventListener(OPEN_FILE_SEARCH_EVENT, handleOpenSearch);
  }, []);

  return (
    <div className="h-[50px] border-b border-white/[0.12] bg-transparent grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 px-2 shrink-0 select-none relative @container/vm-header">
      {/* Left Section: Mode Switchers & Sidebar Toggle */}
      <div className="flex items-center gap-2 z-10">
        <button
          onClick={onToggleFileExplorer}
          className={cn(
            "h-8 w-8 rounded-lg transition-all flex items-center justify-center",
            workspace.ui.isFileExplorerOpen
              ? "text-[#4ee06a] bg-[#4ee06a]/10"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05]",
          )}
          title="Toggle File Explorer"
        >
          <PanelLeft className="h-4 w-4" data-testid="geist-icon" />
        </button>

        {(workspace.mode === "frontend" || interactionMode === "agentic") && onTogglePreview && (
          <div className="relative inline-flex h-[29px] items-center rounded-[6px] border border-white/[0.08] bg-white/[0.02] p-0.5 gap-0.5">
            <button
              onClick={() => onTogglePreview()}
              className={cn(
                "group relative inline-flex items-center justify-center transition-all duration-300 w-[26px] h-full rounded-[4px]",
                previewMode
                  ? "bg-white/[0.08] text-white shadow-[0px_2px_2px_0px_rgba(0,0,0,0.04)]"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
              title="Preview"
              data-testid="vm-tab-preview"
            >
              <Eye className="h-4 w-4" data-testid="geist-icon" />
              {hasPendingChanges ? (
                <span className="absolute top-1 right-1 w-1 h-1 bg-orange-500 rounded-full" />
              ) : (
                isSandboxRunning && (
                  <span className="absolute top-1 right-1 w-1 h-1 bg-[#4ee06a] rounded-full" />
                )
              )}
            </button>

            <button
              onClick={() => onTogglePreview()}
              className={cn(
                "group relative inline-flex items-center justify-center transition-all duration-300 w-[26px] h-full rounded-[4px]",
                !previewMode
                  ? "bg-white/[0.08] text-white shadow-[0px_2px_2px_0px_rgba(0,0,0,0.04)]"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
              title="Code"
              data-testid="vm-tab-code"
            >
              <Code2 className="h-4 w-4" data-testid="geist-icon" />
            </button>

            {onOpenEnvConfig && (
              <button
                onClick={onOpenEnvConfig}
                className="group relative inline-flex items-center justify-center transition-all duration-300 w-[26px] h-full rounded-[4px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                title="Env"
                data-testid="vm-tab-env"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" data-testid="geist-icon" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center Section: Search Bar (Centered Absolute) */}
      <div className="flex justify-center w-full">
        <div ref={containerRef} className="relative">
          <Search className="absolute left-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 text-zinc-600" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            className="h-7 w-48 rounded-md border border-white/6 bg-white/2 pl-7 pr-10 text-[11px] text-zinc-400 transition-all placeholder:text-zinc-600 focus:w-64 focus:border-white/12 focus:bg-white/4 focus:text-zinc-200 focus:outline-none"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] text-zinc-700">
            ⌘P
          </kbd>

          <AnimatePresence>
            {isSearchOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                className="absolute top-full left-0 w-[320px] -translate-x-1/2 md:left-1/2 mt-2 bg-[#0c0c0e] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/90 overflow-hidden z-[100] backdrop-blur-xl"
              >
                <div className="flex flex-col">
                  <div className="p-3 border-b border-white/[0.05] bg-white/[0.01]">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-2">
                      {searchQuery ? "Search Results" : "Recent Files"}
                    </span>
                  </div>

                  <div className="max-h-[320px] overflow-y-auto custom-scrollbar py-1">
                    {filteredFiles.length === 0 ? (
                      <div className="p-8 text-center text-[12px] text-zinc-600 italic">
                        No files found matching "{searchQuery}"
                      </div>
                    ) : (
                      filteredFiles.map((file, index) => {
                        const fileName = file.split("/").pop() || "";
                        const folderPath = file.includes("/")
                          ? file.split("/").slice(0, -1).join(" › ")
                          : "";

                        return (
                          <button
                            key={file}
                            onClick={() => handleSearchSelect(file)}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-3 text-left transition-all relative group",
                              index === selectedIndex
                                ? "bg-[#4ee06a]/10 text-white"
                                : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-100",
                            )}
                          >
                            <FileCode2 className={cn(
                              "w-4 h-4 shrink-0 transition-colors",
                              index === selectedIndex ? "text-[#4ee06a]" : "text-zinc-600 group-hover:text-zinc-400"
                            )} />

                            <div className="flex flex-col min-w-0 flex-1">
                              <span className={cn(
                                "text-[12px] font-medium truncate",
                                index === selectedIndex ? "text-[#4ee06a]" : "text-zinc-200"
                              )}>
                                {fileName}
                              </span>
                              {folderPath && (
                                <span className="text-[10px] text-zinc-600 truncate mt-0.5">
                                  {folderPath}
                                </span>
                              )}
                            </div>

                            {index === selectedIndex && (
                              <div className="flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded border border-[#4ee06a]/20 bg-[#4ee06a]/10 text-[9px] text-[#4ee06a] font-mono">
                                  ENTER
                                </kbd>
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right Section: Actions */}
      <div className="flex items-center gap-2 z-10">
        <button
          onClick={onToggleTerminal}
          className={cn(
            "h-7 w-7 rounded-md transition-all flex items-center justify-center border",
            workspace.ui.isTerminalOpen
              ? "bg-[#4ee06a]/10 border-[#4ee06a]/20 text-[#4ee06a] hover:bg-[#4ee06a]/20"
              : "border-white/[0.05] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
          )}
          title="Toggle Terminal"
        >
          <Terminal className="h-3.5 w-3.5" data-testid="geist-icon" />
        </button>

        <button
          onClick={onToggleActionPanel}
          className={cn(
            "h-7 w-7 rounded-md transition-all flex items-center justify-center border border-white/[0.05]",
            workspace.ui.isActionPanelOpen
              ? "text-zinc-100 bg-white/[0.05]"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]",
          )}
          title={interactionMode === "agentic" ? "Toggle Activity Panel" : "Toggle Action Panel"}
        >
          <PanelRight className="h-3.5 w-3.5" data-testid="geist-icon" />
        </button>

        <button
          onClick={onToggleChat}
          className={cn(
            "h-7 w-7 rounded-md transition-all flex items-center justify-center border border-white/[0.05]",
            isChatCollapsed
              ? "text-[#4ee06a] bg-[#4ee06a]/10 border-[#4ee06a]/20"
              : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300"
          )}
          title={isChatCollapsed ? "Show Chat" : "Expand Workspace"}
        >
          <Maximize2 className="h-3.5 w-3.5" data-testid="geist-icon" />
        </button>
      </div>
    </div>
  );
}
