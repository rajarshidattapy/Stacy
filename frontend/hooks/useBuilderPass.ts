"use client";

import { useBuilderPassContext } from "@/contexts/BuilderPassContext";

export function useBuilderPass() {
  return useBuilderPassContext();
}
