# Chatbud screen map for review

25 October 2026 · Planning only · No app changes authorized

**Status:** accepted as the planning baseline in Q&A. The navigation and functional groupings below are the agreed direction; detailed layouts and unresolved operating rules still require agreement. This is not authorization to implement.

The business-policy record is [Chatbud_Workflow_and_UX_Plan.md](Chatbud_Workflow_and_UX_Plan.md). **Agreed** means the presentation or priority was selected in Q&A. **Proposed** means the detailed menu, grouping or layout needs review. Listing a screen does not claim the capability is implemented.

## Client navigation

**Agreed primary destinations:** Home · Care · Appointments · Store · My Health.

Desktop uses a header; mobile uses a five-item bottom bar with the same labels. Account settings and support remain accessible. Support is reached through a persistent Help control, without adding a sixth primary tab.

| Destination | Screens and purpose | Decision status |
|---|---|---|
| Home: first visitor | Choose a need within Mental Health, Nutrition or Fitness, then see relevant professionals. Browsing remains available without sign-in. | Entry agreed; detailed module layout proposed. |
| Home: signed-in client | Next appointment, pending booking actions, intake checklist and today's care tasks. | Priority agreed; detailed module layout proposed. |
| Care | Professional directory with concern, profession, language, price and availability filters. | Primary destination agreed; filter arrangement proposed. |
| Professional profile | Name/photo, compact qualifications/scope/languages, services/prices with Choose a time buttons, then full biography. Each service shows duration, intake and confirmation type. | V4 layout accepted as the planning baseline. |
| Booking | Date/time → Account if needed → Intake only if due before payment → Review & pay → Appointment status. Recheck availability and begin the 10-minute slot hold on entry to Review & pay. Later intake appears after confirmation. | Conditional intake timing, reservation start and v5 layout accepted as the planning baseline. |
| Appointments | Requests and appointments, opening a single detail workspace for each. Proposed grouping: needs action, upcoming and past. | Primary destination agreed; subviews proposed. |
| Appointment detail | Booking status, payment status, deadlines, intake completion, preparation, meeting access, support, cancellation/rescheduling and related refund case. | Proposed layout implementing agreed business rules. |
| Store | Wellness products and Supplements categories first, followed by the catalog; search, filters, Bag and orders remain accessible. | Category-first entry agreed; detailed browsing layout awaits review. |
| Product detail | Dedicated product page. Proposed contents: actual images, price, stock, product specifications, supplement ingredients/serving information/precautions where relevant, delivery coverage and return terms. | Dedicated page agreed; detailed contents/layout proposed. |
| Bag | Dedicated page with items, quantities, subtotal and a clear route to checkout. | Dedicated page and bag continuity agreed; detailed layout awaits review. |
| Checkout | Phone → Delivery → Review & Payment. Phone OTP signs in or creates an account. Delivery checks coverage and area fees. Review shows total and online/COD choice before commitment. Preserve the bag through verification. | Stages and payment/identity rules agreed; detailed layout proposed. |
| Order detail | Proposed timeline: confirmed → packing → dispatched → out for delivery → delivered. Show payment separately, delivery details, support and return requests. Orders can be linked from Store and Account. | Proposed tracking/layout; agreed policies govern eligibility. |
| My Health | Intake access, published care plans/history, goals, tasks and progress. | Intake/care-plan layouts accepted; task progress/follow-up layouts v1 are accepted as the planning baseline. |
| Account | Contact details, verification, language, order history, payment/refund references and relevant settings. Open through the profile control; make sign-out an explicit action. | Access agreed; detailed menu proposed. |
| Support | Dedicated workspace for Chatbud AI/customer service, with booking/order-linked conversations and case progress. Always reachable through Help. | Presentation and contextual linking agreed; detailed layout proposed. |

### Proposed client interaction rules

