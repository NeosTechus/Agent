ALTER TABLE `users` ADD `password_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verification_token` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verification_expires` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `password_reset_token` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_reset_expires` integer;--> statement-breakpoint
CREATE INDEX `idx_users_email_verification_token` ON `users` (`email_verification_token`);--> statement-breakpoint
CREATE INDEX `idx_users_password_reset_token` ON `users` (`password_reset_token`);--> statement-breakpoint

CREATE TABLE `usage_tracking` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`subscription_id` text,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`minutes_used` integer DEFAULT 0 NOT NULL,
	`minutes_included` integer NOT NULL,
	`overage_minutes` integer DEFAULT 0 NOT NULL,
	`overage_cents` integer DEFAULT 0 NOT NULL,
	`notified_50pct_at` integer,
	`notified_80pct_at` integer,
	`notified_100pct_at` integer,
	`notified_110pct_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_usage_tracking_org_period_start` ON `usage_tracking` (`organization_id`,`period_start`);--> statement-breakpoint
CREATE INDEX `idx_usage_tracking_org_period_end` ON `usage_tracking` (`organization_id`,`period_end`);
