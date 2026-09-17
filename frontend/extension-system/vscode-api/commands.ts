import { CommandRegistry } from "../runtime/command-registry";
import { Disposable } from "./types";

export interface VSCodeCommandsApi {
  registerCommand(id: string, callback: (...args: unknown[]) => unknown): Disposable;
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
  getCommands(): Promise<string[]>;
}

export function createCommandsApi(commandRegistry: CommandRegistry): VSCodeCommandsApi {
  return {
    registerCommand: (id, callback) => commandRegistry.registerCommand(id, callback),
    executeCommand: (id, ...args) => commandRegistry.executeCommand(id, ...args),
    getCommands: async () => commandRegistry.listCommands().map((command) => command.id),
  };
}
