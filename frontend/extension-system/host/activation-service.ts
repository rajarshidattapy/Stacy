import { ExtensionManifest } from "../vscode-api/types";
import { ExtensionHost, HostedExtension } from "./extension-host";

export type ActivationReason =
  | { kind: "startup" }
  | { kind: "command"; command: string }
  | { kind: "language"; languageId: string }
  | { kind: "extension"; extensionId: string };

export class ActivationService {
  constructor(private readonly extensionHost: ExtensionHost) {}

  async activateByReason(reason: ActivationReason): Promise<HostedExtension[]> {
    const activated: HostedExtension[] = [];

    for (const extension of this.extensionHost.listExtensions()) {
      if (!extension.isActive && shouldActivate(extension.manifest, reason)) {
        await this.extensionHost.activateExtension(extension.id);
        activated.push(extension);
      }
    }

    return activated;
  }

  activateStartupExtensions(): Promise<HostedExtension[]> {
    return this.activateByReason({ kind: "startup" });
  }

  activateCommand(command: string): Promise<HostedExtension[]> {
    return this.activateByReason({ kind: "command", command });
  }

  activateLanguage(languageId: string): Promise<HostedExtension[]> {
    return this.activateByReason({ kind: "language", languageId });
  }
}

export function shouldActivate(manifest: ExtensionManifest, reason: ActivationReason): boolean {
  const activationEvents = manifest.activationEvents ?? [];

  if (activationEvents.includes("*")) {
    return true;
  }

  if (reason.kind === "startup") {
    return activationEvents.includes("onStartupFinished");
  }

  if (reason.kind === "command") {
    return activationEvents.includes(`onCommand:${reason.command}`);
  }

  if (reason.kind === "language") {
    return activationEvents.includes(`onLanguage:${reason.languageId}`);
  }

  if (reason.kind === "extension") {
    return activationEvents.includes(`onExtension:${reason.extensionId}`);
  }

  return false;
}
