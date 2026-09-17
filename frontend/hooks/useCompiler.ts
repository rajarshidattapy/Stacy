"use client";

import { useState, useCallback } from 'react';

export type CompilerStatus = "IDLE" | "QUEUED" | "COMPILING" | "SUCCESS" | "ERROR";

export interface CompileFile {
  path: string;
  content: string;
}

export interface UseCompilerReturn {
  status: CompilerStatus;
  logs: string[];
  wasmHex: string | null;
  compile: (files: CompileFile[]) => void;
  reset: () => void;
  clearLogs: () => void;
}

export function useCompiler(): UseCompilerReturn {
  const [status, setStatus] = useState<CompilerStatus>("IDLE");
  const [logs, setLogs] = useState<string[]>([]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const compile = useCallback((_files: CompileFile[]) => {
    setStatus("SUCCESS");
    setLogs(["> [MOCK] Compilation successful"]);
  }, []);

  const reset = useCallback(() => {
    setStatus("IDLE");
    setLogs([]);
  }, []);

  return { status, logs, wasmHex: status === "SUCCESS" ? "mock_wasm_hex" : null, compile, reset, clearLogs };
}