- Keep the next action visible: pay, complete intake, wait for approval, accept a proposed time, join a session or track a case.
- Display professional approval and instant confirmation distinctly before payment.
- Keep appointment, payment and refund states separate. A paid request is not necessarily confirmed; a refund case is not a completed payout.
- Agreed pending/refund presentation: status, amount, deadline and next action remain visible; detailed timeline/history is expandable.
- Agreed meeting entry: activate Join session 10 minutes before the confirmed start. Earlier views retain details, intake and support.
- Agreed Home refinement: remove the count-card row and prioritize the next appointment and required client actions.
- Agreed mobile Care refinement: search/categories remain visible; language, price and availability use a Filters drawer, with active-filter chips and a result count on the page. All prices is the starting price filter.
- Agreed profile refinement: show a compact qualifications, approved-service scope and language summary below the name/photo, then services/prices, then the full biography.
- Agreed service-card action: Choose a time for both modes, with the price, duration, intake requirements and confirmation-type badge visible before selection.
- Show the relevant price and terms during confirmation of any cancellation or rescheduling action.
- Support coordinates bookings; do not add direct client–professional booking chat or reveal direct contact details as an assumed feature.
- Completed clinical intake does not appear in AI/support case context. Internal readers are limited to the assigned professional under the agreed policy.
- Submitted intake remains preserved; clients add dated updates and the assigned professional is notified. Private session notes are separate and author-only. The current published care plan remains client-visible during revision drafting; explicit publication creates a new version of the same plan, retains history and notifies the client. Care-workflow wireframes v1 are accepted as the planning baseline; see [review](Chatbud_Intake_Care_Plan_Review.md).
- Task tracking includes completion, optional notes and professional-configured measurements. Submitted clinical progress is visible to the client and assigned professional, with a clear audience notice; support is excluded from its content. Unchanged tasks carry progress into new published plan versions; revised/removed tasks retain separate history. A professional's target follow-up date creates a Chatbud coordination task, without reserving or confirming an appointment. Progress/follow-up wireframes v1 are accepted as the planning baseline; see [review](Chatbud_Task_Progress_Followup_Review.md).
- Care-task reminders are separate per professional-configured task schedule, with client delivery-time/mute controls and generic notification wording. Follow-up first contact has a 24-hour target under 24/7 coverage, sooner when appointment timing/notice requires it. Up to two additional unanswered-contact attempts are at least 24 hours apart, then pause for human review; stop on decline/opt-out. A missed first-contact deadline alerts a supervisor and reassigns to an available qualified coordinator, retaining the owner if none is available and preserving the original deadline. Reminder/contact wireframes v1 are accepted as the planning baseline; see [review](Chatbud_Reminders_Followup_Contact_Review.md).
- Existing-account linking and recovery need a defined safe identity flow, including email/Google care accounts and phone-OTP store checkout.

## Professional workspace

**Agreed landing priority:** today's sessions, requests needing a response, and unfinished care plans/follow-ups.

The following functional menu grouping is **accepted as the planning baseline**; detailed labels and layouts remain to be reviewed:

| Menu | Screens and next actions |
|---|---|
| Dashboard | Today's sessions, response deadlines, requests and unfinished care work. |
| Appointments | Upcoming/past sessions and active requests; accept/decline where applicable, join a session, propose a change and coordinate through Chatbud support. |
| Clients | Assigned clients, permitted intake/care records, plans and follow-up work. |
| Services & Intake | Services, fees, instant/approval mode and intake requirements within approved scope; scope-change requests go to admin. |
| Availability | Weekly hours, blocked time and optional Google Calendar connection/conflict information. |
| Profile | Public profile and listing readiness, plus verification/scope status. |
| Support | Professional-facing coordination cases and assistance. |

**Proposed entry flow:** focused professional sign-in/onboarding → application and document progress → verification/corrections → approved-service and availability setup → bookable workspace. Detailed onboarding layouts await visual review; agreed evidence, response-target, autosave and correction rules are recorded below.

**Agreed verification boundaries:** designated verification team members with explicit approval permission approve applications and service-scope changes. Service/availability setup unlocks only after approval; applicants cannot prepare those drafts while pending. Approval is separate from publishing. The evidence baseline and response target are recorded below; detailed onboarding layouts remain under review; see [onboarding review](Chatbud_Onboarding_Verification_Review.md).

**Agreed submission requirements:** profession-specific checklists cover identity evidence, qualification documents and registration/licence where applicable. Review feedback is due within two working days after each complete submission/resubmission, using Monday–Friday Nepal working days excluding Nepal public holidays. This is a response target, not approval. Detailed checklist contents are launch configuration; the agreed application-handling rules are recorded below.

**Agreed application handling:** autosave to the signed-in account with cross-device resume; specific field/document corrections with reasons and preservation of accepted work; written not-approved reasons and a human re-review route with clarification or new evidence. Service setup remains locked before approval. Onboarding/verification wireframes v1 are accepted as the planning baseline; see [review](Chatbud_Onboarding_Verification_Review.md).

**Agreed request presentation:** open a focused request-detail screen before accepting or declining. Dashboard cards lead to review; context and response deadline remain visible with decision controls. The professional/admin v1 core dashboard and request-detail layouts are accepted as the planning baseline.

**Agreed service setup:** guided steps Basics → Booking & Intake → Availability → Preview & Publish, retaining drafts and providing a client-facing preview. If an enabled Google Calendar connection stops syncing, new bookings continue using Chatbud availability with a prominent warning; existing bookings and paid requests remain intact. Service/availability wireframes v1 are accepted as the planning baseline; see [review brief](Chatbud_Service_Availability_Review.md).

## Admin workspace

