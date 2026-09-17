"use client";

interface SupabaseSessionState {
  session: null;
  user: null;
  loading: boolean;
}

export function useSupabaseSession(): SupabaseSessionState {
  return { session: null, user: null, loading: false };
}
