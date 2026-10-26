# Chatbud workflow and UI/UX change plan

Discussion draft · 25 October 2026 · Planning only

This document consolidates the decisions agreed in the planning conversation. It does not authorize implementation, activate integrations, change production settings, or establish that planned capabilities already work. Items labelled **Proposed** or **Open** need further agreement.

The consolidated screen map has been accepted as the **planning baseline**. This accepts the navigation and functional screen grouping as the direction for further planning; detailed layouts and unresolved operating rules still need agreement. Implementation remains on hold.

## 1. Agreed scope and design direction

- Work order: client care and booking first, professional/admin workflows second, ecommerce third.
- Visual direction: minimal and clinical, with restrained colours and compact, information-focused screens.
- Languages: English, Nepali and Hindi. English is the default; users choose their preferred language for screens and booking/order notifications.
- Client primary navigation: Home, Care, Appointments, Store, My Health. Desktop uses a header and mobile uses a bottom navigation bar, with consistent labels. Account settings and support remain accessible.
- Signed-in client Home prioritizes the next appointment, pending booking actions, the intake checklist and today's care tasks.
- Home layout refinement: remove the three summary count cards and lead with the next appointment and required client actions.
- Mobile Care filters: keep search and care categories visible; use a drawer for language, price and availability, with active-filter chips and a result count visible on the page. The price filter starts at All prices.
- First-time, signed-out visitors choose a need within Mental Health, Nutrition or Fitness, then see relevant professionals. Browsing does not require an account.
- Profile-to-booking presentation: a dedicated professional profile page followed by a dedicated step-by-step booking page. Preserve selections through sign-in and payment.
- Professional-profile information order: a compact qualifications, approved-service scope and language summary immediately below the name/photo, then services/prices, with the full biography below.
- Service-card buttons use Choose a time for both booking types. Each card shows price, duration, intake requirements and confirmation type before selection; its badge distinguishes instant confirmation from professional approval.
- Professional landing screen: an action dashboard prioritizing today's sessions, requests needing a response, and unfinished care plans/follow-ups.
- Admin landing screen: a role-filtered action queue ordered by urgency and deadlines, with summary counts above it. Users only see information allowed by their role.
- Store presentation: dedicated product pages followed by checkout steps Phone → Delivery → Review & Payment. Preserve the bag through phone verification.
- Client support presentation: a dedicated Support workspace with booking/order-linked conversations and case progress, accessible through a persistent Help control.
- Pending-approval and refund tracking: keep status, amount, deadline and next action visible on the appointment page; detailed timeline/history is expandable.
- Confirmed appointment joining: activate Join session 10 minutes before the scheduled start. Before then, clients can still access session details, intake and support.
- Accepted visual baselines: v2 appointment-state presentation (confirmed/preparation, active Join window, paid/awaiting approval and refund progress), v3 Home/Care layouts (action-first Home without count cards, mobile Care Filters drawer with chips/counts), and v4 professional profile (compact qualifications/scope/languages, services/prices, then biography; Choose a time on both service cards). The v5 booking layout is also accepted: conditional account/intake stages, a slot recheck and 10-minute reservation on entry to Review & pay, and unavailable/expired-hold recovery.
- Physical catalog: Chatbud sells and fulfills its own wellness products and supplements.
- Booking coordination: all coordination between clients and professionals goes through Chatbud's AI/customer-service team.
- Coordination coverage: 24/7, seven days a week, through AI and/or in-house customer service. This supersedes the earlier restricted-hours proposal.
- AI coordination is part of the planned operating model. AI integration was previously paused; discussing its role here does not activate it or authorize implementation.

## 2. Client care and booking: agreed rules

### Service configuration

Each verified professional chooses instant confirmation or professional approval separately for each service. They also configure intake requirements per service. Clients must be told which booking type and intake requirements apply before paying.

Existing confirmed bookings keep their agreed price and terms when a professional changes service settings.

### Payment and booking timelines

