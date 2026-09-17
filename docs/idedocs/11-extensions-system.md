# 11 — Extensions System (Deep Dive)

VS Code-style extension subsystem. Surfaces marketplace data, lets extensions activate against a `vscode` API shim, and treats Monaco themes as a special class of extensions for unified UX.

```
extension-system/
  vscode-api/         Shim for the `vscode` namespace
    index.ts          createVSCodeApi(opts) → { commands, window, workspace, languages, extensions, Uri, Position, Range, Disposable }
    commands.ts       VSCodeCommandsApi (registerCommand, executeCommand)
    languages.ts      VSCodeLanguagesApi (registerCompletionItemProvider, ...)
    window.ts         VSCodeWindowApi (showInformationMessage, createOutputChannel, ...)
    workspace.ts      VSCodeWorkspaceApi (workspaceFolders, fs, getConfiguration)
    types.ts          Disposable, Position, Range, Uri (classes), interfaces (TextDocument, ExtensionManifest, ExtensionContext, Memento, etc.)

  runtime/            In-memory registries shared between host and api shim
    command-registry.ts
    language-feature-registry.ts
    output-channel-registry.ts

  host/               Activation logic
    extension-host.ts        ExtensionHost class
    extension-context.ts     createExtensionContext / disposeExtensionContext / MemoryMemento
    activation-service.ts    ActivationService + shouldActivate(manifest, reason)

  registry/           Marketplace clients (read-only)
    vscode-marketplace-client.ts   POST extensionquery
    open-vsx-client.ts             GET /api/...

  installer/          Server-side install helpers
    download-extension.ts          fetch VSIX bytes
    extract-vsix.ts                Unzip via injected VSIXUnzipper
```

---

## 1. `vscode-api/types.ts` — value classes & interfaces

### `Disposable`
Tiny class with idempotent dispose:
```ts
class Disposable implements DisposableLike {
  private isDisposed = false;
  constructor(private readonly callOnDispose: () => void = () => undefined) {}
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.callOnDispose();
  }
  static from(...disposables: DisposableLike[]): Disposable {
    return new Disposable(() => disposables.forEach(d => d.dispose()));
  }
}
```

### `Position`
Immutable line/character pair. Methods: `isBefore`, `isAfter`, `isEqual`, `translate(lineDelta, characterDelta)`, `with(line, character)`. Throws on negative values.

### `Range`
Two `Position`s. Constructor overloaded: `(startLine, startChar, endLine, endChar)` or `(start: Position, end: Position)`. **Auto-normalizes** if end is before start (swaps).

### `Uri`
```ts
class Uri {
  private constructor(scheme, authority, path, query="", fragment="") {}
  get fsPath(): string { return scheme === "file" ? decodeURIComponent(path) : path; }
  static parse(value: string): Uri        // via new URL()
  static file(path: string): Uri          // ensures leading "/"
  static joinPath(base, ...segments): Uri // dedupes "/"
  toString(): string
}
```

### Interfaces
- `TextDocument { uri, languageId, version, getText(range?) }`
- `CancellationToken { isCancellationRequested }`
- `CompletionItem`, `CompletionList`, `CompletionContext { triggerCharacter? }`
- `CompletionItemProvider.provideCompletionItems(doc, pos, token, context)`
- `Hover { contents, range? }`, `HoverProvider`
- `Location { uri, range }`, `DefinitionProvider`
- `OutputChannel extends DisposableLike { name, append(value), appendLine(value), clear(), show(), hide() }`
- `Extension<T = unknown> { id, extensionUri, extensionPath, isActive, packageJSON: ExtensionManifest, exports?: T, activate(): Promise<T> }`
- `ExtensionManifest { name, publisher?, version?, displayName?, description?, main?, browser?, activationEvents?, contributes?, engines? }`
- `ExtensionContext { subscriptions, extension, extensionUri, extensionPath, globalStorageUri, logUri, storageUri?, workspaceState: Memento, globalState: Memento, asAbsolutePath(rel) }`
- `Memento { get<T>(key, default?), update(key, value), keys() }`

## 2. `runtime/command-registry.ts`

