"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Check,
  ChevronDown,
  Cloud,
  ExternalLink,
  FileText,
  Info,
  Settings,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { MONACO_THEME_CHANGE_EVENT, setStoredMonacoTheme } from "@/lib/monacoTheme";
import { INSTALLED_EXTENSIONS_STORAGE_KEY, type IDEExtension } from "./ExtensionsPanel";

interface ExtensionDetailViewProps {
  extension: IDEExtension;
  onClose: () => void;
}

const tabNames = ["Details", "Features", "Changelog", "Extension Pack"] as const;
type DetailTab = (typeof tabNames)[number];

export function ExtensionDetailView({ extension, onClose }: ExtensionDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("Details");
  const [installed, setInstalled] = useState(extension.installed ?? extension.source === "local");
  const [detail, setDetail] = useState<IDEExtension>(extension);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  useEffect(() => {
    setActiveTab("Details");
    setInstalled(extension.installed ?? extension.source === "local");
    setDetail(extension);
  }, [extension.id, extension.installed, extension.source]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadDetail() {
      setIsLoadingDetail(true);
      try {
        const params = new URLSearchParams({ source: extension.source });
        if (extension.source === "open-vsx") {
          if (extension.namespace) params.set("namespace", extension.namespace);
          if (extension.extensionName) params.set("extension", extension.extensionName);
          if (extension.version) params.set("version", extension.version);
        } else if (extension.source === "marketplace") {
          if (!extension.namespace || !extension.extensionName) { setIsLoadingDetail(false); return; }
          params.set("namespace", extension.namespace);
          params.set("extension", extension.extensionName);
        } else if (extension.extensionName) {
          params.set("folder", extension.extensionName);
        } else {
          setIsLoadingDetail(false);
          return;
        }
        const res = await fetch(`/api/extensions/detail?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Detail request failed.");
        const next = (await res.json()) as IDEExtension;
        setDetail(cur => ({
          ...cur, ...next,
          source: cur.source, installed: cur.installed, iconColor: cur.iconColor,
          iconText: next.iconText ?? cur.iconText,
          iconBackground: next.iconBackground ?? cur.iconBackground,
          monacoThemeId: next.monacoThemeId ?? cur.monacoThemeId,
        }));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.error("Failed to load extension detail:", e);
      } finally {
        setIsLoadingDetail(false);
      }
    }
    void loadDetail();
    return () => controller.abort();
  }, [extension]);

  const marketplaceUrl = useMemo(() => {
    if (detail.marketplaceUrl) return detail.marketplaceUrl;
    if (!detail.namespace || !detail.extensionName) return undefined;
    return `https://open-vsx.org/extension/${detail.namespace}/${detail.extensionName}`;
  }, [detail.extensionName, detail.marketplaceUrl, detail.namespace]);

  const categories = detail.categories?.length ? detail.categories : detail.type === "theme" ? ["Themes"] : ["Other"];

  function handleInstall() {
    if (detail.type === "theme" && detail.monacoThemeId) {
      setStoredMonacoTheme(detail.monacoThemeId);
      window.dispatchEvent(new CustomEvent(MONACO_THEME_CHANGE_EVENT, { detail: { theme: detail.monacoThemeId } }));
      return;
    }
    if (detail.source === "local") return;
    setInstalled(v => {
      const next = !v;
      persistInstalled(detail.id, next);
      return next;
    });
  }

  return (
    <div
      className="h-full min-h-0 flex flex-col bg-[#1e1e1e] text-[#cccccc] overflow-hidden"
      style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
    >
      {/* Tab bar */}
      <div className="h-9 shrink-0 flex items-center border-b border-[#252526] bg-[#2d2d2d]">
        <div className="h-full flex items-center gap-2 px-3 border-r border-[#252526] bg-[#1e1e1e] min-w-0 max-w-xs">
          <Box className="h-3.5 w-3.5 text-[#75beff] shrink-0" />
          <span className="text-[12px] text-[#cccccc] truncate italic">Extension: {detail.name}</span>
          <button
            onClick={onClose}
            className="ml-auto p-0.5 rounded text-[#8d8d8d] hover:text-[#cccccc] hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Loading bar */}
      {isLoadingDetail && (
        <div className="h-[2px] w-full bg-[#2d2d2d] shrink-0 overflow-hidden">
          <div className="h-full bg-[#007acc] animate-pulse w-1/3" />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#424242 transparent" }}>
        <div className="flex gap-0 min-h-full">
          {/* Main content */}
          <main className="flex-1 min-w-0 px-7 py-6">
            {/* Header */}
            <header className="flex gap-5 pb-5 border-b border-[#3e3e42]">
              <div className="shrink-0">
                {detail.iconUrl ? (
                  <img src={detail.iconUrl} alt="" className="w-[128px] h-[128px] object-contain" />
                ) : detail.type === "theme" ? (
                  <div className="w-[128px] h-[128px] rounded-sm overflow-hidden border border-[#3e3e42]">
                    <div className="w-full h-full" style={{ background: getThemeSwatch(detail.iconBackground) }} />
                  </div>
                ) : (
                  <div
                    className="w-[128px] h-[128px] flex items-center justify-center text-5xl font-bold text-white/70 border border-[#3e3e42]"
                    style={{ backgroundColor: detail.iconBackground ?? "#2563eb" }}
                  >
                    {detail.iconText ?? detail.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex flex-col gap-2 pt-1">
                <h1 className="text-[26px] font-light text-[#cccccc] leading-tight">{detail.name}</h1>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#8d8d8d]">
                  <span className="text-[#cccccc]">{detail.author}</span>
                  {typeof detail.downloads === "number" && (
                    <span className="flex items-center gap-1">
                      <Cloud className="h-3.5 w-3.5" />
                      {formatCompact(detail.downloads)}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <StarRow rating={detail.rating} />
                    {typeof detail.reviewCount === "number" && (
                      <span className="ml-0.5 text-[#8d8d8d]">({detail.reviewCount})</span>
                    )}
                  </span>
                </div>

                <p className="text-[13px] text-[#cccccc] leading-snug max-w-2xl">{detail.description}</p>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {detail.type === "theme" ? (
                    <ActionBtn onClick={handleInstall} variant="primary">Activate</ActionBtn>
                  ) : detail.source === "local" ? (
                    <ActionBtn disabled variant="secondary">Built-in</ActionBtn>
                  ) : installed ? (
                    <>
                      <ActionBtn onClick={handleInstall} variant="secondary" chevron>Disable</ActionBtn>
                      <ActionBtn onClick={handleInstall} variant="secondary" chevron>Uninstall</ActionBtn>
                    </>
                  ) : (
                    <ActionBtn onClick={handleInstall} variant="primary">Install</ActionBtn>
                  )}
                  <label className="flex items-center gap-1.5 text-[12px] text-[#cccccc] cursor-pointer select-none">
                    <span className="flex h-4 w-4 items-center justify-center border border-[#6b6b6b] bg-transparent">
                      <Check className="h-3 w-3 text-[#cccccc]" />
                    </span>
                    Auto Update
                    <button className="text-[#8d8d8d] hover:text-[#cccccc]"><Settings size={12} /></button>
                  </label>
                </div>
              </div>
            </header>

            {/* Tabs */}
            <nav className="flex border-b border-[#3e3e42] mt-0">
              {tabNames.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] border-b-[1.5px] transition-colors",
                    activeTab === tab
                      ? "border-[#007acc] text-[#cccccc]"
                      : "border-transparent text-[#8d8d8d] hover:text-[#cccccc]",
                  )}
                >
                  {tab}
                </button>
              ))}
            </nav>

            {/* Tab content */}
            <div className="py-5">
              {activeTab === "Details" && <DetailsTab extension={detail} />}
              {activeTab === "Features" && <FeaturesTab extension={detail} />}
              {activeTab === "Changelog" && <PlaceholderTab label="Changelog" />}
              {activeTab === "Extension Pack" && <PlaceholderTab label="Extension Pack" />}
            </div>
          </main>

          {/* Sidebar */}
          <aside className="w-[220px] shrink-0 border-l border-[#3e3e42] px-5 py-6 space-y-5 hidden lg:block">
            <SideSection title="Installation">
              <MetaRow label="Identifier" value={detail.id} mono />
              <MetaRow label="Version" value={detail.version} mono />
              {detail.lastUpdated && <MetaRow label="Last Updated" value={timeAgo(detail.lastUpdated)} />}
            </SideSection>

            <SideSection title="Marketplace">
              {detail.publishedAt && <MetaRow label="Published" value={timeAgo(detail.publishedAt)} />}
              {detail.lastUpdated && <MetaRow label="Last Released" value={timeAgo(detail.lastUpdated)} />}
              <MetaRow
                label="Source"
                value={detail.source === "local" ? "Built-in" : detail.source === "marketplace" ? "VS Marketplace" : "Open VSX"}
              />
            </SideSection>

            <SideSection title="Categories">
              <div className="flex flex-wrap gap-1 mt-1">
                {categories.map(c => (
                  <span key={c} className="border border-[#6b6b6b] px-1.5 py-0.5 text-[10px] text-[#cccccc]">{c}</span>
                ))}
              </div>
            </SideSection>

            <SideSection title="Resources">
              <div className="space-y-1.5">
                {detail.repositoryUrl && (
                  <ResourceLink href={detail.repositoryUrl} icon={<FileText size={13} />} label="Repository" />
                )}
                {detail.licenseUrl && (
                  <ResourceLink href={detail.licenseUrl} icon={<ShieldCheck size={13} />} label="License" />
                )}
                {marketplaceUrl && (
                  <ResourceLink href={marketplaceUrl} icon={<ExternalLink size={13} />} label="Marketplace" />
                )}
              </div>
            </SideSection>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ActionBtn({
  children, onClick, variant, chevron, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant: "primary" | "secondary";
  chevron?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-7 flex items-center gap-1 px-3 text-[12px] font-medium transition-colors rounded-sm",
        variant === "primary"
          ? "bg-[#0e639c] text-white hover:bg-[#1177bb] border border-[#1177bb]"
          : "bg-transparent text-[#cccccc] border border-[#6b6b6b] hover:bg-white/[0.07]",
        disabled && "opacity-50 cursor-default",
      )}
    >
      {children}
      {chevron && <ChevronDown size={11} />}
    </button>
  );
}

function DetailsTab({ extension }: { extension: IDEExtension }) {
  if (extension.readme) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[11px] text-[#8d8d8d] border border-[#3e3e42] px-3 py-1.5 w-fit">
          <ShieldCheck className="h-3.5 w-3.5 text-[#4ade80]" />
          {extension.source === "local" ? "Built-in extension" : `${extension.source === "marketplace" ? "VS Marketplace" : "Open VSX"} extension`}
        </div>
        <MarkdownContent markdown={extension.readme} />
      </div>
    );
  }
  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-[#cccccc]">
      <div className="flex items-center gap-2 text-[11px] text-[#8d8d8d] border border-[#3e3e42] px-3 py-1.5 w-fit">
        <ShieldCheck className="h-3.5 w-3.5 text-[#4ade80]" />
        {extension.source === "local" ? "Built-in extension" : "Marketplace extension"}
      </div>
      <div className="border-l-[3px] border-[#3794ff] bg-[#2d2d2d] px-4 py-2.5 text-[#cccccc]">
        {extension.description}
      </div>
      <ul className="space-y-1.5 text-[#8d8d8d]">
        <li><span className="text-[#cccccc]">Publisher:</span> {extension.author}</li>
        <li><span className="text-[#cccccc]">Identifier:</span> <code className="font-mono text-[11px] bg-[#2d2d2d] px-1">{extension.id}</code></li>
        <li><span className="text-[#cccccc]">Version:</span> {extension.version}</li>
      </ul>
    </div>
  );
}

function FeaturesTab({ extension }: { extension: IDEExtension }) {
  const features = extension.features?.length
    ? extension.features
    : [extension.type === "theme" ? "Editor color theme" : "Extension manifest", "Marketplace lookup", "VSIX download"];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {features.map(f => (
        <div key={f} className="flex items-start gap-2.5 border border-[#3e3e42] bg-[#252526] px-3 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 text-[#4ade80] shrink-0" />
          <span className="text-[12px] text-[#cccccc]">{f}</span>
        </div>
      ))}
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center min-h-[120px] border border-dashed border-[#3e3e42] text-[12px] text-[#8d8d8d]">
      {label} information is not available.
    </div>
  );
}

function MarkdownContent({ markdown }: { markdown: string }) {
  return (
    <div className="text-[13px] leading-relaxed text-[#cccccc] space-y-3 max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-[22px] font-light text-[#cccccc] border-b border-[#3e3e42] pb-2 mb-3">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[17px] font-semibold text-[#cccccc] mt-5 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[14px] font-semibold text-[#cccccc] mt-4 mb-1.5">{children}</h3>,
          p: ({ children }) => <p className="text-[#cccccc] mb-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 mb-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 mb-2">{children}</ol>,
          li: ({ children }) => <li className="text-[#cccccc]">{children}</li>,
          blockquote: ({ children }) => <blockquote className="border-l-[3px] border-[#3794ff] bg-[#2d2d2d] px-4 py-2">{children}</blockquote>,
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            return isBlock
              ? <code className="block">{children}</code>
              : <code className="bg-[#2d2d2d] px-1 py-0.5 text-[#d7ba7d] font-mono text-[12px]">{children}</code>;
          },
          pre: ({ children }) => <pre className="bg-[#1e1e1e] border border-[#3e3e42] p-4 overflow-x-auto text-[12px] font-mono mb-3">{children}</pre>,
          img: ({ src, alt }) => <img src={src ?? ""} alt={alt ?? ""} className="max-w-full border border-[#3e3e42]" />,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-[#3794ff] hover:underline">{children}</a>,
          table: ({ children }) => <div className="overflow-x-auto mb-3"><table className="w-full border-collapse border border-[#3e3e42] text-[12px]">{children}</table></div>,
          th: ({ children }) => <th className="border border-[#3e3e42] bg-[#252526] px-3 py-1.5 text-left text-[#cccccc] font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-[#3e3e42] px-3 py-1.5 text-[#cccccc]">{children}</td>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold text-[#bbbbbb] uppercase tracking-[0.06em] mb-2">{title}</h2>
      {children}
    </section>
  );
}

function MetaRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-col mb-1.5">
      <span className="text-[10px] text-[#8d8d8d]">{label}</span>
      <span className={cn("text-[11px] text-[#cccccc] break-all", mono && "font-mono")}>{value}</span>
    </div>
  );
}

function ResourceLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 text-[12px] text-[#3794ff] hover:underline"
    >
      <span className="text-[#8d8d8d]">{icon}</span>
      {label}
    </a>
  );
}

function StarRow({ rating }: { rating?: number }) {
  const filled = Math.round(Math.max(0, Math.min(5, rating ?? 0)));
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={13}
          className={i < filled ? "fill-[#cca700] text-[#cca700]" : "text-[#6b6b6b]"}
        />
      ))}
    </span>
  );
}

// ── Utilities ────────────────────────────────────────────────────────────────

function formatCompact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function timeAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

function getThemeSwatch(color: string | undefined): string {
  const base = color ?? "#4f46e5";
  return `linear-gradient(135deg, ${base} 0%, #1e1e1e 52%, #cccccc 52%, #cccccc 100%)`;
}

function persistInstalled(extensionId: string, installed: boolean): void {
  try {
    const saved = window.localStorage.getItem(INSTALLED_EXTENSIONS_STORAGE_KEY);
    const ids = new Set(saved ? (JSON.parse(saved) as string[]) : []);
    installed ? ids.add(extensionId) : ids.delete(extensionId);
    window.localStorage.setItem(INSTALLED_EXTENSIONS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {}
}