| Stage | Agreed behaviour |
|---|---|
| Before payment | Sign in and complete any required pre-payment intake without a slot hold. Time selection alone does not reserve the slot. |
| Entry to Review & pay | Recheck slot availability and booking eligibility, then reserve the selected slot for 10 minutes. If unavailable, preserve selections/completed intake and offer another time before collecting payment. |
| Payment completes after the 10-minute reservation expires | Recheck the original slot and booking rules. Complete the booking if still eligible, using the service's original instant/approval mode. Otherwise open a CRM case offering another time or a full refund; do not silently move the client. |
| Instant-confirmation service | Full online payment is required before confirmation. |
| Instant booking notice | At least one hour before the session. Professionals may require longer notice per service. |
| Join session | Becomes active 10 minutes before a confirmed appointment's scheduled start. Before that, details, intake and support remain available. |
| Approval-based service | Collect payment before the professional's decision; display Paid · Awaiting professional approval. |
| Approval request timing | The request must be submitted at least four hours before the session. |
| 30 minutes after successful payment, still unaccepted | Create a confirmation-call task for AI/customer service. This is an escalation, not an expiry. |
| Explicit professional acceptance during a call | AI or staff may record that acceptance and confirm an active request. Unclear responses go to a human. |
| 60 minutes after successful payment, still unaccepted | Expire the request and automatically create a CRM case eligible for a full refund. |
| Professional declines a paid request | Automatically create a CRM case eligible for a full refund. |

The 30- and 60-minute clocks start after successful payment, not when payment is opened. Acceptance must occur while the request remains active. Approval-based bookings require at least four hours' notice; instant bookings require at least one hour, with professionals permitted to require longer per-service notice. Availability and payment handling must account for the 10-minute reservation when checking these cutoffs.

### Cancellations, rescheduling and attendance

| Situation | Agreed rule |
|---|---|
| Client cancels before professional approval | Cancel the request and automatically create a CRM case eligible for a full refund. |
| Client cancels a confirmed appointment at least 24 hours beforehand | Eligible for a full refund. |
| Client cancels less than 24 hours beforehand | Admin reviews refund eligibility individually. |
| Client requests a new time with the same professional and service | One free reschedule at least 24 hours before the session. Late or additional requests require admin review. |
| Client has requested a reschedule | Keep the original appointment valid until the replacement time is confirmed. |
| Professional cancels a confirmed appointment | Let the client choose a full refund or rescheduling. Never move or reassign the client without consent. |
| Professional initiates a change | Do not consume the client's free reschedule allowance. |
| Client does not join | Allow a 15-minute grace period, then mark no-show. Any refund request requires admin review. |
| Professional does not join after a 15-minute grace period | Log a CRM incident. Customer service verifies it, then offers the client a full refund or rescheduling without using their free-change allowance. |
| A technical failure prevents the session from taking place | Open a CRM incident. Staff verify what happened, then offer the client a full refund or rescheduling when the session could not take place. |

Professional no-show and technical-failure prevention remedies are agreed above. Disputed attendance, partially completed/interrupted sessions and the effect of technical-failure rescheduling on the free-change allowance still need detailed rules.

### Intake and communication

- Professionals configure intake requirements per service and choose whether completion is required before payment or after confirmation, before the session. Skip checkout intake when it is due later; for approval-based requests, post-confirmation intake becomes due after professional acceptance.
- If required post-confirmation intake is incomplete as the session approaches, send reminders and alert the professional. The professional decides whether to proceed or ask customer service to arrange the next step. Incompleteness alone does not trigger an automatic joining block or cancellation.
- Internal access to completed clinical intake is limited to the assigned professional. Booking AI and customer service see completion status and scheduling details, not the completed clinical answers.
- The client can review their own submission; the restriction above concerns internal access.
- Submitted intake is preserved; clients provide dated updates and the assigned professional is notified. Updates do not overwrite the original or expose clinical answers to support/booking AI.
- Private session notes are separate from client-facing care plans and readable internally only by their authoring professional. Care-plan revisions remain drafts while the current published version stays client-visible. Explicit publication creates a new version of the same plan, retains earlier published versions and notifies the client. See [care-workflow review](Chatbud_Intake_Care_Plan_Review.md); v1 detailed layouts are accepted as the planning baseline.
- All booking coordination goes through Chatbud's AI/customer-service team. The consultation itself remains between the client and professional.

