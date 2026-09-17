One-time setup (already done on this machine: .env exists, Postgres is running and migrated):
cd R:\Projects\stacy
docker compose up -d postgres        # Postgres on :5432
cd agent\agent-ts
npx bun install
npx bun run db:migrate
Then open agent\agent-ts\.env and set one key:
OPENAI_API_KEY=sk-...        # or ANTHROPIC_API_KEY=sk-ant-...
Bun isn't installed on this machine, so these commands use npx bun. If you install Bun, you can drop the npx.

Start the server (port 8787, used by the IDE):
cd R:\Projects\stacy\agent\agent-ts
npx bun run server        # or: npx bun run dev   (restarts when files change)
To check it, open http://localhost:8787/health. You want "ok": true, "database": true, "stacyvm": true and a provider under model.

StacyVM (port 7423) must be running for the sandbox agents: smart-contract, frontend, integration, orchestrator and audit. It isn't installed globally on this machine. Either use the binary I built during testing:
& "C:\Users\asus\AppData\Local\Temp\claude\R--Projects-stacy\e3cf8091-a8cd-4455-bdc6-fe09ebf2a66d\scratchpad\stacyvm.exe" serve
or install it properly with npm run setup from the repo root. The setup script runs npx stacyvm-setup@latest --dir .stacyvm.

Other ways to run:
- Everything at once: from the repo root, npm run dev starts StacyVM (if installed), the agent server and the IDE.
- Terminal only, no IDE:
npx bun run harness --agent planner --no-sandbox --new-thread
npx bun run harness --agent smart-contract --new-sandbox --new-thread   # needs StacyVM