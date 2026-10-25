# Chatbud AI support team

Chatbud needs one support operation for clients, professionals and staff, reachable through web chat, voice/phone, WhatsApp, email, Instagram and Facebook. Conversations support English, Nepali and Hindi. Each channel must share the same account permissions, booking workflow, ticket history and audit trail.

## Delivered in this change

- `/assistant`, `/pro/assistant` and `/admin/ai-team` provide client, professional and support-team workspaces.
- AI SDK 7 coordinates specialist agents through Vercel AI Gateway. The existing Next.js/NestJS/Supabase architecture is retained.
- Private, authenticated conversations and messages persist in Supabase. English, Nepali and Hindi are supported through a per-conversation language choice and translated entry controls.
- The booking specialist reads the approved directory and real availability. It prepares a reservation request; a separate user click executes it through the existing `chatbud_care` gateway. The resulting `HELD` appointment awaits professional confirmation and the existing payment flow.
- Cancellation proposals use the existing ownership and status checks. Booking prices, duration and service identity, and cancellation time/revision, are revalidated at confirmation. A stale proposal requires a fresh review.
- Tracking reads the current account's own appointments and orders; a professional can see their own appointments with clients. Clinical notes, research data, meeting links and delivery addresses are excluded from AI context.
- Communications specialists prepare saved drafts. Draft confirmation never sends a message. Recipient IDs are derived from the authenticated account's appointment relationship.
- Human handoff creates an actual ticket in the existing support inbox after the user confirms its summary. AI replies pause on that conversation to avoid conflicting support.
- Support staff can prepare public business/professional recruitment research briefs. Confirmed briefs are stored as `WAITING_CONNECTOR`; no social search, mailbox scan or outreach is claimed to have happened.
- Browser dictation and read-aloud are available when the browser supports the selected language. Dictation requires a microphone click, discloses browser processing, and puts the transcript in the composer for review. Audio is not uploaded to or stored by Chatbud in this implementation.
- A staff workspace shows agent responsibilities, channel readiness, handoff metadata and research briefs. It does not expose everyone's private AI transcripts.

This is the first implementation of the support platform. It is **not yet a connected, autonomous operation across every external channel**. Model credentials, verified channel adapters, lead-search ingestion, outbound delivery and phone infrastructure remain activation/build work.

## Agents and permissions

| Agent           | Tools                                                             | Access boundary                                                                  |
| --------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Concierge       | Delegate to permitted specialists                                 | Authenticated conversation; never executes confirmations                         |
| Booking         | Directory search, available times, booking/cancellation proposals | Published services and the user's own bookings                                   |
| Tracking        | Booking/order status                                              | Current client or professional account only                                      |
| Communications  | Message drafts, human handoff proposal                            | Appointment-linked recipients; drafts and user-approved ticket creation          |
| Operations      | Permitted queue counts                                            | `SUPPORT` or `SECURITY_ADMIN`; existing backend roles still apply                |
| Lead research   | Research brief proposals                                          | `SUPPORT` or `SECURITY_ADMIN`; public organizations and professional recruitment |
| Voice interface | Dictation/read-aloud of the same chat                             | Browser permission and user action; phone is a separate adapter                  |
| Human support   | Existing support tickets and escalation                           | Existing support portal and role checks                                          |

The lead research specialist receives only the current staff request, without earlier support/care conversation history.

The model never receives service credentials, raw SQL, a generic network tool, clinical records, role-management capability or the action-confirmation endpoint. Roles and account identity come from the server, not from the prompt. Website/social/email content must be treated as untrusted input, even after channel adapters are introduced.

## Architecture and data

A channel adapter will verify the provider event, deduplicate its ID, resolve a verified channel identity, and submit a normalized message. The coordinator selects a specialist. Each specialist can use only the tools assigned to it. Mutating tools prepare reviewable actions. Confirmation executes a narrow database transaction and produces the system result. Delivery adapters are separate from reasoning and bookings.

This release exposes only authenticated web endpoints:

| Endpoint                                  | Purpose                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| `GET /ai/status`                          | Public readiness and channel status, without credentials       |
| `GET/POST /ai/conversations`              | List own conversations or create one with language and consent |
| `GET /ai/conversation?conversationId=...` | Read owned messages and current action states                  |
| `POST /ai/chat`                           | Persist a user turn, run permitted agents, persist the reply   |
| `POST /ai/actions`                        | Owner-confirmed or rejected action, outside model control      |
| `GET /ai/team`                            | Support-role operational metadata and channel readiness        |

`assist` is a private database schema. Browser roles have no schema/table access or gateway execution privilege; all tables have RLS enabled. `public.chatbud_assist` is executable only by `service_role`. It verifies an active application account and enforces ownership/roles on every operation, consistent with Chatbud's existing server-only gateways.

Tables:

- `conversation`: owner, language, channel, AI-processing consent version, status and linked support ticket.
- `message`: user/assistant messages with a stable sequence and run association.
- `run`: request-id deduplication, running/succeeded/failed state, token count and saved response.
- `action`: exact proposed payload, summary, expiration, decision and system result.
- `communication_draft`: appointment-linked recipient, author and unsent draft body.
- `research_job`: public research brief, creator, source platform and waiting state.

A request ID is bound to its original conversation and text. Repeating a finished turn returns the saved result without a new model call. Only one active turn is allowed per conversation; abandoned runs expire after 90 seconds. Actions require a completed run, expire after 30 minutes, lock on confirmation and are idempotent. Failed runs reject their unfinished proposals. A human handoff pauses further AI actions in that conversation.