### Proposed client journey

Choose concern → compare professionals → review professional/service → select time → sign in if needed while retaining selections → complete intake only if required before payment → recheck availability and begin the 10-minute hold on entry to Review & pay → review total and policies → pay → receive the appropriate confirmation or pending-approval state. Later intake appears in the preparation checklist after confirmation.

After confirmation: prepare → complete any remaining intake → join consultation → receive the professional's care plan → track goals and arrange follow-up.

The intake/care-plan layouts are accepted as the planning baseline. Task progress at launch includes completion, optional notes and measurements configured by the professional. Submitted progress is visible to the client and assigned professional, with a clear audience notice; support cannot read clinical notes or measurements. Unchanged tasks carry progress across published plan revisions, while revised/removed tasks retain separate history. A professional's target follow-up date creates a Chatbud coordination task; the client still chooses and pays for an eligible booking under existing rules. Task progress/follow-up wireframes v1 are accepted as the planning baseline; see [review brief](Chatbud_Task_Progress_Followup_Review.md).

Care-task reminders follow each professional-configured task schedule separately, using generic wording without clinical details. Clients can adjust delivery time or mute reminders. The first follow-up contact is due within 24 hours of the recommendation under planned 24/7 coverage, sooner when target date/booking notice requires it. Allow up to two additional unanswered-contact attempts, at least 24 hours apart, then pause for human review. Stop outreach on decline/opt-out. A missed first-contact deadline immediately alerts a supervisor and reassigns to an available qualified coordinator, retaining the current owner if none is available. Preserve the original deadline. See [reminder/contact wireframes](Chatbud_Reminders_Followup_Contact_Review.md), accepted as the planning baseline.

Preserving selections through sign-in and payment is agreed. The v2 appointment states and v5 booking layout are accepted planning baselines. Neither statement claims the current implementation already satisfies the plan.

## 3. Professional and admin workflow: agreed rules

### Professional control

- Verified professionals manage services, fees, intake, booking type and hours within their approved scope.
- Admin reviews scope changes.
- Professional applications and scope changes may be approved only by designated verification team members with explicit approval permission. Service/availability setup remains locked until professional approval; approval does not itself publish a service.
- Application verification requires profession-specific checklists for identity evidence, qualifications and registration/licence where applicable. Provide review feedback within two working days after each complete submission/resubmission, using Monday–Friday Nepal working days excluding Nepal public holidays. This is a response target, not guaranteed or automatic approval.
- Application drafts autosave to the signed-in account for cross-device resume. Correction requests identify individual fields/documents with reasons and preserve accepted work. Not-approved applicants receive a written reason and may request human re-review with clarification or new evidence. Service setup remains locked until approval. See [onboarding/verification wireframes](Chatbud_Onboarding_Verification_Review.md), accepted as the planning baseline.
- Professionals set weekly working hours and block time in Chatbud.
- Google Calendar sync is optional; it is not a condition for enabling instant confirmation.
- If an enabled Google Calendar connection stops syncing, continue accepting new bookings using Chatbud availability with a prominent sync warning. Do not automatically pause services; existing bookings and paid approval requests remain intact.
- Service setup uses guided steps: Basics → Booking & Intake → Availability → Preview & Publish. Preserve drafts and show a client-facing preview before publication. See [service/availability review](Chatbud_Service_Availability_Review.md); v1 detailed wireframes are accepted as the planning baseline.
- Confirmed appointments retain their agreed price and terms after later service changes.

### Case ownership and confirmation calls

