import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';

// State types (I'm defining these in JSON)

export type NotificationChannels = {
	push?: { enabled: boolean };
	email?: { enabled: boolean; address?: string };
	webhook?: { enabled: boolean; url?: string; auth_header?: string };
	home_assistant?: { enabled: boolean; webhook_url?: string };
};

export type UserSettings = {
	theme: 'system' | 'light' | 'dark';
	currency: string; // 'EUR', 'GBP', etc.
	odometer_unit: 'km' | 'mi';
	locale: string;
	notification_channels?: NotificationChannels;
	favorite_vehicle?: string | null;
	avatar_key?: string | null;
};

export type VehicleMeta = {
	color?: string;
	notes?: string;
	insurance_expires?: string;
	registration_expires?: string;
	displacement_cc?: number;
	fuel_type?: 'petrol' | 'diesel' | 'electric' | 'hybrid';
	avatar_emoji?: string;
};

export type PartNumbers = string[];

export type TrackerState = Record<string, unknown>;

export type PartsUsed = Array<{
	name: string;
	part_number?: string;
	cost_cents?: number;
}>;

export type Attachments = string[]; // document IDs

export type RuleTrigger =
	| { type: 'odometer_upcoming'; km_before: number }
	| { type: 'odometer_overdue'; km_past: number }
	| { type: 'date_upcoming'; days_before: number }
	| { type: 'date_overdue'; days_past: number }
	| { type: 'calendar_date'; month: number; day: number }
	| { type: 'no_odometer_update'; days: number }
	| { type: 'document_expiring'; days_before: number };

export type RuleNotification = {
	title: string;
	body: string;
};

export type NotificationData = Record<string, unknown>;

export type PushKeys = {
	p256dh: string;
	auth: string;
};

// Tables
export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	password_hash: text('password_hash'), // null for magic-link-only users
	timezone: text('timezone').notNull().default('Europe/Amsterdam'),
	locale: text('locale').notNull().default('en'),
	onboarding_done: integer('onboarding_done', { mode: 'boolean' }).notNull().default(false),
	settings: text('settings', { mode: 'json' })
		.$type<UserSettings>()
		.notNull()
		.default(sql`'{"theme":"system","currency":"EUR","odometer_unit":"km","locale":"en"}'`),
	created_at: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`),
	updated_at: text('updated_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull() // unix timestamp — Lucia requires camelCase property names
});

export const magic_link_tokens = sqliteTable('magic_link_tokens', {
	id: text('id').primaryKey(),
	user_id: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	token_hash: text('token_hash').notNull().unique(),
	expires_at: text('expires_at').notNull(),
	used_at: text('used_at'),
	created_at: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});

export const vehicles = sqliteTable(
	'vehicles',
	{
		id: text('id').primaryKey(),
		user_id: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: text('type', { enum: ['motorcycle', 'scooter', 'bike', 'other'] })
			.notNull()
			.default('motorcycle'),
		name: text('name').notNull(),
		make: text('make').notNull(),
		model: text('model').notNull(),
		year: integer('year').notNull(),
		vin: text('vin'),
		license_plate: text('license_plate'),
		current_odometer: integer('current_odometer').notNull().default(0),
		odometer_unit: text('odometer_unit', { enum: ['km', 'mi'] })
			.notNull()
			.default('km'),
		cover_image_key: text('cover_image_key'),
		archived_at: text('archived_at'), // null = active; timestamp = archived
		purchase_price_cents: integer('purchase_price_cents'), // null = not tracked
		sold_price_cents: integer('sold_price_cents'), // null = not tracked
		meta: text('meta', { mode: 'json' })
			.$type<VehicleMeta>()
			.notNull()
			.default(sql`'{}'`),
		sort_order: integer('sort_order').notNull().default(0),
		created_at: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`),
		updated_at: text('updated_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(table) => ({
		userArchived: index('idx_vehicles_user_archived').on(table.user_id, table.archived_at)
	})
);

