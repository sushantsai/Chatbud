// Contract tests: the API must accept exactly what the web app and the database produce.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  application,
  appointmentDecision,
  appointmentRequest,
  availabilityInput,
  goalInput,
  planInput,
  profileInput,
  reviewDecision,
  serviceInput,
  promoCheck,
  slotQuery,
  supportActions,
  teamActions,
} from "../src/schemas";
const id = "7b0f7c0e-6a4e-4a53-9f0e-0c2f6a1d9b11";
const accepts = (
  schema: { safeParse: (v: unknown) => { success: boolean } },
  value: unknown,
) => assert.equal(schema.safeParse(value).success, true, JSON.stringify(value));
const rejects = (
  schema: { safeParse: (v: unknown) => { success: boolean } },
  value: unknown,
) =>
  assert.equal(schema.safeParse(value).success, false, JSON.stringify(value));

test("appointment requests accept slot times as the database returns them", () => {
  // Postgres serialises timestamptz in jsonb with a numeric offset, not "Z".
  accepts(appointmentRequest, {
    serviceId: id,
    startsAt: "2026-10-05T04:15:00+00:00",
    idempotencyKey: id,
  });
  accepts(appointmentRequest, {
    serviceId: id,
    startsAt: "2026-10-05T04:15:00.000Z",
    idempotencyKey: id,
  });
  rejects(appointmentRequest, {
    serviceId: id,
    startsAt: "tomorrow at ten",
    idempotencyKey: id,
  });
});

test("slot queries take a calendar day", () => {
  accepts(slotQuery, { serviceId: id, date: "2026-10-05" });
  rejects(slotQuery, { serviceId: id, date: "05/10/2026" });
});

test("confirming an appointment needs an https meeting link", () => {
  accepts(appointmentDecision, {
    id,
    decision: "CONFIRM",
    meetingUrl: "https://meet.example/abc",
  });
  accepts(appointmentDecision, { id, decision: "DECLINE" });
  rejects(appointmentDecision, { id, decision: "CONFIRM" });
  rejects(appointmentDecision, {
    id,
    decision: "CONFIRM",
    meetingUrl: "http://meet.example/abc",
  });
});

test("services and weekly hours match the practitioner workspace form", () => {
  // The workspace sends back the price it was given, which the database returns as a decimal.
  accepts(serviceInput, {
    id,
    profession: "counselor",
    title: "Individual consultation",
    durationMinutes: 50,
    price: 1500.0,
    active: true,
  });
  accepts(serviceInput, {
    profession: "yoga_instructor",
    title: "Yoga session",
    durationMinutes: 60,
    price: 0,
    active: false,
  });
  rejects(serviceInput, {
    profession: "surgeon",
    title: "Surgery",
    durationMinutes: 60,
    price: 1,
    active: true,
  });
  accepts(availabilityInput, {
    rules: [{ weekday: 0, start: "09:00", end: "17:00" }],
  });
  rejects(availabilityInput, {
    rules: [{ weekday: 0, start: "17:00", end: "09:00" }],
  });
});

test("review decisions, goals, plans and profile names", () => {
  accepts(reviewDecision, { caseId: id, decision: "APPROVED", rationale: "" });
  rejects(reviewDecision, { caseId: id, decision: "MAYBE", rationale: "" });
  accepts(goalInput, {
    domain: "nutrition",
    title: "Eat breakfast daily",
    note: "",
    targetDate: "",
  });
  accepts(goalInput, {
    domain: "fitness",
    title: "Walk daily",
    note: "",
    targetDate: "2026-11-01",
  });
  accepts(goalInput, { id, status: "DONE" });
  rejects(goalInput, {
    domain: "dental",
    title: "Floss",
    note: "",
    targetDate: "",
  });
  accepts(planInput, {
    clientId: id,
    domain: "nutrition",
    title: "Meal plan",
    body: "Three regular meals.",
  });
  accepts(planInput, {
    id,
    clientId: id,
    domain: "nutrition",
    title: "Meal plan",
    body: "Updated.",
    archived: true,
  });
  rejects(planInput, {
    clientId: id,
    domain: "nutrition",
    title: "Meal plan",
    body: "x",
    version: 2,
  });
  accepts(profileInput, { displayName: "Dr Shreya Example" });
  rejects(profileInput, { displayName: "S" });
});

