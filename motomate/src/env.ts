import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	AUTH_SECRET: { schema: (input) => input },
	PUBLIC_APP_URL: { public: true, schema: (input) => input },
	PUBLIC_DEMO_ENABLED: { public: true, schema: (input) => input },
	SMTP_HOST: { schema: (input) => input },
	SMTP_PORT: { schema: (input) => input },
	SMTP_SECURE: { schema: (input) => input },
	SMTP_USER: { schema: (input) => input },
	SMTP_PASS: { schema: (input) => input },
	SMTP_REJECT_UNAUTHORIZED: { schema: (input) => input },
	SMTP_FROM: { schema: (input) => input },
	STORAGE_LOCAL_PATH: { schema: (input) => input },
	DATABASE_URL: { schema: (input) => input },
	VAPID_PUBLIC_KEY: { schema: (input) => input },
	VAPID_PRIVATE_KEY: { schema: (input) => input },
	VAPID_SUBJECT: { schema: (input) => input },
	ALTCHA_HMAC_KEY: { schema: (input) => input },
	OIDC_ISSUER: { schema: (input) => input },
	OIDC_CLIENT_ID: { schema: (input) => input },
	OIDC_CLIENT_SECRET: { schema: (input) => input },
	OIDC_SCOPES: { schema: (input) => input },
	OIDC_NAME: { schema: (input) => input },
	OIDC_TRUST_UNVERIFIED_EMAIL: { schema: (input) => input },
	AUTH_ALLOW_REGISTRATION: { schema: (input) => input },
	OIDC_ALLOW_SIGNUP: { schema: (input) => input }
});