export const task_templates = sqliteTable('task_templates', {
	id: text('id').primaryKey(),
	user_id: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	vehicle_id: text('vehicle_id').references(() => vehicles.id, { onDelete: 'cascade' }), // null = all vehicles
	name: text('name').notNull(),
	category: text('category', {
		enum: ['oil', 'tire', 'chain', 'brake', 'custom']
	})
		.notNull()
		.default('custom'),
	description: text('description'),
	interval_km: integer('interval_km'), // null = time-only
	interval_months: integer('interval_months'), // null = km-only
	part_numbers: text('part_numbers', { mode: 'json' })
		.$type<PartNumbers>()
		.notNull()
		.default(sql`'[]'`),
	is_preset: integer('is_preset', { mode: 'boolean' }).notNull().default(false),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	created_at: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});

export const active_trackers = sqliteTable(
	'active_trackers',
	{
		id: text('id').primaryKey(),
		vehicle_id: text('vehicle_id')
			.notNull()
			.references(() => vehicles.id, { onDelete: 'cascade' }),
		template_id: text('template_id')
			.notNull()
			.references(() => task_templates.id, { onDelete: 'cascade' }),
		last_done_at: text('last_done_at'),
		last_done_odometer: integer('last_done_odometer'),
		next_due_at: text('next_due_at'), // computed on service log
		next_due_odometer: integer('next_due_odometer'), // computed on service log
		status: text('status', { enum: ['ok', 'due', 'overdue'] })
			.notNull()
			.default('ok'),
		state: text('state', { mode: 'json' })
			.$type<TrackerState>()
			.notNull()
			.default(sql`'{}'`),
		created_at: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`),
		updated_at: text('updated_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(table) => ({
		vehicleStatus: index('idx_active_trackers_vehicle_status').on(table.vehicle_id, table.status)
	})
);

export const service_logs = sqliteTable(
	'service_logs',
	{
		id: text('id').primaryKey(),
		vehicle_id: text('vehicle_id')
			.notNull()
			.references(() => vehicles.id, { onDelete: 'cascade' }),
		tracker_id: text('tracker_id').references(() => active_trackers.id, { onDelete: 'set null' }),
		performed_at: text('performed_at').notNull(), // ISO date string
		odometer_at_service: integer('odometer_at_service').notNull(),
		cost_cents: integer('cost_cents'), // null = not tracked
		currency: text('currency').notNull().default('EUR'),
		notes: text('notes'),
		parts_used: text('parts_used', { mode: 'json' })
			.$type<PartsUsed>()
			.notNull()
			.default(sql`'[]'`),
		attachments: text('attachments', { mode: 'json' })
			.$type<Attachments>()
			.notNull()
			.default(sql`'[]'`),
		remark: text('remark'),
		created_at: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(table) => ({
		vehiclePerformed: index('idx_service_logs_vehicle_performed').on(
			table.vehicle_id,
			table.performed_at
		)
	})
);

export const finance_transactions = sqliteTable(
	'finance_transactions',
	{
		id: text('id').primaryKey(),
		vehicle_id: text('vehicle_id')
			.notNull()
			.references(() => vehicles.id, { onDelete: 'cascade' }),
		user_id: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		category: text('category', {
			enum: ['maintenance', 'parts', 'accessories', 'administrative', 'other']
		})
			.notNull()
			.default('other'),
		amount_cents: integer('amount_cents').notNull(),
		currency: text('currency').notNull().default('EUR'),
		notes: text('notes'),
		performed_at: text('performed_at').notNull(), // ISO date string
		odometer_at_transaction: integer('odometer_at_transaction'), // optional odometer reading
		created_at: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`),
		updated_at: text('updated_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(table) => ({
		vehiclePerformed: index('idx_finance_transactions_vehicle_performed').on(
			table.vehicle_id,
			table.performed_at
		)
	})
);

