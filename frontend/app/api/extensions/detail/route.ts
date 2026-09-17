import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { OpenVSXClient, OpenVSXExtensionMetadata } from "@/extension-system/registry/open-vsx-client";
import { VSCodeMarketplaceClient, VSCodeExtension } from "../../../../extension-system/registry/vscode-marketplace-client";
import { getExtensionPresentation, getLocalPackageIconUrl } from "../extension-utils";

export const dynamic = "force-dynamic";

export interface ExtensionDetailResponse {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  iconUrl?: string;
  iconText?: string;
  iconBackground?: string;
  downloadUrl?: string;
  downloads?: number;
  rating?: number;
  reviewCount?: number;
  categories?: string[];
  tags?: string[];
  publishedAt?: string;
  lastUpdated?: string;
  repositoryUrl?: string;
  licenseUrl?: string;
  marketplaceUrl?: string;
  readme?: string;
  features?: string[];
  monacoThemeId?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source");

  try {
    if (source === "marketplace") {
      const namespace = searchParams.get("namespace");
      const extensionParam = searchParams.get("extension");

      if (!namespace || !extensionParam) {
        return NextResponse.json({ error: "Missing extension coordinates" }, { status: 400 });
      }

      const client = new VSCodeMarketplaceClient();
      const ext = await client.getExtensionById(namespace, extensionParam);
      const readmeUrl = client.getAssetUrl(ext, "Microsoft.VisualStudio.Services.Content.Details");
      const readme = await readRemoteText(readmeUrl);

      return NextResponse.json(toMarketplaceDetail(ext, client, readme));
    }

    if (source === "open-vsx") {
      const namespace = searchParams.get("namespace");
      const extension = searchParams.get("extension");
      const version = searchParams.get("version") ?? "latest";

      if (!namespace || !extension) {
        return NextResponse.json({ error: "Missing extension coordinates" }, { status: 400 });
      }

      const registry = new OpenVSXClient();
      const metadata = await registry.getExtension(namespace, extension, version);
      const readme = await readRemoteText(normalizeOpenVSXUrl(metadata.files.readme));

      return NextResponse.json(toOpenVSXDetail(metadata, registry, readme));
    }

    const folder = searchParams.get("folder") ?? searchParams.get("extension");

    if (!folder || folder.includes("..")) {
      return NextResponse.json({ error: "Missing local extension folder" }, { status: 400 });
    }

    const detail = readLocalDetail(folder);
    return NextResponse.json(detail);
  } catch (error) {
    console.error("[extensions/detail] Error loading extension detail:", error);
    return NextResponse.json({ error: "Failed to load extension detail" }, { status: 500 });
  }
}

function toOpenVSXDetail(
  metadata: OpenVSXExtensionMetadata,
  registry: OpenVSXClient,
  readme?: string,
): ExtensionDetailResponse {
  const manifest = metadata.packageJson as Record<string, any> | undefined;

  const item = {
    id: `${metadata.namespace}.${metadata.name}`,
    name: manifest?.displayName || metadata.displayName || metadata.name,
    description: manifest?.description || metadata.description || "No description available",
    author: metadata.namespace,
    version: metadata.version,
    iconUrl: normalizeOpenVSXUrl(metadata.files.icon),
    downloadUrl: metadata.files.download ? registry.getDownloadUrl(metadata) : undefined,
    downloads: getNumberField(metadata, "downloadCount"),
    rating: getNumberField(metadata, "averageRating"),
    reviewCount: getNumberField(metadata, "reviewCount"),
    categories: metadata.categories?.length ? metadata.categories : getStringArray(manifest?.categories),
    tags: metadata.tags ?? [],
    publishedAt: metadata.timestamp,
    repositoryUrl: getRepositoryUrl(manifest),
    licenseUrl: normalizeOpenVSXUrl(metadata.files.license),
    marketplaceUrl: `https://open-vsx.org/extension/${metadata.namespace}/${metadata.name}`,
    readme,
    features: getFeaturesFromManifest(manifest),
  };

  return {
    ...item,
    ...getExtensionPresentation({
      id: item.id,
      name: item.name,
      type: inferExtensionType(metadata),
      manifest,
      iconUrl: item.iconUrl,
    }),
  };
}

function toMarketplaceDetail(
  extension: VSCodeExtension,
  client: VSCodeMarketplaceClient,
  readme?: string,
): ExtensionDetailResponse {
  const downloads =
    extension.statistics.find((s) => s.statisticName === "install")?.value ??
    extension.statistics.find((s) => s.statisticName === "installCount")?.value;
  const rating = extension.statistics.find((s) => s.statisticName === "averagerating")?.value;
  const reviewCount = extension.statistics.find((s) => s.statisticName === "ratingcount")?.value;
  const isTheme = extension.categories?.some((c) => c.toLowerCase().includes("theme")) ?? false;

  const item = {
    id: `${extension.publisher.publisherName}.${extension.extensionName}`,
    name: extension.displayName || extension.extensionName,
    description: extension.shortDescription || "No description available",
    author: extension.publisher.displayName || extension.publisher.publisherName,
    version: extension.versions[0]?.version || "0.0.1",
    iconUrl: client.getIconUrl(extension),
    downloads,
    rating,
    reviewCount,
    categories: extension.categories,
    tags: extension.tags,
    publishedAt: extension.publishedDate,
    lastUpdated: extension.lastUpdated,
    marketplaceUrl: `https://marketplace.visualstudio.com/items?itemName=${extension.publisher.publisherName}.${extension.extensionName}`,
    readme,
  };

  return {
    ...item,
    ...getExtensionPresentation({
      id: item.id,
      name: item.name,
      type: isTheme ? "theme" : "extension",
      iconUrl: item.iconUrl,
    }),
  };
}

