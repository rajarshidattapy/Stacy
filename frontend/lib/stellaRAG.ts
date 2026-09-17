export interface StellaRAGOptions {
  timeout?: number;
  onChunk?: (chunk: string) => void;
}

export async function queryStellaRAG(_prompt: string, _options?: StellaRAGOptions): Promise<string> {
  return "";
}
