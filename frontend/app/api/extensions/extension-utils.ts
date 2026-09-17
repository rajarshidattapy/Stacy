const DEVICON_BASE = "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons";

const DEVICON_ALIASES: Record<string, string> = {
  bash: "bash",
  bat: "windows8",
  c: "c",
  coffeescript: "coffeescript",
  cpp: "cplusplus",
  csharp: "csharp",
  css: "css3",
  dockerfile: "docker",
  dotenv: "linux",
  fs: "fsharp",
  git: "git",
  go: "go",
  groovy: "groovy",
  handlebars: "handlebars",
  html: "html5",
  java: "java",
  javascript: "javascript",
  json: "json",
  less: "less",
  lua: "lua",
  markdown: "markdown",
  node: "nodejs",
  npm: "npm",
  php: "php",
  powershell: "powershell",
  python: "python",
  r: "r",
  ruby: "ruby",
  rust: "rust",
  scss: "sass",
  shellscript: "bash",
  sql: "azuresqldatabase",
  swift: "swift",
  typescript: "typescript",
  xml: "xml",
  yaml: "yaml",
};

export interface ExtensionPresentationInput {
  folder?: string;
  id: string;
  name: string;
  type: "extension" | "theme";
  manifest?: Record<string, any>;
  iconUrl?: string;
  iconBackground?: string;
}

export interface ExtensionPresentation {
  iconUrl?: string;
  iconText: string;
  iconBackground: string;
}

export function getExtensionPresentation(input: ExtensionPresentationInput): ExtensionPresentation {
  return {
    iconUrl: input.iconUrl ?? getManifestDerivedIconUrl(input.folder, input.manifest),
    iconText: getIconText(input.name || input.id),
    iconBackground: input.iconBackground ?? (input.type === "theme" ? "#4f46e5" : getStableColor(input.id || input.name)),
  };
}

export function getLocalPackageIconUrl(folder: string, manifest: Record<string, any>): string | undefined {
  if (typeof manifest.icon === "string" && !manifest.icon.includes("..")) {
    return `/api/extensions/assets/${encodeURIComponent(folder)}?path=${encodeURIComponent(manifest.icon)}`;
  }

  return undefined;
}

function getManifestDerivedIconUrl(
  folder: string | undefined,
  manifest: Record<string, any> | undefined,
): string | undefined {
  const explicitIcon = folder && manifest ? getLocalPackageIconUrl(folder, manifest) : undefined;

  if (explicitIcon) {
    return explicitIcon;
  }

  const languageId = getPrimaryLanguageId(manifest) ?? folder;

  if (!languageId) {
    return undefined;
  }

  const deviconName = DEVICON_ALIASES[languageId.toLowerCase()];

  if (!deviconName) {
    return undefined;
  }

  const variant = deviconName === "less" || deviconName === "npm"
    ? "original-wordmark"
    : "original";

  return `${DEVICON_BASE}/${deviconName}/${deviconName}-${variant}.svg`;
}

function getPrimaryLanguageId(manifest: Record<string, any> | undefined): string | undefined {
  const languages = manifest?.contributes?.languages;

  if (!Array.isArray(languages)) {
    return undefined;
  }

  const language = languages.find((entry) => entry && typeof entry.id === "string");
  return language?.id;
}

function getIconText(value: string): string {
  const words = value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return (words[0] ?? value).slice(0, 2).toUpperCase();
}

function getStableColor(value: string): string {
  const palette = [
    "#059669",
    "#2563eb",
    "#7c3aed",
    "#ea580c",
    "#0891b2",
    "#e11d48",
    "#d97706",
    "#475569",
  ];
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return palette[hash % palette.length];
}