- CRM cases include confirmation calls, cancellations, refund tasks and support issues.
- Automatically assign an available team member according to role, case type and workload.
- Escalate an urgent booking-related task to a supervisor after five minutes without action following assignment. This does not extend the 30-minute confirmation-call trigger or the 60-minute booking expiry. Non-booking escalation deadlines and detailed fallback ownership still need definition.
- AI or staff can record explicit professional approval received during a confirmation call and confirm an active booking. Unclear responses require human review.

### Refund operation

Automatic case creation does not mean an automatic money transfer. The current planned workflow accounts for gateways requiring manual refunds.

1. A rule or an admin review establishes refund eligibility.
2. Create or update the linked CRM refund case.
3. Staff initiate the gateway refund within **one business day** of eligibility.
4. Record the amount, gateway reference and processing progress.
5. Record completion only when the refund has actually completed.

Gateway settlement time is separate from Chatbud's initiation deadline. The agreed deadline is **6 PM Nepal time on the next Monday–Friday working day, excluding Nepal public holidays**. Customer-service coverage remains 24/7; it does not change this finance calendar.

Only designated finance staff may initiate gateway refunds or record payout progress/completion. Support coordinates cases and client updates. Supervisors require a separate finance permission to perform payout actions. Routine refunds already eligible under agreed rules do not require a second person's approval before initiation; finance still verifies payment receipt and the refundable balance. Authorized supervisors decide exceptional eligibility and amounts; finance processes the approved outcome. Completion requires the gateway refund reference, amount, completion date and payout confirmation proving returned funds; no separate client acknowledgment is required. See [finance review](Chatbud_Finance_Refund_Review.md) and its standalone v1 wireframes, accepted as the planning baseline.

### Proposed workspaces

- Agreed professional landing view: today's sessions, requests needing a response, and unfinished care plans/follow-ups. Proposed supporting information includes intake completion and availability changes.
- Agreed professional request presentation: open a focused detail screen before accepting/declining, with booking context and response deadline visible with the decisions.
- Agreed admin landing view: a role-filtered action queue ordered by urgency and deadlines, with summary counts above it. Proposed queue fields include owner, case type, booking/order/payment reference, age, next action and deadline.
- Agreed admin case presentation: desktop queue beside the selected case; mobile full-page case returning to the same queue filters, selection and position.
- Refund view: eligibility, approval/review where needed, amount, initiation deadline, gateway reference, progress and completion evidence.
- Clear distinction between customer-visible updates and internal notes.
- Confirmation records identify the booking, professional acceptance, timestamp and AI/staff actor. No inferred acceptance from an unclear call or voicemail.
- Agreed refund role boundaries: support coordinates; designated finance staff alone process and record payouts. Supervisor status does not grant payout access. Routine eligible refunds need no second approval; authorized supervisors decide exceptional eligibility and amount. Verification-role permissions remain a separate review.

## 4. Ecommerce: agreed rules

| Area | Decision |
|---|---|
| Seller and fulfillment | Chatbud owns and fulfills the catalog. |
| Products | Wellness products and supplements. |
| Checkout identity | Use phone OTP to sign in or create an account. |
| Payments | Online payment and cash on delivery where coverage supports it. |
| Launch coverage | Kathmandu Valley first, then expand. |
| Delivery fees | Charge by delivery area; disclose the total before the customer commits. |
| COD verification | Phone OTP plus stock, address and coverage checks. Call only flagged orders. |
| Change-of-mind returns | Within seven days of delivery; unopened, unused, with seals intact where applicable. |
| Damaged, incorrect or faulty items | Separate support-review process. |
| Return shipping | Chatbud pays shipping for every approved return, including approved change-of-mind returns. |
| Original outbound delivery fee on approved returns | Refund it for damaged, incorrect or faulty items; retain it for change-of-mind returns. This is separate from Chatbud-paid return shipping. |
| Product-return refund eligibility | Eligibility begins after the returned item is received and inspected. An authorized admin may waive the return where appropriate. The agreed finance initiation deadline then applies. |

