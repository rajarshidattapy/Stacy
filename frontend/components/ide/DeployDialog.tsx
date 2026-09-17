"use client";
import { cn } from "@/lib/utils";
import { 
  X, 
  Upload, 
  CheckCircle2, 
  Loader2, 
  Copy, 
  ExternalLink,
  Rocket,
  AlertCircle
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type DeployerStatus = "IDLE" | "UPLOADING" | "INSTANTIATING" | "SUCCESS" | "ERROR";
type NetworkType = "testnet" | "mainnet";

interface DeployDialogProps {
  isOpen: boolean;
  onClose: () => void;
  status: DeployerStatus;
  contractId: string | null;
  explorerUrl: string | null;
  network: NetworkType;
  onDeploy: () => void;
}

export function DeployDialog({
  isOpen,
  onClose,
  status,
  contractId,
  explorerUrl,
  network,
  onDeploy
}: DeployDialogProps) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    if (contractId) {
      navigator.clipboard.writeText(contractId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Auto-start deployment when dialog opens
  useEffect(() => {
    if (isOpen && status === "IDLE") {
      onDeploy();
    }
  }, [isOpen, status, onDeploy]);

  const isDeploying = status === "UPLOADING" || status === "INSTANTIATING";
  const isSuccess = status === "SUCCESS";
  const isError = status === "ERROR";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    isSuccess ? "bg-green-500/20" : isError ? "bg-red-500/20" : "bg-[#4ee06a]/20"
                  )}>
                    {isSuccess ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : isError ? (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <Rocket className="w-5 h-5 text-[#4ee06a]" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-100">
                      {isSuccess ? "Deployment Successful" : isError ? "Deployment Failed" : "Deploying Contract"}
                    </h2>
                    <p className="text-xs text-zinc-500">
                      {network === "testnet" ? "Stellar Testnet" : "Stellar Mainnet"}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Progress Steps */}
              <div className="px-5 py-5 space-y-4">
                {/* Step 1: Upload WASM */}
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all",
                    status === "UPLOADING" ? "bg-yellow-500/20 ring-2 ring-yellow-500/50" :
                    (status === "INSTANTIATING" || status === "SUCCESS") ? "bg-green-500/20" : 
                    status === "ERROR" ? "bg-red-500/20" : "bg-zinc-800"
                  )}>
                    {status === "UPLOADING" ? (
                      <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                    ) : (status === "INSTANTIATING" || status === "SUCCESS") ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <Upload className="w-4 h-4 text-zinc-500" />
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className={cn(
                      "text-sm font-medium",
                      status === "UPLOADING" ? "text-yellow-400" :
                      (status === "INSTANTIATING" || status === "SUCCESS") ? "text-green-400" : "text-zinc-400"
                    )}>
                      Upload WASM
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {status === "UPLOADING" ? "Uploading contract bytecode..." : 
                       (status === "INSTANTIATING" || status === "SUCCESS") ? "WASM uploaded successfully" :
                       "Waiting to start"}
                    </p>
                  </div>
                </div>

                {/* Connector Line */}
                <div className="ml-4 w-px h-4 bg-zinc-800" />

                {/* Step 2: Instantiate */}
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all",
                    status === "INSTANTIATING" ? "bg-yellow-500/20 ring-2 ring-yellow-500/50" :
                    status === "SUCCESS" ? "bg-green-500/20" : 
                    status === "ERROR" ? "bg-red-500/20" : "bg-zinc-800"
                  )}>
                    {status === "INSTANTIATING" ? (
                      <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                    ) : status === "SUCCESS" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <Rocket className="w-4 h-4 text-zinc-500" />
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className={cn(
                      "text-sm font-medium",
                      status === "INSTANTIATING" ? "text-yellow-400" :
                      status === "SUCCESS" ? "text-green-400" : "text-zinc-400"
                    )}>
                      Instantiate Contract
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {status === "INSTANTIATING" ? "Creating contract instance..." : 
                       status === "SUCCESS" ? "Contract created successfully" :
                       "Waiting for WASM upload"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Contract ID - Show when successful */}
              {isSuccess && contractId && (
                <div className="px-5 pb-5">
                  <div className="p-4 rounded-lg bg-green-500/5 border border-green-900/50">
                    <label className="text-[10px] text-green-400/70 uppercase tracking-wider font-medium">
                      Contract ID
                    </label>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="flex-1 text-sm font-mono text-green-300 truncate">
                        {contractId}
                      </code>
                      <button 
                        onClick={handleCopy}
                        className={cn(
                          "p-2 rounded-md transition-colors",
                          copied ? "bg-green-500/20 text-green-400" : "hover:bg-zinc-800 text-zinc-400"
                        )}
                        title="Copy contract ID"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    {copied && (
                      <p className="text-[10px] text-green-400 mt-1">Copied to clipboard!</p>
                    )}
                  </div>
                </div>
              )}

              {/* Error message */}
              {isError && (
                <div className="px-5 pb-5">
                  <div className="p-4 rounded-lg bg-red-500/5 border border-red-900/50">
                    <p className="text-sm text-red-400">
                      Deployment failed. Check the terminal for details.
                    </p>
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-3">
                {isSuccess && explorerUrl ? (
                  <>
                    <button
                      onClick={onClose}
                      className="flex-1 h-10 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                    >
                      Close
                    </button>
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 h-10 rounded-lg bg-[#4ee06a] hover:bg-[#4ee06a] text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on Explorer
                    </a>
                  </>
                ) : isError ? (
                  <button
                    onClick={onClose}
                    className="flex-1 h-10 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                ) : (
                  <div className="flex-1 flex items-center justify-center gap-2 text-zinc-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Please sign the transactions in your wallet...
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