test("a full practitioner application as the form submits it", () => {
  const details = {
    practice: {
      displayName: "Dr Example",
      title: "Consultant psychiatrist",
      yearsExperience: 8,
      setting: "hospital",
      workplace: "",
      city: "Kathmandu",
      modes: ["online"],
      languages: ["English", "Nepali"],
      focus: "",
      clientGroups: [],
    },
    identity: {
      legalName: "Example Person",
      dateOfBirth: "1988-02-03",
      gender: "",
      phone: "+9779800000000",
      idType: "citizenship",
      idNumber: "00-00-00-00000",
      idIssuer: "Kathmandu",
    },
    qualifications: [
      {
        level: "MD",
        field: "Psychiatry",
        institution: "Example University",
        country: "Nepal",
        year: 2015,
      },
    ],
    registration: {
      held: true,
      body: "Nepal Medical Council",
      number: "12345",
      issuedOn: "",
      validUntil: "",
      association: "",
    },
    references: [
      {
        name: "Example Referee",
        role: "Head of department",
        organization: "Example Hospital",
        contact: "referee@example.invalid",
      },
    ],
    documents: [
      { kind: "identity", path: `${id}/identity-x.pdf`, name: "id.pdf" },
    ],
    declarations: {
      accurate: true,
      goodStanding: true,
      standingDetails: "",
      consentToVerify: true,
      withinScope: true,
    },
  };
  const base = {
    profession: "psychiatrist",
    bio: "A biography that is comfortably longer than thirty characters.",
    experience: "Eight years in practice.",
  };
  accepts(application, { ...base, details });
  accepts(application, base);
  rejects(application, {
    ...base,
    details: { ...details, identity: { ...details.identity, phone: "12345" } },
  });
  rejects(application, {
    ...base,
    details: {
      ...details,
      declarations: { ...details.declarations, consentToVerify: false },
    },
  });
});

test("support requests as the help page sends them", () => {
  accepts(supportActions.ticket_create, {
    category: "BOOKING",
    subject: "Not confirmed",
    body: "I requested a time two days ago.",
    appointmentId: "",
    as: "CLIENT",
  });
  accepts(supportActions.ticket_create, {
    category: "OTHER",
    subject: "Payout question",
    body: "When are payouts made to professionals?",
    appointmentId: id,
    as: "PROFESSIONAL",
  });
  rejects(supportActions.ticket_create, {
    category: "BOOKING",
    subject: "Hi",
    body: "short",
    appointmentId: "",
    as: "CLIENT",
  });
  accepts(supportActions.ticket_reply, { id, body: "Thank you." });
  accepts(supportActions.tickets_mine, {});
});

test("team actions as the admin portal sends them", () => {
  accepts(teamActions.ticket_update, { id, status: "ESCALATED" });
  accepts(teamActions.ticket_update, { id, assign: "me" });
  rejects(teamActions.ticket_update, { id, status: "DELETED" });
  accepts(teamActions.ticket_note, {
    id,
    body: "Called the client.",
    internal: true,
  });
  accepts(teamActions.booking_cancel, {
    id,
    reason: "Professional unavailable; client informed.",
  });
  rejects(teamActions.booking_cancel, { id, reason: "no" });
  accepts(teamActions.booking_confirm, {
    id,
    meetingUrl: "https://meet.example/abc",
  });
  accepts(teamActions.product_save, {
    title: "Yoga mat",
    description: "A non-slip mat for home practice.",
    category: "FITNESS",
    price: 2000,
  });
  rejects(teamActions.product_save, {
    title: "Yoga mat",
    description: "A non-slip mat for home practice.",
    category: "MEDICINE",
    price: 2000,
  });
  accepts(teamActions.product_status, { id, status: "PUBLISHED" });
  accepts(teamActions.stock_receive, { id, quantity: 25 });
  rejects(teamActions.stock_receive, { id, quantity: 0 });
  accepts(teamActions.offer_save, {
    title: "Dashain offer",
    kind: "PERCENT",
    value: 20,
    productId: "",
    endsOn: "2026-10-31",
    active: true,
  });
  rejects(teamActions.offer_save, {
    title: "Too generous",
    kind: "PERCENT",
    value: 95,
    productId: "",
    endsOn: "",
    active: true,
  });
  accepts(teamActions.promo_save, {
    code: "welcome10",
    kind: "PERCENT",
    value: 10,
    minSubtotal: 500,
    endsOn: "",
    maxRedemptions: "",
    active: true,
  });
  accepts(teamActions.promo_save, {
    code: "FLAT200",
    kind: "FIXED",
    value: 200,
    minSubtotal: 0,
    endsOn: "2026-12-31",
    maxRedemptions: 100,
    active: true,
  });
  rejects(teamActions.promo_save, {
    code: "no spaces",
    kind: "FIXED",
    value: 200,
    minSubtotal: 0,
    endsOn: "",
    maxRedemptions: "",
    active: true,
  });
  accepts(teamActions.team_role_set, {
    email: "agent@example.invalid",
    role: "SUPPORT",
    grant: true,
  });
  rejects(teamActions.team_role_set, {
    email: "agent@example.invalid",
    role: "CONSUMER",
    grant: true,
  });
  accepts(promoCheck, { code: "WELCOME10", subtotal: 1500 });
});