### Ecommerce journey: agreed presentation, detailed states proposed

Browse → dedicated product page → bag → checkout Phone → Delivery → Review & Payment → order confirmation → packing → dispatch → delivery → support or return when needed.

Category-first Store entry, dedicated product/Bag pages, the three checkout stages and bag continuity are agreed. Detailed layouts, fulfillment tracking states and return-processing screens remain under review.

Store leads with Wellness products and Supplements categories followed by the catalog, retaining search/filters. A dedicated Bag page shows quantities, subtotal and checkout. Online stock reservation and late-payment handling are the current Q&A topics; see [store/bag/checkout review](Chatbud_Store_Cart_Checkout_Review.md). Existing delivery, payment, identity and returns decisions remain in force. Detailed store/checkout layouts are not yet visually reviewed.

### Proposed tracking and account behaviour

- Order timeline: confirmed → packing → dispatched → out for delivery → delivered.
- Payment status remains separate. COD stays unpaid until collection is recorded.
- Preserve the bag through OTP verification and payment redirects.
- Provide a safe path for an existing care account to verify its phone and use the same account. Do not silently merge accounts based on a name or an unverified match.
- Support partial/failed delivery and courier exceptions in the CRM; exact policies remain open.
- Use the CRM refund progress pattern for approved store refunds. The eligibility trigger is agreed: receipt and inspection of the returned item, or an authorized admin's return waiver. Record the waiver and eligibility decision, then apply the agreed finance initiation deadline.

Exact serviceable areas, delivery prices, delivery estimates, courier arrangements, inspection steps/turnaround and failed-delivery/COD refusal rules are open. Chatbud pays shipping for all approved returns. Original outbound delivery fees are refunded for damaged/incorrect/faulty items and retained for change-of-mind returns. Refund eligibility begins after receipt/inspection or an authorized return waiver.

## 5. Proposed UI and screen structure

The client navigation, Home priorities, first-visitor entry, dedicated profile/booking and product pages, checkout stages, Support workspace, and professional/admin landing-screen priorities recorded in section 1 are agreed. The remaining recommendations in this section require review; they are not additional agreed business policies. The consolidated screen map is in [Chatbud_Screen_Map.md](Chatbud_Screen_Map.md).

### Shared design

- Restrained palette, strong typography hierarchy, consistent status labels and compact desktop layouts.
- Maintain readable text and comfortable touch targets on mobile; compact styling should not shrink controls or Devanagari text excessively.
- Support complete English/Nepali/Hindi layouts, suitable fonts, translated errors/statuses and text expansion.
- Make language switching accessible and preserve the chosen preference across signed-in screens and notifications.
- Separate demonstration listings from live offerings. Do not give sample profiles live verification/availability signals or offer purchase actions on products labelled not for sale.
- Show unavailable integrations honestly before users commit to an action.
- Use text and icons alongside status colours, accessible labels, visible keyboard focus and contextual errors.

### Client screens

1. Home: agreed need-first entry within Mental Health, Nutrition or Fitness for new visitors; next appointment, pending actions, intake checklist and today's care tasks for signed-in clients. Detailed module layouts remain proposed.
2. Care directory: concern, profession, language, availability and price filters. Avoid an unexplained default price ceiling that hides options.
3. Dedicated professional profile page (agreed presentation): proposed contents include an authentic photo, qualifications, scope, approach, languages, services, prices and availability.
4. Dedicated step-by-step booking page (agreed presentation): proposed contents include visible stages, retained selections, booking-type label, intake checklist, payment hold timer, total and policy summary.
5. Appointment workspace: booking and payment status, response deadline, intake completion, meeting access, support and change requests.
6. My Health: care plans, goals, progress and clear sharing controls.
7. Store/product detail: actual product photos and product-specific information; supplements include ingredients, serving information and precautions.
8. Checkout: agreed stages Phone → Delivery → Review & Payment, retaining the bag through verification. Proposed order-detail contents include delivery coverage, total, payment, tracking and return/support actions.
9. Account: identity, verified contact details, language, orders and relevant settings.
10. Support: agreed dedicated workspace with booking/order-linked conversations and case progress, accessed through a persistent Help control. Detailed layout and case-progress labels remain proposed.

