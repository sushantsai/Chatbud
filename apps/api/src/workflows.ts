import { z } from "zod";
const id = z.string().uuid(),
  text = (max = 4000, min = 0) => z.string().trim().min(min).max(max),
  none = z.object({}).strict();
const task = z
  .object({
    id: id.optional(),
    title: text(200, 1),
    schedule: z.enum(["DAILY", "WEEKLY"]),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    measurements: z.array(text(40, 1)).max(10).default([]),
  })
  .strict();
const bag = z
  .array(
    z.object({ skuId: id, quantity: z.number().int().min(1).max(10) }).strict(),
  )
  .min(1)
  .max(30);
export const workflowActions = {
  client_tasks: none,
  provider_summary: none,
  return_request: z
    .object({
      orderId: id,
      reason: z.enum(["CHANGE_OF_MIND", "DAMAGED", "INCORRECT", "FAULTY"]),
      unopenedUnused: z.boolean(),
      note: text(2000, 3),
    })
    .strict(),
  return_inspect: z
    .object({
      id,
      receivedAndInspected: z.boolean(),
      waive: z.boolean(),
      evidence: text(2000, 10),
    })
    .strict(),
  operating_settings: none,
  permission_set: z
    .object({
      userId: id,
      permission: z.enum(["SUPERVISOR", "VERIFY_APPROVE"]),
      grant: z.boolean(),
    })
    .strict(),
  holiday_save: z
    .object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      label: text(120, 3),
    })
    .strict(),
  rereview_request: z.object({ reason: text(2000, 10) }).strict(),
  cancellation_choice: z
    .object({ id, choice: z.enum(["REFUND", "RESCHEDULE"]) })
    .strict(),
  reschedule_offer: z
    .object({ caseId: id, startsAt: z.string().datetime({ offset: true }) })
    .strict(),
  delivery_zones: none,
  delivery_quote: z
    .object({ zoneId: id, items: bag, promoCode: text(20).default("") })
    .strict(),
  zone_save: z
    .object({
      city: text(100, 1),
      area: text(100, 1),
      fee: z.number().min(0).max(100000),
      cod: z.boolean(),
      active: z.boolean(),
    })
    .strict(),
  availability_block: z
    .object({ startsAt: z.string().datetime(), endsAt: z.string().datetime() })
    .strict()
    .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt)),
  preferences: z
    .object({ language: z.enum(["en", "ne", "hi"]).optional() })
    .strict(),
  notifications: none,
  draft_load: none,
  draft_save: z
    .object({
      payload: z.record(z.unknown()),
      revision: z.number().int().min(0),
    })
    .strict(),
  intake_form: z
    .object({
      serviceId: id,
      appointmentId: id.optional(),
      bookingKey: id.optional(),
    })
    .strict(),
  intake_submit: z
    .object({
      serviceId: id,
      bookingKey: id.optional(),
      appointmentId: id.optional(),
      parentId: id.optional(),
      answers: z.record(text(8000)).refine((v) => Object.keys(v).length <= 40),
    })
    .strict(),
  appointment_detail: z.object({ id }).strict(),
  join: z.object({ id }).strict(),
  coordination: z.object({ id, note: text(2000, 3) }).strict(),
  session_incident: z.object({ id, note: text(2000, 3) }).strict(),
  reschedule_request: z.object({ id, note: text(2000, 3) }).strict(),
  my_care: none,
  client_care: z.object({ clientId: id }).strict(),
  private_note: z.object({ appointmentId: id, body: text(16000, 1) }).strict(),
  plan_save: z
    .object({
      id: id.optional(),
      clientId: id,
      domain: z.enum(["mental", "nutrition", "fitness"]),
      title: text(160, 3),
      body: text(16000, 1),
      tasks: z.array(task).max(30),
    })
    .strict(),
  plan_publish: z.object({ revisionId: id }).strict(),
  progress_submit: z
    .object({
      revisionId: id,
      taskId: id,
      completed: z.boolean(),
      note: text(2000).default(""),
      measurements: z.record(text(80)).default({}),
    })
    .strict(),
  reminder_save: z
    .object({
      taskId: id,
      muted: z.boolean(),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .strict(),
  followup_create: z
    .object({
      appointmentId: id,
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  cases_mine: none,
  contact_optout: z.object({ id }).strict(),
  staff_presence: z.object({ available: z.boolean() }).strict(),
  queue: z.object({ includeClosed: z.boolean().optional() }).strict(),
  case_action: z
    .object({
      id,
      status: z.enum(["OPEN", "IN_PROGRESS", "REVIEW", "RESOLVED", "CLOSED"]),
      note: text(2000, 3),
    })
    .strict(),
  followup_contact: z
    .object({
      id,
      outcome: z.enum([
        "UNANSWERED",
        "CONNECTED",
        "BOOKED",
        "DECLINED",
        "OPTED_OUT",
      ]),
      note: text(2000, 3),
    })
    .strict(),
  call_approval: z
    .object({ id, explicitApproval: z.literal(true), evidence: text(2000, 10) })
    .strict(),
  finance_update: z.discriminatedUnion("stage", [
    z
      .object({
        refundId: id,
        stage: z.literal("INITIATED"),
        reference: text(100, 3),
      })
      .strict(),
    z
      .object({
        refundId: id,
        stage: z.literal("COMPLETED"),
        reference: text(100, 3),
        amount: z.number().positive(),
        confirmation: text(2000, 3),
        completedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .strict(),
  ]),
  refund_exception: z
    .object({
      refundId: id,
      approve: z.boolean(),
      amount: z.number().nonnegative(),
      reason: text(2000, 10),
    })
    .strict(),
};
export const workflowRequest = z
  .object({
    action: z.enum(
      Object.keys(workflowActions) as [
        keyof typeof workflowActions,
        ...(keyof typeof workflowActions)[],
      ],
    ),
    data: z.unknown().default({}),
  })
  .strict();
