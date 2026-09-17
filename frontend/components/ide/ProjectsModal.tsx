"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Folder } from "lucide-react";

interface Project {
  id: string;
  name: string;
  updated_at: string;
  created_at: string;
  contract_state: any;
  frontend_state: any;
}

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (project: Project) => void;
  currentProjectId?: string | null;
}

export function ProjectsModal({ isOpen, onClose }: ProjectsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Folder className="w-5 h-5 text-[#4ee06a]" />
            My Projects
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            Projects are disabled in mock mode.
          </DialogDescription>
        </DialogHeader>
        <div className="text-center py-12 text-zinc-500">
          <Folder className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No projects (mock mode).</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
