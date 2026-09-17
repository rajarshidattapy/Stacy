import { ExtensionManifest } from "../vscode-api/types";

export interface UnzippedFile {
  path: string;
  readText(): Promise<string>;
  readBytes(): Promise<ArrayBuffer>;
}

export interface VSIXUnzipper {
  unzip(vsix: ArrayBuffer): Promise<UnzippedFile[]>;
}

export interface ExtractedVSIX {
  manifest: ExtensionManifest;
  files: Map<string, UnzippedFile>;
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<ArrayBuffer>;
}

export async function extractVSIX(vsix: ArrayBuffer, unzipper: VSIXUnzipper): Promise<ExtractedVSIX> {
  const files = await unzipper.unzip(vsix);
  const fileMap = new Map(files.map((file) => [normalizePath(file.path), file]));
  const manifestFile = fileMap.get("extension/package.json") ?? fileMap.get("package.json");

  if (!manifestFile) {
    throw new Error("VSIX is missing extension/package.json.");
  }

  const manifest = JSON.parse(await manifestFile.readText()) as ExtensionManifest;

  return {
    manifest,
    files: fileMap,
    readText: async (path: string) => {
      const file = fileMap.get(normalizePath(path));

      if (!file) {
        throw new Error(`VSIX file not found: ${path}`);
      }

      return file.readText();
    },
    readBytes: async (path: string) => {
      const file = fileMap.get(normalizePath(path));

      if (!file) {
        throw new Error(`VSIX file not found: ${path}`);
      }

      return file.readBytes();
    },
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}
