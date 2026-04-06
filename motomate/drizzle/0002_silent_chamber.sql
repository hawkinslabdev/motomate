CREATE TABLE `travels` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`user_id` text NOT NULL,
	`start_date` text NOT NULL,
	`duration_days` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`remark` text,
	`total_expenses_cents` integer,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`gpx_document_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_travels_vehicle_start` ON `travels` (`vehicle_id`,`start_date`);