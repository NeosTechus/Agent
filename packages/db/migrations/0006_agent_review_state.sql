-- Prompt-weakening admin approval queue (PRD §5.19, audit gap from Phase 7).
--
-- When an owner edits the system prompt in a way that the LLM-as-judge
-- flags as weakening safety guardrails, the change is saved to
-- `agent_versions` with `review_state = 'pending_admin_review'` and is
-- NOT pushed to Vapi until an admin approves. The previously-published
-- version stays live during the review window.

ALTER TABLE agent_versions ADD COLUMN review_state TEXT NOT NULL DEFAULT 'published';
--> statement-breakpoint
ALTER TABLE agent_versions ADD COLUMN review_reason TEXT;
--> statement-breakpoint
ALTER TABLE agent_versions ADD COLUMN reviewed_by_admin_id TEXT;
--> statement-breakpoint
ALTER TABLE agent_versions ADD COLUMN reviewed_at INTEGER;
--> statement-breakpoint
CREATE INDEX idx_agent_versions_review_state ON agent_versions(review_state);
