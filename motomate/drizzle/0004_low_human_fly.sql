CREATE INDEX `idx_odometer_logs_vehicle_user_unit_reading`
ON `odometer_logs` (
	`vehicle_id`,
	`user_id`,
	`measurement_unit`,
	coalesce(`measurement`, `odometer`)
);
