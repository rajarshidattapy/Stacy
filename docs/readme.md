<p align="center">
  <img src="../stacyvm/assets/stacy-logo-dark.png" alt="Stacy" width="320" />
</p>

<h3 align="center">From PRD to deployed dApp, with agents doing the typing.</h3>

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
├── agent/      TypeScript agents (deepagents + LangGraph + Postgres memory) and skills
├── stacyvm/    Self-hosted sandboxes for running agent code (Docker, gVisor, Firecracker)
└── docs/       PRDs, design notes, IDE deep-dives
```

## ✦ Quick start

```bash
# 1. Start the sandbox server (http://localhost:7423)
npx stacyvm-setup@latest

# 2. Set up the agents
cd agent/agent-ts
cp .env.example .env        # add ANTHROPIC_API_KEY, DATABASE_URL, ...
bun install && bun run db:migrate

# 3. Talk to an agent
bun run harness --agent planner --no-sandbox --new-thread

# 4. Run the IDE
cd ../../frontend && bun install && bun dev
```

## ✦ Learn more

- [`AGENT_SYSTEM_PRD.md`](AGENT_SYSTEM_PRD.md): the agent architecture
- [`idedocs/`](idedocs/README.md): how the IDE is built
- [`run-commands.md`](run-commands.md): harness commands for each agent
- [`../stacyvm/README.md`](../stacyvm/README.md): the sandbox runtime

<p align="center"><sub>Built with ☕, Claude, and a lot of <code>forge build</code>.</sub></p>
