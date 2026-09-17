"use client";

import { useState, useEffect } from "react";
import { Wallet, Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  MONACO_THEME_CHANGE_EVENT,
  MONACO_THEME_LABELS,
  MONACO_THEME_OPTIONS,
  MonacoThemeName,
  getStoredMonacoTheme,
  setStoredMonacoTheme,
} from "@/lib/monacoTheme";

type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

export default function AccountsDialog({
  isOpen,
  onClose,
  walletAddress,
  walletStatus,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDisconnectWallet?: () => void;
  walletAddress?: string | null;
  walletStatus?: WalletStatus;
}) {
  const [selectedMonacoTheme, setSelectedMonacoTheme] = useState<MonacoThemeName>("v0-dark");

  useEffect(() => {
    if (isOpen) {
      setSelectedMonacoTheme(getStoredMonacoTheme());
    }
  }, [isOpen]);

  const handleSave = () => {
    setStoredMonacoTheme(selectedMonacoTheme);
    window.dispatchEvent(new CustomEvent(MONACO_THEME_CHANGE_EVENT, { detail: { theme: selectedMonacoTheme } }));
    onClose();
  };

  const walletLabel = walletStatus === "connected" && walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : walletStatus ?? "—";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[850px] bg-zinc-900 border-zinc-800 text-zinc-100 flex flex-col md:flex-row p-0 overflow-hidden gap-0">

        {/* Left column: Settings */}
        <div className="flex-1 p-6 flex flex-col h-full max-h-[80vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-xl font-bold">Account &amp; Settings</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Manage your IDE preferences.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 flex-1">
            {/* Account */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Account</h3>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full border border-zinc-700 bg-zinc-800 flex items-center justify-center text-sm font-semibold text-zinc-200">
                    M
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">Mock User</p>
                    <p className="text-xs text-zinc-500">mock@dev.local</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Wallet</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-zinc-500" />
                      <span className={cn("text-sm font-medium", walletStatus === "connected" ? "text-emerald-300" : "text-zinc-300")}>
                        {walletLabel}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Settings</h3>
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Editor</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-800">
                    <div>
                      <p className="text-sm text-zinc-200">Font Size</p>
                      <p className="text-xs text-zinc-500">Editor font size in pixels</p>
                    </div>
                    <select className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300">
                      <option>12px</option><option>13px</option><option>14px</option><option>16px</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-800">
                    <div>
                      <p className="text-sm text-zinc-200">Tab Size</p>
                      <p className="text-xs text-zinc-500">Spaces per tab</p>
                    </div>
                    <select className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300">
                      <option>2</option><option>4</option><option>8</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Appearance</h4>
                <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-800">
                  <div>
                    <p className="text-sm text-zinc-200">Editor Theme</p>
                    <p className="text-xs text-zinc-500">Monaco editor color scheme</p>
                  </div>
                  <select
                    className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300"
                    value={selectedMonacoTheme}
                    onChange={(e) => setSelectedMonacoTheme(e.target.value as MonacoThemeName)}
                  >
                    {MONACO_THEME_OPTIONS.map((theme) => (
                      <option key={theme} value={theme}>{MONACO_THEME_LABELS[theme]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-end gap-2 border-t border-zinc-800 pt-6">
              <Button variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-zinc-100">Cancel</Button>
              <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-500 text-white">Save Changes</Button>
            </div>
          </div>
        </div>

        {/* Right column: Subscription */}
        <div className="w-full md:w-[320px] bg-zinc-950/50 border-t md:border-t-0 md:border-l border-zinc-800 p-6 flex flex-col">
          <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-purple-400" /> Subscription
          </h3>
          <div className="rounded-xl border border-emerald-800/50 bg-emerald-900/20 p-4 mb-6 shadow-sm shadow-emerald-900/10">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-2">
              <CheckCircle className="w-5 h-5" /> Active Pass (mock)
            </div>
            <p className="text-xs text-emerald-200/70 leading-relaxed">
              Full access to all AI models is enabled in mock mode.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
