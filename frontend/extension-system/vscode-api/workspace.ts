import { Uri, WorkspaceConfiguration, WorkspaceFolder } from "./types";

export interface WorkspaceApiOptions {
  workspaceFolders?: WorkspaceFolder[];
  configuration?: Record<string, unknown>;
  onDidUpdateConfiguration?: (section: string, value: unknown) => void | Promise<void>;
}

export interface VSCodeWorkspaceApi {
  workspaceFolders: WorkspaceFolder[] | undefined;
  getConfiguration(section?: string): WorkspaceConfiguration;
}

export function createWorkspaceApi(options: WorkspaceApiOptions = {}): VSCodeWorkspaceApi {
  const configuration = new Map<string, unknown>(Object.entries(options.configuration ?? {}));

  return {
    workspaceFolders: options.workspaceFolders?.map((folder, index) => ({
      ...folder,
      index,
    })),
    getConfiguration: (section) => ({
      get: <T = unknown>(key: string, defaultValue?: T) => {
        const fullKey = section ? `${section}.${key}` : key;
        return readConfigurationValue<T>(configuration, fullKey, defaultValue);
      },
      has: (key: string) => {
        const fullKey = section ? `${section}.${key}` : key;
        return configuration.has(fullKey);
      },
      update: async (key: string, value: unknown) => {
        const fullKey = section ? `${section}.${key}` : key;
        configuration.set(fullKey, value);
        await options.onDidUpdateConfiguration?.(fullKey, value);
      },
    }),
  };
}

export function createWorkspaceFolder(path: string, name: string, index = 0): WorkspaceFolder {
  return {
    uri: Uri.file(path),
    name,
    index,
  };
}

function readConfigurationValue<T>(
  configuration: Map<string, unknown>,
  key: string,
  defaultValue?: T,
): T | undefined {
  if (configuration.has(key)) {
    return configuration.get(key) as T;
  }

  const [root, ...path] = key.split(".");
  let current = configuration.get(root);

  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return defaultValue;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return (current ?? defaultValue) as T | undefined;
}
