import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { VSCodeMarketplaceClient, VSCodeExtension } from '../../../extension-system/registry/vscode-marketplace-client';
import { getExtensionPresentation, getLocalPackageIconUrl } from './extension-utils';

export const dynamic = "force-dynamic";

interface ExtensionListItem {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  type: "extension" | "theme";
  namespace?: string;
  extensionName?: string;
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
  monacoThemeId?: string;
  source: "local" | "open-vsx" | "marketplace";
}

interface MonacoThemeDefinition {
  base?: string;
  inherit?: boolean;
  colors?: Record<string, string>;
  rules?: Array<{
    token?: string;
    foreground?: string;
    background?: string;
    fontStyle?: string;
  }>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.trim();
    const client = new VSCodeMarketplaceClient();

    if (query) {
      const extensions = await client.search(query, 25);
      return NextResponse.json(extensions.map((ext) => toMarketplaceListItem(ext, client)));
    }

    // 1. Fetch featured extensions from official marketplace
    let marketplaceExtensions: ExtensionListItem[] = [];
    try {
      const extensions = await client.getFeatured(12);
      marketplaceExtensions = extensions.map(ext => toMarketplaceListItem(ext, client));
    } catch (e) {
      console.warn("[extensions] Failed to fetch featured extensions:", e);
    }

    const extensionsDir = path.join(process.cwd(), 'components/ide/extensions');
    const themesPath = path.join(process.cwd(), 'lib/monacoThemes/themelist.json');
    
    let localExtensions: ExtensionListItem[] = [];

    // 2. Load folder-based extensions
    if (fs.existsSync(extensionsDir)) {
      const folders = fs.readdirSync(extensionsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      localExtensions = folders.map<ExtensionListItem>(folder => {
        const folderPath = path.join(extensionsDir, folder);
        const pkgPath = path.join(folderPath, 'package.json');
        const nlsPath = path.join(folderPath, 'package.nls.json');
        
        let pkg: any = {};
        let nls: Record<string, string> = {};

        if (fs.existsSync(pkgPath)) {
          try {
            pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          } catch (e) {}
        }

        if (fs.existsSync(nlsPath)) {
          try {
            nls = JSON.parse(fs.readFileSync(nlsPath, 'utf-8'));
          } catch (e) {}
        }

        const resolve = (str: string | undefined) => {
          if (!str) return str;
          if (str.startsWith('%') && str.endsWith('%')) {
            const key = str.slice(1, -1);
            return nls[key] || str;
          }
          return str;
        };

        const item = {
          id: pkg.publisher ? `${pkg.publisher}.${pkg.name || folder}` : pkg.name || folder,
          name: resolve(pkg.displayName) || resolve(pkg.name) || folder,
          description: resolve(pkg.description) || "No description available",
          author: pkg.publisher || "vscode",
          version: pkg.version || "0.0.1",
          type: "extension" as const,
          namespace: pkg.publisher || "vscode",
          extensionName: folder,
          iconUrl: getLocalPackageIconUrl(folder, pkg),
          categories: getManifestCategories(pkg) ?? getContributionCategories(pkg.contributes),
          source: "local" as const
        };

        return {
          ...item,
          ...getExtensionPresentation({
            folder,
            id: item.id,
            name: item.name,
            type: item.type,
            manifest: pkg,
            iconUrl: item.iconUrl,
          }),
        };
      });
    }

    // 3. Load Monaco themes as extensions
    let themeExtensions: ExtensionListItem[] = [];
    if (fs.existsSync(themesPath)) {
      try {
        const themes = JSON.parse(fs.readFileSync(themesPath, 'utf-8')) as Record<string, string>;
        themeExtensions = Object.entries(themes).map<ExtensionListItem>(([id, name]) => {
          const themeDefinition = readMonacoThemeDefinition(name);
          const item = {
            id: `monaco-theme-${id}`,
            name: `${name} Theme`,
            description: `A beautiful ${name} color theme for Monaco Editor.`,
            author: "Monaco",
            version: "1.0.0",
            type: "theme" as const,
            iconUrl: createMonacoThemeIcon(name, themeDefinition),
            iconBackground: getThemeColor(themeDefinition, "editor.background", getBaseEditorBackground(themeDefinition)),
            monacoThemeId: id,
            source: "local" as const
          };

          return {
            ...item,
            ...getExtensionPresentation({
              id: item.id,
              name: item.name,
              type: item.type,
              iconUrl: item.iconUrl,
              iconBackground: item.iconBackground,
            }),
          };
        });
      } catch (e) {
        console.error("[extensions] Error parsing themes list:", e);
      }
    }

    return NextResponse.json([...marketplaceExtensions, ...localExtensions, ...themeExtensions]);
  } catch (error) {
    console.error('[extensions] Error fetching extensions:', error);
    return NextResponse.json({ error: 'Failed to fetch extensions' }, { status: 500 });
  }
}

