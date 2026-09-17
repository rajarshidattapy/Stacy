import { CommandRegistry } from "../runtime/command-registry";
import { LanguageFeatureRegistry } from "../runtime/language-feature-registry";
import { OutputChannelRegistry } from "../runtime/output-channel-registry";
import { createVSCodeApi, VSCodeApi, VSCodeApiOptions } from "../vscode-api";
import {
  Extension,
  ExtensionContext,
  ExtensionManifest,
  Uri,
} from "../vscode-api/types";
import { createExtensionContext, disposeExtensionContext } from "./extension-context";

export interface ExtensionModule {
  activate?: (context: ExtensionContext) => unknown | Promise<unknown>;
  deactivate?: () => unknown | Promise<unknown>;
}

export interface ExtensionModuleLoader {
  load(extension: HostedExtension, vscode: VSCodeApi): Promise<ExtensionModule>;
}

export interface CommonJSModuleLoaderOptions {
  readModule(extension: HostedExtension, modulePath: string): Promise<string>;
  require?: (moduleId: string, extension: HostedExtension) => unknown;
}

export interface HostedExtensionInit {
  id?: string;
  manifest: ExtensionManifest;
  extensionUri: Uri;
  modulePath?: string;
}

export interface HostedExtension extends Extension {
  manifest: ExtensionManifest;
  modulePath: string;
}

export interface ExtensionHostOptions extends VSCodeApiOptions {
  moduleLoader: ExtensionModuleLoader;
}

export class ExtensionHost {
  readonly commandRegistry: CommandRegistry;
  readonly outputChannelRegistry: OutputChannelRegistry;
  readonly languageFeatureRegistry: LanguageFeatureRegistry;
  readonly vscode: VSCodeApi;

  private readonly moduleLoader: ExtensionModuleLoader;
  private readonly extensions = new Map<string, HostedExtension>();
  private readonly contexts = new Map<string, ExtensionContext>();
  private readonly modules = new Map<string, ExtensionModule>();

  constructor(options: ExtensionHostOptions) {
    this.commandRegistry = options.commandRegistry ?? new CommandRegistry();
    this.outputChannelRegistry = options.outputChannelRegistry ?? new OutputChannelRegistry();
    this.languageFeatureRegistry = options.languageFeatureRegistry ?? new LanguageFeatureRegistry();
    this.moduleLoader = options.moduleLoader;
    this.vscode = createVSCodeApi({
      ...options,
      commandRegistry: this.commandRegistry,
      outputChannelRegistry: this.outputChannelRegistry,
      languageFeatureRegistry: this.languageFeatureRegistry,
      extensions: {
        all: [],
        getExtension: (id) => this.extensions.get(id),
      },
    });
  }

  registerExtension(init: HostedExtensionInit): HostedExtension {
    const id = init.id ?? getExtensionId(init.manifest);
    const extension: HostedExtension = {
      id,
      manifest: init.manifest,
      packageJSON: init.manifest,
      extensionUri: init.extensionUri,
      extensionPath: init.extensionUri.fsPath,
      modulePath: init.modulePath ?? init.manifest.browser ?? init.manifest.main ?? "./extension.js",
      isActive: false,
      activate: () => this.activateExtension(id),
    };

    this.extensions.set(id, extension);
    this.refreshVSCodeExtensionsList();
    return extension;
  }

  getExtension(id: string): HostedExtension | undefined {
    return this.extensions.get(id);
  }

  listExtensions(): HostedExtension[] {
    return Array.from(this.extensions.values());
  }

  async activateExtension<T = unknown>(id: string): Promise<T> {
    const extension = this.extensions.get(id);

    if (!extension) {
      throw new Error(`Extension not registered: ${id}`);
    }

    if (extension.isActive) {
      return extension.exports as T;
    }

    const module = await this.moduleLoader.load(extension, this.vscode);
    const context = createExtensionContext({
      extension,
      extensionUri: extension.extensionUri,
    });

    this.contexts.set(id, context);
    this.modules.set(id, module);

    const exports = module.activate ? await module.activate(context) : undefined;
    extension.exports = exports;
    extension.isActive = true;

    return exports as T;
  }

  async deactivateExtension(id: string): Promise<void> {
    const extension = this.extensions.get(id);

    if (!extension?.isActive) {
      return;
    }

    await this.modules.get(id)?.deactivate?.();

    const context = this.contexts.get(id);
    if (context) {
      disposeExtensionContext(context);
    }

    extension.isActive = false;
    extension.exports = undefined;
    this.modules.delete(id);
    this.contexts.delete(id);
  }

  async deactivateAll(): Promise<void> {
    for (const extension of this.extensions.values()) {
      await this.deactivateExtension(extension.id);
    }
  }

  private refreshVSCodeExtensionsList(): void {
    this.vscode.extensions.all.splice?.(0);
    this.vscode.extensions.all.push?.(...this.listExtensions());
  }
}

export function getExtensionId(manifest: ExtensionManifest): string {
  return manifest.publisher ? `${manifest.publisher}.${manifest.name}` : manifest.name;
}

export function createCommonJSModuleLoader(options: CommonJSModuleLoaderOptions): ExtensionModuleLoader {
  return {
    load: async (extension, vscode) => {
      const code = await options.readModule(extension, extension.modulePath);
      const module = { exports: {} as ExtensionModule };
      const exports = module.exports;
      const require = (moduleId: string) => {
        if (moduleId === "vscode") {
          return vscode;
        }

        if (options.require) {
          return options.require(moduleId, extension);
        }

        throw new Error(`Extension ${extension.id} tried to require unsupported module: ${moduleId}`);
      };

      const runModule = new Function(
        "require",
        "module",
        "exports",
        `"use strict";\n${code}\n//# sourceURL=${extension.id}/${extension.modulePath}`,
      ) as (require: (moduleId: string) => unknown, module: { exports: ExtensionModule }, exports: ExtensionModule) => void;

      runModule(require, module, exports);
      return module.exports;
    },
  };
}