Per account: 20 new conversations/day, 30 turns/hour and a soft 100,000 recorded-token daily threshold. Per turn: three specialist delegations, twelve specialist tool calls, bounded SDK step loops, bounded output tokens, no provider retry and a 45-second model timeout. These are application limits, not a hard currency-spend guarantee. Configure a Gateway budget and provider retention policy before activating production traffic.

## External channel implementation plan

All six requested customer-facing channels are in scope. Their adapters are not fabricated by a configuration flag.

| Channel            | Required account/infrastructure                           | Next implementation                                                                                                 |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Web chat           | Existing Chatbud login; AI Gateway                        | Activate model after credentials and evaluation                                                                     |
| Voice in browser   | Browser microphone/speech support                         | Test Nepali/Hindi voice availability on target devices                                                              |
| Phone              | Licensed/available telephony provider and business number | Signed inbound webhooks, speech/realtime session, interruption handling, caller verification and transfer to staff  |
| WhatsApp           | WhatsApp Business account and number                      | Meta permissions, webhook verification, identity linking, session window and approved outbound templates            |
| Email              | Verified sending domain and permitted inbound mailbox     | Verify signatures/events, parse threads/attachments safely, suppress bounces/unsubscribes, queue and track delivery |
| Instagram          | Professional account and approved Meta access             | Messaging webhooks, scope verification, account linking and platform response restrictions                          |
| Facebook Messenger | Business Page and approved Meta access                    | Signed events, Page identity, conversation windows and handoff routing                                              |

Cross-channel identities must be linked by a verified, one-time account flow. A matching name, social profile or email display field cannot unlock account data. Unverified contacts may ask general public questions but cannot read bookings, orders or professional records. Phone caller ID alone is not identity verification. Identity-linking tokens must never be placed in model context or logs.

Before phone recording or persistent transcription, present the required notice and obtain recording consent. Browser dictation in this release is not an implemented phone agent and does not promise recordings or transfers.

## Lead generation and email workflow

1. Staff supplies the geography, organization/professional criteria, platform, purpose and volume. Separate partnership/recruitment research from opted-in consumer inquiries.
2. Use approved public search/data APIs and authorized business inboxes. Store source URL, observation time, provenance and permitted use. Do not scrape private accounts or infer health conditions from posts or care data.
3. Deduplicate organizations, professionals and contacts; verify contact information; score for the declared business purpose.
4. Put proposed outreach in a staff review queue with its exact recipient, message, language and channel.
5. Check permission to contact, suppression/opt-out lists, channel windows, campaign caps and template requirements immediately before sending.
6. Execute through an outbox worker using an idempotency key. Record delivery, failure, reply and unsubscribe events. Stop scheduled follow-up when a reply, handoff or opt-out occurs.
7. Convert qualified, permitted inquiries to client/professional onboarding; never create or expose a clinical profile merely because someone was a lead.

The current research table stores briefs only. Search ingestion, a lead/contact CRM, permission/suppression lists, sender domain and campaign workers are explicit remaining work. No campaign or mailbox access is started by this change.

## Activation

In the API's secure environment:

```dotenv
ENABLE_AI_ASSISTANT=true
AI_GATEWAY_MODEL=<an exact current provider/model ID>
AI_GATEWAY_API_KEY=<server-only gateway key>
```

A Vercel deployment may use its injected `VERCEL_OIDC_TOKEN` instead of a key. The model must support tool calls and the selected languages. Fetch current IDs from `https://ai-gateway.vercel.sh/v1/models`; do not copy a model name from an old document. Never put a secret in a `NEXT_PUBLIC_` variable, repository, chat or log. Restart/redeploy the API after configuration. No Gateway credential is configured in this workspace, so the UI currently reports that the AI connection is required and cannot start live AI conversations.

Before a production pilot, evaluate real model behavior in English, Nepali and Hindi: scheduling ambiguity, wrong dates/timezones, cancelled/expired orders, prompt injection, unauthorized data requests, clinical advice, urgent distress and human handoff. The current keyword urgent-distress guard and mocked agent tests are not a validated clinical screener or a guarantee of model behavior. Use the existing emergency guidance and a staffed escalation procedure.

Conversation data is potentially sensitive. Add an explicit retention/deletion schedule, role-scoped audit access, provider data-processing terms, operational alerting and channel-specific consent before broad rollout. Avoid putting message bodies or source contact data in operational logs or analytics tags.

## Validation

- `npm run check`: web and API TypeScript checks.
- `npm test`: existing contracts plus real AI SDK orchestration using its mock provider; no paid model calls.
- `supabase/tests/assistant.sql`: transactions verify ownership, staff permissions, request/confirmation idempotency, stale-price rejection, actual appointment creation, private tracking, drafts without delivery, human handoff and suspended-account denial. All synthetic data rolls back.
- Build and browser checks distinguish actual backend checks from mocked UI responses. External provider delivery and real model language quality require credentials and separate live verification.

### Verified result for this change

Web/API type checks and the production build pass. All 40 API tests pass, including seven AI runtime/contract tests. The production API/proxy rejects unauthenticated and forged-token requests; the real signed-out assistant screen renders correctly. Browser fixtures verify language selection, consent, retry after model failure, action confirmation, mobile layout, handoff pause and channel status with no browser exceptions. Screenshots use synthetic UI fixtures. Transactional tests against Supabase verify the actual authorization and booking/ticket state changes and roll back all test records. Live Gateway model generation, telephone calls and external channel delivery were not exercised because those connections are absent.
