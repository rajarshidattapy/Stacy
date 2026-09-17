"use client";

import { X, Sparkles, CheckCircle2, Zap } from "lucide-react";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PricingModal({ isOpen, onClose }: PricingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div 
        className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row shadow-[#4ee06a]/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left column: Free tier */}
        <div className="flex-1 p-8 flex flex-col border-b md:border-b-0 md:border-r border-zinc-800/50 bg-zinc-900/20">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              Free Mode
            </h3>
            <p className="text-sm text-zinc-400 mt-2">
              Basic access for standard models.
            </p>
          </div>
          
          <ul className="space-y-4 mb-8 flex-1">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
              <span className="text-sm text-zinc-300">Access to standard AI models (Gemini Flash, Kimi, GLM)</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
              <span className="text-sm text-zinc-300">Basic code generation & editing</span>
            </li>
            <li className="flex items-start gap-3 opacity-50">
              <X className="w-5 h-5 text-zinc-600 shrink-0 mt-0.5" />
              <span className="text-sm text-zinc-500">Premium models (GPT-4o, Claude 3.5 Sonnet)</span>
            </li>
          </ul>

          <div className="pt-4 mt-auto">
            <button 
              onClick={onClose}
              className="w-full py-2.5 rounded-lg border border-zinc-700 font-medium text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              Continue Free
            </button>
          </div>
        </div>

        {/* Right column: Premium tier */}
        <div className="flex-1 p-8 flex flex-col relative bg-gradient-to-b from-[#4ee06a]/20 to-transparent">
          <div className="absolute top-4 right-4">
            <button 
              onClick={onClose}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-6">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#4ee06a]/10 border border-[#4ee06a]/20 text-[#4ee06a] text-xs font-semibold uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Premium
            </div>
            <h3 className="text-2xl font-bold text-white">
              Builder's Pass
            </h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-white">₹150</span>
              <span className="text-sm text-zinc-400">/ 24 hours</span>
            </div>
            <p className="text-sm text-zinc-400 mt-2">
              Unlock the most powerful AI reasoning models.
            </p>
          </div>
          
          <ul className="space-y-4 mb-4 flex-1">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#4ee06a] shrink-0 mt-0.5" />
              <span className="text-sm text-zinc-200">
                <strong className="text-white">GPT-4o & Claude 3.5 Sonnet</strong> access
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#4ee06a] shrink-0 mt-0.5" />
              <span className="text-sm text-zinc-200">Complex smart contract reasoning</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#4ee06a] shrink-0 mt-0.5" />
              <span className="text-sm text-zinc-200">Advanced frontend UI generation</span>
            </li>
          </ul>

          <div className="pt-6 border-t border-[#4ee06a]/10 mt-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#4ee06a] px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#6af080]"
            >
              <Zap className="h-4 w-4" />
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
