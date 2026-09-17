interface PassStatus {
  active: boolean;
  expiresAt: Date | null;
}

export async function checkBuilderPass(_userId: string): Promise<PassStatus> {
  return { active: true, expiresAt: null };
}
