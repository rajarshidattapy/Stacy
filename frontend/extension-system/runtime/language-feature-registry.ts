import {
  CompletionItemProvider,
  DefinitionProvider,
  Disposable,
  DocumentSelector,
  HoverProvider,
  LanguageFeatureKind,
} from "../vscode-api/types";

export interface LanguageFeatureRegistration<TProvider> {
  id: string;
  kind: LanguageFeatureKind;
  selector: DocumentSelector;
  provider: TProvider;
  triggerCharacters?: string[];
}

export class LanguageFeatureRegistry {
  private readonly completions = new Map<string, LanguageFeatureRegistration<CompletionItemProvider>>();
  private readonly hovers = new Map<string, LanguageFeatureRegistration<HoverProvider>>();
  private readonly definitions = new Map<string, LanguageFeatureRegistration<DefinitionProvider>>();
  private nextRegistrationId = 0;

  registerCompletionItemProvider(
    selector: DocumentSelector,
    provider: CompletionItemProvider,
    triggerCharacters: string[] = [],
  ): Disposable {
    return this.register(this.completions, "completion", selector, provider, triggerCharacters);
  }

  registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable {
    return this.register(this.hovers, "hover", selector, provider);
  }

  registerDefinitionProvider(selector: DocumentSelector, provider: DefinitionProvider): Disposable {
    return this.register(this.definitions, "definition", selector, provider);
  }

  listCompletionProviders(): LanguageFeatureRegistration<CompletionItemProvider>[] {
    return Array.from(this.completions.values());
  }

  listHoverProviders(): LanguageFeatureRegistration<HoverProvider>[] {
    return Array.from(this.hovers.values());
  }

  listDefinitionProviders(): LanguageFeatureRegistration<DefinitionProvider>[] {
    return Array.from(this.definitions.values());
  }

  disposeAll(): void {
    this.completions.clear();
    this.hovers.clear();
    this.definitions.clear();
  }

  private register<TProvider>(
    target: Map<string, LanguageFeatureRegistration<TProvider>>,
    kind: LanguageFeatureKind,
    selector: DocumentSelector,
    provider: TProvider,
    triggerCharacters?: string[],
  ): Disposable {
    const id = `${kind}:${this.nextRegistrationId++}`;
    target.set(id, {
      id,
      kind,
      selector,
      provider,
      triggerCharacters,
    });

    return new Disposable(() => {
      target.delete(id);
    });
  }
}
