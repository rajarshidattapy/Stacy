// Thin layer over the stacyvm SDK.
//
// The SDK already exposes Client + Sandbox with the methods we need. This
// module just gives us a process-wide singleton + sandbox cache so the rest
// of the codebase doesn't have to thread a Client through every call.
import { Client, type Sandbox } from "stacyvm";

let _client: Client | null = null;

export function getStacyClient(): Client {
  if (_client) return _client;
  const baseUrl = process.env.STACYVM_URL ?? "http://localhost:7423";
  const apiKey = process.env.STACYVM_API_KEY || undefined;
  _client = new Client({ baseUrl, apiKey, timeout: 120_000 });
  return _client;
}

const _sandboxCache = new Map<string, Sandbox>();

export async function getSandbox(sandboxId: string): Promise<Sandbox> {
  const cached = _sandboxCache.get(sandboxId);
  if (cached) return cached;
  const sb = await getStacyClient().get(sandboxId);
  _sandboxCache.set(sandboxId, sb);
  return sb;
}

export function cacheSandbox(sb: Sandbox): void {
  _sandboxCache.set(sb.id, sb);
}

export function dropSandboxCache(sandboxId: string): void {
  _sandboxCache.delete(sandboxId);
}
