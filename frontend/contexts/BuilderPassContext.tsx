"use client";

import React, { createContext, useContext, ReactNode } from "react";

interface BuilderPassContextValue {
  isActive: boolean;
  expiresAt: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const BuilderPassContext = createContext<BuilderPassContextValue | undefined>(undefined);

export function BuilderPassProvider({ children }: { children: ReactNode }) {
  return (
    <BuilderPassContext.Provider
      value={{ isActive: true, expiresAt: null, isLoading: false, refresh: async () => {} }}
    >
      {children}
    </BuilderPassContext.Provider>
  );
}

export function useBuilderPassContext(): BuilderPassContextValue {
  const context = useContext(BuilderPassContext);
  if (context === undefined) {
    throw new Error("useBuilderPassContext must be used within a BuilderPassProvider");
  }
  return context;
}
