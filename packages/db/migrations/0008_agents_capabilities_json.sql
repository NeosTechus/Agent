-- Adds capabilities_json to agents.
--
-- Stores per-agent feature toggles (PRD §5.4: take_reservations, take_orders,
-- answer_menu_questions, transfer_to_human, take_messages) as a JSON string.
-- The application reads it via JSON.parse(row.capabilities_json), so existing
-- rows must have valid JSON; default '{}' = "all capabilities off".

ALTER TABLE agents ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '{}';
