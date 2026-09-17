export type Thenable<T> = PromiseLike<T>;

export interface DisposableLike {
  dispose(): void;
}

export class Disposable implements DisposableLike {
  private isDisposed = false;

  constructor(private readonly callOnDispose: () => void = () => undefined) {}

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.callOnDispose();
  }

  static from(...disposables: DisposableLike[]): Disposable {
    return new Disposable(() => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    });
  }
}

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {
    if (line < 0 || character < 0) {
      throw new Error("Position values must be non-negative.");
    }
  }

  isBefore(other: Position): boolean {
    return this.line < other.line || (this.line === other.line && this.character < other.character);
  }

  isAfter(other: Position): boolean {
    return other.isBefore(this);
  }

  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }

  translate(lineDelta = 0, characterDelta = 0): Position {
    return new Position(this.line + lineDelta, this.character + characterDelta);
  }

  with(line = this.line, character = this.character): Position {
    return new Position(line, character);
  }
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(start: Position, end: Position);
  constructor(
    startOrStartLine: Position | number,
    endOrStartCharacter: Position | number,
    endLine?: number,
    endCharacter?: number,
  ) {
    const start =
      startOrStartLine instanceof Position
        ? startOrStartLine
        : new Position(startOrStartLine, endOrStartCharacter as number);
    const end =
      endOrStartCharacter instanceof Position
        ? endOrStartCharacter
        : new Position(endLine ?? start.line, endCharacter ?? start.character);

    if (end.isBefore(start)) {
      this.start = end;
      this.end = start;
      return;
    }

    this.start = start;
    this.end = end;
  }

  get isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }

  get isSingleLine(): boolean {
    return this.start.line === this.end.line;
  }

  contains(positionOrRange: Position | Range): boolean {
    if (positionOrRange instanceof Range) {
      return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
    }

    return !positionOrRange.isBefore(this.start) && !positionOrRange.isAfter(this.end);
  }
}

export class Uri {
  private constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query = "",
    public readonly fragment = "",
  ) {}

  get fsPath(): string {
    return this.scheme === "file" ? decodeURIComponent(this.path) : this.path;
  }

  static parse(value: string): Uri {
    const url = new URL(value);
    return new Uri(
      url.protocol.replace(":", ""),
      url.host,
      url.pathname,
      url.search.replace(/^\?/, ""),
      url.hash.replace(/^#/, ""),
    );
  }

  static file(path: string): Uri {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return new Uri("file", "", normalizedPath);
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const joined = [base.path.replace(/\/$/, ""), ...pathSegments].join("/");
    return new Uri(base.scheme, base.authority, joined.replace(/\/+/g, "/"), base.query, base.fragment);
  }

  toString(): string {
    const authority = this.authority ? `//${this.authority}` : "";
    const query = this.query ? `?${this.query}` : "";
    const fragment = this.fragment ? `#${this.fragment}` : "";
    return `${this.scheme}:${authority}${this.path}${query}${fragment}`;
  }
}

export interface WorkspaceFolder {
  uri: Uri;
  name: string;
  index: number;
}

export interface WorkspaceConfiguration {
  get<T = unknown>(section: string, defaultValue?: T): T | undefined;
  has(section: string): boolean;
  update(section: string, value: unknown): Promise<void>;
}

export type DocumentSelector = string | DocumentFilter | ReadonlyArray<string | DocumentFilter>;

export interface DocumentFilter {
  language?: string;
  scheme?: string;
  pattern?: string;
}

export interface TextDocument {
  uri: Uri;
  languageId: string;
  version: number;
  getText(range?: Range): string;
}

export interface CancellationToken {
  readonly isCancellationRequested: boolean;
}

export interface CompletionItem {
  label: string;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  filterText?: string;
}

export interface CompletionList {
  isIncomplete?: boolean;
  items: CompletionItem[];
}

export interface CompletionContext {
  triggerCharacter?: string;
}

export interface CompletionItemProvider {
  provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    context: CompletionContext,
  ): CompletionItem[] | CompletionList | undefined | Thenable<CompletionItem[] | CompletionList | undefined>;
}

export interface Hover {
  contents: string | string[];
  range?: Range;
}

export interface HoverProvider {
  provideHover(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
  ): Hover | undefined | Thenable<Hover | undefined>;
}

export interface Location {
  uri: Uri;
  range: Range;
}

export interface DefinitionProvider {
  provideDefinition(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
  ): Location | Location[] | undefined | Thenable<Location | Location[] | undefined>;
}

export type LanguageFeatureKind = "completion" | "hover" | "definition";

export interface OutputChannel extends DisposableLike {
  readonly name: string;
  append(value: string): void;
  appendLine(value: string): void;
  clear(): void;
  show(): void;
  hide(): void;
}

export interface Extension<T = unknown> {
  id: string;
  extensionUri: Uri;
  extensionPath: string;
  isActive: boolean;
  packageJSON: ExtensionManifest;
  exports?: T;
  activate(): Promise<T>;
}

export interface ExtensionManifest {
  name: string;
  publisher?: string;
  version?: string;
  displayName?: string;
  description?: string;
  main?: string;
  browser?: string;
  activationEvents?: string[];
  contributes?: Record<string, unknown>;
  engines?: Record<string, string>;
}

export interface ExtensionContext {
  subscriptions: DisposableLike[];
  extension: Extension;
  extensionUri: Uri;
  extensionPath: string;
  globalStorageUri: Uri;
  logUri: Uri;
  storageUri?: Uri;
  workspaceState: Memento;
  globalState: Memento;
  asAbsolutePath(relativePath: string): string;
}

export interface Memento {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
  keys(): readonly string[];
}