**Agreed landing priority:** a role-filtered action queue ordered by urgency and deadlines, with summary counts above it. Case assignment is automatic by role, case type and workload. Urgent booking tasks escalate to a supervisor after five minutes without action following assignment, without extending the 30-minute call trigger or 60-minute booking expiry.

The following functional menu grouping is **accepted as the planning baseline**; detailed labels and layouts remain to be reviewed:

| Menu | Screens and next actions |
|---|---|
| Work Queue | Assigned/unassigned/escalated work, urgent deadlines and the next action. |
| Verification | Professional applications, evidence review, corrections and scope-change decisions. |
| Bookings | Paid approval requests, 30-minute follow-up tasks, confirmation-call records, exceptions and changes. |
| CRM & Support | Booking/order-linked cases, customer conversations, internal notes, assignment and escalation history. |
| Refunds & Payments | Eligibility/review, manual refund initiation deadline, amount, gateway reference, processing and completion evidence. |
| Catalog & Inventory | Chatbud products, listing information, stock and relevant batch/expiry records. |
| Fulfillment & Returns | Online/COD orders, flagged-order verification, packing, dispatch, delivery exceptions and return/inspection work. |
| Team & Permissions | Team availability, workload, roles and supervisor fallbacks. |
| Settings & Integrations | Delivery areas/fees, finance calendar, language templates, Google/OTP/AI/channel connection readiness and related operational settings. |

These are functional groups, not a requirement to show every menu item to every team member. Role permissions and access to clinical intake remain enforced separately.

**Agreed case presentation:** desktop queue beside the selected case; mobile full-page case with return to the same queue filters, selection and position. The professional/admin v1 core queue and case-workspace layouts are accepted as the planning baseline; see the [review](chatbud-operations-wireframes-v1/Chatbud_Professional_Admin_Review_v1.pdf). Finance-specific rules are recorded below; other role grants and remaining operational layouts are reviewed separately.

**Agreed payout permissions:** gateway refunds and payout progress/completion edits are restricted to designated finance staff; supervisors require a separate finance permission. Support coordinates. Routine eligible refunds need no second approval; authorized supervisors decide exceptional eligibility and amount. Completion requires the gateway refund reference, amount, completion date and payout confirmation; no separate client acknowledgment is required. Finance execution wireframes v1 are accepted as the planning baseline; see [finance review](Chatbud_Finance_Refund_Review.md).

## Shared visual and navigation direction

- **Agreed:** minimal and clinical, restrained colours, compact information-focused screens.
- **Agreed:** English default, with English/Nepali/Hindi selected-language screens and booking/order notifications.
- **Proposed:** compact desktop tables and clear mobile cards, readable text, comfortable touch targets, visible focus, translated errors and adequate space for Devanagari text.
- **Proposed:** authentic professional/product imagery, consistent plain-language status labels and clear separation of sample versus live offerings.
- **Proposed:** if an account has professional/admin permissions, offer a clearly labelled workspace switch without exposing unauthorized menus or mixing client and operational context. Exact placement needs review.
- **Open:** placement of existing secondary/coming-soon sections; this map does not authorize their removal.

## What remains to agree

1. Detailed client/professional/admin layouts within the accepted functional menu groupings.
2. Professional/admin request and case-detail presentation; see [review brief](Chatbud_Professional_Admin_Review.md).
3. Store bag presentation, order timeline and return-processing screens.
4. Remaining operational exceptions and commercial values listed in the workflow plan.

## Client wireframes v5

The v2 appointment-state presentation, v3 Home/Care layouts, v4 professional profile and v5 booking layout are accepted as planning baselines. Professional/admin screen review is next; implementation is not authorized by these acceptances.

The current review set covers Home, Care, professional profile, booking and appointment details: [focused booking PDF](chatbud-wireframes-v5/Chatbud_Booking_Review_v5.pdf), [full PDF](chatbud-wireframes-v5/Chatbud_Client_Wireframes.pdf), [offline click-through](chatbud-wireframes-v5/index.html), and [mobile overview](chatbud-wireframes-v5/overview.png). V5 adds conditional account/intake stages, a slot recheck and 10-minute hold on entry to payment, plus unavailable-slot and expired-hold recovery. The accepted v2/v3/v4 client layouts are retained. Support remains a booking-linked workspace. Previous versions are preserved separately.

Intake is configurable per service: required before payment, or after confirmation before the session. Later intake adds no checkout step. English is used for review; all three agreed languages remain in product scope. Timers and checks are illustrative local state. No real account, clinical answer, payment, booking, call, message, meeting or refund is used. Mobile PDF pages show the first viewport; the HTML allows full scrolling.

This map has been accepted as the planning baseline. That acceptance does not authorize app development or activate integrations. Implementation needs its own explicit go-ahead after scope and dependencies are agreed.
