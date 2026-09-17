"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { format } from "date-fns";
import { useEffect, useState } from "react";

interface SaveProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name?: string) => void;
  defaultName?: string;
  isSaving?: boolean;
  lastSavedAt?: string | null;
}

export function SaveProjectDialog({
  isOpen,
  onClose,
  onSave,
  defaultName = "",
  isSaving = false,
  lastSavedAt,
}: SaveProjectDialogProps) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
    }
  }, [isOpen, defaultName]);

  const lastSavedLabel = lastSavedAt
    ? `Last saved ${format(new Date(lastSavedAt), "MMM d, yyyy • HH:mm")}`
    : "Saved to your Supabase projects table";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px] bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Save className="w-4 h-4 text-[#4ee06a]" />
            {defaultName ? "Update Project" : "Save Project"}
          </DialogTitle>
          <DialogDescription className="text-zinc-500 text-sm">
            Give your project a name so you can reopen it later. State is stored directly in Supabase (JSONB).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-3">
          <label className="text-xs uppercase tracking-wide text-zinc-500">Project name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Soroban Hello World"
            className="bg-zinc-900 border-zinc-800 focus:border-[#4ee06a] focus:ring-[#4ee06a]/40"
            disabled={isSaving}
            autoFocus
          />
          <p className="text-xs text-zinc-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#4ee06a]/70" />
            {lastSavedLabel}
          </p>
        </div>

        <DialogFooter className="mt-4 flex items-center gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
            className="text-zinc-400 hover:text-zinc-100"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onSave(name.trim())}
            disabled={!name.trim() || isSaving}
            className="bg-[#4ee06a] hover:bg-[#4ee06a] text-white"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{defaultName ? "Update Save" : "Save Project"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

