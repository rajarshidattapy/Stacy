"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { History } from "lucide-react";

interface VersionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string | null;
  sessionId?: string | null;
  onRestoreComplete?: () => void;
}

export function VersionsModal({ isOpen, onClose }: VersionsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-[#4ee06a]" />
            Project Versions
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Versions are disabled in mock mode.
          </DialogDescription>
        </DialogHeader>
        <div className="text-center py-12 text-zinc-500">
          <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No versions (mock mode).</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
