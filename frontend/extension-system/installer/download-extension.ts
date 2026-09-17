import { OpenVSXClient, OpenVSXExtensionMetadata } from "../registry/open-vsx-client";

export interface DownloadedExtension {
  metadata: OpenVSXExtensionMetadata;
  vsix: ArrayBuffer;
}

export interface DownloadExtensionOptions {
  fetcher?: typeof fetch;
  registry?: OpenVSXClient;
}

export async function downloadExtension(
  namespace: string,
  extension: string,
  version = "latest",
  options: DownloadExtensionOptions = {},
): Promise<DownloadedExtension> {
  const registry = options.registry ?? new OpenVSXClient({ fetcher: options.fetcher });
  const metadata = await registry.getExtension(namespace, extension, version);
  const downloadUrl = registry.getDownloadUrl(metadata);
  const fetcher = options.fetcher ?? fetch;

  const response = await fetcher(downloadUrl, {
    headers: {
      accept: "application/octet-stream",
    },
  });

  if (!response.ok) {
    throw new Error(`VSIX download failed: ${response.status} ${response.statusText}`);
  }

  return {
    metadata,
    vsix: await response.arrayBuffer(),
  };
}
