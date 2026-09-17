import { DisposableLike, Extension, ExtensionContext, Memento, Uri } from "../vscode-api/types";

class MemoryMemento implements Memento {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
      return;
    }

    this.values.set(key, value);
  }

  keys(): readonly string[] {
    return Array.from(this.values.keys());
  }
}

export interface CreateExtensionContextOptions {
  extension: Extension;
  extensionUri: Uri;
  storageRoot?: Uri;
  logRoot?: Uri;
}

export function createExtensionContext(options: CreateExtensionContextOptions): ExtensionContext {
  const extensionPath = options.extensionUri.fsPath;
  const storageRoot = options.storageRoot ?? Uri.file("/extension-storage");
  const logRoot = options.logRoot ?? Uri.file("/extension-logs");

  return {
    subscriptions: [],
    extension: options.extension,
    extensionUri: options.extensionUri,
    extensionPath,
    globalStorageUri: Uri.joinPath(storageRoot, options.extension.id, "global"),
    logUri: Uri.joinPath(logRoot, options.extension.id),
    storageUri: Uri.joinPath(storageRoot, options.extension.id, "workspace"),
    workspaceState: new MemoryMemento(),
    globalState: new MemoryMemento(),
    asAbsolutePath: (relativePath: string) =>
      Uri.joinPath(options.extensionUri, relativePath).fsPath,
  };
}

export function disposeExtensionContext(context: ExtensionContext): void {
  for (const subscription of context.subscriptions as DisposableLike[]) {
    subscription.dispose();
  }

  context.subscriptions.length = 0;
}
