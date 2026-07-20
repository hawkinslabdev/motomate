CREATE TABLE `document_links` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`document_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`relation` text DEFAULT 'attachment' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_document_links_target` ON `document_links` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_document_links_vehicle` ON `document_links` (`vehicle_id`);--> statement-breakpoint
CREATE INDEX `idx_document_links_document` ON `document_links` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_document_links_unique` ON `document_links` (`target_type`,`target_id`,`document_id`,`relation`);--> statement-breakpoint
CREATE TABLE `document_sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`paperless_task_id` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`last_error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_document_sync_jobs_document` ON `document_sync_jobs` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_document_sync_jobs_due` ON `document_sync_jobs` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `paperless_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text DEFAULT 'Paperless-ngx' NOT NULL,
	`base_url` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_tested_at` text,
	`last_error` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_paperless_integrations_user_url` ON `paperless_integrations` (`user_id`,`base_url`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`doc_type` text DEFAULT 'service' NOT NULL,
	`source` text DEFAULT 'motomate' NOT NULL,
	`storage_key` text,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`paperless_integration_id` text,
	`paperless_document_id` integer,
	`sync_status` text DEFAULT 'none' NOT NULL,
	`sync_error` text,
	`last_synced_at` text,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paperless_integration_id`) REFERENCES `paperless_integrations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_documents`("id", "vehicle_id", "user_id", "name", "title", "doc_type", "source", "storage_key", "mime_type", "size_bytes", "paperless_integration_id", "paperless_document_id", "sync_status", "sync_error", "last_synced_at", "expires_at", "created_at") SELECT "id", "vehicle_id", "user_id", "name", "title", "doc_type", 'motomate', "storage_key", "mime_type", "size_bytes", NULL, NULL, 'none', NULL, NULL, "expires_at", "created_at" FROM `documents`;--> statement-breakpoint
DROP TABLE `documents`;--> statement-breakpoint
ALTER TABLE `__new_documents` RENAME TO `documents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_documents_vehicle_created` ON `documents` (`vehicle_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_documents_paperless_document` ON `documents` (`paperless_integration_id`,`paperless_document_id`) WHERE "documents"."paperless_document_id" IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `document_links` (`id`, `vehicle_id`, `document_id`, `target_type`, `target_id`, `relation`, `created_at`)
SELECT 'dl_' || lower(hex(randomblob(16))), service_logs.vehicle_id, attachment.value, 'service_log', service_logs.id, 'attachment', service_logs.created_at
FROM service_logs
JOIN json_each(CASE WHEN json_valid(service_logs.attachments) THEN service_logs.attachments ELSE '[]' END) AS attachment
JOIN documents ON documents.id = attachment.value
	AND documents.vehicle_id = service_logs.vehicle_id
WHERE attachment.type = 'text';--> statement-breakpoint
INSERT OR IGNORE INTO `document_links` (`id`, `vehicle_id`, `document_id`, `target_type`, `target_id`, `relation`, `created_at`)
SELECT 'dl_' || lower(hex(randomblob(16))), finance_transactions.vehicle_id, attachment.value, 'finance_transaction', finance_transactions.id, 'attachment', finance_transactions.created_at
FROM finance_transactions
JOIN json_each(CASE WHEN json_valid(finance_transactions.attachments) THEN finance_transactions.attachments ELSE '[]' END) AS attachment
JOIN documents ON documents.id = attachment.value
	AND documents.vehicle_id = finance_transactions.vehicle_id
	AND documents.user_id = finance_transactions.user_id
WHERE attachment.type = 'text';
