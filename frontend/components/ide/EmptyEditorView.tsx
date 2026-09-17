"use client";
import type { ReactNode } from "react";

interface EmptyEditorViewProps {
  onGoToFile?: () => void;
  onFindInFiles?: () => void;
  onCommandPalette?: () => void;
  onToggleTerminal?: () => void;
}

export function EmptyEditorView({
  onGoToFile,
  onFindInFiles,
  onCommandPalette,
  onToggleTerminal,
}: EmptyEditorViewProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-zinc-950 text-zinc-400 font-mono">
      <div className="flex flex-col items-center max-w-md w-full gap-8">
        <p className="text-sm text-center mb-8 text-zinc-500">
          Send a message to ask the agent to<br/>start making changes
        </p>

        <div className="flex flex-col gap-3 w-full max-w-sm">
          <ShortcutRow label="Go to File" onClick={onGoToFile}>
            <Key>Ctrl</Key>
            <Key>P</Key>
          </ShortcutRow>

          <ShortcutRow label="Find in Files" onClick={onFindInFiles}>
            <Key>Ctrl</Key>
            <Key>Shift</Key>
            <Key>F</Key>
          </ShortcutRow>

          <ShortcutRow label="Command Palette" onClick={onCommandPalette}>
            <Key>Ctrl</Key>
            <Key>Shift</Key>
            <Key>P</Key>
          </ShortcutRow>

          <ShortcutRow label="Terminal" onClick={onToggleTerminal}>
            <Key>Ctrl</Key>
            <Key>`</Key>
          </ShortcutRow>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-zinc-900/80"
    >
      <span className="text-zinc-500">{label}</span>
      <div className="flex gap-1">{children}</div>
    </button>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="bg-zinc-800/50 border border-zinc-700/50 rounded px-1.5 py-0.5 text-zinc-400">
      {children}
    </kbd>
  );
}