```ts
class CommandRegistry {
  private readonly commands = new Map<string, CommandHandler>();

  registerCommand(id, handler): Disposable {
    if (!id.trim()) throw new Error("Command id is required.");
    if (this.commands.has(id)) throw new Error(`Command already registered: ${id}`);
    this.commands.set(id, handler);
    return new Disposable(() => this.commands.delete(id));
  }

  async executeCommand<T>(id, ...args): Promise<T> {
    const cmd = this.commands.get(id);
    if (!cmd) throw new Error(`Command not found: ${id}`);
    return cmd(...args) as Promise<T>;
  }

  hasCommand(id), listCommands(), clear()
}
```

Strict registration: throws if id duplicated. Dispose removes it.

## 3. `runtime/language-feature-registry.ts`

Three Maps keyed by `${kind}:${nextRegistrationId++}`:
```ts
completions: Map<string, LanguageFeatureRegistration<CompletionItemProvider>>
hovers:      Map<string, LanguageFeatureRegistration<HoverProvider>>
definitions: Map<string, LanguageFeatureRegistration<DefinitionProvider>>

interface LanguageFeatureRegistration<P> {
  id, kind: "completion"|"hover"|"definition", selector, provider, triggerCharacters?
}
```

API:
```ts
registerCompletionItemProvider(selector, provider, triggerCharacters = []): Disposable
registerHoverProvider(selector, provider): Disposable
registerDefinitionProvider(selector, provider): Disposable
listCompletionProviders() / listHoverProviders() / listDefinitionProviders()
disposeAll()
```

These are **storage only** — to make Monaco actually consult them, glue code must iterate `listCompletionProviders()` and call `monaco.languages.registerCompletionItemProvider(language, { provideCompletionItems(model, pos, token, ctx) {...} })` with an adapter that converts `model` → `TextDocument`. That bridge is intentionally absent so the registries stay editor-agnostic.

## 4. `runtime/output-channel-registry.ts`

Stores named `OutputChannel`s for `vscode.window.createOutputChannel`. Each channel buffers `append`/`appendLine` calls. Display surface is the IDE — wire to `LogDock` if you want it visible.

## 5. `host/extension-context.ts`

```ts
class MemoryMemento implements Memento {
  private values = new Map<string, unknown>();
  get(key, default?) { return values.has(key) ? values.get(key) : default; }
  async update(key, value) { value === undefined ? values.delete(key) : values.set(key, value); }
  keys() { return [...values.keys()]; }
}

createExtensionContext({ extension, extensionUri, storageRoot?, logRoot? }) → ExtensionContext {
  subscriptions: [],
  extension, extensionUri, extensionPath: extensionUri.fsPath,
  globalStorageUri: Uri.joinPath(storageRoot, extension.id, "global"),
  logUri:           Uri.joinPath(logRoot,    extension.id),
  storageUri:       Uri.joinPath(storageRoot, extension.id, "workspace"),
  workspaceState: new MemoryMemento(),
  globalState:    new MemoryMemento(),
  asAbsolutePath: (rel) => Uri.joinPath(extensionUri, rel).fsPath,
}

disposeExtensionContext(ctx) {
  for (const sub of ctx.subscriptions) sub.dispose();
  ctx.subscriptions.length = 0;
}
```

`storageRoot`/`logRoot` default to `Uri.file("/extension-storage")` / `Uri.file("/extension-logs")` — virtual paths. Memento is in-memory only; survives until `deactivateExtension` dispose. To persist, replace `MemoryMemento` with one backed by `localStorage`/IndexedDB.

## 6. `host/extension-host.ts` — full lifecycle

