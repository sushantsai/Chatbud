# Google sign-in and Meet

Google authentication uses Supabase Auth. Meeting creation uses the API's existing connected Google account. These are separate OAuth grants; signing in does not grant Meet access or professional/team roles. AI activation is paused and this change does not include the AI support branch.

## Google sign-in

1. In Google Cloud, create or reuse a **Web application** OAuth client. Set its authorized redirect URI to `https://xwqgsvnyutqahrboalch.supabase.co/auth/v1/callback`. Configure the consent screen and its audience/test users for the intended release.
2. In [Supabase → Authentication → Sign In / Providers → Google](https://supabase.com/dashboard/project/xwqgsvnyutqahrboalch/auth/providers), enter the client ID and secret directly and enable the provider. Do not put its secret in web environment variables or source control. Existing production Vercel Google credentials are sensitive and cannot be read back for reuse.
3. Supabase's redirect allowlist includes these exact application callbacks (preserving existing entries):
   - `https://chatbud-web.vercel.app/auth/callback`
   - `https://chatbud-web-git-feat-google-auth-meet-myself-80fb.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`
4. Use **Continue with Google** in the client sign-in dialog, professional portal or team portal. The browser uses PKCE and the SDK exchanges the callback code once, then verifies the user and returns to a validated path on the same origin. Only `openid email profile` are requested. Email confirmation now also uses this callback; open confirmation links in the initiating browser for automatic sign-in.

`GET /api/auth/providers` reports only provider availability, never credentials. The button gives an email/password alternative when Google is unavailable. A Google account receives the same consumer onboarding as any other account; professional verification and team roles still require existing approval procedures. Provider availability is not proof that Google consent and redirect configuration work: verify a real Google login after saving credentials.

## Google Meet

Production API credentials already exist: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`. Keep them server-side and scoped to the intended deployment. Do not copy production sensitive secrets into a preview to test this change.

Enable the **Google Meet REST API** in that Google Cloud project. The connected organizer account must have granted `https://www.googleapis.com/auth/meetings.space.created` with offline access; a different OAuth client or revoked refresh token requires a fresh account authorization. This implementation creates Meet spaces directly; it does not create Calendar events, invite attendees or synchronize calendars.

The API checks the active account, booking ownership or support role, and eligible booking state before requesting a new room. Confirming a booking uses an existing room when available. Accepting a proposed reschedule also reuses it. Booking gateways check the final update again after the external API request. Concurrent confirmations or state changes during the external request can still leave an unused room; Google creation and the Postgres update do not share a transaction.

Meet spaces retain the existing `OPEN` access setting because a central Chatbud account creates them. Anyone with the link can join without waiting for that organizer. Treat meeting links as private. Professional-owned rooms and host admission require a separate per-professional connection flow.

If Google fails, booking confirmation retains the existing Jitsi fallback. `/health` reports the configured provider, not a live Google test result.

## Verify the connected account

A signed-in **SUPPORT** or **SECURITY_ADMIN** can open `/admin/integrations` and choose **Create test Meet room**. It creates an empty room, without invitations or booking changes. Success is reported only for an actual Google Meet URL; failures never report fallback success. Attempts are audited and limited to one per minute per account. The status and test API routes are authenticated and role checked. The UI does not automatically run the test.

Apply `supabase/migrations/20261025123239_google_meet_permissions.sql` before deploying the API. The migration has been applied to the Chatbud Supabase project. Its gateway is executable only by `service_role` and validates `auth.role()` internally. `supabase/tests/google_meet.sql` verifies role/ownership, reschedule state, expired holds, test budgets and suspended accounts with rollback-only fixtures.
