"use client";

import { useState, useCallback } from 'react';

export type NetworkType = "testnet" | "mainnet";
export type DeployStatus = "IDLE" | "UPLOADING" | "INSTANTIATING" | "SUCCESS" | "ERROR";

export interface UseDeployerReturn {
  status: DeployStatus;
  contractId: string | null;
  wasmHash: string | null;
  logs: string[];
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  explorerUrl: string | null;
  deploy: (
    wasmHex: string,
    walletAddress: string,
    signFn: (xdr: string, networkPassphrase: string) => Promise<string>
  ) => Promise<void>;
  reset: () => void;
  clearLogs: () => void;
}

export function useDeployer(): UseDeployerReturn {
  const [status, setStatus] = useState<DeployStatus>("IDLE");
  const [logs, setLogs] = useState<string[]>([]);
  const [network, setNetwork] = useState<NetworkType>("testnet");

  const clearLogs = useCallback(() => setLogs([]), []);

  const deploy = useCallback(async (_wasmHex: string, _walletAddress: string, _signFn: any) => {
    setStatus("SUCCESS");
    setLogs(["> [MOCK] Contract deployed successfully"]);
  }, []);

  const reset = useCallback(() => {
    setStatus("IDLE");
    setLogs([]);
  }, []);

  return {
    status,
    contractId: status === "SUCCESS" ? "MOCK_CONTRACT_ID_0000000000000000000000000000000000000000000000000000" : null,
    wasmHash: status === "SUCCESS" ? "mock_wasm_hash" : null,
    logs,
    network,
    setNetwork,
    explorerUrl: null,
    deploy,
    reset,
    clearLogs,
  };
}