function readLocalDetail(folder: string): ExtensionDetailResponse {
  const { extensionRoot, folderName } = resolveLocalExtension(folder);
  const pkgPath = path.join(extensionRoot, "package.json");
  const nlsPath = path.join(extensionRoot, "package.nls.json");

  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Local extension not found: ${folder}`);
  }

  const manifest = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, any>;
  const nls = fs.existsSync(nlsPath)
    ? (JSON.parse(fs.readFileSync(nlsPath, "utf-8")) as Record<string, string>)
    : {};
  const resolve = (value: unknown) => {
    if (typeof value !== "string") {
      return undefined;
    }

    if (value.startsWith("%") && value.endsWith("%")) {
      return nls[value.slice(1, -1)] ?? value;
    }

    return value;
  };

  const readme = readFirstExistingText(extensionRoot, ["README.md", "Readme.md", "readme.md"]);

  const item = {
    id: manifest.publisher ? `${manifest.publisher}.${manifest.name || folderName}` : manifest.name || folderName,
    name: resolve(manifest.displayName) || resolve(manifest.name) || folderName,
    description: resolve(manifest.description) || "No description available",
    author: manifest.publisher || "vscode",
    version: manifest.version || "0.0.1",
    iconUrl: getLocalPackageIconUrl(folderName, manifest),
    categories: getStringArray(manifest.categories) ?? getContributionCategories(manifest.contributes),
    repositoryUrl: getRepositoryUrl(manifest),
    readme,
    features: getFeaturesFromManifest(manifest),
  };

  return {
    ...item,
    ...getExtensionPresentation({
      folder: folderName,
      id: item.id,
      name: item.name,
      type: Array.isArray(manifest.contributes?.themes) ? "theme" : "extension",
      manifest,
      iconUrl: item.iconUrl,
    }),
  };
}

function resolveLocalExtension(requestedName: string): {
  extensionRoot: string;
  folderName: string;
} {
  const extensionsRoot = path.join(process.cwd(), "components/ide/extensions");
  const directRoot = path.join(extensionsRoot, requestedName);

  if (fs.existsSync(path.join(directRoot, "package.json"))) {
    return {
      extensionRoot: directRoot,
      folderName: requestedName,
    };
  }

  if (!fs.existsSync(extensionsRoot)) {
    throw new Error(`Local extensions directory not found: ${extensionsRoot}`);
  }

  const folders = fs
    .readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const folder of folders) {
    const pkgPath = path.join(extensionsRoot, folder, "package.json");

    if (!fs.existsSync(pkgPath)) {
      continue;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, any>;
      const manifestId = manifest.publisher
        ? `${manifest.publisher}.${manifest.name || folder}`
        : manifest.name || folder;

      if (manifest.name === requestedName || manifestId === requestedName) {
        return {
          extensionRoot: path.join(extensionsRoot, folder),
          folderName: folder,
        };
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Local extension not found: ${requestedName}`);
}

async function readRemoteText(url: string | undefined): Promise<string | undefined> {
  if (!url) {
    return undefined;
  }

  const response = await fetch(url, {
    headers: {
      accept: "text/markdown,text/plain,*/*",
    },
  });

  if (!response.ok) {
    return undefined;
  }

  return response.text();
}

function readFirstExistingText(root: string, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const filePath = path.join(root, candidate);

    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  }

  return undefined;
}

function getFeaturesFromManifest(manifest: Record<string, any> | undefined): string[] {
  const contributes = manifest?.contributes as Record<string, unknown> | undefined;

  if (!contributes) {
    return [];
  }

  const labels: Record<string, string> = {
    commands: "Commands",
    configuration: "Settings",
    configurationDefaults: "Configuration defaults",
    debuggers: "Debuggers",
    grammars: "Syntax grammars",
    icons: "Icon themes",
    jsonValidation: "JSON validation",
    keybindings: "Keybindings",
    languages: "Languages",
    menus: "Menus",
    snippets: "Snippets",
    themes: "Color themes",
    views: "Views",
    viewsContainers: "View containers",
  };

  return Object.keys(contributes)
    .map((key) => labels[key] ?? key)
    .sort();
}

function getContributionCategories(contributes: unknown): string[] {
  if (!contributes || typeof contributes !== "object") {
    return [];
  }

  const contributionMap = contributes as Record<string, unknown>;
  const categories: string[] = [];

  if (Array.isArray(contributionMap.languages)) categories.push("Programming Languages");
  if (Array.isArray(contributionMap.debuggers)) categories.push("Debuggers");
  if (Array.isArray(contributionMap.grammars)) categories.push("Syntax");
  if (Array.isArray(contributionMap.snippets)) categories.push("Snippets");
  if (Array.isArray(contributionMap.themes)) categories.push("Themes");

  return categories.length ? categories : ["Other"];
}

function getRepositoryUrl(manifest: Record<string, any> | undefined): string | undefined {
  const repository = manifest?.repository;

  if (typeof repository === "string") {
    return repository;
  }

  if (repository && typeof repository.url === "string") {
    return repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
  }

  return undefined;
}

function getStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function getNumberField(source: unknown, field: string): number | undefined {
  const value = (source as Record<string, unknown>)[field];
  return typeof value === "number" ? value : undefined;
}

function normalizeOpenVSXUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  return url.startsWith("http") ? url : `https://open-vsx.org${url}`;
}

function inferExtensionType(extension: OpenVSXExtensionMetadata): "extension" | "theme" {
  const categories = extension.categories ?? [];
  const contributes = extension.packageJson?.contributes;

  if (
    categories.some((category) => category.toLowerCase().includes("theme")) ||
    Array.isArray((contributes as { themes?: unknown[] } | undefined)?.themes)
  ) {
    return "theme";
  }

  return "extension";
}
