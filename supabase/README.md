# Chatbud Supabase

Project `chatbud`, reference `xwqgsvnyutqahrboalch`.

Migrations:

1. `20261003000100_chatbud_initial.sql`: 58 application tables across `core`, `care`, `shop`, `finance`, and `ops`; integrity constraints, RLS, inventory and finance ledgers.
2. `20261003000200_api_gateway.sql`: narrow server-only `public.chatbud_api` RPC for catalog, accounts, personal dashboard, practitioner applications and reviewer reads.
3. `20261003000300_active_provider_catalog.sql`: exclude suspended/deactivated provider accounts from published listings.
4. `20261003000400_unambiguous_profession.sql`: unambiguous PL/pgSQL application category variable.
5. `20261004000100_pin_trigger_search_path.sql`: fixed search path for the stock and ledger trigger functions.
6. `20261004000200_provider_application_details.sql`: structured practitioner application stored on the verification case, and the private `credential-evidence` storage bucket.

All migrations have been applied to this project. Browser roles have no direct access to the application schemas or gateway RPC. The RPC permits only the service role; NestJS verifies the user token and supplies the authenticated actor. This first implementation uses the Supabase service-role key in the backend, so protecting that environment is essential.

No real professionals, products or clients are seeded. Profession reference rows carry pending-review policy markers. Live bookings and checkout are gated until their operational workflows are implemented.

`tests/gateway.sql` verifies authorization, practitioner application persistence, audit and reviewer access in a transaction, then rolls back its synthetic records. Apply migrations to a fresh development Supabase project in order; do not reapply the initial migration to this already provisioned project.

CLI credentials are stored outside this repository. Never commit tokens, passwords or service-role keys.
