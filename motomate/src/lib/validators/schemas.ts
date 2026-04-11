import { z } from 'zod';

// Coercion helpers
// Form data and preset objects can both produce null, undefined, or "" for
// optional number fields. These preprocessors normalise that before validation.

/** Optional integer: null / undefined / "" → undefined; coerces strings to number */
const optInt = (min?: number, max?: number) =>
	z.preprocess(
		(v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
		min !== undefined && max !== undefined
			? z.number().int().min(min).max(max).optional()
			: min !== undefined
				? z.number().int().min(min).optional()
				: z.number().int().optional()
	);

/** Optional positive integer (>0): null / undefined / "" → undefined */
const optPosInt = () =>
	z.preprocess(
		(v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
		z.number().int().positive().optional()
	);

/** Required integer: coerces strings; rejects null / undefined / "" */
const reqInt = (min = 0) =>
	z.preprocess(
		(v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
		z.number().int().min(min)
	);

/** Optional string: "" / null -> undefined */
const optStr = (maxLen?: number) =>
	z.preprocess(
		(v) => (v === '' || v === null ? undefined : v),
		maxLen ? z.string().max(maxLen).optional() : z.string().optional()
	);

// Schemas
export const NotificationChannelsSchema = z
	.object({
		push: z.object({ enabled: z.boolean() }).optional(),
		email: z
			.object({
				enabled: z.boolean(),
				address: z.string().email().optional().or(z.literal(''))
			})
			.optional(),
		webhook: z
			.object({
				enabled: z.boolean(),
				url: z.string().url().optional().or(z.literal('')),
				auth_header: z.string().max(500).optional()
			})
			.optional(),
		home_assistant: z
			.object({
				enabled: z.boolean(),
				webhook_url: z.string().url().optional().or(z.literal(''))
			})
			.optional()
	})
	.optional();

export const UserSettingsSchema = z.object({
	theme: z.enum(['system', 'light', 'dark']).default('system'),
	currency: z.string().length(3).default('EUR'),
	odometer_unit: z.enum(['km', 'mi']).default('km'),
	locale: z.string().default('en'),
	notification_channels: NotificationChannelsSchema,
	favorite_vehicle: z.string().nonempty().max(64).nullable().optional(),
	avatar_key: z.string().max(500).nullable().optional()
});

export const CreateUserSchema = z.object({
	email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
	password: z.string().min(8, 'Use at least 8 characters').max(128).optional()
});

export const LoginSchema = z.object({
	email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
	password: z.string().min(1, 'Enter your password')
});

export const MagicLinkRequestSchema = z.object({
	email: z.string().email().toLowerCase().trim()
});

export const VehicleMetaSchema = z.object({
	color: optStr(50),
	notes: optStr(2000),
	insurance_expires: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	registration_expires: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	displacement_cc: optPosInt(),
	fuel_type: z.enum(['petrol', 'diesel', 'electric', 'hybrid']).optional(),
	avatar_emoji: optStr(10)
});

export const CreateVehicleSchema = z.object({
	type: z.enum(['motorcycle', 'scooter', 'bike', 'other']).default('motorcycle'),
	name: z.string().min(1).max(100).trim(),
	make: z.string().min(1).max(100).trim(),
	model: z.string().min(1).max(100).trim(),
	year: reqInt(1900),
	vin: optStr(17),
	license_plate: optStr(20),
	current_odometer: z.preprocess(
		(v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
		z.number().int().min(0)
	),
	odometer_unit: z.enum(['km', 'mi']).default('km'),
	meta: VehicleMetaSchema.default({})
});

export const UpdateVehicleSchema = CreateVehicleSchema.partial().extend({
	sort_order: optInt(),
	cover_image_key: z.string().max(500).nullish(),
	purchase_price_cents: z.number().int().min(0).nullable().optional(),
	sold_price_cents: z.number().int().min(0).nullable().optional()
});

export const CreateTaskTemplateSchema = z.object({
	vehicle_id: optStr(),
	name: z.string().min(1).max(200).trim(),
	category: z.enum(['oil', 'tire', 'chain', 'brake', 'custom']).default('custom'),
	description: optStr(500),
	// Accept null (from presets), undefined, "" (from forms), or a valid number
	interval_km: optPosInt(),
	interval_months: optPosInt(),
	part_numbers: z.array(z.string().max(100)).default([]),
	is_preset: z.boolean().default(false),
	enabled: z.boolean().default(true)
});

export const CreateServiceLogSchema = z.object({
	vehicle_id: z.string().min(1),
	tracker_id: optStr(),
	performed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
	odometer_at_service: reqInt(0),
	cost_cents: optInt(0),
	currency: z.string().length(3).default('EUR'),
	notes: optStr(2000),
	parts_used: z
		.array(
			z.object({
				name: z.string().min(1).max(200),
				part_number: optStr(50),
				cost_cents: optInt(0)
			})
		)
		.default([]),
	attachments: z.array(z.string()).default([]),
	remark: optStr(200)
});

export const CreateDocumentSchema = z.object({
	vehicle_id: z.string().min(1),
	name: z.string().min(1).max(200).trim(), // original filename
	title: z.string().max(200).trim().optional().nullable(), // user-facing description
	doc_type: z
		.enum(['service', 'quotation', 'papers', 'photo', 'notes', 'other', 'route'])
		.default('service'),
	storage_key: z.string().min(1),
	mime_type: z.string().min(1),
	size_bytes: reqInt(0),
	expires_at: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
});

export const RuleTriggerSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('odometer_upcoming'), km_before: z.number().int().positive() }),
	z.object({ type: z.literal('odometer_overdue'), km_past: z.number().int().min(0) }),
	z.object({ type: z.literal('date_upcoming'), days_before: z.number().int().positive() }),
	z.object({ type: z.literal('date_overdue'), days_past: z.number().int().min(0) }),
	z.object({
		type: z.literal('calendar_date'),
		month: z.number().int().min(1).max(12),
		day: z.number().int().min(1).max(31)
	}),
	z.object({ type: z.literal('no_odometer_update'), days: z.number().int().positive() }),
	z.object({ type: z.literal('document_expiring'), days_before: z.number().int().positive() })
]);

export const RuleNotificationSchema = z.object({
	title: z.string().min(1).max(200),
	body: z.string().min(1).max(1000)
});

export const CreateWorkflowRuleSchema = z.object({
	vehicle_id: optStr(),
	name: z.string().min(1).max(200).trim(),
	description: optStr(500),
	trigger: RuleTriggerSchema,
	actions: RuleNotificationSchema,
	enabled: z.boolean().default(true)
});

export const UpdateWorkflowTriggerSchema = z.object({
	id: z.string().min(1),
	trigger: RuleTriggerSchema
});

export const OdometerUpdateSchema = z.object({
	current_odometer: reqInt(0)
});

export const CreateTravelSchema = z.object({
	vehicle_id: z.string().min(1),
	start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
	duration_days: reqInt(1),
	title: z.string().min(1).max(200).trim(),
	remark: optStr(2000),
	total_expenses_cents: optInt(0),
	currency: z.string().length(3).default('EUR'),
	gpx_document_ids: z.array(z.string()).default([])
});

export const UpdateTravelSchema = CreateTravelSchema.partial().omit({ vehicle_id: true });
