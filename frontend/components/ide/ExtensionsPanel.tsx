"use client";
import { useState, useMemo, useEffect } from "react";
import { Check, Cloud, Filter, RefreshCw, Search, Settings, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MONACO_THEME_CHANGE_EVENT,
  setStoredMonacoTheme,
} from "@/lib/monacoTheme";

export interface IDEExtension {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  type: "extension" | "theme";
  source: "local" | "open-vsx" | "marketplace";
  iconUrl?: string;
  downloadUrl?: string;
  namespace?: string;
  extensionName?: string;
  downloads?: number;
  rating?: number;
  reviewCount?: number;
  categories?: string[];
  tags?: string[];
  publishedAt?: string;
  lastUpdated?: string;
  repositoryUrl?: string;
  licenseUrl?: string;
  marketplaceUrl?: string;
  readme?: string;
  features?: string[];
  monacoThemeId?: string;
  iconColor?: string;
  iconBackground?: string;
  iconText?: string;
  installed?: boolean;
}

interface ExtensionsPanelProps {
  activeExtensionId?: string | null;
  onSelectExtension?: (extension: IDEExtension) => void;
}

export const INSTALLED_EXTENSIONS_STORAGE_KEY = "stacy.installed-extension-ids";

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function ExtensionsPanel({ activeExtensionId, onSelectExtension }: ExtensionsPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyInstalled, setShowOnlyInstalled] = useState(false);
  const [extensions, setExtensions] = useState<IDEExtension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [installedIds, setInstalledIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(INSTALLED_EXTENSIONS_STORAGE_KEY);
      if (saved) setInstalledIds(new Set(JSON.parse(saved) as string[]));
    } catch {}
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      INSTALLED_EXTENSIONS_STORAGE_KEY,
      JSON.stringify(Array.from(installedIds)),
    );
  }, [installedIds]);

  useEffect(() => {
    const controller = new AbortController();
    const id = window.setTimeout(() => void fetchExtensions(controller.signal), searchQuery.trim() ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(id); };

    async function fetchExtensions(signal: AbortSignal) {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        const q = searchQuery.trim();
        if (q && !showOnlyInstalled) params.set("query", q);
        const res = await fetch(`/api/extensions${params.size ? `?${params}` : ""}`, { signal });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setExtensions(data.map((ext: IDEExtension) => ({
          ...ext,
          installed: ext.source === "local" || installedIds.has(ext.id),
        })));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Marketplace unavailable");
      } finally {
        setIsLoading(false);
      }
    }
  }, [installedIds, searchQuery, showOnlyInstalled]);

  const filtered = useMemo(() => extensions.filter(ext => {
    const q = searchQuery.trim().toLowerCase();
    const match = !q || ext.name.toLowerCase().includes(q) || ext.description.toLowerCase().includes(q) || ext.author.toLowerCase().includes(q);
    return showOnlyInstalled ? match && ext.installed : match;
  }), [searchQuery, showOnlyInstalled, extensions]);

  const installed = filtered.filter(e => e.installed || e.source === "local");
  const notInstalled = filtered.filter(e => !e.installed && e.source !== "local");

  function toggleInstall(ext: IDEExtension, e: React.MouseEvent) {
    e.stopPropagation();
    if (ext.type === "theme" && ext.monacoThemeId) {
      activateTheme(ext.monacoThemeId);
      return;
    }
    if (ext.source === "local") return;
    setInstalledIds(cur => {
      const next = new Set(cur);
      next.has(ext.id) ? next.delete(ext.id) : next.add(ext.id);
      return next;
    });
  }

  function activateTheme(themeId: string) {
    setStoredMonacoTheme(themeId);
    window.dispatchEvent(new CustomEvent(MONACO_THEME_CHANGE_EVENT, { detail: { theme: themeId } }));
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#181818] text-[#cccccc] select-none overflow-hidden" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1 shrink-0">
        <span className="text-[11px] font-semibold text-[#bbbbbb] uppercase tracking-[0.08em]">Extensions</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowOnlyInstalled(!showOnlyInstalled)}
            title="Filter extensions"
            className={cn("p-1 rounded text-[#8d8d8d] hover:text-[#cccccc] hover:bg-white/[0.07] transition-colors", showOnlyInstalled && "text-[#cccccc] bg-white/[0.07]")}
          >
            <Filter size={14} />
          </button>
          <button
            title="Refresh"
            className="p-1 rounded text-[#8d8d8d] hover:text-[#cccccc] hover:bg-white/[0.07] transition-colors"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 shrink-0">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 w-3.5 h-3.5 text-[#8d8d8d] pointer-events-none" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search Extensions in Marketplace"
            className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007acc] rounded-none text-[13px] text-[#cccccc] placeholder:text-[#8d8d8d] pl-8 pr-7 py-1.5 outline-none transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 text-[#8d8d8d] hover:text-[#cccccc]">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#424242 transparent" }}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-5 h-5 border-2 border-[#3c3c3c] border-t-[#007acc] rounded-full animate-spin" />
            <span className="text-[11px] text-[#8d8d8d]">Loading extensions…</span>
          </div>
        ) : error ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[12px] text-[#f48771]">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-2 text-[11px] text-[#3794ff] hover:underline">Retry</button>
          </div>
        ) : (
          <>
            {installed.length > 0 && (
              <ExtensionGroup
                label={showOnlyInstalled ? "INSTALLED" : "INSTALLED"}
                extensions={installed}
                activeId={activeExtensionId}
                installedIds={installedIds}
                onSelect={onSelectExtension}
                onToggle={toggleInstall}
              />
            )}
            {notInstalled.length > 0 && (
              <ExtensionGroup
                label={searchQuery.trim() ? "RESULTS" : "MARKETPLACE — FEATURED"}
                extensions={notInstalled}
                activeId={activeExtensionId}
                installedIds={installedIds}
                onSelect={onSelectExtension}
                onToggle={toggleInstall}
              />
            )}
            {filtered.length === 0 && (
              <div className="px-5 py-8 text-center text-[12px] text-[#8d8d8d]">No extensions found</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ExtensionGroup({
  label,
  extensions,
  activeId,
  installedIds,
  onSelect,
  onToggle,
}: {
  label: string;
  extensions: IDEExtension[];
  activeId?: string | null;
  installedIds: Set<string>;
  onSelect?: (ext: IDEExtension) => void;
  onToggle: (ext: IDEExtension, e: React.MouseEvent) => void;
}) {
  return (
    <div>
      <div className="px-5 py-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#bbbbbb] uppercase tracking-[0.06em]">{label}</span>
        <span className="text-[10px] text-[#8d8d8d] font-mono">{extensions.length}</span>
      </div>
      {extensions.map(ext => (
        <ExtensionItem
          key={ext.id}
          ext={ext}
          isActive={activeId === ext.id}
          isInstalled={installedIds.has(ext.id) || ext.source === "local"}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function ExtensionItem({
  ext,
  isActive,
  isInstalled,
  onSelect,
  onToggle,
}: {
  ext: IDEExtension;
  isActive: boolean;
  isInstalled: boolean;
  onSelect?: (ext: IDEExtension) => void;
  onToggle: (ext: IDEExtension, e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={() => onSelect?.(ext)}
      className={cn(
        "group relative flex items-start gap-3 px-5 py-2 cursor-pointer transition-colors",
        isActive ? "bg-[#37373d]" : "hover:bg-[#2a2d2e]",
      )}
    >
      {/* Icon */}
      <div className="shrink-0 mt-0.5">
        {ext.iconUrl ? (
          <img src={ext.iconUrl} alt="" className="w-[50px] h-[50px] object-contain bg-transparent" />
        ) : (
          <div
            className="w-[50px] h-[50px] flex items-center justify-center text-lg font-bold text-white/60"
            style={{ backgroundColor: ext.iconBackground ?? "#2d2d2d" }}
          >
            {ext.iconText ?? ext.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 pr-16">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-semibold text-[#cccccc] leading-tight truncate">{ext.name}</span>
        </div>
        <p className="text-[12px] text-[#8d8d8d] leading-snug truncate mt-0.5">{ext.description}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] text-[#8d8d8d]">{ext.author}</span>
          {typeof ext.downloads === "number" && ext.downloads > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-[#8d8d8d]">
              <Cloud size={10} />
              {formatDownloads(ext.downloads)}
            </span>
          )}
          {typeof ext.rating === "number" && ext.rating > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-[#8d8d8d]">
              <Star size={10} className="fill-[#8d8d8d]" />
              {ext.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Actions — always visible */}
      <div className="absolute right-3 top-2 flex items-center gap-1">
        {isInstalled ? (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => onToggle(ext, e)}
              className="p-1 rounded text-[#8d8d8d] hover:text-[#cccccc] hover:bg-white/[0.07] transition-colors"
              title="Settings"
            >
              <Settings size={13} />
            </button>
            <Check size={13} className="text-[#4ade80]" />
          </div>
        ) : (
          <button
            onClick={e => onToggle(ext, e)}
            className="px-2.5 py-0.5 text-[11px] font-medium border border-[#3794ff]/60 text-[#3794ff] hover:bg-[#3794ff]/10 transition-colors rounded-sm"
          >
            {ext.type === "theme" ? "Activate" : "Install"}
          </button>
        )}
      </div>
    </div>
  );
}
