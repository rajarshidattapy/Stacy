// Canonical Result shape for all LLM-callable tools.
//
// Tools must NEVER throw — they always return a Result so the LLM sees the
// failure as a structured tool result instead of a runtime error that aborts
// the run.
export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: string; code?: string };
export type Result<T> = Ok<T> | Err;

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

export function err(error: string, code?: string): Err {
  return { ok: false, error, code };
}

export function fromThrowable<T>(fn: () => Promise<T>, code?: string): Promise<Result<T>> {
  return fn().then(
    (data) => ok(data),
    (e: unknown) => err(e instanceof Error ? e.message : String(e), code),
  );
}
