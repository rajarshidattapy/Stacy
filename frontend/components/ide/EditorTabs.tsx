"use client";
import { cn } from "@/lib/utils";
import { X, FileCode2, ChevronRight, Hash, Box } from "lucide-react";
import { WorkspaceState } from "@/types/ide";

interface EditorTabsProps {
  openFiles: string[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onCloseFile: (path: string) => void;
}

export function EditorTabs({
  openFiles,
  activeFile,
  onSelectFile,
  onCloseFile,
}: EditorTabsProps) {
  const getSymbolName = (path: string) => {
    const fileName = path.split("/").pop() || "";
    const nameWithoutExt = fileName.split(".")[0];
    if (!nameWithoutExt) return "";
    return nameWithoutExt
      .split(/[-_.]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");
  };

  if (openFiles.length === 0) return null;

  return (
    <div className="flex flex-col shrink-0">
      {/* Tab Bar */}
      <div className="flex h-10 bg-[#050505] border-b border-white/[0.08] overflow-x-auto no-scrollbar">
        {openFiles.map((path) => {
          const fileName = path.split("/").pop() || path;
          const isActive = activeFile === path;

          return (
            <div
              key={path}
              onClick={() => onSelectFile(path)}
              className={cn(
                "group relative flex h-full min-w-[140px] max-w-[200px] items-center gap-2.5 px-4 cursor-pointer transition-all",
                isActive
                  ? "bg-[#0c0c0e] text-white"
                  : "text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300"
              )}
            >
              <div className={cn(
                "flex items-center justify-center rounded-sm",
                isActive ? "text-[#4ee06a]" : "text-zinc-500"
              )}>
                <FileCode2 className="h-4 w-4" />
              </div>
              <span className={cn(
                "truncate text-[12px] font-medium flex-1",
                isActive ? "text-white" : "text-zinc-400"
              )}>
                {fileName}
              </span>

              {/* Active Indicator Line */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4ee06a] shadow-[0_-1px_4px_rgba(78,224,106,0.2)]" />
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFile(path);
                }}
                className={cn(
                  "p-1 rounded-md hover:bg-white/[0.1] transition-colors",
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
              >
                <X className="h-3 w-3" />
              </button>

              {/* Vertical Separator */}
              {!isActive && (
                <div className="absolute right-0 top-1/4 bottom-1/4 w-px bg-white/[0.05]" />
              )}
            </div>
          );
        })}
      </div>

      {/* Breadcrumbs (Custom Style from Image) */}
      {activeFile && (
        <div className="flex h-8 items-center gap-1.5 px-4 bg-[#09090b] border-b border-black/[0.05] overflow-x-auto no-scrollbar">
          {activeFile.split("/").map((part, index, array) => {
            const isLast = index === array.length - 1;

            return (
              <div key={index} className="flex items-center gap-1.5 shrink-0">
                {index > 0 && <span className="text-white text-[12px] font-bold mx-0.5 mt-0.5">›</span>}

                <div className="flex items-center gap-1.5">
                  {isLast && <FileCode2 className="h-3.5 w-3.5 text-white" />}
                  <span className="text-white text-[12px] font-medium tracking-wide">
                    {part}
                  </span>
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-white text-[12px] font-bold mx-0.5 mt-0.5">›</span>
            <span className="text-white text-[12px] font-medium">...</span>
          </div>
        </div>
      )}
    </div>
  );
}