Agreed primary navigation: Home, Care, Appointments, Store, My Health; account and help remain readily accessible. Use the same labels across desktop and mobile, with a desktop header and mobile bottom navigation.

### Professional and admin screens

- Provide a focused sign-in/onboarding entry before showing the full workspace navigation.
- Professional sections: daily work, appointments, clients/care plans, services/intake/booking type, availability, profile and support.
- Make application progress, account autosave status, missing evidence and item-specific corrections visible. The agreed review-response target is two Nepal working days after each complete submission/resubmission; accepted items remain preserved and not-approved decisions provide written reasons and human re-review.
- Admin sections: action queue, professional verification/scope changes, bookings, customer service, refunds/payments, catalog/inventory, fulfillment/returns, team and integrations.
- Make record context and the next action easy to inspect without opening several unrelated pages.

## 6. Proposed implementation phases

No phase starts until its scope is approved.

| Phase | Outcome |
|---|---|
| 0. Finish design decisions | Resolve launch-critical open rules, review screen maps/wireframes, and agree acceptance criteria. |
| 1. Client care and booking | Professional profiles, booking continuity, both confirmation types, payment holds, deadlines, intake boundaries, appointment workspace and support handoffs. Include the minimum professional service/availability controls, role permissions, case assignment/escalation, confirmation records and manual-refund tracking required to operate these bookings. |
| 2. Professional/admin workspace expansion | Complete the professional/admin layouts, richer calendar and case-management views, optional connections and operational reporting. Essential booking and refund operations are dependencies of phase 1, not deferred until this phase. |
| 3. Ecommerce | OTP account flow, coverage and pricing, online/COD checkout, fulfillment tracking, returns and CRM links. |

Apply the selected visual direction, mobile accessibility and all three languages throughout the relevant phase. AI/channel activation is a separate dependency and must not be represented as working before it is verified. The agreed 24/7 operating promise requires actual team and/or integration readiness.

## 7. Proposed acceptance criteria

- The client can distinguish instant confirmation from an approval request before paying.
- Booking selections and shopping-bag contents survive the agreed sign-in/verification journey.
- A payment reservation lasts 10 minutes and does not allow two clients to secure the same slot.
- Successful paid approval requests produce one 30-minute escalation and expire at 60 minutes if still unaccepted. Acceptance, cancellation and expiry races cannot produce contradictory outcomes.
- Urgent booking-related CRM tasks with no action after five minutes from assignment escalate to a supervisor, without extending the booking's existing deadlines.
- Refund eligibility creates one linked CRM case; failed or unverified payments are not reported as successful charges/refunds.
- A payment completed after reservation expiry triggers revalidation of the original slot and booking rules. If eligible, complete it in its original confirmation mode; otherwise create the agreed CRM case offering another time or a full refund. Never silently move the client or reset the approval clock merely because a payment notification arrived late.
- Confirmation by call requires explicit professional acceptance, an active request and an auditable record.
- The 24-hour cancellation rule and one-free-reschedule rule are enforced consistently, with professional-initiated changes excluded from that allowance.
- A client-requested reschedule preserves the original appointment until a replacement is confirmed.
- Client no-show marking respects the 15-minute grace period; refund requests enter admin review.
- Confirmed appointments keep details, intake and support available before the Join button becomes active 10 minutes before the scheduled start.
- Pending-approval/refund views keep status, amount, deadline and next action visible while detailed timeline/history can be expanded.
- Completed clinical intake is inaccessible to booking AI and customer-service roles; they can see permitted completion/scheduling information.
- Refund initiation and refund completion have distinct statuses. The one-business-day initiation clock uses the agreed finance calendar.
- Store checkout validates phone, inventory, address and delivery coverage, and displays area-based delivery charges before ordering.
- COD calls are limited to flagged orders under agreed flag rules; payment is not marked collected prematurely.
- Product return requests apply the seven-day criteria while keeping damaged/incorrect/faulty cases on their separate review path.
- Chatbud pays shipping for every approved return. Original delivery fees are refunded for damaged/incorrect/faulty items and retained for change-of-mind returns. Eligibility starts after receipt/inspection or an authorized return waiver, then uses the agreed finance deadline.
- English is the default. Users can select Nepali or Hindi, and screens/notifications follow that preference.
- Desktop/mobile screens use consistent navigation and plain-language states without misleading sample/live or integration availability claims.

