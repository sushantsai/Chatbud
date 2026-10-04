# Chatbud

Development foundation for Chatbud Nepal, a digital health and wellbeing platform: mental-health, nutrition and fitness professionals (Care), Chatbud-owned wellness/supplement ecommerce (Store), and health insurance from licensed partners (Protect).

## What works

- Responsive care directory, nutrition filters, wellness shop, cart, care dashboard, practitioner application and reviewer workspaces.
- Supabase email/password authentication and verified-user API authentication.
- Live approved catalog and practitioner applications persisted in Supabase. Reviewer reads require a designated review role.
- Development preview with fictional data, signed browser sessions, appointment overlap checks, 10-minute holds, inventory reservations, idempotent requests, and application review actions.

Live care works end to end without payment: practitioners apply with verification details and documents, reviewers approve, request information or reject, approved practitioners set services and weekly hours, and clients request appointments that the practitioner confirms with a meeting link. Payments, in-app video, shipping and fulfillment are not enabled. Preview checkout collects no money and dispatches no products. Use fictional information in preview forms. The live catalog is empty until real professionals and products are onboarded.

## App structure

The web app has five tabs, each its own route: Home (`/`), Professionals (`/professionals`), Appointments (`/appointments`), Store (`/store`) and My Health (`/my-health`), plus `/practitioner`, `/review` and `/protect`. Shared session, catalog and bag state lives in `apps/web/app/_components/app.tsx`.

Each vertical is `live`, `soon` (shown as coming soon) or `off` (hidden) in `apps/web/app/_lib/features.ts`. Medicines and insurance are `soon`; content is `off`.

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

The smoke script requires both development servers. It checks preview isolation, bookings, inventory, idempotency, practitioner review and live authentication gates. `supabase/tests/gateway.sql` checks live gateway authorization and persistence inside a transaction that rolls back all test records. `supabase/tests/care.sql` does the same for review decisions, services, availability, slots and appointment requests.

## Architecture and deployment

`apps/web` is Next.js App Router. Browser API requests pass through a fixed-route server proxy to the NestJS API in `apps/api`. Supabase stores application data behind a server-only RPC; browser users cannot execute that RPC or read private schemas directly. The backend verifies the Supabase access token and derives the actor from the authenticated user.

Both apps deploy to Vercel as separate projects from this repository: the web project with root directory `apps/web`, and the NestJS API with root directory `apps/api`. Set `CHATBUD_API_URL` on the web project to the API's HTTPS URL, and `WEB_ORIGIN`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the API project. Vercel runs both with `NODE_ENV=production`, which disables preview routes; a self-hosted API must use `npm run start --workspace @chatbud/api` for the same effect. Public Supabase settings must be present when building the web app.

Set the same `DEMO_SESSION_SECRET` on both projects so the web proxy can sign each visitor's address for the API's traffic guard. Without it the live site still works, but the API limits all proxied traffic as one caller.

The in-memory traffic guards are per server instance. Shared edge rate limits, monitored secrets, account recovery/email redirects, operational review, payment webhooks and fulfillment workflows remain deployment work. Do not expose the development API as a production service.

See `supabase/README.md` for migration details. No secrets or real client/provider/product records are seeded in this repository.
