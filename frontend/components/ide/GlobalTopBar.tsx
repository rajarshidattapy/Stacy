"use client";
import { cn } from "@/lib/utils";
import {
  Wallet,
  LogOut,
  SlidersHorizontal,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { IdeMode } from "@/types/ide";

type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

interface GlobalTopBarProps {
  ideMode: IdeMode;
  onIdeModeChange: (mode: IdeMode) => void;
  interactionMode?: "agentic" | "manual";
  onInteractionModeChange?: (mode: "agentic" | "manual") => void;
  walletAddress?: string | null;
  walletStatus?: WalletStatus;
  onConnectWallet?: () => void;
  onDisconnectWallet?: () => void;
  onToggleHomeSidebar?: () => void;
  onOpenEnvConfig?: () => void;
  currentProjectId?: string | null;
  currentProjectName?: string | null;
  onSaveProject?: () => void;
  onOpenProjects?: () => void;
  onOpenVersions?: () => void;
  isSaving?: boolean;
}

export function GlobalTopBar({
  ideMode,
  onIdeModeChange,
  interactionMode = "manual",
  onInteractionModeChange,
  walletAddress,
  walletStatus = "disconnected",
  onConnectWallet,
  onDisconnectWallet,
  onToggleHomeSidebar,
  onOpenEnvConfig,
}: GlobalTopBarProps) {
  const displayAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

  const router = useRouter();
  const isConnected = walletStatus === "connected" && walletAddress;
  const isConnecting = walletStatus === "connecting";

  return (
    <div className="h-12 border-b border-black/20 bg-[#050505] flex items-center justify-between px-4 shrink-0 select-none">
      {/* Left - Brand */}
      <div className="flex items-center -ml-4">
        <div
          onClick={() => router.push("/")}
          className="relative group-active:scale-95 transition-transform cursor-pointer"
        >
          <Image src="/logo.png" alt="Logo" width={44} height={44} className="rounded-lg" />
        </div>
        <span
          onClick={onToggleHomeSidebar}
          className="text-sm ml-1 text-zinc-100 font-bold tracking-tight hover:opacity-90 transition-opacity cursor-pointer"
        >
          Stacy
        </span>
      </div>

      {/* Center - Mode Toggles */}
      <div className="flex items-center gap-4">
        {onInteractionModeChange && (
          <div className="flex items-center bg-white/3 rounded-xl p-1 border border-white/5">
            <button
              onClick={() => onInteractionModeChange("agentic")}
              className={cn(
                "px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-2",
                interactionMode === "agentic"
                  ? "bg-white/8 text-[#4ee06a] shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              )}
            >
              Agentic
            </button>
            <button
              onClick={() => onInteractionModeChange("manual")}
              className={cn(
                "px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-2",
                interactionMode === "manual"
                  ? "bg-white/8 text-[#4ee06a] shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              )}
            >
              Manual
            </button>
          </div>
        )}

        {interactionMode === "manual" && (
          <div className="flex items-center bg-white/3 rounded-xl p-1 border border-white/5">
            <button
              onClick={() => onIdeModeChange("contract")}
              className={cn(
                "px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-2",
                ideMode === "contract"
                  ? "bg-white/8 text-[#4ee06a] shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              )}
            >
              Smart Contract
            </button>
            <button
              onClick={() => onIdeModeChange("frontend")}
              className={cn(
                "px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-2",
                ideMode === "frontend"
                  ? "bg-white/8 text-[#4ee06a] shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              )}
            >
              Frontend
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isConnected ? (
          <div className="flex items-center gap-2">
            <span className="h-8 px-3 rounded-md bg-green-900/30 border border-green-800/50 text-green-400 text-xs font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {displayAddress}
            </span>
            <button
              onClick={onDisconnectWallet}
              className="h-8 min-w-[88px] px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-800/50 transition-colors flex items-center justify-center"
              title="Disconnect wallet"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onConnectWallet}
            disabled={isConnecting}
            className={cn(
              "h-8 min-w-[88px] px-3 rounded-lg bg-white/5 border border-white/5 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 whitespace-nowrap",
              isConnecting
                ? "text-zinc-500 cursor-wait"
                : "text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
            )}
          >
            <Wallet className="w-3.5 h-3.5" />
            {isConnecting ? "Connecting..." : "Connect wallet"}
          </button>
        )}
      </div>
    </div>
  );
}
