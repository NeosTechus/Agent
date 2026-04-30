-- Initial schema for AI Receptionist platform (Cloudflare D1 / SQLite).
-- Generated to match Drizzle schema in /packages/db/schema/.
-- Runtime must execute `PRAGMA foreign_keys = ON;` per connection.

CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`stripe_customer_id` text,
	`plan_tier` text,
	`credits_remaining` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_stripe_customer_id_unique` ON `users` (`stripe_customer_id`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint

CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`plan_tier` text DEFAULT 'free' NOT NULL,
	`location_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_organizations_owner_user_id` ON `organizations` (`owner_user_id`);--> statement-breakpoint

CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`invited_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_org_members_organization_id` ON `organization_members` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_org_members_user_id` ON `organization_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_org_members_org_user` ON `organization_members` (`organization_id`,`user_id`);--> statement-breakpoint

CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`business_name` text NOT NULL,
	`address` text,
	`hours_json` text,
	`existing_phone_number` text,
	`twilio_forwarding_number` text,
	`vertical` text,
	`integrations_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_businesses_organization_id` ON `businesses` (`organization_id`);--> statement-breakpoint

CREATE TABLE `voices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`elevenlabs_voice_id` text,
	`name` text NOT NULL,
	`sample_url` text,
	`consent_recording_url` text,
	`approved_by_admin_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_voices_organization_id` ON `voices` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_voices_elevenlabs_voice_id` ON `voices` (`elevenlabs_voice_id`);--> statement-breakpoint

CREATE TABLE `voice_clone_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`sample_r2_url` text NOT NULL,
	`consent_recording_r2_url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_admin_id` text,
	`reviewed_at` integer,
	`rejection_reason` text,
	`elevenlabs_voice_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_voice_clone_requests_organization_id` ON `voice_clone_requests` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_voice_clone_requests_status` ON `voice_clone_requests` (`status`);--> statement-breakpoint

CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'inbound' NOT NULL,
	`system_prompt` text NOT NULL,
	`first_message` text NOT NULL,
	`voice_id` text,
	`vapi_assistant_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voice_id`) REFERENCES `voices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agents_business_id` ON `agents` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_agents_voice_id` ON `agents` (`voice_id`);--> statement-breakpoint
CREATE INDEX `idx_agents_vapi_assistant_id` ON `agents` (`vapi_assistant_id`);--> statement-breakpoint

CREATE TABLE `agent_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`version` integer NOT NULL,
	`system_prompt` text NOT NULL,
	`first_message` text NOT NULL,
	`voice_id` text,
	`published_at` integer NOT NULL,
	`published_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voice_id`) REFERENCES `voices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`published_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_versions_agent_id` ON `agent_versions` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_versions_agent_id_version` ON `agent_versions` (`agent_id`,`version`);--> statement-breakpoint

CREATE TABLE `knowledge_base_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`file_name` text NOT NULL,
	`file_type` text NOT NULL,
	`r2_url` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`indexed_at` integer,
	`vector_namespace` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_kb_docs_business_id` ON `knowledge_base_documents` (`business_id`);--> statement-breakpoint

CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`agent_id` text,
	`direction` text NOT NULL,
	`phone_number` text,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`transcript` text,
	`recording_r2_url` text,
	`outcome` text,
	`flagged` integer DEFAULT false NOT NULL,
	`quality_score` real,
	`is_test` integer DEFAULT false NOT NULL,
	`organization_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_calls_business_id` ON `calls` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_calls_agent_id` ON `calls` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_calls_org_created` ON `calls` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_calls_flagged` ON `calls` (`flagged`);--> statement-breakpoint

CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`before_value` text,
	`after_value` text,
	`ip_address` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_org_created` ON `audit_logs` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_user_id` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_resource` ON `audit_logs` (`resource_type`,`resource_id`);--> statement-breakpoint

CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`url` text NOT NULL,
	`events_subscribed` text NOT NULL,
	`secret_token` text NOT NULL,
	`last_success_at` integer,
	`last_failure_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_webhooks_organization_id` ON `webhooks` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_webhooks_status` ON `webhooks` (`status`);--> statement-breakpoint

CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`response_code` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`delivered_at` integer,
	`dead_letter_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_webhook_deliveries_webhook_id` ON `webhook_deliveries` (`webhook_id`);--> statement-breakpoint
CREATE INDEX `idx_webhook_deliveries_webhook_dead_letter` ON `webhook_deliveries` (`webhook_id`,`dead_letter_at`);--> statement-breakpoint

CREATE TABLE `promo_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`max_redemptions` integer,
	`redemptions_used` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`created_by_admin_id` text NOT NULL,
	`applies_to_plan_tier` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_admin_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_codes_code_unique` ON `promo_codes` (`code`);--> statement-breakpoint
CREATE INDEX `idx_promo_codes_code` ON `promo_codes` (`code`);--> statement-breakpoint

CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`stripe_subscription_id` text,
	`plan_tier` text NOT NULL,
	`status` text NOT NULL,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_stripe_subscription_id_unique` ON `subscriptions` (`stripe_subscription_id`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_organization_id` ON `subscriptions` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_status` ON `subscriptions` (`status`);--> statement-breakpoint

CREATE TABLE `promo_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`promo_code_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`redeemed_at` integer NOT NULL,
	`applied_to_subscription_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applied_to_subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_promo_redemptions_promo_code_id` ON `promo_redemptions` (`promo_code_id`);--> statement-breakpoint
CREATE INDEX `idx_promo_redemptions_organization_id` ON `promo_redemptions` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_promo_redemptions_org_promo` ON `promo_redemptions` (`organization_id`,`promo_code_id`);--> statement-breakpoint

CREATE TABLE `demo_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`caller_id` text,
	`ip_address` text,
	`business_name_entered` text,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`transcript` text,
	`ended_naturally` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_demo_calls_ip_address` ON `demo_calls` (`ip_address`);--> statement-breakpoint
CREATE INDEX `idx_demo_calls_created_at` ON `demo_calls` (`created_at`);--> statement-breakpoint

CREATE TABLE `first_call_review_window` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`calls_reviewed_count` integer DEFAULT 0 NOT NULL,
	`escalations_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_first_call_review_window_organization_id` ON `first_call_review_window` (`organization_id`);
