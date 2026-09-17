"use client";

import { useMemo, useCallback, useEffect } from "react";
import { useWallet } from "./useWallet";
import { useCompiler, CompileFile } from "./useCompiler";
import { useDeployer } from "./useDeployer";
import {
  useSandbox,
  EditorChange,
  BindingsResponse,
  FileTreeSyncData,
  FileContentSyncData,
} from "./useSandbox";

/**
 * Combined hook for Stellar IDE operations.
 * Orchestrates wallet, compilation, deployment, and sandbox functionality.
 */
export function useStellarIDE() {
  const wallet = useWallet();
  const compiler = useCompiler();
  const deployer = useDeployer();
  const sandbox = useSandbox();

  // Combine all logs from different sources
  const allLogs = useMemo(() => {
    return [
      ...wallet.logs,
      ...compiler.logs,
      ...deployer.logs,
      ...sandbox.logs,
    ];
  }, [wallet.logs, compiler.logs, deployer.logs, sandbox.logs]);

  // Helper to compile with files
  const compileContract = useCallback(
    (files: CompileFile[]) => {
      compiler.compile(files);
    },
    [compiler],
  );

  // Helper to deploy after successful compilation
  const deployContract = useCallback(async () => {
    if (!wallet.address) {
      console.error("Cannot deploy: wallet not connected");
      return;
    }
    if (!compiler.wasmHex) {
      console.error("Cannot deploy: no compiled WASM");
      return;
    }

    await deployer.deploy(compiler.wasmHex, wallet.address, wallet.sign);
  }, [wallet.address, wallet.sign, compiler.wasmHex, deployer]);

  // Helper to generate bindings
  const generateBindings = useCallback(
    (contractId: string, onSuccess?: (changes: EditorChange[]) => void) => {
      console.log(
        "[useStellarIDE] ============================================",
      );
      console.log("[useStellarIDE] generateBindings() CALLED");
      console.log(
        "[useStellarIDE] ============================================",
      );
      console.log("[useStellarIDE] Contract ID:", contractId);
      console.log("[useStellarIDE] Network:", deployer.network);
      console.log("[useStellarIDE] Sandbox connected:", sandbox.isConnected);
      console.log("[useStellarIDE] Has success callback:", !!onSuccess);
      console.log("[useStellarIDE] Timestamp:", new Date().toISOString());

      if (!sandbox.isConnected) {
        const errorMsg = "Cannot generate bindings: sandbox not connected";
        console.error("[useStellarIDE]", errorMsg);
        return;
      }

      // Set up the response handler
      console.log("[useStellarIDE] Setting up bindings response handler...");
      sandbox.setOnBindingsResponse((response: BindingsResponse) => {
        console.log(
          "[useStellarIDE] ============================================",
        );
        console.log("[useStellarIDE] BINDINGS RESPONSE HANDLER CALLED");
        console.log(
          "[useStellarIDE] ============================================",
        );
        console.log("[useStellarIDE] Response success:", response.success);
        console.log(
          "[useStellarIDE] Changes available:",
          !!response.editor?.changes,
        );
        console.log(
          "[useStellarIDE] Changes count:",
          response.editor?.changes?.length || 0,
        );

        if (response.success && onSuccess && response.editor?.changes) {
          console.log(
            "[useStellarIDE] Calling onSuccess callback with",
            response.editor.changes.length,
            "changes",
          );
          onSuccess(response.editor.changes);
          console.log("[useStellarIDE] onSuccess callback completed");
        } else {
          if (!response.success) {
            console.warn(
              "[useStellarIDE] Response not successful, skipping onSuccess",
            );
          } else if (!onSuccess) {
            console.warn("[useStellarIDE] No onSuccess callback provided");
          } else if (!response.editor?.changes) {
            console.warn("[useStellarIDE] No changes in response");
          }
        }
        console.log(
          "[useStellarIDE] ============================================",
        );
      });

      console.log("[useStellarIDE] Calling sandbox.generateBindings()...");
      sandbox.generateBindings(contractId, deployer.network);
      console.log("[useStellarIDE] generateBindings() call completed");
      console.log(
        "[useStellarIDE] ============================================",
      );
    },
    [sandbox, deployer.network],
  );

  // Reset all state
  const resetAll = useCallback(() => {
    compiler.reset();
    deployer.reset();
    sandbox.reset();
  }, [compiler, deployer, sandbox]);

  // Clear all logs
  const clearAllLogs = useCallback(() => {
    wallet.clearLogs();
    compiler.clearLogs();
    deployer.clearLogs();
    sandbox.clearLogs();
  }, [wallet, compiler, deployer, sandbox]);

  return {
    // Wallet
    wallet: {
      address: wallet.address,
      status: wallet.status,
      connect: wallet.connect,
      disconnect: wallet.disconnect,
      error: wallet.error,
    },

    // Compiler
    compiler: {
      status: compiler.status,
      wasmHex: compiler.wasmHex,
      compile: compileContract,
      reset: compiler.reset,
    },

    // Deployer
    deployer: {
      status: deployer.status,
      contractId: deployer.contractId,
      wasmHash: deployer.wasmHash,
      network: deployer.network,
      setNetwork: deployer.setNetwork,
      explorerUrl: deployer.explorerUrl,
      deploy: deployContract,
      reset: deployer.reset,
    },

    // Sandbox
    sandbox: {
      status: sandbox.status,
      agentStatus: sandbox.agentStatus,
      agentState: sandbox.agentState,
      bindingsStatus: sandbox.bindingsStatus,
      previewUrl: sandbox.previewUrl,
      sandboxInfo: sandbox.sandboxInfo,
      spawn: sandbox.spawn,
      stop: sandbox.stop,
      generateBindings: generateBindings,
      sendChatMessage: sandbox.sendChatMessage,
      executeCommand: sandbox.executeCommand,
      setOnChatResponse: sandbox.setOnChatResponse,
      setOnChatProgress: sandbox.setOnChatProgress,
      setOnBindingsResponse: sandbox.setOnBindingsResponse,
      isConnected: sandbox.isConnected,
      // File sync operations
      syncFileTree: sandbox.syncFileTree,
      readFile: sandbox.readFile,
      writeFile: sandbox.writeFile,
      deleteFile: sandbox.deleteFile,
      setOnFileTreeSync: sandbox.setOnFileTreeSync,
      setOnFileContentSync: sandbox.setOnFileContentSync,
    },

    // Combined
    allLogs,
    resetAll,
    clearAllLogs,

    // Convenience booleans
    isWalletConnected: wallet.status === "connected",
    isCompiling: compiler.status === "COMPILING",
    isDeploying:
      deployer.status === "UPLOADING" || deployer.status === "INSTANTIATING",
    hasCompiledWasm: !!compiler.wasmHex,
    hasDeployedContract: !!deployer.contractId,
    isSandboxRunning:
      sandbox.status === "running" || sandbox.status === "preview_starting",
    isSandboxConnected: sandbox.isConnected,
  };
}

export type StellarIDEHook = ReturnType<typeof useStellarIDE>;
