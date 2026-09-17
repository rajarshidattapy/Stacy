"use client";
import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Search, ListFilter, CaseSensitive, WholeWord, Regex, RefreshCw, FilePlus, AlignLeft, Minus, ReplaceAll } from "lucide-react";
import { cn } from "@/lib/utils";

import { FileNode } from "@/types/ide";

interface SearchPanelProps {
  files: FileNode[];
  fileContents: Record<string, string>;
  onSelectFile: (path: string) => void;
  dispatch: any;
}

interface Match {
  line: number;
  text: string;
  before: string;
  match: string;
  after: string;
}

interface FileResult {
  path: string;
  matches: Match[];
  isExpanded: boolean;
}

export function SearchPanel({ files, fileContents, onSelectFile, dispatch }: SearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchWord, setMatchWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [isReplaceVisible, setIsReplaceVisible] = useState(true);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [showReplaceAllConfirm, setShowReplaceAllConfirm] = useState(false);

  const searchResults = useMemo(() => {
    if (!searchQuery) return [];

    const results: FileResult[] = [];
    const query = matchCase ? searchQuery : searchQuery.toLowerCase();

    Object.entries(fileContents).forEach(([path, content]) => {
      const lines = content.split('\n');
      const matches: Match[] = [];

      lines.forEach((lineText, index) => {
        const target = matchCase ? lineText : lineText.toLowerCase();
        let pos = 0;

        while ((pos = target.indexOf(query, pos)) !== -1) {
          matches.push({
            line: index + 1,
            text: lineText,
            before: lineText.substring(0, pos),
            match: lineText.substring(pos, pos + searchQuery.length),
            after: lineText.substring(pos + searchQuery.length)
          });
          pos += searchQuery.length;
        }
      });

      if (matches.length > 0) {
        results.push({
          path,
          matches,
          isExpanded: expandedFiles[path] ?? true
        });
      }
    });

    return results;
  }, [searchQuery, fileContents, matchCase, expandedFiles]);

  const totalMatches = searchResults.reduce((acc, curr) => acc + curr.matches.length, 0);

  const handleReplaceAll = () => {
    searchResults.forEach(result => {
      let content = fileContents[result.path];
      const query = matchCase ? searchQuery : new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
      
      // Basic replace for now - can be improved for regex/word match
      const newContent = content.replace(query, replaceQuery);
      
      dispatch({
        type: "UPDATE_FILE",
        payload: { path: result.path, content: newContent }
      });
    });
    setShowReplaceAllConfirm(false);
  };

  const handleReplaceSingle = (path: string, line: number, matchIndex: number) => {
    // Single replace is harder without offset info, for now we just do first occurrence on that line
    // Or we can just implement Replace All first as requested
  };

  return (
    <div className="w-full h-full flex flex-col shrink-0 text-sm bg-transparent">
      <div className="h-9 flex items-center justify-between px-4 border-b border-zinc-800/50">
        <span className="text-[10px] font-medium text-zinc-400 tracking-wider">SEARCH</span>
        <div className="flex items-center gap-1.5">
          <RefreshCw 
            className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-transform active:rotate-180" 
            onClick={() => {
              setSearchQuery("");
              setReplaceQuery("");
            }}
          />
          <ListFilter className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer" />
          <FilePlus className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer" />
          <AlignLeft className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer" />
          <Minus 
            className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer" 
            onClick={() => setResultsCollapsed(!resultsCollapsed)}
          />
        </div>
      </div>
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsReplaceVisible(!isReplaceVisible)}
            className="focus:outline-none"
          >
            {isReplaceVisible ? (
              <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
            )}
          </button>
          <div className="relative flex-1 flex items-center">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search (↑↓ for history)"
              className="w-full bg-zinc-900 border border-zinc-700/80 rounded-[2px] text-[13px] text-zinc-300 pl-2 pr-[68px] py-[3px] outline-none focus:border-zinc-500 placeholder:text-zinc-500 font-mono"
            />
            <div className="absolute right-[2px] flex items-center gap-0.5">
              <button 
                onClick={() => setMatchCase(!matchCase)}
                className={cn("p-[1px] rounded-[2px]", matchCase ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300")}
                title="Match Case (Alt+C)"
              >
                <CaseSensitive className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setMatchWord(!matchWord)}
                className={cn("p-[1px] rounded-[2px]", matchWord ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300")}
                title="Match Whole Word (Alt+W)"
              >
                <WholeWord className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setUseRegex(!useRegex)}
                className={cn("p-[1px] rounded-[2px]", useRegex ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300")}
                title="Use Regular Expression (Alt+R)"
              >
                <Regex className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        
        {isReplaceVisible && (
          <div className="flex items-center gap-1">
            <div className="w-4 shrink-0" />
            <div className="relative flex-1 flex items-center">
              <input
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Replace"
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-[2px] text-[13px] text-zinc-300 pl-2 pr-[48px] py-[3px] outline-none focus:border-zinc-500 placeholder:text-zinc-500 font-mono"
              />
              <div className="absolute right-[2px] flex items-center gap-0.5">
                <button className="p-[1px] rounded-[2px] text-zinc-500 hover:text-zinc-300" title="Preserve Case">
                  <span className="font-mono text-[10px] px-1 font-bold">AB</span>
                </button>
                <button 
                  className="p-[1px] rounded-[2px] text-zinc-500 hover:text-zinc-300 disabled:opacity-30" 
                  title="Replace All (Ctrl+Alt+Enter)"
                  disabled={!searchQuery || totalMatches === 0}
                  onClick={() => setShowReplaceAllConfirm(true)}
                >
                  <ReplaceAll className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {searchQuery && !resultsCollapsed && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-5 py-2 text-[11px] text-zinc-500 border-b border-zinc-800/50 flex items-center justify-between">
              <span>
                {totalMatches} results in {searchResults.length} files
              </span>
              <div className="flex items-center gap-2">
                <span className="text-blue-400/80 hover:text-blue-400 cursor-pointer">Open in editor</span>
                <span className="text-zinc-600">|</span>
                <span className="text-blue-400/80 hover:text-blue-400 cursor-pointer">Search with AI</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
              {searchResults.map((result) => (
                <div key={result.path} className="flex flex-col">
                  <div 
                    className="group flex items-center gap-1 px-1 py-0.5 hover:bg-white/[0.03] cursor-pointer"
                    onClick={() => {
                      setExpandedFiles(prev => ({ ...prev, [result.path]: !(prev[result.path] ?? true) }));
                    }}
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      {(expandedFiles[result.path] ?? true) ? (
                        <ChevronDown className="w-3 h-3 text-zinc-500" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-zinc-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        {/* Mock file icon based on extension */}
                        {result.path.endsWith('.json') && <span className="text-yellow-500 text-[10px]">JS</span>}
                        {result.path.endsWith('.tsx') && <span className="text-blue-400 text-[10px]">TSX</span>}
                        {!result.path.includes('.') && <span className="text-zinc-500 text-[10px]">F</span>}
                      </div>
                      <span className="text-[12.5px] text-zinc-300 truncate font-medium">
                        {result.path.split('/').pop()}
                      </span>
                      <span className="text-[11px] text-zinc-500 truncate opacity-40">
                        {result.path.split('/').slice(0, -1).join('/')}
                      </span>
                    </div>
                    <div className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[#f1b42f] text-[10px] text-black font-bold px-1 mx-1">
                      {result.matches.length}
                    </div>
                  </div>

                  {(expandedFiles[result.path] ?? true) && (
                    <div className="flex flex-col">
                      {result.matches.map((match, idx) => (
                        <div 
                          key={`${result.path}-${idx}`}
                          onClick={() => onSelectFile(result.path)}
                          className="pl-8 pr-4 py-1 hover:bg-white/[0.05] cursor-pointer group/match relative"
                        >
                          <div className="text-[12px] font-mono whitespace-pre truncate text-zinc-400">
                            <span className="opacity-50">{match.before}</span>
                            <span className="bg-[#f14c4c]/30 text-white rounded-[1px] px-[1px] border-b border-[#f14c4c]">{match.match}</span>
                            <span className="opacity-50">{match.after}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {showReplaceAllConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
            <div className="w-[400px] bg-[#1e1e1e] border border-white/[0.1] rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="px-6 py-4 border-b border-white/[0.05] flex items-center justify-center">
                <h3 className="text-[13px] font-medium text-zinc-300">Replace All</h3>
              </div>
              <div className="px-8 py-10 text-center">
                <p className="text-[14px] text-zinc-300 font-mono leading-relaxed">
                  Replace {totalMatches} occurrences across {searchResults.length} files with '{replaceQuery}'?
                </p>
              </div>
              <div className="px-4 py-3 bg-[#1e1e1e] border-t border-white/[0.05] flex items-center justify-end gap-2">
                <button 
                  onClick={() => setShowReplaceAllConfirm(false)}
                  className="px-6 py-1.5 rounded-[4px] bg-white/[0.05] hover:bg-white/[0.08] text-[13px] text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleReplaceAll}
                  className="px-8 py-1.5 rounded-[4px] bg-transparent border border-[#4ee06a]/50 hover:bg-[#4ee06a]/10 text-[#4ee06a] text-[13px] transition-all"
                >
                  Replace
                </button>
              </div>
            </div>
          </div>
        )}

        {!searchQuery && (
          <div className="mt-2 text-[13px] text-zinc-500 leading-relaxed font-mono px-5">
            Search was canceled before any results could be found - <span className="text-blue-400 cursor-pointer hover:underline" onClick={() => setSearchQuery("App")}>Search again</span>
          </div>
        )}
      </div>
    </div>
  );
}
