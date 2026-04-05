# Contributing

Thank you for considering to helping me out. Follow these steps to get your local environment running.

---

## Build & Development

### Prerequisites

* Node.js 20+
* npm 10+

### Setup

```bash
cd motomate && mkdir data
npm install
cp .env.example .env
npm run db:migrate
```

### Development

```bash
npm run dev          # Start dev server at http://localhost:5173
npm run check        # Svelte-check + TypeScript
npm run check:watch  # Watch mode
npm run lint         # ESLint + Prettier check
npm run format       # Auto-format with Prettier
npx svelte-check     # Run all checks
```

---

## Database

* **Schema**: `src/lib/db/schema.ts`
* **Migrations**: `./drizzle/`

```bash
npm run db:generate  # Generate migration from schema changes
npm run db:migrate   # Apply pending migrations
npm run db:studio    # Open Drizzle Studio (browser DB viewer)
```

---

## Build & Preview

```bash
npm run build        # Production build → ./build/
npm run preview      # Preview production build locally
```

The build uses `@sveltejs/adapter-node`, resulting in a Node.js server at `build/index.js`.

---

## Push Notifications

If you need to test push notifications locally, generate your own VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Copy the generated keys into your `.env` as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.