## 8. Remaining work, grouped for review

### A. Exceptions needing a policy or a launch fallback

- Disputed attendance and partially completed/interrupted consultations.
- Financial outcomes when a professional determines incomplete intake prevents a session.
- Technical-failure rescheduling details, including the free-change allowance.
- Product-order cancellations, failed delivery, COD refusal and inspection turnaround.
- Non-booking case escalation deadlines and detailed supervisor/finance/verification permissions.

**Agreed launch fallback:** route unresolved exception cases to an assigned, authorized human through the CRM. This covers cases such as interrupted/disputed sessions, intake preventing a session and failed delivery/COD refusal. Record evidence, the proposed outcome and any required client consent. Do not automatically impose a penalty, extra charge or refund denial under a rule that has not been agreed. Existing agreed refund eligibility rules remain in force. New specific rules can be added explicitly later.

### B. Business-supplied launch settings

- Exact serviceable Kathmandu Valley areas, area delivery prices, delivery estimates and courier arrangements.
- Nepal public-holiday calendar and the people responsible for finance coverage under the agreed next-working-day 6 PM deadline.
- Staff roles, workload/availability and supervisor fallbacks to support the agreed 24/7 coordination model.
- Real provider profiles, approved scopes, services, prices, hours and intake templates.
- Real product information, approved listings, stock and return-processing contacts.

These are required launch inputs, not reasons to invent commercial values in the design.

### C. Detailed UX and implementation design

- Booking-step sequence, including per-service intake stages, and remaining layout refinements beyond the accepted v2/v3/v4 client baselines.
- Store bag presentation, detailed tracking and return-processing layouts.
- Payment retry/deduplication, payment-versus-expiry handling, and lead-time checks that account for the 10-minute reservation. The agreed late-payment business remedy must be preserved.
- Safe availability changes and optional Google Calendar conflict handling.
- OTP delivery/retry/recovery and secure linking to existing email/Google care accounts.
- Integration readiness and the actual staff/process coverage needed to meet deadlines. A planned AI role or configured credential is not evidence of a working service.
- Review the proposed phase boundaries and acceptance criteria before development is authorized.

The screen map, primary navigation, role-specific Home priorities, dedicated pages, checkout stages and Support workspace are accepted as the planning baseline. Detailed layouts can now be reviewed against the agreed policies.

### Current design-review deliverable

Client wireframes v5 are prepared for booking review: [focused booking PDF](chatbud-wireframes-v5/Chatbud_Booking_Review_v5.pdf), [full PDF](chatbud-wireframes-v5/Chatbud_Client_Wireframes.pdf), [offline click-through](chatbud-wireframes-v5/index.html), and [mobile overview](chatbud-wireframes-v5/overview.png). V5 shows conditional account/intake steps, the 10-minute hold beginning on entry to Review & pay, and recovery for unavailable slots and expired holds. Accepted v2 appointment states, v3 Home/Care and v4 profile layouts are retained. Earlier versions remain preserved. Timers, availability and payments are local simulations; mobile PDF previews show the first viewport and the HTML supports scrolling.

Visual-review status: client appointment/Home/Care/profile/booking layouts and the core professional/admin, finance, service/availability and onboarding layouts are accepted as planning baselines. Intake/care-plan wireframes v1 are also accepted as the planning baseline; see [care-workflow brief](Chatbud_Intake_Care_Plan_Review.md).

