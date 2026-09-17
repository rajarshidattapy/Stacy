# Build context = repo root (jaishreeram/) so we can pull sibling forgevm SDK
# Build:  docker buildx build --platform linux/arm64 -f agent-ts/Dockerfile -t agent-ts:latest .
FROM oven/bun:1-slim

WORKDIR /app

# Vendor sibling forgevm SDK (already built to dist/)
COPY orchestrator/sdk/js /vendor/forgevm

# Agent sources (skip bun.lock — version may mismatch image's bun)
COPY agent-ts/package.json agent-ts/tsconfig.json ./
COPY agent-ts/src ./src

# Rewrite forgevm path-dep to vendored copy, install
RUN sed -i 's|"forgevm": "file:../orchestrator/sdk/js"|"forgevm": "file:/vendor/forgevm"|' package.json \
 && bun install --production --no-save

ENV SERVICE_PORT=8080
EXPOSE 8080

CMD ["bun", "src/index.ts"]
