import "reflect-metadata";
import { config } from "dotenv";
import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  Module,
  Injectable,
  Inject,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  profession,
  application,
  slotQuery,
  appointmentRequest,
  appointmentRef,
  serviceInput,
  availabilityInput,
  appointmentDecision,
  appointmentProposal,
  rescheduleResponse,
  reviewDecision,
  documentRef,
  goalInput,
  shareInput,
  planInput,
  profileInput,
  opsRequest,
  promoCheck,
  supportActions,
  teamActions,
  mediaTypes,
  documentRequest,
  booking,
  order,
} from "./schemas";
import helmet from "helmet";
import { createMeetingLink, videoProvider } from "./meeting";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
config();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new HttpException(
      { message: r.error.issues.map((i) => i.message).join("; ") },
      400,
    );
  return r.data;
}
const demoProviders = [
  {
    id: "demo-maya",
    serviceId: "demo-s1",
    name: "Maya Sharma",
    profession: "clinical_psychologist",
    service: "Individual consultation",
    bio: "A thoughtful space to explore stress, relationships, and the changes life brings.",
    languages: ["en", "ne"],
    price: 1800,
    duration: 50,
    focus: ["Stress & anxiety", "Relationships"],
    color: "blue",
  },
  {
    id: "demo-anil",
    serviceId: "demo-s2",
    name: "Anil Karki",
    profession: "dietitian",
    service: "Nutrition consultation",
    bio: "Practical nutrition support shaped around your routines, preferences, and goals.",
    languages: ["en", "ne"],
    price: 1500,
    duration: 45,
    focus: ["Balanced eating", "Everyday nutrition"],
    color: "orange",
  },
  {
    id: "demo-nisha",
    serviceId: "demo-s3",
    name: "Nisha Adhikari",
    profession: "nutritionist",
    service: "Food & lifestyle consultation",
    bio: "Build sustainable food habits with a plan that fits your everyday life.",
    languages: ["ne", "en"],
    price: 1200,
    duration: 45,
    focus: ["Meal planning", "Sports nutrition"],
    color: "green",
  },
  {
    id: "demo-rohan",
    serviceId: "demo-s4",
    name: "Rohan Thapa",
    profession: "counselor",
    service: "Counseling consultation",
    bio: "Support for navigating work pressure, transitions, and personal challenges.",
    languages: ["en", "ne"],
    price: 1400,
    duration: 50,
    focus: ["Work & burnout", "Life transitions"],
    color: "purple",
  },
];
const demoProducts = [
  {
    id: "demo-p1",
    name: "Daily reflection journal",
    description:
      "A guided journal for reflection and building everyday routines.",
    kind: "WELLNESS",
    price: 650,
    stock: 18,
    category: "Everyday wellbeing",
  },
  {
    id: "demo-p2",
    name: "Resistance band set",
    description: "Three resistance levels for a gentle movement routine.",
    kind: "WELLNESS",
    price: 1200,
    stock: 12,
    category: "Movement",
  },
  {
    id: "demo-p3",
    name: "Vitamin D3 · sample listing",
    description:
      "Fictional supplement listing. Ingredient, batch, expiry and label approval are required before sale.",
    kind: "SUPPLEMENT",
    price: 850,
    stock: 10,
    category: "Nutrition essentials",
  },
  {
    id: "demo-p4",
    name: "Reusable hydration bottle",
    description: "A practical companion for your daily hydration routine.",
    kind: "WELLNESS",
    price: 900,
    stock: 16,
    category: "Everyday wellbeing",
  },
];
@Injectable()
class DataService {
  readonly db: SupabaseClient;
  readonly demoEnabled =
    process.env.ENABLE_DEMO === "true" && process.env.NODE_ENV !== "production";
  readonly dataPath = join(process.cwd(), ".dev-data");
  readonly previews = new Map<string, any>();
  readonly synced = new Map<string, { stamp: string; at: number }>();
  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error(
        "Configure server Supabase credentials before starting API",
      );
    this.db = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  preview(mode: string | undefined, signed: string | undefined): any {
    if (mode !== "demo") return null;
    if (!this.demoEnabled)
      throw new HttpException("Development preview is unavailable", 404);
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-f0-9]{64}$/.test(
        signed || "",
      )
    )
      throw new HttpException("Invalid preview session", 401);
    const [id, signature] = String(signed).split(".");
    if (
      !/^[a-f0-9-]{36}$/.test(id) ||
      !signature ||
      !process.env.DEMO_SESSION_SECRET
    )
      throw new HttpException("Preview session required", 401);
    const expected = createHmac("sha256", process.env.DEMO_SESSION_SECRET)
      .update(id)
      .digest("hex");
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new HttpException("Invalid preview session", 401);
    let state = this.previews.get(id);
    if (!state) {
      try {
        state = JSON.parse(
          readFileSync(join(this.dataPath, id + ".json"), "utf8"),
        );
      } catch {
        state = {
          sessionId: id,
          appointments: [],
          orders: [],
          applications: [],
          products: structuredClone(demoProducts),
          audit: [],
        };
      }
      if (this.previews.size > 1000) this.previews.clear();
      this.previews.set(id, state);
    }
    return state;
  }
  persist(state: any) {
    mkdirSync(this.dataPath, { recursive: true });
    const file = join(this.dataPath, state.sessionId + ".json");
    writeFileSync(file + ".tmp", JSON.stringify(state), { mode: 0o600 });
    renameSync(file + ".tmp", file);
  }
  // Review, practice setup and appointment actions live in their own gateway.
  care(action: string, actor: string | null = null, data: any = {}) {
    return this.rpc(action, actor, data, "chatbud_care");
  }
  // Goals, care plans and consent-gated sharing.
  health(action: string, actor: string, data: any = {}) {
    return this.rpc(action, actor, data, "chatbud_health");
  }
  // Signed-in practice and appointment features have no preview equivalent.
  liveOnly(mode: string | undefined, signed: string | undefined) {
    if (this.preview(mode, signed))
      throw new HttpException("This is not part of the preview.", 404);
  }
  async rpc(
    action: string,
    actor: string | null = null,
    data: any = {},
    gateway = "chatbud_api",
  ) {
    const { data: result, error } = await this.db.rpc(gateway, {
      p_action: action,
      p_actor: actor,
      p_data: data,
    });
    if (error) {
      if (error.code === "42501") throw new HttpException("Access denied", 403);
      if (error.code === "P0001") throw new HttpException(error.message, 400);
      console.error(
        `Database operation "${action}" failed:`,
        error.code || "no code",
        error.message,
      );
      throw new HttpException("Database operation failed", 500);
    }
    return result;
  }
  async actor(authorization: string | undefined) {
    if (!authorization?.startsWith("Bearer "))
      throw new HttpException("Sign in to continue", 401);
    const token = authorization.slice(7);
    const { data, error } = await this.db.auth.getUser(token);
    if (error || !data.user?.email_confirmed_at)
      throw new HttpException("A verified sign-in is required", 401);
    const profile = {
      email: data.user.email,
      name: data.user.user_metadata?.display_name,
    };
    const stamp = JSON.stringify(profile);
    const synced = this.synced.get(data.user.id);
    if (synced?.stamp !== stamp || Date.now() - synced.at > 300000) {
      await this.rpc("account", data.user.id, profile);
      if (this.synced.size > 10000) this.synced.clear();
      this.synced.set(data.user.id, { stamp, at: Date.now() });
    }
    return data.user.id;
  }
  cleanHolds(state: any) {
    const time = Date.now();
    for (const a of state.appointments)
      if (a.status === "HELD" && Date.parse(a.expiresAt) <= time)
        a.status = "EXPIRED";
    for (const o of state.orders)
      if (o.status === "AWAITING_PAYMENT" && Date.parse(o.expiresAt) <= time) {
        o.status = "EXPIRED";
        for (const item of o.items)
          state.products.find((p: any) => p.id === item.skuId).stock +=
            item.quantity;
      }
  }
}
@Controller()
class AppController {
  constructor(@Inject(DataService) private readonly data: DataService) {}
  @Get("health") health() {
    return {
      status: "ok",
      service: "chatbud-api",
      demoAvailable: this.data.demoEnabled,
      videoProvider: videoProvider(),
    };
  }
  @Get("catalog") async catalog(
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    const state = this.data.preview(mode, session);
    if (state) {
      this.data.cleanHolds(state);
      return {
        mode: "demo",
        providers: demoProviders,
        products: state.products,
      };
    }
    return { mode: "live", ...(await this.data.rpc("catalog")) };
  }
  @Get("me") async me(
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    const state = this.data.preview(mode, session);
    if (state) {
      this.data.cleanHolds(state);
      return {
        appointments: state.appointments,
        orders: state.orders,
        providerApplication: state.applications.at(-1) || null,
        roles: ["PREVIEW"],
      };
    }
    return this.data.rpc("dashboard", await this.data.actor(auth));
  }
  @Post("providers/applications") async apply(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    const state = this.data.preview(mode, session);
    const input = parse(application, body);
    if (state) {
      const row = {
        ...input,
        id: crypto.randomUUID(),
        name: "Preview practitioner",
        status: "SUBMITTED",
        submittedAt: new Date().toISOString(),
      };
      state.applications.push(row);
      state.audit.push({
        action: "Application submitted",
        at: new Date().toISOString(),
      });
      this.data.persist(state);
      return row;
    }
    const actor = await this.data.actor(auth);
    // Evidence must be a file this applicant uploaded through a signed URL.
    if (input.details?.documents.some((d) => !d.path.startsWith(`${actor}/`)))
      throw new HttpException("Upload your documents again.", 400);
    return this.data.rpc("provider_apply", actor, {
      ...input,
      details: { ...input.details, profession: input.profession },
    });
  }
  @Post("providers/documents") async document(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    const state = this.data.preview(mode, session);
    const input = parse(documentRequest, body);
    // Preview never stores files.
    if (state) return { path: `preview/${crypto.randomUUID()}`, token: null };
    const actor = await this.data.actor(auth);
    const path = `${actor}/${input.kind}-${crypto.randomUUID()}.${mediaTypes[input.mediaType]}`;
    const { data, error } = await this.data.db.storage
      .from("credential-evidence")
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error("Evidence upload URL failed:", error?.message);
      throw new HttpException("Document upload is unavailable.", 500);
    }
    return { path, token: data.token };
  }
  @Post("appointments/holds") async hold(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    const state = this.data.preview(mode, session);
    const input = parse(booking, body);
    if (!state) {
      await this.data.actor(auth);
      throw new HttpException(
        "Live booking opens after provider and payment onboarding.",
        503,
      );
    }
    this.data.cleanHolds(state);
    const previous = state.appointments.find(
      (a: any) => a.idempotencyKey === input.idempotencyKey,
    );
    if (previous) {
      if (
        previous.serviceId !== input.serviceId ||
        previous.startsAt !== input.startsAt
      )
        throw new HttpException(
          "Idempotency key belongs to a different request.",
          409,
        );
      return previous;
    }
    const provider = demoProviders.find((p) => p.serviceId === input.serviceId);
    if (!provider) throw new HttpException("Service not found", 404);
    const start = Date.parse(input.startsAt);
    if (start < Date.now() || start > Date.now() + 90 * 86400000)
      throw new HttpException(
        "Choose a future appointment within 90 days",
        400,
      );
    const end = start + provider.duration * 60000;
    if (
      state.appointments.some(
        (a: any) =>
          a.providerId === provider.id &&
          a.status === "HELD" &&
          Date.parse(a.startsAt) < end &&
          Date.parse(a.endsAt) > start,
      )
    )
      throw new HttpException(
        "That time is already held. Choose another time.",
        409,
      );
    const row = {
      id: crypto.randomUUID(),
      ...input,
      providerId: provider.id,
      provider: provider.name,
      service: provider.service,
      price: provider.price,
      endsAt: new Date(end).toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
      status: "HELD",
    };
    state.appointments.unshift(row);
    this.data.persist(state);
    return row;
  }
  @Post("orders") async createOrder(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    const state = this.data.preview(mode, session);
    const input = parse(order, body);
    if (!state) {
      await this.data.actor(auth);
      throw new HttpException(
        "Shop checkout opens after product and payment onboarding.",
        503,
      );
    }
    this.data.cleanHolds(state);
    const prev = state.orders.find(
      (o: any) => o.idempotencyKey === input.idempotencyKey,
    );
    if (prev) {
      const same =
        JSON.stringify(
          [...prev.items].sort((a: any, b: any) =>
            a.skuId.localeCompare(b.skuId),
          ),
        ) ===
        JSON.stringify(
          [...input.items].sort((a: any, b: any) =>
            a.skuId.localeCompare(b.skuId),
          ),
        );
      if (!same)
        throw new HttpException(
          "Idempotency key belongs to a different request.",
          409,
        );
      return prev;
    }
    if (new Set(input.items.map((i) => i.skuId)).size !== input.items.length)
      throw new HttpException("Duplicate product lines are not allowed.", 400);
    const quantities = new Map<string, number>();
    for (const item of input.items)
      quantities.set(
        item.skuId,
        (quantities.get(item.skuId) || 0) + item.quantity,
      );
    let subtotal = 0;
    for (const [id, quantity] of quantities) {
      const p = state.products.find((p: any) => p.id === id);
      if (!p || quantity > p.stock)
        throw new HttpException("Some items are no longer available.", 409);
      subtotal += p.price * quantity;
    }
    const items = [...quantities].map(([skuId, quantity]) => ({
      skuId,
      quantity,
    }));
    for (const item of items)
      state.products.find((p: any) => p.id === item.skuId).stock -=
        item.quantity;
    const row = {
      id: crypto.randomUUID(),
      items,
      idempotencyKey: input.idempotencyKey,
      total: subtotal,
      status: "AWAITING_PAYMENT",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
    };
    state.orders.unshift(row);
    this.data.persist(state);
    return row;
  }
  @Get("admin/overview") async admin(
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    const state = this.data.preview(mode, session);
    if (state) return { applications: state.applications, audit: state.audit };
    return this.data.care("admin_queue", await this.data.actor(auth));
  }
  @Post("admin/review") async review(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    const state = this.data.preview(mode, session);
    if (!state)
      return this.data.care(
        "admin_review",
        await this.data.actor(auth),
        parse(reviewDecision, body),
      );
    const input = parse(
      z
        .object({
          id: z.string().uuid(),
          decision: z.enum(["NEEDS_INFORMATION", "REJECTED"]),
        })
        .strict(),
      body,
    );
    const row = state.applications.find((a: any) => a.id === input.id);
    if (!row) throw new HttpException("Application not found", 404);
    row.status = input.decision;
    state.audit.unshift({
      action: `Application ${input.decision.toLowerCase().replaceAll("_", " ")}`,
      at: new Date().toISOString(),
    });
    this.data.persist(state);
    return row;
  }
}
@Controller()
class CareController {
  constructor(@Inject(DataService) private readonly data: DataService) {}
  @Get("appointments/slots") slots(
    @Query("serviceId") serviceId: string,
    @Query("date") date: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    return this.data.care("slots", null, parse(slotQuery, { serviceId, date }));
  }
  @Get("appointments") async mine(
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    return this.data.care("appointments_mine", await this.data.actor(auth));
  }
  @Post("appointments") async request(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(appointmentRequest, body);
    return this.data.care(
      "appointment_request",
      await this.data.actor(auth),
      input,
    );
  }
  @Post("appointments/cancel") async cancel(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(appointmentRef, body);
    return this.data.care(
      "appointment_cancel",
      await this.data.actor(auth),
      input,
    );
  }
  @Get("provider/workspace") async workspace(
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    return this.data.care("provider_workspace", await this.data.actor(auth));
  }
  @Post("provider/service") async service(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(serviceInput, body);
    return this.data.care(
      "provider_service_save",
      await this.data.actor(auth),
      input,
    );
  }
  @Post("provider/availability") async availability(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(availabilityInput, body);
    return this.data.care(
      "provider_availability_save",
      await this.data.actor(auth),
      input,
    );
  }
  @Post("provider/profile") async profile(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(profileInput, body);
    return this.data.rpc("profile_save", await this.data.actor(auth), input);
  }
  @Post("provider/appointments") async decide(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(appointmentDecision, body);
    const actor = await this.data.actor(auth);
    const meetingUrl =
      input.decision === "CONFIRM"
        ? input.meetingUrl || (await createMeetingLink()).url
        : undefined;
    return this.data.care("provider_appointment_decide", actor, {
      ...input,
      meetingUrl,
    });
  }
  @Post("provider/reschedule") async propose(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(appointmentProposal, body);
    return this.data.care(
      "provider_appointment_propose",
      await this.data.actor(auth),
      input,
    );
  }
  @Post("appointments/reschedule") async respond(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(rescheduleResponse, body);
    const actor = await this.data.actor(auth);
    // Accepting finalises the consultation, so it needs a link if it has none yet;
    // the gateway keeps an existing link and ignores this one.
    return this.data.care("appointment_reschedule_respond", actor, {
      ...input,
      ...(input.accept ? { meetingUrl: (await createMeetingLink()).url } : {}),
    });
  }
  @Post("admin/document") async evidence(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(documentRef, body);
    // The gateway checks the reviewer role and that the file belongs to this application.
    await this.data.care("admin_document", await this.data.actor(auth), input);
    const { data, error } = await this.data.db.storage
      .from("credential-evidence")
      .createSignedUrl(input.path, 120);
    if (error || !data) {
      console.error("Evidence link failed:", error?.message);
      throw new HttpException("This document could not be opened.", 500);
    }
    return { url: data.signedUrl };
  }
}
@Controller()
class HealthController {
  constructor(@Inject(DataService) private readonly data: DataService) {}
  @Get("health/mine") async mine(
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    return this.data.health("health_mine", await this.data.actor(auth));
  }
  @Post("health/goal") async goal(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(goalInput, body);
    return this.data.health("goal_save", await this.data.actor(auth), input);
  }
  @Post("health/share") async share(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(shareInput, body);
    return this.data.health("share_set", await this.data.actor(auth), input);
  }
  @Get("provider/clients") async clients(
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    return this.data.health("provider_clients", await this.data.actor(auth));
  }
  @Post("provider/plan") async plan(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    const input = parse(planInput, body);
    return this.data.health("plan_save", await this.data.actor(auth), input);
  }
}
@Controller()
class OpsController {
  constructor(@Inject(DataService) private readonly data: DataService) {}
  // Runs one named action after validating its data against that action's schema.
  private async run(
    actions: Record<string, z.ZodTypeAny>,
    body: unknown,
    auth: string,
  ) {
    const { action, data } = parse(opsRequest, body);
    const schema = Object.hasOwn(actions, action) ? actions[action] : null;
    if (!schema) throw new HttpException("Unknown action", 404);
    const input = parse(schema, data ?? {});
    const actor = await this.data.actor(auth);
    if (action === "booking_confirm" && !input.meetingUrl)
      input.meetingUrl = (await createMeetingLink()).url;
    return this.data.rpc(action, actor, input, "chatbud_ops");
  }
  @Get("store/offers") offers(
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    if (this.data.preview(mode, session)) return { products: [] };
    return this.data.rpc("storefront", null, {}, "chatbud_ops");
  }
  @Post("store/promo") promo(
    @Body() body: unknown,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    return this.data.rpc(
      "promo_check",
      null,
      parse(promoCheck, body),
      "chatbud_ops",
    );
  }
  @Post("support") support(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    return this.run(supportActions, body, auth);
  }
  // Roles are enforced per action inside the database gateway.
  @Post("admin/ops") team(
    @Body() body: unknown,
    @Headers("authorization") auth: string,
    @Query("mode") mode: string,
    @Headers("x-chatbud-demo-session") session: string,
  ) {
    this.data.liveOnly(mode, session);
    return this.run(teamActions, body, auth);
  }
}
@Module({
  controllers: [AppController, CareController, HealthController, OpsController],
  providers: [DataService],
})
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });
  app.use(helmet());
  app.enableCors({ origin: process.env.WEB_ORIGIN || "http://localhost:3000" });
  app.use((req: any, res: any, next: () => void) => {
    const ip = clientIp(req);
    const now = Date.now();
    const old = limits.get(ip) || { at: now, count: 0 };
    if (now - old.at > 60000) {
      old.at = now;
      old.count = 0;
    }
    old.count++;
    limits.set(ip, old);
    if (limits.size > 10000) limits.clear();
    if (old.count > 2000)
      return res.status(429).json({ message: "Please try again shortly." });
    next();
  });
  await app.listen(
    Number(process.env.PORT || 3001),
    process.env.HOST || (process.env.VERCEL ? "0.0.0.0" : "127.0.0.1"),
  );
}
const limits = new Map<string, { at: number; count: number }>();
// The web proxy signs the visitor address; unsigned callers are limited by their own address.
function clientIp(req: any): string {
  const ip = String(req.headers["x-chatbud-client-ip"] || "");
  const signature = String(req.headers["x-chatbud-client-signature"] || "");
  const secret = process.env.DEMO_SESSION_SECRET;
  if (ip && secret && /^[a-f0-9]{64}$/.test(signature)) {
    const expected = createHmac("sha256", secret).update(ip).digest("hex");
    if (timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
      return ip;
  }
  return req.ip;
}
bootstrap().catch((error) => {
  console.error(
    "API startup failed; verify configuration:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
