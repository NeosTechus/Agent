-- Drops the agents.voice_id foreign key to voices.id.
--
-- voice_id holds an *external* ID (ElevenLabs voice ID, Vapi voice ID, or a
-- local clone ID), not always a row in our local `voices` table. The FK
-- caused agent creates to 500 with FOREIGN KEY constraint failed whenever
-- the user picked a stock ElevenLabs voice (which is the common case).
--
-- SQLite can't drop a constraint directly — recreate the table without it,
-- copy data over, drop old, rename new, restore indexes.

CREATE TABLE agents_new (
  id TEXT PRIMARY KEY NOT NULL,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'inbound' NOT NULL,
  system_prompt TEXT NOT NULL,
  first_message TEXT NOT NULL,
  voice_id TEXT,
  vapi_assistant_id TEXT,
  status TEXT DEFAULT 'draft' NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  organization_id TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

INSERT INTO agents_new SELECT * FROM agents;

DROP TABLE agents;

ALTER TABLE agents_new RENAME TO agents;

CREATE INDEX idx_agents_business_id ON agents(business_id);
CREATE INDEX idx_agents_voice_id ON agents(voice_id);
CREATE INDEX idx_agents_vapi_assistant_id ON agents(vapi_assistant_id);
CREATE INDEX idx_agents_organization_id ON agents(organization_id);