```ts
class ExtensionHost {
  commandRegistry, outputChannelRegistry, languageFeatureRegistry, vscode

  private extensions = new Map<string, HostedExtension>()
  private contexts   = new Map<string, ExtensionContext>()
  private modules    = new Map<string, ExtensionModule>()

  constructor({ moduleLoader, ...registries, window?, workspace?, extensions? }) {
    this.{registries} = options.{registry} ?? new {Registry}();
    this.moduleLoader = options.moduleLoader;
    this.vscode = createVSCodeApi({ ...options, ...registries, extensions: { all: [], getExtension: id => this.extensions.get(id) } });
  }

  registerExtension({ id?, manifest, extensionUri, modulePath? }): HostedExtension {
    const id = init.id ?? getExtensionId(manifest);   // "publisher.name" or just "name"
    const extension = {
      id, manifest, packageJSON: manifest,
      extensionUri, extensionPath: extensionUri.fsPath,
      modulePath: init.modulePath ?? manifest.browser ?? manifest.main ?? "./extension.js",
      isActive: false,
      activate: () => this.activateExtension(id),
    };
    this.extensions.set(id, extension);
    this.refreshVSCodeExtensionsList();
    return extension;
  }

  async activateExtension(id) {
    const ext = this.extensions.get(id);
    if (!ext) throw `Extension not registered: ${id}`;
    if (ext.isActive) return ext.exports;

    const module  = await this.moduleLoader.load(ext, this.vscode);
    const context = createExtensionContext({ extension: ext, extensionUri: ext.extensionUri });

    this.contexts.set(id, context);
    this.modules.set(id, module);

    const exports = module.activate ? await module.activate(context) : undefined;
    ext.exports  = exports;
    ext.isActive = true;
    return exports;
  }

  async deactivateExtension(id) {
    const ext = this.extensions.get(id);
    if (!ext?.isActive) return;
    await this.modules.get(id)?.deactivate?.();
    const ctx = this.contexts.get(id);
    if (ctx) disposeExtensionContext(ctx);
    ext.isActive = false; ext.exports = undefined;
    this.modules.delete(id); this.contexts.delete(id);
  }

  async deactivateAll() { for (const e of this.extensions.values()) await this.deactivateExtension(e.id); }
}

function getExtensionId(manifest) { return manifest.publisher ? `${manifest.publisher}.${manifest.name}` : manifest.name; }
```

`refreshVSCodeExtensionsList()` (line 150) splices the api shim's `extensions.all` array in-place to keep references stable for any extension code that captured it.

### `createCommonJSModuleLoader`

Reads the extension's main script and evaluates it inside an isolated function scope built via the `Function` constructor (so it has its own `require`, `module`, `exports`):

```
runModule(require, module, exports)
  where require(id) =
     id === "vscode"   → this.vscode
     options.require   → delegate
     else              → throw
```

Source URL `//# sourceURL=${extension.id}/${modulePath}` ensures DevTools tags the script under the extension id when stepping through.

This loader works for plain JS extensions. Extensions that ship with bundled WebAssembly, native node-gyp modules, or that depend on real `fs` / `child_process` will fail at the require gate.

## 7. `host/activation-service.ts`

```ts
type ActivationReason =
  | { kind: "startup" }
  | { kind: "command";   command: string }
  | { kind: "language";  languageId: string }
  | { kind: "extension"; extensionId: string };

class ActivationService {
  constructor(private readonly extensionHost: ExtensionHost) {}

  async activateByReason(reason): Promise<HostedExtension[]> {
    const activated = [];
    for (const ext of this.extensionHost.listExtensions()) {
      if (!ext.isActive && shouldActivate(ext.manifest, reason)) {
        await this.extensionHost.activateExtension(ext.id);
        activated.push(ext);
      }
    }
    return activated;
  }

  activateStartupExtensions()         → activateByReason({ kind: "startup" })
  activateCommand(command)            → activateByReason({ kind: "command", command })
  activateLanguage(languageId)        → activateByReason({ kind: "language", languageId })
}

function shouldActivate(manifest, reason) {
  const events = manifest.activationEvents ?? [];
  if (events.includes("*")) return true;
  if (reason.kind === "startup")   return events.includes("onStartupFinished");
  if (reason.kind === "command")   return events.includes(`onCommand:${reason.command}`);
  if (reason.kind === "language")  return events.includes(`onLanguage:${reason.languageId}`);
  if (reason.kind === "extension") return events.includes(`onExtension:${reason.extensionId}`);
  return false;
}
```

Mirrors VS Code's activation event semantics: extensions opt into when they wake up via `package.json:activationEvents`.

## 8. `registry/vscode-marketplace-client.ts`

```ts
class VSCodeMarketplaceClient {
  baseUrl = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";

  async search(query, size=20): Promise<VSCodeExtension[]>
  async getFeatured(size=12)
  async getExtensionById(publisher, name)
  getAssetUrl(extension, assetType): string | undefined
  getIconUrl(extension): string | undefined  // assetType = "Microsoft.VisualStudio.Services.Icons.Default"
}
```

