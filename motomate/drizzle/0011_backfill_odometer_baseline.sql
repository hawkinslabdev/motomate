INSERT INTO `odometer_logs` (`id`, `vehicle_id`, `user_id`, `odometer`, `measurement`, `measurement_unit`, `kind`, `recorded_at`)
SELECT
	lower(hex(randomblob(10))),
	v.`id`,
	v.`user_id`,
	coalesce(v.`current_measurement`, v.`current_odometer`),
	coalesce(v.`current_measurement`, v.`current_odometer`),
	coalesce(v.`current_measurement_unit`, v.`odometer_unit`),
	'odometer',
	date('now')
FROM `vehicles` v
WHERE coalesce(v.`current_measurement`, v.`current_odometer`) > 0
	AND coalesce(v.`current_measurement`, v.`current_odometer`) > coalesce((
		SELECT max(coalesce(o.`measurement`, o.`odometer`))
		FROM `odometer_logs` o
		WHERE o.`vehicle_id` = v.`id`
			AND coalesce(o.`measurement_unit`, v.`odometer_unit`) = coalesce(v.`current_measurement_unit`, v.`odometer_unit`)
	), -1)
	AND coalesce(v.`current_measurement`, v.`current_odometer`) > coalesce((
		SELECT max(coalesce(s.`measurement_at_service`, s.`odometer_at_service`))
		FROM `service_logs` s
		WHERE s.`vehicle_id` = v.`id`
			AND coalesce(s.`measurement_unit`, v.`odometer_unit`) = coalesce(v.`current_measurement_unit`, v.`odometer_unit`)
	), -1);
