# Chatbud

Development foundation for Chatbud Nepal, a digital health and wellbeing platform: mental-health, nutrition and fitness professionals (Care), Chatbud-owned wellness/supplement ecommerce (Store), and health insurance from licensed partners (Protect).

## Current release

The 26 October workflow release implements the accepted client care layouts, dedicated professional profiles and booking pages, appointment status/detail pages, the urgent admin queue, finance-only refund evidence, guided service setup, account-saved applications, clinical intake updates, author-only session notes, explicitly published care-plan versions, task progress and scheduling follow-ups.

New paid appointments require full online payment. Payment reservation lasts 10 minutes; approval services escalate to a staff call case at 30 minutes and expire after 60 minutes. Instant services confirm on verified payment. A database cron checks deadlines every minute, releases expired stock holds, creates in-app reminders and routes overdue cases. It does not place calls or send external messages. AI integration remains paused.

The Store retains its existing visual baseline with the locked category, product-page, Bag and checkout workflows. Phone verification, published delivery areas and stock checks are enforced on the server. Online stock holds last 15 minutes. Late payments recheck fulfillment or create a refund case. Whole-order returns are reviewed after receipt/inspection or authorized waiver; selected-item and other exceptions go through support review.

English is the default. The language selector supplies Nepali/Hindi navigation and key booking/status controls; remaining English screen copy and notification templates require translation review before a complete three-language launch. Professional-authored clinical content is not automatically translated.

Actual online payment, SMS OTP delivery, Google OAuth/Meet and Calendar depend on their provider configuration. Sandbox payments are disabled in production. Publishing delivery areas/fees, the official Nepal holiday calendar, staff role grants and staffing availability are operating setup tasks. No delivery coverage, gateway payout or external reminder is simulated as completed.

Previous UI: https://chatbud-classic.vercel.app (Vercel sign-in required). Archived source: `archive/ui-before-locked-redesign-20261026`, commit `d0e12084f868213115c2ae08be38a4e6b8ed3acd`. Presentation rollback does not undo shared database policies. See [release record](docs/releases/2026-10-26.md).

## App structure

Client navigation is Home, Care, Appointments, Store and My Health, with persistent Help. Profiles use `/professionals/:id`, bookings `/book/:service`, appointment details `/appointments/:id`, products `/store/:id`, and the Bag `/bag`. Professionals work under `/pro`; the team works under `/admin`, including the operations queue, finance, verification, roles and operating settings.

Browser requests use the Next.js fixed-route proxy to the NestJS API. The API verifies the Supabase user and derives their actor ID. Private schemas have deny-by-default RLS; only service-only RPCs can read or change records. Each action checks its own ownership/permission. Finance and supervisor grants are separate; ordinary support cannot read clinical answers or private notes.

Google integration setup is in [GOOGLE_SETUP.md](GOOGLE_SETUP.md). Configured credentials do not establish successful Google login or meeting creation; connection checks are still required.

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
npm test
npm run build
node scripts/smoke.mjs
```

`npm test` runs the API's request-contract tests. The smoke script requires both development servers. It checks preview isolation, bookings, inventory, idempotency, practitioner review and live authentication gates. `supabase/tests/gateway.sql` checks live gateway authorization and persistence inside a transaction that rolls back all test records. `supabase/tests/care.sql` does the same for review decisions, services, availability, slots and appointment requests. `supabase/tests/health.sql` covers goals, scope-limited plans and consent-gated sharing. `supabase/tests/ops.sql` covers grievances, booking oversight, catalogue, offers, promo codes and team roles.

## Architecture and deployment

`apps/web` is Next.js App Router. Browser API requests pass through a fixed-route server proxy to the NestJS API in `apps/api`. Supabase stores application data behind a server-only RPC; browser users cannot execute that RPC or read private schemas directly. The backend verifies the Supabase access token and derives the actor from the authenticated user.

Both apps deploy to Vercel as separate projects from this repository: the web project with root directory `apps/web`, and the NestJS API with root directory `apps/api`. Set `CHATBUD_API_URL` on the web project to the API's HTTPS URL, and `WEB_ORIGIN`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the API project. Vercel runs both with `NODE_ENV=production`, which disables preview routes; a self-hosted API must use `npm run start --workspace @chatbud/api` for the same effect. Public Supabase settings must be present when building the web app.

Set the same `DEMO_SESSION_SECRET` on both projects so the web proxy can sign each visitor's address for the API's traffic guard. Without it the live site still works, but the API limits all proxied traffic as one caller.

The in-memory traffic guards are per server instance. Shared edge rate limits, monitored secrets, account recovery/email redirects, operational review, payment webhooks and fulfillment workflows remain deployment work. Do not expose the development API as a production service.

See `supabase/README.md` for migration details. No secrets or real client/provider/product records are seeded in this repository.
