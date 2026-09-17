import { ExtensionManifest } from "../vscode-api/types";

export interface OpenVSXClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export interface OpenVSXExtensionMetadata {
  namespace: string;
  name: string;
  version: string;
  files: {
    download?: string;
    icon?: string;
    manifest?: string;
    readme?: string;
    license?: string;
    namespaceAccess?: string;
  };
  displayName?: string;
  description?: string;
  timestamp?: string;
  publisher?: string;
  allVersions?: Record<string, string>;
  categories?: string[];
  tags?: string[];
  extensionKind?: string[];
  packageJson?: ExtensionManifest;
}

export interface OpenVSXSearchResult {
  extensions: OpenVSXExtensionMetadata[];
  offset: number;
  totalSize: number;
}

export interface OpenVSXSearchOptions {
  query?: string;
  category?: string;
  size?: number;
  offset?: number;
}

export class OpenVSXClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: OpenVSXClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://open-vsx.org";
    this.fetcher = options.fetcher ?? fetch;
  }

  async getExtension(
    namespace: string,
    extension: string,
    version = "latest",
  ): Promise<OpenVSXExtensionMetadata> {
    const url = `${this.baseUrl}/api/${encodeURIComponent(namespace)}/${encodeURIComponent(
      extension,
    )}/${encodeURIComponent(version)}`;

    return this.getJson<OpenVSXExtensionMetadata>(url);
  }

  async search(options: OpenVSXSearchOptions = {}): Promise<OpenVSXSearchResult> {
    const params = new URLSearchParams();

    if (options.query) {
      params.set("query", options.query);
    }

    if (options.category) {
      params.set("category", options.category);
    }

    if (options.size !== undefined) {
      params.set("size", String(options.size));
    }

    if (options.offset !== undefined) {
      params.set("offset", String(options.offset));
    }

    return this.getJson<OpenVSXSearchResult>(`${this.baseUrl}/api/-/search?${params.toString()}`);
  }

  getDownloadUrl(metadata: OpenVSXExtensionMetadata): string {
    if (!metadata.files.download) {
      throw new Error(`No VSIX download URL for ${metadata.namespace}.${metadata.name}`);
    }

    return metadata.files.download.startsWith("http")
      ? metadata.files.download
      : `${this.baseUrl}${metadata.files.download}`;
  }

  private async getJson<T>(url: string): Promise<T> {
    const response = await this.fetcher(url, {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Open VSX request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }
}
