"use client";
import { cn } from "@/lib/utils";
import { FileNode } from "@/types/ide";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  RefreshCw,
  FileCode2,
  FileJson,
  Type,
  Search,
  MoreVertical,
  Plus,
  GripVertical
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FileExplorerProps {
  files: FileNode[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  isOpen: boolean;
  onAddFile?: (parentPath: string, fileName: string) => void;
  onAddFolder?: (parentPath: string, folderName: string) => void;
  onRename?: (oldPath: string, newName: string) => void;
  onDelete?: (path: string) => void;
  onRefresh?: () => void;
  showRefresh?: boolean;
}

// Helper to get file icons
const getFileIcon = (name: string, isExpanded?: boolean, isFolder?: boolean) => {
  if (isFolder) {
    return isExpanded ? 
      <FolderOpen className="w-4 h-4 text-zinc-400 shrink-0" /> : 
      <Folder className="w-4 h-4 text-zinc-400 shrink-0" />;
  }

  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return <FileCode2 className="w-4 h-4 text-blue-400/80 shrink-0" />;
    case "js":
    case "jsx":
      return <FileCode2 className="w-4 h-4 text-yellow-400/80 shrink-0" />;
    case "json":
      return <FileJson className="w-4 h-4 text-orange-400/80 shrink-0" />;
    case "rs":
      return <FileCode2 className="w-4 h-4 text-orange-500/80 shrink-0" />;
    case "css":
      return <Type className="w-4 h-4 text-blue-300/80 shrink-0" />;
    default:
      return <FileText className="w-4 h-4 text-zinc-500 shrink-0" />;
  }
};

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  isFolder: boolean;
}

const ContextMenu = ({ x, y, onClose, onNewFile, onNewFolder, onRename, onDelete, isFolder }: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Clamp to viewport
  const menuWidth = 180;
  const menuHeight = isFolder ? 140 : 92;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  const MenuItem = ({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); onClose(); }}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] font-medium transition-colors rounded-[5px]",
        danger ? "text-red-400 hover:bg-red-500/10" : "text-zinc-300 hover:bg-white/[0.07]"
      )}
    >
      <span className={cn("shrink-0", danger ? "text-red-400" : "text-zinc-500")}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="fixed z-200 bg-[#1c1c1e] border border-white/10 rounded-lg shadow-2xl p-1.5 overflow-hidden"
      style={{ top: clampedY, left: clampedX, width: menuWidth }}
    >
      {isFolder && (
        <>
          <MenuItem icon={<FilePlus className="w-3.5 h-3.5" />} label="New File" onClick={onNewFile} />
          <MenuItem icon={<FolderPlus className="w-3.5 h-3.5" />} label="New Folder" onClick={onNewFolder} />
          <div className="h-px bg-white/6 my-1" />
        </>
      )}
      <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} label="Rename" onClick={onRename} />
      <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} label="Delete" onClick={onDelete} danger />
    </div>
  );
};

