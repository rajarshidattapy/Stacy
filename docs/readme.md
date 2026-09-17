
<h3 align="center">Stacy</h3>

<p align="center">
  An AI-assisted smart contract IDE. Describe your project, approve the plan, then watch specialist agents write, test, deploy, and wire it up inside isolated sandboxes.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=nextdotjs" alt="Next.js"/>
  <img src="https://img.shields.io/badge/LangGraph-deepagents-1C3C3C?style=flat-square" alt="LangGraph"/>
  <img src="https://img.shields.io/badge/Claude-Anthropic-D97757?style=flat-square&logo=anthropic&logoColor=white" alt="Claude"/>
  <img src="https://img.shields.io/badge/Foundry-Solidity-363636?style=flat-square&logo=solidity" alt="Foundry"/>
  <img src="https://img.shields.io/badge/runtime-Bun-fbf0df?style=flat-square&logo=bun&logoColor=black" alt="Bun"/>
</p>

---

## ✦ How it works

```
  you ──▶ 🧭 Planner ──▶ PRD.md ──▶ 🎼 Orchestrator
                                         │
               ┌─────────────────────────┼─────────────────────────┐
               ▼                         ▼                         ▼
        📜 Smart Contract          🎨 Frontend              🔌 Integration
        write · test · deploy      Next.js · Tailwind       wagmi · viem
               └─────────────────────────┼─────────────────────────┘
                                         ▼
                             📦 StacyVM sandbox  ·  🛡️ Audit
```

| Agent | What it does |
|---|---|
| **Planner** | Talks the idea through with you and writes `PRD.md` |
| **Orchestrator** | Splits the PRD into phases and hands each task to a specialist |
| **Smart Contract** | Writes, tests, and deploys Solidity with Foundry |
| **Frontend** | Builds the React/Next.js UI |
| **Integration** | Connects the UI to the deployed contracts with wagmi + viem |
| **Audit** | Reads the contracts only and writes `audit-report.md` |

## ✦ Repo layout

```
stacy/
├── frontend/   Next.js IDE: Monaco editor, file tree, chat, terminal
├── agent/      TypeScript agents (deepagents + LangGraph + Postgres memory), skills, HTTP/SSE server
├── scripts/    setup + dev runners for the whole stack
└── docs/       PRDs, design notes, IDE deep-dives
```

```
  IDE :3000  ──HTTP/SSE──▶  agent server :8787  ──SDK──▶  StacyVM :7423  ──▶  sandbox (stacy-evm)
                                   │
                                   └──▶ Postgres :5432 (threads, checkpoints)
```

## ✦ Quick start

Needs Node 18+, Docker running, and an Anthropic API key. Bun is optional; the scripts fall back to `npx bun`.

```bash
npm run setup   # Postgres, StacyVM (npx stacyvm-setup@latest), sandbox image, deps, DB schema
                # then put ANTHROPIC_API_KEY in agent/agent-ts/.env
npm run dev     # StacyVM + agent server + IDE → http://localhost:3000
```

In the IDE, click **Start Sandbox**, pick an agent in the chat bar (**Auto** begins with the planner), and chat. Files the agents write show up in the editor when each run ends.

> Don't run `npx stacyvm-setup@latest` by hand from the repo root. It would treat the local `stacyvm/` reference copy as its own clone and `git reset --hard` it. `npm run setup` passes `--dir .stacyvm` to avoid that.

The CLI harness still works without the IDE: `cd agent/agent-ts && bun run harness --agent planner --no-sandbox --new-thread`.

## ✦ Learn more

- [`AGENT_SYSTEM_PRD.md`](AGENT_SYSTEM_PRD.md): the agent architecture
- [`idedocs/`](idedocs/README.md): how the IDE is built
- [`run-commands.md`](run-commands.md): harness commands for each agent
- [`../stacyvm/README.md`](../stacyvm/README.md): the sandbox runtime

<p align="center"><sub>Built with ☕, Claude, and a lot of <code>forge build</code>.</sub></p>
