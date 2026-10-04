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
export const appointmentDecision = z
  .object({
    id: z.string().uuid(),
    decision: z.enum(["CONFIRM", "DECLINE"]),
    meetingUrl: z.string().url().startsWith("https://").max(300).optional(),
  })
  .strict()
  .refine(
    (d) => d.decision !== "CONFIRM" || !!d.meetingUrl,
    "Add the meeting link for this appointment",
  );
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
    })
    .strict(),
  z
    .object({
      id: z.string().uuid(),
      status: z.enum(["ACTIVE", "DONE", "ARCHIVED"]),
    })
    .strict(),
]);
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