const InlineInput = ({ 
  initialValue, 
  onConfirm, 
  onCancel, 
  icon,
  validate
}: { 
  initialValue: string; 
  onConfirm: (val: string) => void; 
  onCancel: () => void;
  icon: React.ReactNode;
  validate?: (val: string) => string | null;
}) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleChange = (val: string) => {
    setValue(val);
    if (validate) {
      setError(validate(val));
    }
  };

  const handleConfirm = () => {
    if (error) return;
    onConfirm(value);
  };

  return (
    <div className="relative">
      <div className={cn(
        "flex items-center gap-1.5 px-4 py-1.5 transition-colors",
        error ? "bg-red-500/10 border-y border-red-500/30" : "bg-blue-500/5 border-y border-blue-500/10"
      )}>
        <div className="shrink-0">{icon}</div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") onCancel();
          }}
          onBlur={() => {
            // Only confirm if there's no error, otherwise cancel on blur if invalid?
            // Actually, VS Code usually keeps the input if it's invalid but blurs.
            // Let's just confirm if valid.
            if (!error) onConfirm(value);
            else onCancel();
          }}
          className="flex-1 bg-transparent text-zinc-100 text-[13px] outline-none border-none p-0 focus:ring-0 selection:bg-blue-500/30"
          spellCheck={false}
        />
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full left-0 right-0 z-[100] mt-1 px-3 py-2 bg-[#4b1d1d] border border-red-500/50 rounded-sm shadow-xl"
          >
            <p className="text-[11px] text-red-200 leading-relaxed font-medium">
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FileItem = ({
  node,
  level,
  activeFile,
  onSelectFile,
  path,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  siblings
}: {
  node: FileNode;
  level: number;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  path: string;
  onAddFile?: (parentPath: string, fileName: string) => void;
  onAddFolder?: (parentPath: string, folderName: string) => void;
  onRename?: (oldPath: string, newName: string) => void;
  onDelete?: (path: string) => void;
  siblings?: FileNode[];
}) => {
  const [isExpanded, setExpanded] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [showAddInput, setShowAddInput] = useState<{ type: "file" | "folder" } | null>(null);
  const [addInputValue, setAddInputValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  
  const renameInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const currentPath = path ? `${path}/${node.name}` : node.name;
  const filePath = node.type === "file" ? node.id : currentPath;
  const isActive = activeFile === filePath;

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (showAddInput && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [showAddInput]);

  const handleRename = () => {
    if (renameValue.trim() && renameValue !== node.name && onRename) {
      onRename(filePath, renameValue.trim());
    }
    setIsRenaming(false);
  };

  const handleAddItem = () => {
    if (addInputValue.trim()) {
      if (showAddInput?.type === "file" && onAddFile) {
        onAddFile(filePath, addInputValue.trim());
      } else if (showAddInput?.type === "folder" && onAddFolder) {
        onAddFolder(filePath, addInputValue.trim());
      }
    }
    setShowAddInput(null);
    setAddInputValue("");
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="w-full">
      <div
        onContextMenu={onContextMenu}
        className={cn(
          "group relative flex items-center gap-1.5 py-[2px] px-2 cursor-pointer transition-colors w-full",
          isActive 
            ? "bg-white/[0.08] text-white" 
            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
        )}
        style={{ paddingLeft: `${level * 12 + 12}px` }}
        onClick={() => {
          if (node.type === "folder") setExpanded(!isExpanded);
          else onSelectFile(filePath);
        }}
      >
        {/* Full width background hover effect helper */}
        <div className="absolute inset-0 -z-10 group-hover:bg-white/[0.04]" />
        
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {node.type === "folder" ? (
            <span className="w-4 h-4 flex items-center justify-center">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
              )}
            </span>
          ) : (
            <span className="w-4" /> 
          )}
          
          {getFileIcon(node.name, isExpanded, node.type === "folder")}

          <span className="flex-1 truncate text-[13px] font-medium tracking-tight">
            {node.name}
          </span>
        </div>

        {/* Hover Actions */}
        <div className="hidden group-hover:flex items-center pr-1">
          <button
            onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
            className="p-1 hover:bg-white/10 rounded transition-colors text-zinc-500 hover:text-zinc-200"
            title="More actions"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Conditional Rendering for Rename and Add Input */}
      <div style={{ paddingLeft: `${level * 12 + 12}px` }}>
        {isRenaming && (
          <InlineInput
            initialValue={node.name}
            icon={getFileIcon(node.name, isExpanded, node.type === "folder")}
            validate={(val) => {
              if (!val.trim()) return "A file or folder name must be provided.";
              if (val.trim() === node.name) return null;
              if (siblings?.some(s => s.name === val.trim())) {
                return `A file or folder ${val.trim()} already exists at this location. Please choose a different name.`;
              }
              return null;
            }}
            onConfirm={(val) => {
              if (val.trim() && val !== node.name) onRename?.(filePath, val.trim());
              setIsRenaming(false);
            }}
            onCancel={() => setIsRenaming(false)}
          />
        )}

        {showAddInput && (
          <InlineInput
            initialValue=""
            icon={showAddInput.type === "file" ? <FileText className="w-4 h-4 text-zinc-500" /> : <Folder className="w-4 h-4 text-zinc-500" />}
            validate={(val) => {
              if (!val.trim()) return "A file or folder name must be provided.";
              if (node.children?.some(c => c.name === val.trim())) {
                return `A file or folder ${val.trim()} already exists at this location. Please choose a different name.`;
              }
              return null;
            }}
            onConfirm={(val) => {
              if (val.trim()) {
                if (showAddInput.type === "file") onAddFile?.(filePath, val.trim());
                else onAddFolder?.(filePath, val.trim());
              }
              setShowAddInput(null);
            }}
            onCancel={() => setShowAddInput(null)}
          />
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isFolder={node.type === "folder"}
          onClose={() => setContextMenu(null)}
          onNewFile={() => setShowAddInput({ type: "file" })}
          onNewFolder={() => setShowAddInput({ type: "folder" })}
          onRename={() => setIsRenaming(true)}
          onDelete={() => onDelete?.(filePath)}
        />
      )}

      {node.type === "folder" && isExpanded && node.children && (
        <div className="flex flex-col">
          {node.children.map((child) => (
            <FileItem
              key={child.id}
              node={child}
              level={level + 1}
              activeFile={activeFile}
              onSelectFile={onSelectFile}
              path={currentPath}
              onAddFile={onAddFile}
              onAddFolder={onAddFolder}
              onRename={onRename}
              onDelete={onDelete}
              siblings={node.children}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function FileExplorer({
  files,
  activeFile,
  onSelectFile,
  isOpen,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  onRefresh,
  showRefresh = true
}: FileExplorerProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rootShowAddInput, setRootShowAddInput] = useState<{ type: "file" | "folder" } | null>(null);
  const [rootAddInputValue, setRootAddInputValue] = useState("");
  const rootAddInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rootShowAddInput && rootAddInputRef.current) {
      rootAddInputRef.current.focus();
    }
  }, [rootShowAddInput]);

  const handleRootAddItem = () => {
    if (rootAddInputValue.trim()) {
      if (rootShowAddInput?.type === "file" && onAddFile) {
        onAddFile("", rootAddInputValue.trim());
      } else if (rootShowAddInput?.type === "folder" && onAddFolder) {
        onAddFolder("", rootAddInputValue.trim());
      }
    }
    setRootShowAddInput(null);
    setRootAddInputValue("");
  };

  if (!isOpen) return null;

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-hidden">
      <div className="h-10 flex items-center justify-between px-4 shrink-0 group/header border-b border-white/[0.03]">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em]">
          Explorer
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setRootShowAddInput({ type: "file" })}
            className="p-1.5 text-zinc-500 text-zinc-200 bg-white/[0.05] rounded-md transition-all"
            title="New File"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setRootShowAddInput({ type: "folder" })}
            className="p-1.5 text-zinc-500 text-zinc-200 bg-white/[0.05] rounded-md transition-all"
            title="New Folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          {showRefresh && onRefresh && (
            <button
              onClick={() => {
                setIsRefreshing(true);
                onRefresh();
                setTimeout(() => setIsRefreshing(false), 1000);
              }}
              className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] rounded-md transition-all"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            </button>
          )}
        </div>
      </div>

      <div 
        className="flex-1 overflow-y-auto custom-scrollbar py-2"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
          }
        }}
      >
        {/* Root Add Input */}
        <AnimatePresence mode="wait">
          {rootShowAddInput && (
            <motion.div 
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mx-2 mb-1"
            >
              <InlineInput
                initialValue=""
                icon={rootShowAddInput.type === "file" ? <FileText className="w-3.5 h-3.5 text-zinc-500" /> : <Folder className="w-3.5 h-3.5 text-zinc-500" />}
                validate={(val) => {
                  if (!val.trim()) return "A file or folder name must be provided.";
                  if (files.some(f => f.name === val.trim())) {
                    return `A file or folder ${val.trim()} already exists at this location. Please choose a different name.`;
                  }
                  return null;
                }}
                onConfirm={(val) => {
                  if (val.trim()) {
                    if (rootShowAddInput.type === "file") onAddFile?.("", val.trim());
                    else onAddFolder?.("", val.trim());
                  }
                  setRootShowAddInput(null);
                }}
                onCancel={() => setRootShowAddInput(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {files.length === 0 && !rootShowAddInput ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-6">
            <div className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-3">
              <Folder className="w-5 h-5 text-zinc-800" />
            </div>
            <p className="text-[11px] text-zinc-600 font-medium leading-relaxed italic">Empty Workspace</p>
          </div>
        ) : (
          files.map((file) => (
            <FileItem
              key={file.id}
              node={file}
              level={0}
              activeFile={activeFile}
              onSelectFile={onSelectFile}
              path=""
              onAddFile={onAddFile}
              onAddFolder={onAddFolder}
              onRename={onRename}
              onDelete={onDelete}
              siblings={files}
            />
          ))
        )}
      </div>
    </div>
  );
}
