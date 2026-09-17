// Pretty terminal printer for AgentEvents. Used by the test harness CLI.
// Indents subagent events one level deeper.
import type { AgentEvent } from "./events.ts";

const R = "\x1b[0m";
const B = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const GREY = "\x1b[90m";
const MAGENTA = "\x1b[35m";
const RED = "\x1b[31m";

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

function truncate(s: string, max = 1500): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `${GREY}… [${s.length - max} chars]${R}`;
}

export interface PrinterOpts {
  indent?: number;
}

export function printEvent(ev: AgentEvent, opts: PrinterOpts = {}): void {
  const pad = "  ".repeat(opts.indent ?? 0);
  const t = `${GREY}[${ts()}]${R}`;

  switch (ev.type) {
    case "agent_started":
      console.log(`\n${pad}${BLUE}══════════════════════════════════════════════════════${R}`);
      console.log(`${pad}${B}${BLUE}${t} agent=${ev.agent} thread=${ev.threadId} run=${ev.runId}${R}`);
      console.log(`${pad}${BLUE}══════════════════════════════════════════════════════${R}`);
      break;
    case "thinking_started":
      console.log(`\n${pad}${GREY}── thinking · ${ev.profile ?? "?"} · ${ev.modelName ?? "?"} ──${R}`);
      break;
    case "thinking_chunk":
      process.stdout.write(`${DIM}${ev.text}${R}`);
      break;
    case "thinking_ended":
      if (ev.tokensIn || ev.tokensOut) {
        console.log(`${pad}${GREY}  (in=${ev.tokensIn ?? 0} out=${ev.tokensOut ?? 0})${R}`);
      }
      break;
    case "tool_call_started":
      console.log(`\n${pad}${YELLOW}${t} CALL → ${B}${ev.tool}${R}${YELLOW} ${truncate(JSON.stringify(ev.args), 400)}${R}`);
      break;
    case "tool_call_ended": {
      const color = ev.ok ? GREEN : RED;
      const result = typeof ev.result === "string" ? ev.result : JSON.stringify(ev.result);
      console.log(`${pad}${color}${t} ← ${ev.tool} ${ev.ok ? "ok" : "ERR"}${R}`);
      console.log(`${pad}${DIM}${truncate(result, 1200)}${R}`);
      break;
    }
    case "todo_updated":
      console.log(`\n${pad}${CYAN}${t} todos: ${ev.todos.length} items${R}`);
      break;
    case "subagent_spawned":
      console.log(`\n${pad}${MAGENTA}${t} ⤷ subagent ${B}${ev.subagentName}${R}${MAGENTA}: ${truncate(ev.taskDescription, 200)}${R}`);
      break;
    case "subagent_event":
      printEvent(ev.innerEvent, { indent: (opts.indent ?? 0) + 1 });
      break;
    case "subagent_returned":
      console.log(`${pad}${MAGENTA}${t} ⤶ subagent returned${R}`);
      console.log(`${pad}${DIM}${truncate(JSON.stringify(ev.summary), 800)}${R}`);
      break;
    case "agent_message":
      console.log(`\n${pad}${B}${CYAN}${t} agent:${R} ${ev.text}`);
      break;
    case "phase_complete":
      console.log(`\n${pad}${B}${BLUE}${t} ✓ phase complete: ${ev.phase}${R}`);
      console.log(`${pad}${DIM}${truncate(JSON.stringify(ev.summary), 800)}${R}`);
      break;
    case "awaiting_user_input":
      console.log(`\n${pad}${B}${YELLOW}${t} ⏸  awaiting user input (${ev.reason})${R}`);
      break;
    case "error":
      console.log(`\n${pad}${RED}${t} ERROR @ ${ev.where}: ${ev.message}${R}`);
      if (ev.stack) console.log(`${pad}${DIM}${ev.stack}${R}`);
      break;
    case "agent_ended":
      console.log(`\n${pad}${BLUE}══════════════════════════════════════════════════════${R}`);
      console.log(`${pad}${B}${BLUE}${t} done · status=${ev.status} · tokens=${ev.totalTokens ?? 0} · ${ev.ms ?? 0}ms${R}`);
      console.log(`${pad}${BLUE}══════════════════════════════════════════════════════${R}`);
      break;
  }
}
