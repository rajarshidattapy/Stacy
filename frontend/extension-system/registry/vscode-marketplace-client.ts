export interface VSCodeExtension {
  publisher: {
    publisherName: string;
    displayName: string;
  };
  extensionName: string;
  displayName: string;
  shortDescription: string;
  versions: Array<{
    version: string;
    files: Array<{
      assetType: string;
      source: string;
    }>;
    properties?: Array<{
      key: string;
      value: string;
    }>;
  }>;
  statistics: Array<{
    statisticName: string;
    value: number;
  }>;
  categories?: string[];
  tags?: string[];
  lastUpdated: string;
  publishedDate: string;
}

export interface MarketplaceResponse {
  results: Array<{
    extensions: VSCodeExtension[];
    pagingToken: string | null;
    resultMetadata: Array<{
      metadataType: string;
      metadataItems: Array<{
        name: string;
        count: number;
      }>;
    }>;
  }>;
}

export class VSCodeMarketplaceClient {
  private readonly baseUrl = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";

  async search(query: string, size = 20): Promise<VSCodeExtension[]> {
    const body = {
      filters: [
        {
          criteria: [
            { filterType: 10, value: query }, // Search text
            { filterType: 8, value: "Microsoft.VisualStudio.Code" }, // Target
            { filterType: 12, value: "4096" } // Exclude unlisted
          ],
          pageSize: size,
          pageNumber: 1,
          sortBy: 0,
          sortOrder: 0
        }
      ],
      flags: 951 // versions, properties, statistics, asset info, categories
    };

    return this.query(body);
  }

  async getFeatured(size = 12): Promise<VSCodeExtension[]> {
    const body = {
      filters: [
        {
          criteria: [
            { filterType: 8, value: "Microsoft.VisualStudio.Code" },
            { filterType: 12, value: "4096" }
          ],
          pageSize: size,
          pageNumber: 1,
          sortBy: 4, // Sort by downloads
          sortOrder: 0
        }
      ],
      flags: 951
    };

    return this.query(body);
  }

  private async query(body: any): Promise<VSCodeExtension[]> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json;api-version=3.0-preview.1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Marketplace request failed: ${response.status}`);
    }

    const data: MarketplaceResponse = await response.json();
    return data.results[0]?.extensions || [];
  }

  async getExtensionById(publisher: string, name: string): Promise<VSCodeExtension> {
    const body = {
      filters: [
        {
          criteria: [
            { filterType: 8, value: "Microsoft.VisualStudio.Code" },
            { filterType: 7, value: `${publisher}.${name}` },
            { filterType: 12, value: "4096" },
          ],
          pageSize: 1,
          pageNumber: 1,
          sortBy: 0,
          sortOrder: 0,
        },
      ],
      flags: 951,
    };

    const extensions = await this.query(body);
    const ext = extensions[0];
    if (!ext) throw new Error(`Extension not found: ${publisher}.${name}`);
    return ext;
  }

  getAssetUrl(extension: VSCodeExtension, assetType: string): string | undefined {
    const version = extension.versions[0];
    if (!version) return undefined;

    const asset = version.files.find(f => f.assetType === assetType);
    return asset?.source;
  }

  getIconUrl(extension: VSCodeExtension): string | undefined {
    return this.getAssetUrl(extension, "Microsoft.VisualStudio.Services.Icons.Default");
  }
}
