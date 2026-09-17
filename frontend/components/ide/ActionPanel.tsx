"use client";
import { cn } from "@/lib/utils";
import { IdeMode, TerminalStatus, DeployedContract } from "@/types/ide";
import {
  Play,
  Rocket,
  CheckCircle2,
  Loader2,
  FileJson,
  Code2,
  AlertCircle,
  Copy,
  ExternalLink,
  Sparkles,
  Globe,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { DeployDialog } from "./DeployDialog";

type CompilerStatus = "IDLE" | "QUEUED" | "COMPILING" | "SUCCESS" | "ERROR";
type DeployerStatus =
  | "IDLE"
  | "UPLOADING"
  | "INSTANTIATING"
  | "SUCCESS"
  | "ERROR";
type NetworkType = "testnet" | "mainnet";
type SandboxStatus =
  | "idle"
  | "spawning"
  | "preview_starting"
  | "running"
  | "stopping"
  | "error";
type BindingsStatus = "idle" | "generating" | "success" | "error";

interface ActionPanelProps {
  mode: IdeMode;
  isOpen: boolean;
  terminalStatus: TerminalStatus;
  deployedContracts: DeployedContract[];
  onCompile: () => void;
  onDeploy: () => void;
  onGenerateBindings: (contractId: string) => void;
  // New props for detailed status
  compilerStatus?: CompilerStatus;
  deployerStatus?: DeployerStatus;
  wasmHex?: string | null;
  latestContractId?: string | null;
  isWalletConnected?: boolean;
  // Network selection
  network?: NetworkType;
  onNetworkChange?: (network: NetworkType) => void;
  explorerUrl?: string | null;
  // Sandbox props
  sandboxStatus?: SandboxStatus;
  isSandboxConnected?: boolean;
  onSpawnSandbox?: () => void;
  onStopSandbox?: () => void;
  bindingsStatus?: BindingsStatus;
  // File sync
  onSyncToSandbox?: () => void;
}

export function ActionPanel({
  mode,
  isOpen,
  terminalStatus,
  deployedContracts,
  onCompile,
  onDeploy,
  onGenerateBindings,
  compilerStatus = "IDLE",
  deployerStatus = "IDLE",
  wasmHex,
  latestContractId,
  isWalletConnected = false,
  network = "testnet",
  onNetworkChange,
  explorerUrl,
  sandboxStatus = "idle",
  isSandboxConnected = false,
  onSpawnSandbox,
  onStopSandbox,
  bindingsStatus = "idle",
  onSyncToSandbox,
}: ActionPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showDeployDialog, setShowDeployDialog] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) {
    return null;
  }

  const hasCompiledWasm = !!wasmHex;
  const isCompiling =
    compilerStatus === "COMPILING" || terminalStatus === "compiling";
  const isDeploying =
    deployerStatus === "UPLOADING" ||
    deployerStatus === "INSTANTIATING" ||
    terminalStatus === "deploying";

  // Sandbox state booleans (avoids TypeScript narrowing issues in JSX branches)
  const isSandboxActive =
    sandboxStatus === "running" || sandboxStatus === "preview_starting";
  const isSandboxBooting =
    sandboxStatus === "spawning" || sandboxStatus === "preview_starting";
  const isSandboxStopping = sandboxStatus === "stopping";

  const handleDeployClick = () => {
    setShowDeployDialog(true);
  };

  return (
    <div className="w-72 border-l border-white/[0.05] bg-[#09090b] flex flex-col shrink-0 overflow-y-auto custom-scrollbar relative">
      <div className="h-10 flex items-center px-4 border-b border-white/[0.05] shrink-0 bg-white/[0.02]">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em]">
          {mode === "contract" ? "Contract Actions" : "Frontend Controls"}
        </span>
      </div>

      <div className="p-5 space-y-7">
        {/* Live Sync Section - Shared */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-1">
              Live Sync
            </h3>
            {isSandboxConnected && (
              <span className="flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
            )}
          </div>
          <button
            onClick={onSyncToSandbox}
            disabled={!isSandboxConnected}
            className={cn(
              "w-full h-11 flex items-center justify-center gap-2.5 px-4 rounded-xl transition-all border text-[13px] font-medium group",
              isSandboxConnected
                ? "bg-white/[0.05] border-white/[0.1] text-zinc-100 hover:bg-white/[0.08] hover:border-white/[0.15] shadow-lg shadow-black/20"
                : "bg-zinc-900/50 border-white/[0.02] text-zinc-600 cursor-not-allowed opacity-50"
            )}
          >
            <Zap className={cn("w-4 h-4", isSandboxConnected ? "text-[#4ee06a] fill-[#4ee06a]/20" : "text-zinc-600")} />
            <span>Sync to Sandbox</span>
          </button>
          {!isSandboxConnected && (
            <div className="flex items-start gap-2 px-1">
              <AlertCircle className="w-3 h-3 text-zinc-700 mt-0.5 shrink-0" />
              <p className="text-[10px] text-zinc-600 leading-relaxed italic">
                Start sandbox to push local changes for execution
              </p>
            </div>
          )}
        </div>

        {mode === "contract" ? (
          <>
            {/* Compile Section */}
            <div className="space-y-4">
              <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                Development
              </h3>
              <button
                onClick={onCompile}
                disabled={isCompiling}
                className={cn(
                  "w-full h-11 flex items-center justify-center gap-2.5 px-4 rounded-xl transition-all border text-[13px] font-semibold",
                  compilerStatus === "SUCCESS" && !isCompiling
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : compilerStatus === "ERROR" && !isCompiling
                      ? "bg-red-500/10 border-red-500/30 text-red-400"
                      : "bg-white/[0.05] border-white/[0.1] text-zinc-200 hover:bg-white/[0.08] hover:border-white/[0.15]"
                )}
              >
                {isCompiling ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#4ee06a]" />
                ) : compilerStatus === "SUCCESS" ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : compilerStatus === "ERROR" ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>
                  {isCompiling ? "Compiling..." :
                    compilerStatus === "SUCCESS" ? "Build Success" :
                      compilerStatus === "ERROR" ? "Build Failed" : "Build Contract"}
                </span>
              </button>

              {hasCompiledWasm && (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center border border-green-500/20">
                    <Sparkles className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-tight">WASM Binary</span>
                    <span className="text-[10px] text-zinc-500 font-mono">{(wasmHex.length / 2).toLocaleString()} bytes</span>
                  </div>
                </div>
              )}
            </div>

            {/* Deploy Section */}
            <div className="space-y-4 pt-5 border-t border-white/[0.05]">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                  Deployment
                </h3>
                {/* Network Toggle */}
                <div className="flex items-center gap-1 bg-black/40 rounded-lg p-0.5 border border-white/[0.05]">
                  <button
                    onClick={() => onNetworkChange?.("testnet")}
                    className={cn(
                      "px-2 py-1 text-[9px] font-bold rounded-md transition-all",
                      network === "testnet"
                        ? "bg-zinc-800 text-zinc-100 shadow-sm"
                        : "text-zinc-600 hover:text-zinc-400",
                    )}
                  >
                    TEST
                  </button>
                  <button
                    onClick={() => onNetworkChange?.("mainnet")}
                    className={cn(
                      "px-2 py-1 text-[9px] font-bold rounded-md transition-all",
                      network === "mainnet"
                        ? "bg-red-600/20 text-red-400"
                        : "text-zinc-600 hover:text-zinc-400",
                    )}
                  >
                    MAIN
                  </button>
                </div>
              </div>

              {/* Deployment Steps */}
              <div className="space-y-2 px-1">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    deployerStatus === "UPLOADING" ? "bg-yellow-500 animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.5)]" :
                      (deployerStatus === "INSTANTIATING" || deployerStatus === "SUCCESS") ? "bg-[#4ee06a]" : "bg-zinc-800"
                  )} />
                  <span className={cn(
                    "text-[11px] font-medium",
                    deployerStatus === "UPLOADING" ? "text-yellow-400" :
                      (deployerStatus === "INSTANTIATING" || deployerStatus === "SUCCESS") ? "text-zinc-300" : "text-zinc-600"
                  )}>Upload WASM</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    deployerStatus === "INSTANTIATING" ? "bg-yellow-500 animate-pulse shadow-[0_0_8px_rgba(234,179,8,0.5)]" :
                      deployerStatus === "SUCCESS" ? "bg-[#4ee06a]" : "bg-zinc-800"
                  )} />
                  <span className={cn(
                    "text-[11px] font-medium",
                    deployerStatus === "INSTANTIATING" ? "text-yellow-400" :
                      deployerStatus === "SUCCESS" ? "text-zinc-300" : "text-zinc-600"
                  )}>Instantiate Contract</span>
                </div>
              </div>

              <button
                onClick={handleDeployClick}
                disabled={isDeploying || !hasCompiledWasm || !isWalletConnected}
                className={cn(
                  "w-full h-12 flex items-center justify-center gap-2.5 px-4 rounded-xl transition-all border text-[13px] font-bold relative overflow-hidden",
                  deployerStatus === "SUCCESS"
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : !hasCompiledWasm
                      ? "bg-zinc-900/50 border-white/[0.02] text-zinc-600 cursor-not-allowed opacity-50"
                      : !isWalletConnected
                        ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-500"
                        : "bg-zinc-100 text-zinc-950 hover:bg-white hover:scale-[1.02] active:scale-[0.98] border-transparent shadow-xl shadow-white/5"
                )}
              >
                {isDeploying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : deployerStatus === "SUCCESS" ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Rocket className="w-4 h-4" />
                )}
                <span>
                  {isDeploying ? (deployerStatus === "UPLOADING" ? "Uploading..." : "Instantiating...") :
                    deployerStatus === "SUCCESS" ? "Deployment Complete" :
                      !hasCompiledWasm ? "Build Required" :
                        !isWalletConnected ? "Connect Wallet" :
                          `Deploy to ${network}`}
                </span>
              </button>

              {!isWalletConnected && hasCompiledWasm && (
                <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-[11px] text-yellow-500/80 leading-relaxed italic">
                  Freighter wallet required for transaction signing.
                </div>
              )}
            </div>

            {/* Deployed Contract Details */}
            {latestContractId && (
              <div className="space-y-4 pt-5 border-t border-white/[0.05]">
                <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                  Active Contract
                </h3>
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-4">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold block mb-2">
                      Address
                    </label>
                    <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/[0.05]">
                      <code className="text-[11px] font-mono text-[#4ee06a] truncate flex-1 opacity-80">
                        {latestContractId.slice(0, 10)}...{latestContractId.slice(-8)}
                      </code>
                      <button
                        onClick={() => handleCopy(latestContractId)}
                        className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                      >
                        <Copy className={cn("w-3.5 h-3.5", copied ? "text-green-400" : "text-zinc-600")} />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(`https://stellar.expert/explorer/testnet/contract/${latestContractId}`, "_blank")}
                    className="w-full h-9 flex items-center justify-center gap-2.5 px-4 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-zinc-300 hover:text-zinc-100 transition-all border border-white/[0.05] text-[11px] font-semibold uppercase tracking-wider"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Explorer
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Sandbox Section */}
            <div className="space-y-4">
              <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-1">Infrastructure</h3>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full shadow-lg",
                      sandboxStatus === "running" && isSandboxConnected ? "bg-[#4ee06a] shadow-[#4ee06a]/20" :
                        sandboxStatus === "spawning" ? "bg-yellow-500 animate-pulse" :
                          sandboxStatus === "error" ? "bg-red-500" : "bg-zinc-800"
                    )} />
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-tight">
                      {sandboxStatus === "running" && isSandboxConnected ? "Active Agent" :
                        sandboxStatus === "running" ? "Booting..." :
                          sandboxStatus === "spawning" ? "Provisioning..." :
                            sandboxStatus === "stopping" ? "Tearing Down..." :
                              sandboxStatus === "error" ? "Failure" : "Offline"}
                    </span>
                  </div>
                </div>

                {isSandboxActive ? (
                  <button
                    onClick={onStopSandbox}
                    disabled={isSandboxStopping}
                    className="w-full h-10 flex items-center justify-center gap-2.5 px-4 rounded-lg bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all border border-red-500/20 text-[11px] font-bold uppercase tracking-wider"
                  >
                    {isSandboxStopping ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5" />
                    )}
                    {isSandboxStopping ? "Stopping" : "Terminate"}
                  </button>
                ) : (
                  <button
                    onClick={onSpawnSandbox}
                    disabled={isSandboxBooting}
                    className={cn(
                      "w-full h-10 flex items-center justify-center gap-2.5 px-4 rounded-lg transition-all border text-[11px] font-bold uppercase tracking-wider",
                      isSandboxBooting
                        ? "bg-yellow-500/5 border-yellow-500/20 text-yellow-500"
                        : "bg-white text-zinc-950 hover:bg-white/90 border-transparent",
                    )}
                  >
                    {isSandboxBooting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                    {isSandboxBooting ? "Provisioning" : "Launch Sandbox"}
                  </button>
                )}
              </div>
            </div>

            {/* Contract Bindings Section */}
            <div className="space-y-4 pt-5 border-t border-white/[0.05]">
              <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-1">Stellar Bindings</h3>

              {!isSandboxConnected ? (
                <div className="p-4 rounded-xl bg-white/[0.01] border border-white/[0.05] flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-yellow-500/60">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold uppercase tracking-tight">
                      Locked
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 leading-relaxed italic">
                    Launch the sandbox to enable TypeScript binding generation.
                  </p>
                </div>
              ) : deployedContracts.length === 0 && !latestContractId ? (
                <div className="p-4 rounded-xl bg-white/[0.01] border border-white/[0.05] flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-yellow-500/60">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold uppercase tracking-tight">
                      No Data
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 leading-relaxed italic">
                    Deploy a contract first to generate strongly-typed bindings.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5 px-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Select Target</label>
                    <select
                      className="w-full bg-black/40 border border-white/[0.05] text-zinc-300 text-[11px] font-medium rounded-lg h-10 px-3 focus:ring-1 focus:ring-[#4ee06a]/30 outline-none transition-all appearance-none cursor-pointer"
                      defaultValue={latestContractId || deployedContracts[0]?.address}
                    >
                      {latestContractId && (
                        <option value={latestContractId}>
                          Current ({latestContractId.slice(0, 10)}...)
                        </option>
                      )}
                      {deployedContracts.map(c => (
                        <option key={c.id} value={c.address}>{c.name || 'Contract'} ({c.address.slice(0, 10)}...)</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => {
                      const contractId = latestContractId || deployedContracts[0]?.address;
                      if (contractId) onGenerateBindings(contractId);
                    }}
                    disabled={bindingsStatus === "generating"}
                    className={cn(
                      "w-full h-11 flex items-center justify-center gap-2.5 px-4 rounded-xl transition-all border text-[12px] font-bold uppercase tracking-wider mt-2",
                      bindingsStatus === "success"
                        ? "bg-green-500/10 border-green-500/30 text-green-400"
                        : bindingsStatus === "generating"
                          ? "bg-zinc-900 border-white/[0.02] text-zinc-600"
                          : "bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                    )}
                  >
                    {bindingsStatus === "generating" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#4ee06a]" />
                    ) : bindingsStatus === "success" ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <FileJson className="w-4 h-4" />
                    )}
                    <span>{bindingsStatus === "generating" ? "Generating" : "Generate TS"}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4 pt-5 border-t border-white/[0.05]">
              <h3 className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                Project Integrations
              </h3>
              <button className="w-full h-10 flex items-center justify-start gap-3 px-4 rounded-lg bg-white/[0.02] border border-white/[0.05] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition-all text-[11px] font-bold uppercase tracking-wider group">
                <Globe className="w-4 h-4 group-hover:text-[#4ee06a] transition-colors" />
                Vercel Deploy
              </button>
            </div>
          </>
        )}
      </div>

      <DeployDialog
        isOpen={showDeployDialog}
        onClose={() => setShowDeployDialog(false)}
        status={deployerStatus}
        contractId={latestContractId || null}
        explorerUrl={explorerUrl || null}
        network={network}
        onDeploy={onDeploy}
      />
    </div>
  );
}
