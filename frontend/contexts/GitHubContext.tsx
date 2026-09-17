"use client";

import React, { createContext, useContext, useState } from "react";
import {
  GitHubUser,
  GitHubRepository,
  GitHubAuthState,
  GitHubConnectedRepo,
} from "@/types/github";

interface GitHubContextType {
  authState: GitHubAuthState;
  connectedRepo: GitHubConnectedRepo | null;
  repositories: GitHubRepository[];
  isLoading: boolean;
  signIn: () => void;
  signOut: () => void;
  fetchRepositories: () => Promise<void>;
  connectRepository: (repo: GitHubRepository, branch?: string) => void;
  disconnectRepository: () => void;
  pushToGitHub: (
    files: Record<string, string>,
    commitMessage?: string,
  ) => Promise<{ success: boolean; error?: string; commitHash?: string }>;
}

const GitHubContext = createContext<GitHubContextType | undefined>(undefined);

export function GitHubProvider({ children }: { children: React.ReactNode }) {
  const [authState] = useState<GitHubAuthState>({
    isAuthenticated: false,
    user: null,
    accessToken: null,
  });
  const [connectedRepo] = useState<GitHubConnectedRepo | null>(null);
  const [repositories] = useState<GitHubRepository[]>([]);

  return (
    <GitHubContext.Provider
      value={{
        authState,
        connectedRepo,
        repositories,
        isLoading: false,
        signIn: () => {},
        signOut: () => {},
        fetchRepositories: async () => {},
        connectRepository: () => {},
        disconnectRepository: () => {},
        pushToGitHub: async () => ({ success: true, commitHash: "mock-hash" }),
      }}
    >
      {children}
    </GitHubContext.Provider>
  );
}

export function useGitHub() {
  const context = useContext(GitHubContext);
  if (context === undefined) {
    throw new Error("useGitHub must be used within a GitHubProvider");
  }
  return context;
}
