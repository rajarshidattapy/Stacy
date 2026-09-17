"use client";
import { useState, useEffect, useCallback } from "react";
import { X, Eye, EyeOff, Plus, Trash2, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "stacy.env-config";

interface RpcEntry {
  id: string;
  network: string;
  url: string;
}

interface EnvConfig {
  privateKey: string;
  rpcs: RpcEntry[];
  customVars: { id: string; key: string; value: string }[];
}

const PRESET_NETWORKS = [
  "Ethereum Mainnet",
  "Ethereum Sepolia",
  "Ethereum Goerli",
  "Polygon Mainnet",
  "Polygon Mumbai",
  "Arbitrum One",
  "Optimism",
  "Base",
  "BNB Smart Chain",
  "Avalanche C-Chain",
  "Stellar Mainnet",
  "Stellar Testnet",
  "Custom",
];

function loadConfig(): EnvConfig {
  if (typeof window === "undefined") return { privateKey: "", rpcs: [], customVars: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as EnvConfig;
  } catch {}
  return { privateKey: "", rpcs: [], customVars: [] };
}

function saveConfig(cfg: EnvConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

interface EnvConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "rpc" | "wallet" | "vars";

export function EnvConfigModal({ isOpen, onClose }: EnvConfigModalProps) {
  const [tab, setTab] = useState<Tab>("rpc");
  const [config, setConfig] = useState<EnvConfig>({ privateKey: "", rpcs: [], customVars: [] });
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) setConfig(loadConfig());
  }, [isOpen]);

  const handleSave = useCallback(() => {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [config]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const addRpc = () =>
    setConfig(c => ({
      ...c,
      rpcs: [...c.rpcs, { id: uid(), network: "Ethereum Mainnet", url: "" }],
    }));

  const updateRpc = (id: string, field: "network" | "url", value: string) =>
    setConfig(c => ({
      ...c,
      rpcs: c.rpcs.map(r => (r.id === id ? { ...r, [field]: value } : r)),
    }));

  const removeRpc = (id: string) =>
    setConfig(c => ({ ...c, rpcs: c.rpcs.filter(r => r.id !== id) }));

  const addVar = () =>
    setConfig(c => ({
      ...c,
      customVars: [...c.customVars, { id: uid(), key: "", value: "" }],
    }));

  const updateVar = (id: string, field: "key" | "value", value: string) =>
    setConfig(c => ({
      ...c,
      customVars: c.customVars.map(v => (v.id === id ? { ...v, [field]: value } : v)),
    }));

  const removeVar = (id: string) =>
    setConfig(c => ({ ...c, customVars: c.customVars.filter(v => v.id !== id) }));

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-[600px] max-h-[80vh] flex flex-col bg-[#0f0f0f] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-zinc-100">Environment Config</h2>
            <p className="text-[12px] text-zinc-500 mt-0.5">Stored locally in your browser</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 shrink-0">
          {(["rpc", "wallet", "vars"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors",
                tab === t
                  ? "bg-white/[0.08] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
              )}
            >
              {t === "rpc" ? "RPC URLs" : t === "wallet" ? "Private Key" : "Custom Vars"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>

          {/* ── RPC Tab ── */}
          {tab === "rpc" && (
            <>
              <p className="text-[12px] text-zinc-500">
                Override default RPC endpoints. Leave blank to use the built-in public node.
              </p>
              {config.rpcs.length === 0 && (
                <div className="py-6 text-center text-[12px] text-zinc-600">
                  No RPC entries. Add one below.
                </div>
              )}
              {config.rpcs.map(rpc => (
                <div key={rpc.id} className="flex items-center gap-2">
                  <div className="relative shrink-0">
                    <select
                      value={rpc.network}
                      onChange={e => updateRpc(rpc.id, "network", e.target.value)}
                      className="appearance-none h-9 pl-3 pr-7 rounded-lg bg-[#1a1a1a] border border-white/[0.07] text-[12px] text-zinc-200 outline-none focus:border-white/20 cursor-pointer"
                    >
                      {PRESET_NETWORKS.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  </div>
                  <input
                    type="url"
                    value={rpc.url}
                    onChange={e => updateRpc(rpc.id, "url", e.target.value)}
                    placeholder="https://..."
                    className="flex-1 h-9 px-3 rounded-lg bg-[#1a1a1a] border border-white/[0.07] text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/20 font-mono"
                  />
                  <button
                    onClick={() => removeRpc(rpc.id)}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addRpc}
                className="flex items-center gap-2 text-[12px] text-zinc-500 hover:text-zinc-200 transition-colors py-1"
              >
                <Plus size={14} />
                Add RPC endpoint
              </button>
            </>
          )}

          {/* ── Wallet Tab ── */}
          {tab === "wallet" && (
            <>
              <div className="flex items-start gap-3 px-3 py-3 rounded-xl bg-amber-900/20 border border-amber-800/40">
                <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-300/90 leading-relaxed">
                  Private key is stored <strong>only in your browser's localStorage</strong>. Never share it or enter a key holding significant funds. Use a dedicated testing wallet.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Private Key
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showKey ? "text" : "password"}
                    value={config.privateKey}
                    onChange={e => setConfig(c => ({ ...c, privateKey: e.target.value }))}
                    placeholder="0x..."
                    className="w-full h-10 px-3 pr-10 rounded-lg bg-[#1a1a1a] border border-white/[0.07] text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/20 font-mono"
                  />
                  <button
                    onClick={() => setShowKey(s => !s)}
                    className="absolute right-2.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              {config.privateKey && (
                <button
                  onClick={() => setConfig(c => ({ ...c, privateKey: "" }))}
                  className="text-[11px] text-red-500 hover:text-red-400 transition-colors"
                >
                  Clear key
                </button>
              )}
            </>
          )}

          {/* ── Custom Vars Tab ── */}
          {tab === "vars" && (
            <>
              <p className="text-[12px] text-zinc-500">
                Arbitrary key/value pairs injected as env vars into your scripts and deployments.
              </p>
              {config.customVars.length === 0 && (
                <div className="py-6 text-center text-[12px] text-zinc-600">
                  No custom variables. Add one below.
                </div>
              )}
              {config.customVars.map(v => (
                <div key={v.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={v.key}
                    onChange={e => updateVar(v.id, "key", e.target.value)}
                    placeholder="VARIABLE_NAME"
                    className="w-40 h-9 px-3 rounded-lg bg-[#1a1a1a] border border-white/[0.07] text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/20 font-mono uppercase"
                  />
                  <input
                    type="text"
                    value={v.value}
                    onChange={e => updateVar(v.id, "value", e.target.value)}
                    placeholder="value"
                    className="flex-1 h-9 px-3 rounded-lg bg-[#1a1a1a] border border-white/[0.07] text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/20 font-mono"
                  />
                  <button
                    onClick={() => removeVar(v.id)}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addVar}
                className="flex items-center gap-2 text-[12px] text-zinc-500 hover:text-zinc-200 transition-colors py-1"
              >
                <Plus size={14} />
                Add variable
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] shrink-0">
          <span className="text-[11px] text-zinc-600">
            Values never leave your device
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-8 px-4 rounded-lg text-[12px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className={cn(
                "h-8 px-4 rounded-lg text-[12px] font-semibold transition-all",
                saved
                  ? "bg-green-600/30 border border-green-600/50 text-green-400"
                  : "bg-white/[0.08] border border-white/[0.1] text-zinc-100 hover:bg-white/[0.12]"
              )}
            >
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useEnvConfig(): EnvConfig {
  const [config, setConfig] = useState<EnvConfig>({ privateKey: "", rpcs: [], customVars: [] });
  useEffect(() => {
    setConfig(loadConfig());
    const handler = () => setConfig(loadConfig());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  return config;
}
