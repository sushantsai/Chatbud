// Request shapes accepted by the API. Kept free of server code so they can be tested directly.
import { z } from "zod";
export const profession = z.enum([
  "psychiatrist",
  "clinical_psychologist",
  "counselor",
  "nutritionist",
  "dietitian",
  "personal_trainer",
  "fitness_coach",
  "yoga_instructor",
]);
export const text = (max: number, min = 1) =>
  z.string().trim().min(min).max(max);
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const documentKind = z.enum([
  "identity",
  "qualification",
  "registration",
  "experience",
  "photo",
]);
// Everything a reviewer needs to verify the applicant with the issuing bodies.
export const applicationDetails = z
  .object({
    practice: z
      .object({
        displayName: text(80, 3).optional(),
        title: text(120),
        yearsExperience: z.number().int().min(0).max(60),
        setting: z.enum(["independent", "clinic", "hospital", "organization"]),
        workplace: text(160, 0),
        city: text(80),
        modes: z
          .array(z.enum(["online", "in_person"]))
          .min(1)
          .max(2),
        languages: z.array(text(40)).min(1).max(8),
        focus: text(300, 0),
        clientGroups: z.array(text(40)).max(6),
      })
      .strict(),
    identity: z
      .object({
        legalName: text(120, 3),
        dateOfBirth: day,
        gender: text(30, 0),
        phone: z.string().regex(/^\+9779[678]\d{8}$/),
        idType: z.enum([
          "citizenship",
          "passport",
          "national_id",
          "driving_licence",
        ]),
        idNumber: text(40, 3),
        idIssuer: text(80, 2),
      })
      .strict(),
    qualifications: z
      .array(
        z
          .object({
            level: text(60),
            field: text(120),
            institution: text(160),
            country: text(60),
            year: z.number().int().min(1960).max(2100),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    registration: z
      .object({
        held: z.boolean(),
        body: text(120, 0),
        number: text(40, 0),
        issuedOn: day.or(z.literal("")),
        validUntil: day.or(z.literal("")),
        association: text(200, 0),
      })
      .strict(),
    references: z
      .array(
        z
          .object({
            name: text(120),
            role: text(120),
            organization: text(160),
            contact: text(120, 5),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    documents: z
      .array(
        z
          .object({ kind: documentKind, path: text(200), name: text(160) })
          .strict(),
      )
      .max(8),
    declarations: z
      .object({
        accurate: z.literal(true),
        goodStanding: z.boolean(),
        standingDetails: text(1000, 0),
        consentToVerify: z.literal(true),
        withinScope: z.literal(true),
      })
      .strict(),
  })
  .strict();
export const application = z
  .object({
    profession,
    bio: z.string().trim().min(30).max(1500),
    experience: z.string().trim().min(10).max(1000),
    details: applicationDetails.optional(),
  })
  .strict();
export const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const slotQuery = z
  .object({ serviceId: z.string().uuid(), date: day })
  .strict();
export const appointmentRequest = z
  .object({
    serviceId: z.string().uuid(),
    // The database returns slot times with a numeric offset, not "Z".
    startsAt: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const appointmentRef = z.object({ id: z.string().uuid() }).strict();
export const serviceInput = z
  .object({
    id: z.string().uuid().optional(),
    profession,
    title: text(120, 3),
    durationMinutes: z.number().int().min(15).max(180),
    price: z.number().min(0).max(100000),
    active: z.boolean(),
  })
  .strict();
export const availabilityInput = z
  .object({
    rules: z
      .array(
        z
          .object({
            weekday: z.number().int().min(0).max(6),
            start: clock,
            end: clock,
          })
          .strict()
          .refine((r) => r.end > r.start, "Each day must end after it starts"),
      )
      .max(21),
  })
  .strict();
// A meeting link is optional: the server creates one when the professional does not supply their own.
export const appointmentDecision = z
  .object({
    id: z.string().uuid(),
    decision: z.enum(["CONFIRM", "DECLINE"]),
    meetingUrl: z.string().url().startsWith("https://").max(300).optional(),
  })
  .strict();
export const appointmentProposal = z
  .object({
    id: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const rescheduleResponse = z
  .object({ id: z.string().uuid(), accept: z.boolean() })
  .strict();
export const reviewDecision = z
  .object({
    caseId: z.string().uuid(),
    decision: z.enum(["APPROVED", "REJECTED", "NEEDS_INFORMATION"]),
    rationale: text(1000, 0),
  })
  .strict();
export const documentRef = z
  .object({ caseId: z.string().uuid(), path: text(200) })
  .strict();
export const domain = z.enum(["mental", "nutrition", "fitness"]);
export const goalInput = z.union([
  z
    .object({
      domain,
      title: text(160, 3),
      note: text(500, 0),
      targetDate: day.or(z.literal("")),
      // The small repeatable action, how many days a week, and the library entry it came from.
      action: text(160, 0).optional(),
      weeklyTarget: z.number().int().min(1).max(7).optional(),
      template: z
        .string()
        .regex(/^[a-z0-9-]{2,40}$/)
        .optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().uuid(),
      status: z.enum(["ACTIVE", "DONE", "ARCHIVED"]),
    })
    .strict(),
]);
export const goalCheckin = z
  .object({
    id: z.string().uuid(),
    done: z.boolean(),
    date: day.optional(),
  })
  .strict();
const rating = z.number().int().min(1).max(5);
export const wellbeingInput = z
  .object({ mood: rating, sleep: rating, energy: rating })
  .strict();
export const shareInput = z
  .object({ providerId: z.string().uuid(), domain, share: z.boolean() })
  .strict();
export const planInput = z
  .object({
    id: z.string().uuid().optional(),
    clientId: z.string().uuid(),
    domain,
    title: text(160, 3),
    body: text(8000),
    archived: z.boolean().optional(),
  })
  .strict();
export const mediaTypes = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;
export const documentRequest = z
  .object({
    kind: documentKind,
    mediaType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    size: z.number().int().min(1).max(5242880),
  })
  .strict();
export const booking = z
  .object({
    serviceId: z.string().min(1).max(100),
    startsAt: z.string().datetime(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const order = z
  .object({
    items: z
      .array(
        z
          .object({
            skuId: z.string(),
            quantity: z.number().int().min(1).max(10),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const profileInput = z.object({ displayName: text(80, 3) }).strict();

// Support, booking oversight, catalogue and team administration all arrive as { action, data }.
const none = z.object({}).strict();
const uuid = z.string().uuid();
const discountKind = z.enum(["PERCENT", "FIXED"]);
const dayOrBlank = day.or(z.literal(""));
const httpsUrl = z.string().url().startsWith("https://").max(300);
const percentCap = (d: { kind: string; value: number }) =>
  d.kind !== "PERCENT" || d.value <= 90;
export const teamRoles = [
  "VERIFICATION",
  "CLINICAL_REVIEW",
  "SUPPORT",
  "CATALOG",
  "SECURITY_ADMIN",
] as const;
export const opsRequest = z
  .object({ action: z.string().max(40), data: z.unknown().optional() })
  .strict();
export const supportActions = {
  tickets_mine: none,
  ticket_create: z
    .object({
      category: z.enum([
        "BOOKING",
        "PROFESSIONAL",
        "ORDER",
        "ACCOUNT",
        "PAYMENT",
        "OTHER",
      ]),
      subject: text(160, 3),
      body: text(4000, 10),
      appointmentId: uuid.or(z.literal("")),
      as: z.enum(["CLIENT", "PROFESSIONAL"]),
    })
    .strict(),
  ticket_reply: z.object({ id: uuid, body: text(4000) }).strict(),
} as const;
export const teamActions = {
  ops_dashboard: none,
  tickets_queue: none,
  ticket_update: z
    .object({
      id: uuid,
      status: z
        .enum(["OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"])
        .optional(),
      priority: z.enum(["NORMAL", "HIGH", "URGENT"]).optional(),
      assign: z.enum(["me", "none"]).optional(),
    })
    .strict(),
  ticket_note: z
    .object({ id: uuid, body: text(4000), internal: z.boolean() })
    .strict(),
  bookings_list: none,
  booking_cancel: z.object({ id: uuid, reason: text(500, 10) }).strict(),
  booking_confirm: z
    .object({ id: uuid, meetingUrl: httpsUrl.optional() })
    .strict(),
  catalogue: none,
  product_save: z
    .object({
      id: uuid.optional(),
      title: text(120, 3),
      description: text(1000, 10),
      category: z.enum([
        "WELLNESS",
        "NUTRITION",
        "FITNESS",
        "DEVICES",
        "MENTAL_WELLNESS",
        "PERSONAL_CARE",
      ]),
      price: z.number().min(0).max(1000000),
    })
    .strict(),
  product_status: z
    .object({ id: uuid, status: z.enum(["PUBLISHED", "DRAFT", "SUSPENDED"]) })
    .strict(),
  stock_receive: z
    .object({ id: uuid, quantity: z.number().int().min(1).max(10000) })
    .strict(),
  offer_save: z
    .object({
      id: uuid.optional(),
      title: text(80, 3),
      kind: discountKind,
      value: z.number().positive().max(1000000),
      productId: uuid.or(z.literal("")),
      endsOn: dayOrBlank,
      active: z.boolean(),
    })
    .strict()
    .refine(percentCap, "A percentage offer can be at most 90%"),
  promo_save: z
    .object({
      id: uuid.optional(),
      code: z.string().regex(/^[A-Za-z0-9]{4,20}$/),
      kind: discountKind,
      value: z.number().positive().max(1000000),
      minSubtotal: z.number().min(0).max(1000000),
      endsOn: dayOrBlank,
      maxRedemptions: z.number().int().positive().or(z.literal("")),
      active: z.boolean(),
    })
    .strict()
    .refine(percentCap, "A percentage code can be at most 90%"),
  team_list: none,
  team_role_set: z
    .object({
      email: z.string().email().max(200),
      role: z.enum(teamRoles),
      grant: z.boolean(),
    })
    .strict(),
} as const;
export const promoCheck = z
  .object({ code: text(20, 4), subtotal: z.number().min(0).max(10000000) })
  .strict();

// Field research. Studies, consent, participants, assessments and referrals arrive as { action, data }.
const instrument = z.enum(["PHQ9", "GAD7", "MEASURES"]);
const grantByEmail = {
  email: z.string().trim().email().max(160),
  grant: z.boolean(),
};
export const researchActions = {
  workspace: none,
  lead_set: z.object(grantByEmail).strict(),
  study_save: z.union([
    z
      .object({
        code: z
          .string()
          .trim()
          .regex(/^[A-Za-z]{2,6}$/),
        title: text(160, 3),
      })
      .strict(),
    z
      .object({
        id: uuid,
        title: text(160, 3),
        summary: text(2000, 0),
        partner: text(160, 0),
        ethicsReference: text(120, 0),
        ethicsApprovedOn: dayOrBlank,
        instruments: z.array(instrument).max(3),
        consentText: text(6000, 0),
        status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]),
      })
      .strict(),
  ]),
  member_set: z
    .object({
      studyId: uuid,
      ...grantByEmail,
      role: z.enum(["LEAD", "CLINICIAN", "HEALTH_WORKER"]),
    })
    .strict(),
  study_view: z.object({ studyId: uuid }).strict(),
  export: z.object({ studyId: uuid }).strict(),
  participant_enroll: z
    .object({
      studyId: uuid,
      sex: z.enum(["FEMALE", "MALE", "OTHER", "UNDISCLOSED"]),
      birthYear: z.number().int().min(1900).max(2100),
      district: text(80, 2),
      identity: z
        .object({
          fullName: text(120, 2),
          phone: text(30, 0),
          locality: text(160, 0),
        })
        .strict(),
      consent: z
        .object({
          participation: z.literal(true),
          recording: z.boolean(),
          futureUse: z.boolean(),
          method: z.enum(["SIGNED", "THUMBPRINT", "VERBAL_WITNESSED"]),
          witness: text(120, 0),
        })
        .strict()
        .refine((c) => c.method === "SIGNED" || c.witness.length >= 3, {
          message: "A thumbprint or spoken consent needs a witness.",
        }),
    })
    .strict(),
  participant_view: z.object({ participantId: uuid }).strict(),
  participant_identity: z.object({ participantId: uuid }).strict(),
  consent_withdraw: z.object({ participantId: uuid }).strict(),
  assessment_save: z
    .object({
      participantId: uuid,
      instrument,
      answers: z.union([
        z.array(z.number().int().min(0).max(3)).max(12),
        z.record(z.string().max(20), z.number()),
      ]),
      notes: text(2000, 0),
    })
    .strict(),
  referral_save: z.union([
    z
      .object({
        participantId: uuid,
        id: uuid,
        status: z.enum(["OPEN", "CONTACTED", "BOOKED", "CLOSED"]),
      })
      .strict(),
    z
      .object({
        participantId: uuid,
        assessmentId: uuid.or(z.literal("")),
        profession,
        urgency: z.enum(["ROUTINE", "SOON", "URGENT"]),
        note: text(2000, 0),
        treatment: text(2000, 0),
      })
      .strict(),
  ]),
};
