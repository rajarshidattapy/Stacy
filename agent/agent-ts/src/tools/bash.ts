// Bash primitives — synchronous and streaming. Always return Results;
// streaming yields `{type, chunk}` events.
import { getSandbox } from "./stacyvmClient.ts";
import { fromThrowable, type Result } from "./result.ts";

export interface BashOpts {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: string;
}

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: string;
}

export async function bash(
  sandboxId: string,
  command: string,
  opts: BashOpts = {},
): Promise<Result<BashResult>> {
  return fromThrowable(async () => {
    const sb = await getSandbox(sandboxId);
    const res = await sb.exec(command, {
      workdir: opts.cwd,
      env: opts.env,
      timeout: opts.timeout,
    });
    return {
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
      exitCode: res.exit_code ?? 0,
      duration: res.duration ?? "",
    };
  }, "EXEC_FAILED");
}

export interface BashStreamChunk {
  type: "stdout" | "stderr";
  chunk: string;
}

export async function* bashStream(
  sandboxId: string,
  command: string,
  opts: BashOpts = {},
): AsyncGenerator<BashStreamChunk, void, void> {
  const sb = await getSandbox(sandboxId);
  for await (const chunk of sb.execStream(command, {
    workdir: opts.cwd,
    env: opts.env,
  })) {
    yield { type: chunk.stream, chunk: chunk.data };
  }
}
