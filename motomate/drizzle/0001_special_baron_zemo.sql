PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`timezone` text DEFAULT 'Europe/Amsterdam' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`onboarding_done` integer DEFAULT false NOT NULL,
	`settings` text DEFAULT '{"theme":"system","currency":"EUR","odometer_unit":"km","locale":"en"}' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "password_hash", "timezone", "locale", "onboarding_done", "settings", "created_at", "updated_at") SELECT "id", "email", "password_hash", "timezone", "locale", "onboarding_done", "settings", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_active_trackers_vehicle_status` ON `active_trackers` (`vehicle_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_documents_vehicle_created` ON `documents` (`vehicle_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_finance_transactions_vehicle_performed` ON `finance_transactions` (`vehicle_id`,`performed_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user_read` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `idx_odometer_logs_vehicle_recorded` ON `odometer_logs` (`vehicle_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_service_logs_vehicle_performed` ON `service_logs` (`vehicle_id`,`performed_at`);--> statement-breakpoint
CREATE INDEX `idx_vehicles_user_archived` ON `vehicles` (`user_id`,`archived_at`);