POST body shape (private `query(body)`):

```ts
{
  filters: [{
    criteria: [
      { filterType: 10, value: query },                   // search text (when searching)
      { filterType: 8,  value: "Microsoft.VisualStudio.Code" },
      { filterType: 12, value: "4096" },                  // exclude unlisted
    ],
    pageSize, pageNumber: 1,
    sortBy:    0 | 4,                                      // 0 = relevance, 4 = downloads
    sortOrder: 0,
  }],
  flags: 951,                                              // versions+properties+statistics+assets+categories
}
```

Headers: `Accept: application/json;api-version=3.0-preview.1`. Returns `data.results[0]?.extensions || []`.

### `VSCodeExtension` shape

```ts
{ publisher: { publisherName, displayName },
  extensionName, displayName, shortDescription,
  versions: [{ version, files: [{ assetType, source }], properties? }],
  statistics: [{ statisticName, value }],   // names: install, installCount, averagerating, ratingcount
  categories?, tags?, lastUpdated, publishedDate }
```

## 9. `registry/open-vsx-client.ts`

```ts
class OpenVSXClient {
  baseUrl = "https://open-vsx.org"   // configurable
  fetcher = fetch

  async getExtension(namespace, name, version="latest"): Promise<OpenVSXExtensionMetadata>
  async search({ query?, category?, size?, offset? }): Promise<OpenVSXSearchResult>
  getDownloadUrl(metadata): string   // throws if metadata.files.download missing
}
```

`OpenVSXExtensionMetadata.files`: `{ download?, icon?, manifest?, readme?, license?, namespaceAccess? }`. URLs may be relative (resolved via `${baseUrl}${path}`) or absolute.

## 10. `installer/extract-vsix.ts`

```ts
interface UnzippedFile { path; readText(): Promise<string>; readBytes(): Promise<ArrayBuffer> }
interface VSIXUnzipper { unzip(vsix: ArrayBuffer): Promise<UnzippedFile[]> }

async function extractVSIX(vsix, unzipper) {
  const files = await unzipper.unzip(vsix);
  const fileMap = new Map(files.map(f => [normalizePath(f.path), f]));
  const manifestFile = fileMap.get("extension/package.json") ?? fileMap.get("package.json");
  if (!manifestFile) throw new Error("VSIX is missing extension/package.json.");
  const manifest = JSON.parse(await manifestFile.readText());
  return { manifest, files: fileMap, readText, readBytes };
}

normalizePath(p) = p.replace(/\\/g, "/").replace(/^\/+/, "")
```

`unzipper` is **dependency-injected** — the IDE doesn't ship a zip lib in the vendor bundle. Server route can use `node:stream` + a zip library; client could use a wasm zipper.

## 11. API routes — `app/api/extensions/*`

### `GET /api/extensions` (`route.ts`)

`force-dynamic` (skip caching). Logic:

1. If `?query=...` present → `marketplaceClient.search(query, 25)` only.
2. Otherwise:
   - **Featured marketplace** — `getFeatured(12)`.
   - **Local extensions** — scan `components/ide/extensions/*` directories. For each:
     - Read `package.json` and `package.nls.json` (NLS = National Language Support; resolves `%key%` placeholders in `displayName`/`description`).
     - Build `ExtensionListItem` with `id = publisher.name`, `iconUrl = getLocalPackageIconUrl(folder, pkg)`, categories from `pkg.categories` or derived from `pkg.contributes` (`languages` → "Programming Languages", `grammars` → "Syntax", `snippets` → "Snippets", `themes` → "Themes").
   - **Monaco themes as extensions** — read `lib/monacoThemes/themelist.json`. For each `[id, name]`:
     - Read `lib/monacoThemes/${name}.json`.
     - Generate SVG icon via `createMonacoThemeIcon(name, theme)` — paints a 64×64 SVG mock-editor preview using the theme's actual colors (`editor.background`, `editor.foreground`, `editor.selectionBackground`, plus token colors for `keyword`/`string`/`comment`/`entity.name.function`). Returns `data:image/svg+xml;utf8,...`.
     - Build `ExtensionListItem { type: "theme", source: "local", monacoThemeId: id, iconBackground }`.

3. Concatenate and return: `[...marketplace, ...local, ...themes]`.

