export const MONACO_THEME_STORAGE_KEY = "stacy.monaco-theme";
export const MONACO_THEME_CHANGE_EVENT = "stacy:monaco-theme-change";

export const MONACO_THEME_OPTIONS = [
  "v0-dark",
  "github-dark",
  "monokai",
  "dracula",
  "nord",
  "tomorrow-night",
] as const;

export type MonacoThemeName = string;

export const DEFAULT_MONACO_THEME: MonacoThemeName = "v0-dark";

export const MONACO_THEME_LABELS: Record<MonacoThemeName, string> = {
  "v0-dark": "v0 Dark",
  "github-dark": "GitHub Dark",
  monokai: "Monokai",
  dracula: "Dracula",
  nord: "Nord",
  "tomorrow-night": "Tomorrow Night",
};

const LEGACY_THEME_NAME_MAP: Record<string, MonacoThemeName> = {
  "GitHub Dark": "github-dark",
  Monokai: "monokai",
  Dracula: "dracula",
  Nord: "nord",
  "Tomorrow-Night": "tomorrow-night",
};

export function isMonacoThemeName(value: string): value is MonacoThemeName {
  return value === "v0-dark" || /^[a-z0-9-]+$/i.test(value);
}

export function getStoredMonacoTheme(): MonacoThemeName {
  if (typeof window === "undefined") {
    return DEFAULT_MONACO_THEME;
  }

  const stored = window.localStorage.getItem(MONACO_THEME_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_MONACO_THEME;
  }

  if (isMonacoThemeName(stored)) {
    return stored;
  }

  const migrated = LEGACY_THEME_NAME_MAP[stored];
  if (migrated) {
    window.localStorage.setItem(MONACO_THEME_STORAGE_KEY, migrated);
    return migrated;
  }

  return DEFAULT_MONACO_THEME;
}

export function setStoredMonacoTheme(theme: MonacoThemeName): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MONACO_THEME_STORAGE_KEY, theme);
}

export async function loadMonacoThemeData(
  theme: Exclude<MonacoThemeName, "v0-dark">,
): Promise<any> {
  const response = await fetch(`/api/extensions/monaco-theme?id=${encodeURIComponent(theme)}`);

  if (!response.ok) {
    throw new Error(`Unable to load Monaco theme: ${theme}`);
  }

  return response.json();
}
