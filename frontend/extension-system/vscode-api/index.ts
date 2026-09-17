import { CommandRegistry } from "../runtime/command-registry";
import { LanguageFeatureRegistry } from "../runtime/language-feature-registry";
import { OutputChannelRegistry } from "../runtime/output-channel-registry";
import { createCommandsApi, VSCodeCommandsApi } from "./commands";
import { createLanguagesApi, VSCodeLanguagesApi } from "./languages";
import { createWindowApi, VSCodeWindowApi, WindowApiOptions } from "./window";
import { createWorkspaceApi, VSCodeWorkspaceApi, WorkspaceApiOptions } from "./workspace";
import { Disposable, Position, Range, Uri } from "./types";

export * from "./commands";
export * from "./languages";
export * from "./types";
export * from "./window";
export * from "./workspace";

export interface VSCodeApi {
  commands: VSCodeCommandsApi;
  window: VSCodeWindowApi;
  workspace: VSCodeWorkspaceApi;
  languages: VSCodeLanguagesApi;
  extensions: {
    all: unknown[];
    getExtension<T = unknown>(id: string): unknown | undefined;
  };
  Uri: typeof Uri;
  Position: typeof Position;
  Range: typeof Range;
  Disposable: typeof Disposable;
}

export interface VSCodeApiOptions {
  commandRegistry?: CommandRegistry;
  outputChannelRegistry?: OutputChannelRegistry;
  languageFeatureRegistry?: LanguageFeatureRegistry;
  workspace?: WorkspaceApiOptions;
  window?: WindowApiOptions;
  extensions?: {
    all?: unknown[];
    getExtension?: <T = unknown>(id: string) => unknown | undefined;
  };
}

export function createVSCodeApi(options: VSCodeApiOptions = {}): VSCodeApi {
  const commandRegistry = options.commandRegistry ?? new CommandRegistry();
  const outputChannelRegistry = options.outputChannelRegistry ?? new OutputChannelRegistry();
  const languageFeatureRegistry = options.languageFeatureRegistry ?? new LanguageFeatureRegistry();

  return {
    commands: createCommandsApi(commandRegistry),
    window: createWindowApi(outputChannelRegistry, options.window),
    workspace: createWorkspaceApi(options.workspace),
    languages: createLanguagesApi(languageFeatureRegistry),
    extensions: {
      all: options.extensions?.all ?? [],
      getExtension: (id) => options.extensions?.getExtension?.(id),
    },
    Uri,
    Position,
    Range,
    Disposable,
  };
}
