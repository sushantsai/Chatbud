# Chatbud

Development foundation for Chatbud Nepal: mental-health professionals, nutritionists and dietitians, and Chatbud-owned wellness/supplement ecommerce.

## What works

- Responsive care directory, nutrition filters, wellness shop, cart, care dashboard, practitioner application and reviewer workspaces.
- Supabase email/password authentication and verified-user API authentication.
- Live approved catalog and practitioner applications persisted in Supabase. Reviewer reads require a designated review role.
- Development preview with fictional data, signed browser sessions, appointment overlap checks, 10-minute holds, inventory reservations, idempotent requests, and application review actions.

Live booking, payments, video consultations, credential approval, shipping and fulfillment are not enabled. Preview checkout collects no money and dispatches no products. Use fictional information in preview forms. The live catalog is empty until real professionals and products are onboarded.

## Local development

Node 22 or later, npm, and Python 3 are required. Install dependencies with `npm ci`.

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local`. Configure Supabase keys and set the same random `DEMO_SESSION_SECRET` in both files. Keep the service-role key in the API environment only. Environment files are ignored by Git.

Alternatively, authenticate the Supabase CLI and configure development settings with:

```sh
python scripts/configure-local-env.py --project-ref xwqgsvnyutqahrboalch
```

Use `--cli /path/to/supabase` if the executable is not on PATH. Existing environment settings and the preview signing secret are preserved.

Run these in separate terminals from the repository root:

```sh
npm run dev:api
npm run dev:web
```

Open `http://localhost:3000`. The API listens at `127.0.0.1:3001`. Select **Explore preview** for fictional data or **Live database** for the real catalog/account flows. The API must be reachable from the web server.

```sh
npm run check
npm run build
node scripts/smoke.mjs
```

The smoke script requires both development servers. It checks preview isolation, bookings, inventory, idempotency, practitioner review and live authentication gates. `supabase/tests/gateway.sql` checks live gateway authorization and persistence inside a transaction that rolls back all test records.

## Architecture and deployment

`apps/web` is Next.js App Router. Browser API requests pass through a fixed-route server proxy to the NestJS API in `apps/api`. Supabase stores application data behind a server-only RPC; browser users cannot execute that RPC or read private schemas directly. The backend verifies the Supabase access token and derives the actor from the authenticated user.

Deploy the web project with Vercel root directory `apps/web`. Deploy the NestJS API as a separate Node service, then set `CHATBUD_API_URL` to its reachable HTTPS URL and configure its `WEB_ORIGIN`, Supabase credentials, and host binding. Production must use `npm run start --workspace @chatbud/api`, which sets `NODE_ENV=production` and disables preview routes. Both web and API production environments need the shared server-only session secret. Public Supabase settings must be present when building the web app.

The current in-memory traffic guards are development protections. Shared edge rate limits, monitored secrets, account recovery/email redirects, operational review, payment webhooks and fulfillment workflows remain deployment work. Do not expose the development API as a production service.

See `supabase/README.md` for migration details. No secrets or real client/provider/product records are seeded in this repository.
