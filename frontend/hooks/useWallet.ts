"use client";

import { useState, useCallback } from 'react';

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

export interface UseWalletReturn {
  address: string | null;
  status: WalletStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  sign: (xdr: string, networkPassphrase: string) => Promise<string>;
  error: string | null;
  logs: string[];
  clearLogs: () => void;
}

export function useWallet(): UseWalletReturn {
  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [logs, setLogs] = useState<string[]>([]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const connect = useCallback(async () => {
    setStatus("connected");
    setAddress("MOCK_WALLET_ADDRESS_0000000000000000000000000000000");
    setLogs(prev => [...prev, "> [MOCK] Wallet connected"]);
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setStatus("disconnected");
  }, []);

  const sign = useCallback(async (_xdr: string, _networkPassphrase: string): Promise<string> => {
    return "MOCK_SIGNED_XDR";
  }, []);

  return { address, status, connect, disconnect, sign, error: null, logs, clearLogs };
}
