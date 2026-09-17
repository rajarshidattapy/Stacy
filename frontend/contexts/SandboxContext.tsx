"use client";

import React, { createContext, useContext } from "react";
import { StellarIDEHook } from "@/hooks/useStellarIDE";

type SandboxContextType = StellarIDEHook["sandbox"];

const SandboxContext = createContext<SandboxContextType | undefined>(undefined);

export function SandboxProvider({
  children,
  sandbox,
}: {
  children: React.ReactNode;
  sandbox: SandboxContextType;
}) {
  return (
    <SandboxContext.Provider value={sandbox}>
      {children}
    </SandboxContext.Provider>
  );
}

export function useSandboxContext() {
  const context = useContext(SandboxContext);
  if (context === undefined) {
    throw new Error("useSandboxContext must be used within a SandboxProvider");
  }
  return context;
}
