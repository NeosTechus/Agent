-- Drops the agent_versions.voice_id foreign key to voices.id.
--
-- Same problem as migration 0009 (agents.voice_id) — voice_id holds an
-- *external* ID (ElevenLabs voice ID, Vapi voice ID, or a local clone ID),
-- not always a row in our local `voices` table. The FK caused agent
-- publishes to 500 with FOREIGN KEY constraint failed whenever the live
-- agent referenced a stock ElevenLabs voice (i.e., always).
--
-- SQLite recreate-table dance.

CREATE TABLE agent_versions_new (
  id TEXT PRIMARY KEY NOT NULL,
  agent_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  first_message TEXT NOT NULL,
  voice_id TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  published_at INTEGER,
  published_by_user_id TEXT NOT NULL,
  review_state TEXT NOT NULL DEFAULT 'published',
  review_reason TEXT,
  reviewed_by_admin_id TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (published_by_user_id) REFERENCES users(id)
);

INSERT INTO agent_versions_new (
  id, agent_id, version, system_prompt, first_message, voice_id,
  capabilities_json, published_at, published_by_user_id, review_state,
  review_reason, reviewed_by_admin_id, reviewed_at, created_at, updated_at
) SELECT
  id, agent_id, version, system_prompt, first_message, voice_id,
  capabilities_json, published_at, published_by_user_id, review_state,
  review_reason, reviewed_by_admin_id, reviewed_at, created_at,
  COALESCE(updated_at, created_at)
FROM agent_versions;

DROP TABLE agent_versions;
ALTER TABLE agent_versions_new RENAME TO agent_versions;

CREATE INDEX idx_agent_versions_agent_id ON agent_versions(agent_id);
CREATE INDEX idx_agent_versions_agent_id_version ON agent_versions(agent_id, version);
CREATE INDEX idx_agent_versions_review_state ON agent_versions(review_state);