Professional/admin wireframes v1: [PDF](chatbud-operations-wireframes-v1/Chatbud_Professional_Admin_Review_v1.pdf) and [offline prototype](chatbud-operations-wireframes-v1/index.html). The core professional dashboard/request-detail and admin queue/case-workspace layouts are accepted as the planning baseline. Finance/refund permissions are agreed, and finance execution wireframes v1 are accepted as the planning baseline. Professional service/availability wireframes v1 are also accepted as the planning baseline; see [service/availability brief](Chatbud_Service_Availability_Review.md). Professional onboarding/verification layouts are accepted as the planning baseline; see [onboarding brief](Chatbud_Onboarding_Verification_Review.md). Intake/care-plan layouts are accepted; task progress/follow-up workflows are next; see [care-workflow brief](Chatbud_Intake_Care_Plan_Review.md). No permissions or integrations are activated by this review.

Professional onboarding/verification wireframes v1 are prepared for review: [PDF](chatbud-onboarding-wireframes-v1/Chatbud_Onboarding_Verification_Review_v1.pdf) and [offline prototype](chatbud-onboarding-wireframes-v1/index.html). They show the agreed application autosave design, evidence checklist, specific corrections, written decisions/re-review and approval handoff. These layouts are accepted as the planning baseline; the local prototype does not implement account storage, cross-device synchronization or actual verification.

Intake/care-plan wireframes v1 are accepted as the planning baseline: [PDF](chatbud-care-wireframes-v1/Chatbud_Intake_Care_Plan_Review_v1.pdf) and [offline prototype](chatbud-care-wireframes-v1/index.html). The set shows dated intake updates, author-only notes, private care-plan drafts, explicit versioned publication, published history and client My Health. Notifications, records and role checks are local simulations; the app remains unchanged.

Task progress/follow-up wireframes v1 are accepted as the planning baseline: [PDF](chatbud-progress-wireframes-v1/Chatbud_Task_Progress_Followup_Review_v1.pdf) and [offline prototype](chatbud-progress-wireframes-v1/index.html). They show submission audiences, configured measurements, professional review, task history across plan revisions and scheduling-only follow-up coordination. Ownership, notifications, role checks and entries remain local simulations; no booking/payment is created.

Reminder/contact wireframes v1 are accepted as the planning baseline: [PDF](chatbud-reminder-wireframes-v1/Chatbud_Reminders_Followup_Contact_Review_v1.pdf) and [offline prototype](chatbud-reminder-wireframes-v1/index.html). The set shows per-task preferences, generic content, contact opt-out, 24-hour first-contact targets, bounded retries, human-review pause and overdue routing with the original deadline retained. Example clocks, notifications and reassignment remain local simulations; no contact, booking or payment occurs.

These are separate design-review artifacts, not changes to the app or authorization to implement. All data and payments are illustrative. English is used for the initial layout review; English/Nepali/Hindi support remains in the agreed product scope. Professional/admin layouts and remaining client areas still need review.

### Booking-step review: operating rules and v5 layout accepted

Review sequence: Date & time → Account (skip when already signed in) → Required pre-payment intake (only if configured) → Review & pay → Appointment status. Intake due after confirmation appears as a preparation task, rather than an empty checkout step. Service, professional, time, price and confirmation type remain visible or readily accessible throughout; selections survive authentication. Actual slot availability is rechecked before payment.

Agreed decisions: professionals may require intake before payment or after confirmation, before the session. Start the hold on entry to Review & pay, after sign-in and any required pre-payment intake; show that time selection alone does not reserve a slot. If the chosen slot is no longer eligible, preserve the rest of the client's work and offer alternatives before collecting payment. The reservation duration, successful-payment approval deadlines and late-payment remedy remain as already agreed. V5 demonstrates these paths using local sample state and a static timer; it does not establish working availability checks or payment authorization in the app.