export const documents = sqliteTable(
	'documents',
	{
		id: text('id').primaryKey(),
		vehicle_id: text('vehicle_id')
			.notNull()
			.references(() => vehicles.id, { onDelete: 'cascade' }),
		user_id: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(), // original filename (used for download Content-Disposition)
		title: text('title'), // user-facing description/summary
		doc_type: text('doc_type', {
			enum: ['service', 'quotation', 'papers', 'photo', 'notes', 'other', 'route']
		})
			.notNull()
			.default('service'),
		storage_key: text('storage_key').notNull(),
		mime_type: text('mime_type').notNull(),
		size_bytes: integer('size_bytes').notNull(),
		expires_at: text('expires_at'), // ISO date; null = no expiry
		created_at: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(table) => ({
		vehicleCreated: index('idx_documents_vehicle_created').on(table.vehicle_id, table.created_at)
	})
);

export type TravelGpxFiles = (string | null)[]; // document.id per day slot; null = no GPX for that day

export const travels = sqliteTable(
	'travels',
	{
		id: text('id').primaryKey(),
		vehicle_id: text('vehicle_id')
			.notNull()
			.references(() => vehicles.id, { onDelete: 'cascade' }),
		user_id: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		start_date: text('start_date').notNull(), // YYYY-MM-DD
		duration_days: integer('duration_days').notNull().default(1),
		title: text('title').notNull(), // max 200
		remark: text('remark'),
		total_expenses_cents: integer('total_expenses_cents'),
		currency: text('currency').notNull().default('EUR'),
		gpx_document_ids: text('gpx_document_ids', { mode: 'json' })
			.$type<TravelGpxFiles>()
			.notNull()
			.default(sql`'[]'`),
		excluded_gpx_days: text('excluded_gpx_days', { mode: 'json' })
			.$type<number[]>()
			.notNull()
			.default(sql`'[]'`), // day indices (0-based) to hide from map
		created_at: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`),
		updated_at: text('updated_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(t) => ({
		vehicleStart: index('idx_travels_vehicle_start').on(t.vehicle_id, t.start_date)
	})
);

export const workflow_rules = sqliteTable('workflow_rules', {
	id: text('id').primaryKey(),
	user_id: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	vehicle_id: text('vehicle_id').references(() => vehicles.id, { onDelete: 'cascade' }), // null = all vehicles
	name: text('name').notNull(),
	description: text('description'),
	trigger: text('trigger', { mode: 'json' }).$type<RuleTrigger>().notNull(),
	actions: text('actions', { mode: 'json' }).$type<RuleNotification>().notNull(),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	last_triggered_at: text('last_triggered_at'),
	created_at: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`),
	updated_at: text('updated_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});

export const notifications = sqliteTable(
	'notifications',
	{
		id: text('id').primaryKey(),
		user_id: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		vehicle_id: text('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
		type: text('type').notNull(),
		title: text('title').notNull(),
		body: text('body').notNull(),
		read_at: text('read_at'),
		data: text('data', { mode: 'json' })
			.$type<NotificationData>()
			.notNull()
			.default(sql`'{}'`),
		created_at: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(table) => ({
		userRead: index('idx_notifications_user_read').on(table.user_id, table.read_at)
	})
);

export const odometer_logs = sqliteTable(
	'odometer_logs',
	{
		id: text('id').primaryKey(),
		vehicle_id: text('vehicle_id')
			.notNull()
			.references(() => vehicles.id, { onDelete: 'cascade' }),
		user_id: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		odometer: integer('odometer').notNull(),
		remark: text('remark'),
		kind: text('kind').notNull().default('odometer'),
		recorded_at: text('recorded_at').notNull(), // ISO date YYYY-MM-DD
		created_at: text('created_at')
			.notNull()
			.default(sql`(datetime('now'))`)
	},
	(table) => ({
		vehicleRecorded: index('idx_odometer_logs_vehicle_recorded').on(
			table.vehicle_id,
			table.recorded_at
		)
	})
);

export const push_subscriptions = sqliteTable('push_subscriptions', {
	id: text('id').primaryKey(),
	user_id: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	endpoint: text('endpoint').notNull().unique(),
	keys: text('keys', { mode: 'json' }).$type<PushKeys>().notNull(),
	created_at: text('created_at')
		.notNull()
		.default(sql`(datetime('now'))`)
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
	vehicles: many(vehicles),
	task_templates: many(task_templates),
	workflow_rules: many(workflow_rules),
	notifications: many(notifications),
	push_subscriptions: many(push_subscriptions)
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
	user: one(users, { fields: [vehicles.user_id], references: [users.id] }),
	task_templates: many(task_templates),
	active_trackers: many(active_trackers),
	service_logs: many(service_logs),
	odometer_logs: many(odometer_logs),
	documents: many(documents),
	travels: many(travels)
}));

export const travelsRelations = relations(travels, ({ one }) => ({
	vehicle: one(vehicles, { fields: [travels.vehicle_id], references: [vehicles.id] }),
	user: one(users, { fields: [travels.user_id], references: [users.id] })
}));

export const taskTemplatesRelations = relations(task_templates, ({ one, many }) => ({
	user: one(users, { fields: [task_templates.user_id], references: [users.id] }),
	vehicle: one(vehicles, { fields: [task_templates.vehicle_id], references: [vehicles.id] }),
	active_trackers: many(active_trackers)
}));

export const activeTrackersRelations = relations(active_trackers, ({ one, many }) => ({
	vehicle: one(vehicles, { fields: [active_trackers.vehicle_id], references: [vehicles.id] }),
	template: one(task_templates, {
		fields: [active_trackers.template_id],
		references: [task_templates.id]
	}),
	service_logs: many(service_logs)
}));

export const serviceLogsRelations = relations(service_logs, ({ one }) => ({
	vehicle: one(vehicles, { fields: [service_logs.vehicle_id], references: [vehicles.id] }),
	tracker: one(active_trackers, {
		fields: [service_logs.tracker_id],
		references: [active_trackers.id]
	})
}));

export const documentsRelations = relations(documents, ({ one }) => ({
	vehicle: one(vehicles, { fields: [documents.vehicle_id], references: [vehicles.id] }),
	user: one(users, { fields: [documents.user_id], references: [users.id] })
}));

export const workflowRulesRelations = relations(workflow_rules, ({ one }) => ({
	user: one(users, { fields: [workflow_rules.user_id], references: [users.id] }),
	vehicle: one(vehicles, { fields: [workflow_rules.vehicle_id], references: [vehicles.id] })
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
	user: one(users, { fields: [notifications.user_id], references: [users.id] }),
	vehicle: one(vehicles, { fields: [notifications.vehicle_id], references: [vehicles.id] })
}));

export const odometerLogsRelations = relations(odometer_logs, ({ one }) => ({
	vehicle: one(vehicles, { fields: [odometer_logs.vehicle_id], references: [vehicles.id] }),
	user: one(users, { fields: [odometer_logs.user_id], references: [users.id] })
}));

export const financeTransactionsRelations = relations(finance_transactions, ({ one }) => ({
	vehicle: one(vehicles, { fields: [finance_transactions.vehicle_id], references: [vehicles.id] }),
	user: one(users, { fields: [finance_transactions.user_id], references: [users.id] })
}));

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = typeof vehicles.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type MagicLinkToken = typeof magic_link_tokens.$inferSelect;
export type TaskTemplate = typeof task_templates.$inferSelect;
export type InsertTaskTemplate = typeof task_templates.$inferInsert;
export type ActiveTracker = typeof active_trackers.$inferSelect;
export type InsertActiveTracker = typeof active_trackers.$inferInsert;
export type ServiceLog = typeof service_logs.$inferSelect;
export type InsertServiceLog = typeof service_logs.$inferInsert;
export type OdometerLog = typeof odometer_logs.$inferSelect;
export type InsertOdometerLog = typeof odometer_logs.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;
export type WorkflowRule = typeof workflow_rules.$inferSelect;
export type InsertWorkflowRule = typeof workflow_rules.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type PushSubscription = typeof push_subscriptions.$inferSelect;
export type InsertPushSubscription = typeof push_subscriptions.$inferInsert;
export type FinanceTransaction = typeof finance_transactions.$inferSelect;
export type InsertFinanceTransaction = typeof finance_transactions.$inferInsert;
export type Travel = typeof travels.$inferSelect;
export type InsertTravel = typeof travels.$inferInsert;