`toMarketplaceListItem(extension, client)`:
- Pulls statistics: `install`/`installCount` → `downloads`, `averagerating` → `rating`, `ratingcount` → `reviewCount`.
- Picks first version's version string.
- Type is `"theme"` if any category contains "theme" (case-insensitive), else `"extension"`.
- `iconUrl = client.getIconUrl(extension)`.

`getExtensionPresentation({ id, name, type, iconUrl?, iconBackground? })` (in `extension-utils.ts`) builds default `iconText` (initials) and `iconColor` for cards lacking an icon.

### `GET /api/extensions/detail`

Returns extended detail (README HTML, changelog, version list, asset URLs) for the marketplace extension detail page rendered by `ExtensionDetailView`.

### `GET /api/extensions/assets/[folder]`

Proxies asset (icon, image) requests for local extensions out of the project's `components/ide/extensions/<folder>/` subtree.

### `GET /api/extensions/monaco-theme`

Returns the parsed JSON theme definition consumed by `loadMonacoThemeData(name)` in `lib/monacoTheme.ts`.

## 12. `ExtensionsPanel.tsx` — sidebar UI

```ts
interface IDEExtension {
  id, name, description, author, version,
  type: "extension" | "theme",
  source: "local" | "open-vsx" | "marketplace",
  iconUrl?, downloadUrl?, namespace?, extensionName?,
  downloads?, rating?, reviewCount?, categories?, tags?,
  publishedAt?, lastUpdated?, repositoryUrl?, licenseUrl?, marketplaceUrl?,
  readme?, features?, monacoThemeId?,
  iconColor?, iconBackground?, iconText?,
  installed?
}

const INSTALLED_EXTENSIONS_STORAGE_KEY = "stacy.installed-extension-ids"
```

State:
```ts
extensions      IDEExtension[]
isLoading       boolean
installedIds    Set<string>      // hydrated from localStorage
showOnlyInstalled, searchQuery, error
```

On mount: `fetch("/api/extensions")`. On query change: debounce → `fetch("/api/extensions?query=" + encodeURIComponent(q))`.

Card click → `onSelectExtension(ext)` → `IdeWorkspace` sets `selectedExtension` → `ExtensionDetailView` replaces editor.

For Monaco theme cards, "Set Color Theme" button:
```ts
setStoredMonacoTheme(monacoThemeId);
window.dispatchEvent(new CustomEvent(MONACO_THEME_CHANGE_EVENT, { detail: { theme: monacoThemeId } }));
```

`IdeWorkspace`'s listener (line 339-355) re-renders Monaco with the new theme.

`formatDownloads(n)` (line 48): `1_000_000+ → "1.2M"`, `1_000+ → "12K"`, else raw.

## 13. `ExtensionDetailView.tsx`

A 21k file rendering a marketplace-style detail page: hero (icon, name, publisher, install count, rating, install button), tabs (README, Changelog, Reviews, Resources), "More info" sidebar with version, last updated, dates, repository/license/marketplace links. Pulls from `/api/extensions/detail?ns=…&name=…`.

## 14. Where junior dev typically extends

| Goal                                              | Touch                                               |
|---------------------------------------------------|-----------------------------------------------------|
| Wire activation registries to Monaco              | New module that consumes `LanguageFeatureRegistry.listCompletionProviders()` → `monaco.languages.registerCompletionItemProvider`. Adapter for `TextDocument` from a Monaco `model`. |
| Persist Memento across page reloads               | Replace `MemoryMemento` with a `LocalStorageMemento` keyed by `${extensionId}:${kind}:${key}`. |
| Add a new local extension                         | Create folder under `components/ide/extensions/<your-folder>/`, drop `package.json` (+ optional `package.nls.json`). `/api/extensions` will discover automatically. |
| Add a new Monaco theme                            | Drop `lib/monacoThemes/<name>.json`, register in `lib/monacoThemes/themelist.json`. |
| Add support for installing marketplace extensions | Wire VSIX download (`installer/download-extension.ts`) → `extract-vsix.ts` (provide a `VSIXUnzipper`) → in-memory module store → `ExtensionHost.registerExtension`. |
| Add hover/definition glue to Monaco               | Same pattern as completions: read registries, register Monaco-side providers that delegate. |
