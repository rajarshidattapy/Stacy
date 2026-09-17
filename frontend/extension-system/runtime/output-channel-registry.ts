import { Disposable, OutputChannel } from "../vscode-api/types";

export interface OutputChannelEntry {
  name: string;
  lines: string[];
  visible: boolean;
}

export interface OutputChannelRegistryOptions {
  onDidAppendLine?: (channelName: string, text: string) => void;
  onDidShowChannel?: (channelName: string) => void;
}

export class OutputChannelRegistry {
  private readonly channels = new Map<string, OutputChannelEntry>();

  constructor(private readonly options: OutputChannelRegistryOptions = {}) {}

  createOutputChannel(name: string): OutputChannel {
    if (!name.trim()) {
      throw new Error("Output channel name is required.");
    }

    const entry = this.channels.get(name) ?? {
      name,
      lines: [],
      visible: false,
    };

    this.channels.set(name, entry);

    return {
      name,
      append: (text: string) => {
        const previous = entry.lines.pop() ?? "";
        entry.lines.push(`${previous}${text}`);
        this.options.onDidAppendLine?.(name, text);
      },
      appendLine: (text: string) => {
        entry.lines.push(text);
        this.options.onDidAppendLine?.(name, text);
      },
      clear: () => {
        entry.lines.length = 0;
      },
      show: () => {
        entry.visible = true;
        this.options.onDidShowChannel?.(name);
      },
      hide: () => {
        entry.visible = false;
      },
      dispose: () => {
        this.channels.delete(name);
      },
    };
  }

  getChannel(name: string): OutputChannelEntry | undefined {
    const entry = this.channels.get(name);

    if (!entry) {
      return undefined;
    }

    return {
      ...entry,
      lines: [...entry.lines],
    };
  }

  listChannels(): OutputChannelEntry[] {
    return Array.from(this.channels.values()).map((entry) => ({
      ...entry,
      lines: [...entry.lines],
    }));
  }

  disposeAll(): void {
    for (const channel of this.channels.values()) {
      channel.lines.length = 0;
    }

    this.channels.clear();
  }

  asDisposable(): Disposable {
    return new Disposable(() => this.disposeAll());
  }
}
