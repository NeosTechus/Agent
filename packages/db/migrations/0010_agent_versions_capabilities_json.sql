-- Adds capabilities_json to agent_versions.
--
-- Mirror of migration 0008 which added the column to agents. publishAgent
-- writes capabilities_json onto every version row, but the original schema
-- for agent_versions never declared it. Without this, every publish call
-- 500s with "table agent_versions has no column named capabilities_json".
--
-- Default `'{}'` for backfill so existing rows have valid JSON.

ALTER TABLE agent_versions ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '{}';
