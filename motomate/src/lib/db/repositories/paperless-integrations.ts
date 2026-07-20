import { and, eq } from 'drizzle-orm';
import { db } from '../index.js';
import { documents, paperless_integrations } from '../schema.js';
import type { PaperlessIntegration } from '../schema.js';
import { generateId } from '../../utils/id.js';
import { PaperlessIntegrationInputSchema } from '../../validators/schemas.js';
import { PaperlessClient } from '../../server/paperless/client.js';
import { decryptPaperlessToken, encryptPaperlessToken } from '../../server/paperless/secret.js';

export type SafePaperlessIntegration = Omit<PaperlessIntegration, 'encrypted_token'> & {
	token_configured: true;
};

function withoutToken(integration: PaperlessIntegration): SafePaperlessIntegration {
	const { encrypted_token: _encryptedToken, ...safe } = integration;
	return { ...safe, token_configured: true };
}

export async function listPaperlessIntegrations(
	userId: string
): Promise<SafePaperlessIntegration[]> {
	const rows = await db.query.paperless_integrations.findMany({
		where: eq(paperless_integrations.user_id, userId),
		orderBy: (integration, { asc }) => [asc(integration.name)]
	});
	return rows.map(withoutToken);
}

export async function createPaperlessIntegration(
	userId: string,
	input: unknown
): Promise<SafePaperlessIntegration> {
	const parsed = PaperlessIntegrationInputSchema.parse(input);
	const client = new PaperlessClient({ baseUrl: parsed.base_url, token: parsed.token });
	await client.testConnection();
	const now = new Date().toISOString();
	const id = generateId();

	await db.insert(paperless_integrations).values({
		id,
		user_id: userId,
		name: parsed.name,
		base_url: client.baseUrl,
		encrypted_token: encryptPaperlessToken(parsed.token),
		enabled: parsed.enabled,
		last_tested_at: now,
		last_error: null,
		created_at: now,
		updated_at: now
	});

	const created = await getPaperlessIntegrationRecord(id, userId);
	if (!created) throw new Error('Paperless integration was not created');
	return withoutToken(created);
}

export async function deletePaperlessIntegration(id: string, userId: string): Promise<void> {
	const referencedDocument = await db
		.select({ id: documents.id })
		.from(documents)
		.where(and(eq(documents.paperless_integration_id, id), eq(documents.user_id, userId)))
		.limit(1);
	if (referencedDocument.length > 0) {
		throw new Error('Remove or move linked documents before deleting this integration');
	}
	await db
		.delete(paperless_integrations)
		.where(and(eq(paperless_integrations.id, id), eq(paperless_integrations.user_id, userId)));
}

export async function testPaperlessIntegration(
	id: string,
	userId: string
): Promise<{ apiVersion: string | null; serverVersion: string | null }> {
	const integration = await getPaperlessIntegrationRecord(id, userId);
	if (!integration) throw new Error('Paperless integration not found');

	try {
		const result = await getPaperlessClient(id, userId).then((client) => client.testConnection());
		await db
			.update(paperless_integrations)
			.set({ last_tested_at: new Date().toISOString(), last_error: null })
			.where(eq(paperless_integrations.id, id));
		return result;
	} catch (error) {
		await db
			.update(paperless_integrations)
			.set({
				last_tested_at: new Date().toISOString(),
				last_error: error instanceof Error ? error.message.slice(0, 500) : 'Connection failed'
			})
			.where(eq(paperless_integrations.id, id));
		throw error;
	}
}

export async function getPaperlessClient(id: string, userId: string): Promise<PaperlessClient> {
	const integration = await getPaperlessIntegrationRecord(id, userId);
	if (!integration || !integration.enabled) throw new Error('Paperless integration not found');
	return new PaperlessClient({
		baseUrl: integration.base_url,
		token: decryptPaperlessToken(integration.encrypted_token)
	});
}

async function getPaperlessIntegrationRecord(
	id: string,
	userId: string
): Promise<PaperlessIntegration | undefined> {
	return db.query.paperless_integrations.findFirst({
		where: and(eq(paperless_integrations.id, id), eq(paperless_integrations.user_id, userId))
	});
}
