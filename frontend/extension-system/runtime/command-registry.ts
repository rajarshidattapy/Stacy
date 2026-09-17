import { Disposable } from "../vscode-api/types";

export type CommandHandler<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  ...args: TArgs
) => TResult | Promise<TResult>;

export interface RegisteredCommand {
  id: string;
  handler: CommandHandler;
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandHandler>();

  registerCommand(id: string, handler: CommandHandler): Disposable {
    if (!id.trim()) {
      throw new Error("Command id is required.");
    }

    if (this.commands.has(id)) {
      throw new Error(`Command already registered: ${id}`);
    }

    this.commands.set(id, handler);

    return new Disposable(() => {
      this.commands.delete(id);
    });
  }

  async executeCommand<TResult = unknown>(id: string, ...args: unknown[]): Promise<TResult> {
    const command = this.commands.get(id);

    if (!command) {
      throw new Error(`Command not found: ${id}`);
    }

    return command(...args) as Promise<TResult>;
  }

  hasCommand(id: string): boolean {
    return this.commands.has(id);
  }

  listCommands(): RegisteredCommand[] {
    return Array.from(this.commands.entries()).map(([id, handler]) => ({
      id,
      handler,
    }));
  }

  clear(): void {
    this.commands.clear();
  }
}
