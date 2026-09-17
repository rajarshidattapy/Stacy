-- Agent metadata schema. The langgraph PostgresSaver checkpointer manages its
-- own tables (checkpoints, checkpoint_writes, checkpoint_blobs) — those are
-- created via PostgresSaver.setup() and are NOT defined here.
--
-- This file only defines the auxiliary tables we use for thread/run tracking,
-- delegations (subagent runs + circuit-breaker accounting), and long-term
-- memory.
CREATE SCHEMA IF NOT EXISTS agent;

CREATE TABLE IF NOT EXISTS agent.threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID,
    user_id         UUID,
    agent_type      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',  -- active | idle | archived
    sandbox_id      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_tokens_used BIGINT NOT NULL DEFAULT 0,
    total_runs      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS threads_user_idx ON agent.threads (user_id);
CREATE INDEX IF NOT EXISTS threads_status_idx ON agent.threads (status);

CREATE TABLE IF NOT EXISTS agent.runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id       UUID NOT NULL REFERENCES agent.threads(id) ON DELETE CASCADE,
    agent_type      TEXT NOT NULL,
    parent_run_id   UUID REFERENCES agent.runs(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'running',  -- running | success | failure | partial
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    input_message   TEXT,
    final_summary   JSONB,
    model_profile   TEXT,
    tokens_input    INTEGER NOT NULL DEFAULT 0,
    tokens_output   INTEGER NOT NULL DEFAULT 0,
    error           TEXT
);

CREATE INDEX IF NOT EXISTS runs_thread_idx ON agent.runs (thread_id);
CREATE INDEX IF NOT EXISTS runs_parent_idx ON agent.runs (parent_run_id);

CREATE TABLE IF NOT EXISTS agent.delegations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_run_id       UUID NOT NULL REFERENCES agent.runs(id) ON DELETE CASCADE,
    child_subagent_name TEXT NOT NULL,
    task_description    TEXT NOT NULL,
    task_signature      TEXT NOT NULL,
    result              JSONB NOT NULL,
    duration_ms         INTEGER,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS delegations_signature_idx
    ON agent.delegations (child_subagent_name, task_signature, created_at DESC);
CREATE INDEX IF NOT EXISTS delegations_parent_idx
    ON agent.delegations (parent_run_id);

CREATE TABLE IF NOT EXISTS agent.memory (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    project_id  UUID,
    namespace   TEXT NOT NULL,
    key         TEXT NOT NULL,
    value       JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, project_id, namespace, key)
);

CREATE INDEX IF NOT EXISTS memory_user_proj_idx
    ON agent.memory (user_id, project_id, namespace);