function toMarketplaceListItem(
  extension: VSCodeExtension,
  client: VSCodeMarketplaceClient,
): ExtensionListItem {
  const downloads = extension.statistics.find(s => s.statisticName === "install")?.value || 
                    extension.statistics.find(s => s.statisticName === "installCount")?.value;
  const rating = extension.statistics.find(s => s.statisticName === "averagerating")?.value;
  const reviewCount = extension.statistics.find(s => s.statisticName === "ratingcount")?.value;

  const item = {
    id: `${extension.publisher.publisherName}.${extension.extensionName}`,
    name: extension.displayName || extension.extensionName,
    description: extension.shortDescription || "No description available",
    author: extension.publisher.displayName || extension.publisher.publisherName,
    version: extension.versions[0]?.version || "0.0.1",
    type: (extension.categories?.some(c => c.toLowerCase().includes("theme")) ? "theme" : "extension") as "extension" | "theme",
    namespace: extension.publisher.publisherName,
    extensionName: extension.extensionName,
    iconUrl: client.getIconUrl(extension),
    downloads,
    rating,
    reviewCount,
    categories: extension.categories,
    tags: extension.tags,
    publishedAt: extension.publishedDate,
    source: "marketplace" as const, 
  };

  return {
    ...item,
    ...getExtensionPresentation({
      id: item.id,
      name: item.name,
      type: item.type,
      iconUrl: item.iconUrl,
    }),
  } as ExtensionListItem;
}

function getContributionCategories(contributes: unknown): string[] {
  if (!contributes || typeof contributes !== "object") {
    return [];
  }

  const contributionMap = contributes as Record<string, unknown>;
  const categories: string[] = [];

  if (Array.isArray(contributionMap.languages)) {
    categories.push("Programming Languages");
  }

  if (Array.isArray(contributionMap.grammars)) {
    categories.push("Syntax");
  }

  if (Array.isArray(contributionMap.snippets)) {
    categories.push("Snippets");
  }

  if (Array.isArray(contributionMap.themes)) {
    categories.push("Themes");
  }

  return categories;
}

function getManifestCategories(manifest: unknown): string[] | undefined {
  const categories = (manifest as { categories?: unknown } | undefined)?.categories;

  if (!Array.isArray(categories)) {
    return undefined;
  }

  return categories.filter((category): category is string => typeof category === "string");
}

function readMonacoThemeDefinition(themeName: string): MonacoThemeDefinition | undefined {
  const themePath = path.join(process.cwd(), "lib/monacoThemes", `${themeName}.json`);

  if (!fs.existsSync(themePath)) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(themePath, "utf-8")) as MonacoThemeDefinition;
  } catch (error) {
    console.warn(`[extensions] Unable to read Monaco theme ${themeName}:`, error);
    return undefined;
  }
}

function createMonacoThemeIcon(themeName: string, theme: MonacoThemeDefinition | undefined): string {
  const background = getThemeColor(theme, "editor.background", getBaseEditorBackground(theme));
  const foreground = getThemeColor(theme, "editor.foreground", getBaseEditorForeground(theme));
  const selection = getThemeColor(theme, "editor.selectionBackground", withAlpha(foreground, "33"));
  const keyword = getTokenColor(theme, "keyword", "#4f9cff");
  const string = getTokenColor(theme, "string", "#4ade80");
  const comment = getTokenColor(theme, "comment", "#8b949e");
  const accent = getTokenColor(theme, "entity.name.function", keyword);
  const title = themeName.slice(0, 2).toUpperCase();

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="8" fill="${background}"/>
  <rect x="7" y="8" width="50" height="48" rx="4" fill="${selection}" opacity="0.78"/>
  <rect x="12" y="15" width="13" height="3" rx="1.5" fill="${keyword}"/>
  <rect x="29" y="15" width="22" height="3" rx="1.5" fill="${comment}"/>
  <rect x="12" y="24" width="22" height="3" rx="1.5" fill="${string}"/>
  <rect x="38" y="24" width="12" height="3" rx="1.5" fill="${foreground}" opacity="0.85"/>
  <rect x="12" y="33" width="9" height="3" rx="1.5" fill="${comment}"/>
  <rect x="25" y="33" width="28" height="3" rx="1.5" fill="${accent}"/>
  <rect x="12" y="42" width="18" height="3" rx="1.5" fill="${foreground}" opacity="0.9"/>
  <text x="50" y="54" text-anchor="end" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="${foreground}" opacity="0.82">${escapeSvgText(title)}</text>
</svg>`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getThemeColor(
  theme: MonacoThemeDefinition | undefined,
  key: string,
  fallback: string,
): string {
  return normalizeColor(theme?.colors?.[key], fallback);
}

function getTokenColor(
  theme: MonacoThemeDefinition | undefined,
  token: string,
  fallback: string,
): string {
  const exactRule = theme?.rules?.find((rule) => rule.token === token && rule.foreground);
  const partialRule = theme?.rules?.find((rule) => {
    return typeof rule.token === "string" && rule.token.includes(token) && Boolean(rule.foreground);
  });

  return normalizeColor(exactRule?.foreground ?? partialRule?.foreground, fallback);
}

function getBaseEditorBackground(theme: MonacoThemeDefinition | undefined): string {
  const rootRuleBackground = theme?.rules?.find((rule) => rule.token === "" && rule.background)?.background;
  const fallback = theme?.base === "vs" ? "#ffffff" : "#1e1e1e";

  return normalizeColor(rootRuleBackground, fallback);
}

function getBaseEditorForeground(theme: MonacoThemeDefinition | undefined): string {
  const rootRuleForeground = theme?.rules?.find((rule) => rule.token === "" && rule.foreground)?.foreground;
  const fallback = theme?.base === "vs" ? "#1f2328" : "#d4d4d4";

  return normalizeColor(rootRuleForeground, fallback);
}

function normalizeColor(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
    return value;
  }

  if (/^[0-9a-fA-F]{3,8}$/.test(value)) {
    return `#${value}`;
  }

  return fallback;
}

function withAlpha(color: string, alpha: string): string {
  const normalized = normalizeColor(color, "#888888");

  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return `${normalized}${alpha}`;
  }

  return normalized;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
