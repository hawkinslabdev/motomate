import { PUBLIC_DEMO_ENABLED } from '$app/env/public';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	return { demoMode: PUBLIC_DEMO_ENABLED === 'true' };
};
