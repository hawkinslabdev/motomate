ALTER TABLE `active_trackers` ADD `last_done_measurement` integer;--> statement-breakpoint
ALTER TABLE `active_trackers` ADD `next_due_measurement` integer;--> statement-breakpoint
ALTER TABLE `active_trackers` ADD `measurement_unit` text;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `measurement_at_transaction` integer;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `measurement_unit` text;--> statement-breakpoint
ALTER TABLE `odometer_logs` ADD `measurement` integer;--> statement-breakpoint
ALTER TABLE `odometer_logs` ADD `measurement_unit` text;--> statement-breakpoint
ALTER TABLE `service_logs` ADD `measurement_at_service` integer;--> statement-breakpoint
ALTER TABLE `service_logs` ADD `measurement_unit` text;--> statement-breakpoint
ALTER TABLE `task_templates` ADD `interval_measurement` integer;--> statement-breakpoint
ALTER TABLE `task_templates` ADD `interval_unit` text;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `current_measurement` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `current_measurement_unit` text DEFAULT 'km' NOT NULL;--> statement-breakpoint

UPDATE `vehicles`
SET
	`current_measurement` = `current_odometer`,
	`current_measurement_unit` = `odometer_unit`;--> statement-breakpoint

UPDATE `task_templates`
SET
	`interval_measurement` = `interval_km`,
	`interval_unit` = COALESCE(
		(SELECT `odometer_unit` FROM `vehicles` WHERE `vehicles`.`id` = `task_templates`.`vehicle_id`),
		'km'
	)
WHERE `interval_km` IS NOT NULL;--> statement-breakpoint

UPDATE `active_trackers`
SET
	`last_done_measurement` = `last_done_odometer`,
	`next_due_measurement` = `next_due_odometer`,
	`measurement_unit` = (
		SELECT `odometer_unit`
		FROM `vehicles`
		WHERE `vehicles`.`id` = `active_trackers`.`vehicle_id`
	);--> statement-breakpoint

UPDATE `service_logs`
SET
	`measurement_at_service` = `odometer_at_service`,
	`measurement_unit` = (
		SELECT `odometer_unit`
		FROM `vehicles`
		WHERE `vehicles`.`id` = `service_logs`.`vehicle_id`
	);--> statement-breakpoint

UPDATE `finance_transactions`
SET
	`measurement_at_transaction` = `odometer_at_transaction`,
	`measurement_unit` = CASE
		WHEN `odometer_at_transaction` IS NULL THEN NULL
		ELSE (
			SELECT `odometer_unit`
			FROM `vehicles`
			WHERE `vehicles`.`id` = `finance_transactions`.`vehicle_id`
		)
	END;--> statement-breakpoint

UPDATE `odometer_logs`
SET
	`measurement` = `odometer`,
	`measurement_unit` = (
		SELECT `odometer_unit`
		FROM `vehicles`
		WHERE `vehicles`.`id` = `odometer_logs`.`vehicle_id`
	);
