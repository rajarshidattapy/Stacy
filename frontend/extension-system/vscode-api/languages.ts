import { LanguageFeatureRegistry } from "../runtime/language-feature-registry";
import {
  CompletionItemProvider,
  DefinitionProvider,
  Disposable,
  DocumentSelector,
  HoverProvider,
} from "./types";

export interface VSCodeLanguagesApi {
  registerCompletionItemProvider(
    selector: DocumentSelector,
    provider: CompletionItemProvider,
    ...triggerCharacters: string[]
  ): Disposable;
  registerHoverProvider(selector: DocumentSelector, provider: HoverProvider): Disposable;
  registerDefinitionProvider(selector: DocumentSelector, provider: DefinitionProvider): Disposable;
}

export function createLanguagesApi(languageFeatures: LanguageFeatureRegistry): VSCodeLanguagesApi {
  return {
    registerCompletionItemProvider: (selector, provider, ...triggerCharacters) =>
      languageFeatures.registerCompletionItemProvider(selector, provider, triggerCharacters),
    registerHoverProvider: (selector, provider) => languageFeatures.registerHoverProvider(selector, provider),
    registerDefinitionProvider: (selector, provider) =>
      languageFeatures.registerDefinitionProvider(selector, provider),
  };
}
