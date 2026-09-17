import { OutputChannelRegistry } from "../runtime/output-channel-registry";
import { OutputChannel } from "./types";

export interface WindowMessageSink {
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
}

export interface VSCodeWindowApi {
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
  createOutputChannel(name: string): OutputChannel;
}

export interface WindowApiOptions {
  messageSink?: Partial<WindowMessageSink>;
}

export function createWindowApi(
  outputChannels: OutputChannelRegistry,
  options: WindowApiOptions = {},
): VSCodeWindowApi {
  return {
    showInformationMessage: async (message, ...items) => {
      if (options.messageSink?.showInformationMessage) {
        return options.messageSink.showInformationMessage(message, ...items);
      }

      console.info("[Extension]", message);
      return items[0];
    },
    showErrorMessage: async (message, ...items) => {
      if (options.messageSink?.showErrorMessage) {
        return options.messageSink.showErrorMessage(message, ...items);
      }

      console.error("[Extension]", message);
      return items[0];
    },
    createOutputChannel: (name) => outputChannels.createOutputChannel(name),
  };
}
