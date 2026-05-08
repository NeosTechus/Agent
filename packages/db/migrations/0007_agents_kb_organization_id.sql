-- Adds organization_id to agents and knowledge_base_documents.
--
-- These tables previously relied solely on business_id, but every read path
-- in the API filters by organization_id (services/agents/logic.ts:listAgents
-- and services/knowledge_base/logic.ts:listDocs both query
-- `WHERE organization_id = ?`). Without the column, those endpoints 500.
-- We denormalize for query simplicity + index-friendly tenant scoping; the
-- value is derived from the parent business.row at write time and kept in
-- sync by the producer code.

ALTER TABLE agents ADD COLUMN organization_id TEXT;
UPDATE agents SET organization_id = (
  SELECT organization_id FROM businesses WHERE businesses.id = agents.business_id
);
CREATE INDEX IF NOT EXISTS idx_agents_organization_id ON agents(organization_id);

ALTER TABLE knowledge_base_documents ADD COLUMN organization_id TEXT;
UPDATE knowledge_base_documents SET organization_id = (
  SELECT organization_id FROM businesses WHERE businesses.id = knowledge_base_documents.business_id
);
CREATE INDEX IF NOT EXISTS idx_kb_docs_organization_id ON knowledge_base_documents(organization_id);
