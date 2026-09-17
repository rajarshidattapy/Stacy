SERVICE_PORT ?= 8000
SERVICE_IDLE_SEC ?= 900

.PHONY: install service service-llm single attach smoke

install:
	npm install

# Run service WITHOUT LLM (stub mode — exercises sandbox without API cost)
service:
	SERVICE_NO_LLM=1 SERVICE_PORT=$(SERVICE_PORT) SERVICE_IDLE_SEC=$(SERVICE_IDLE_SEC) bun src/index.ts

# Run service WITH deepagent (real Anthropic API calls)
service-llm:
	SERVICE_NO_LLM=0 SERVICE_PORT=$(SERVICE_PORT) SERVICE_IDLE_SEC=$(SERVICE_IDLE_SEC) bun src/index.ts

# Run single agent end-to-end (spawns sandbox, runs prompt, destroys)
single:
	bun src/run_single.ts

# Attach agent to EXISTING sandbox:  make attach SANDBOX=sb-xxxx [PROMPT="..."]
attach:
	@if [ -z "$(SANDBOX)" ]; then echo "usage: make attach SANDBOX=sb-xxxx [PROMPT='...']"; exit 1; fi
	bun src/run_single.ts --attach $(SANDBOX) $(if $(PROMPT),"$(PROMPT)",)

# Quick smoke: spawn sandbox, exec, destroy — no LLM
smoke:
	bun -e "import { Client } from 'forgevm'; const c = new Client({ baseUrl: process.env.FORGEVM_URL ?? 'http://localhost:7423' }); console.log(await c.health()); const s = await c.spawn({ image: 'stacyvm-evm:latest', ttl: '5m' }); console.log(s.id, (await s.exec('node --version && ls /workspace/app')).stdout); await s.destroy();"
