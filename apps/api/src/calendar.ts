// A professional's own Google Calendar: connecting it, adding confirmed
// sessions with a Meet link, keeping them in step, and reading busy times.
// Every Google failure is survivable: bookings never depend on Google.
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

type Fetch = typeof fetch;
const env = (key: string) => process.env[key]?.trim() || "";
const web = () => env("PUBLIC_WEB_URL") || "https://chatbud-web.vercel.app";
// Where Google sends the professional back to after they agree.
export const redirectUri = () => `${web()}/pro/calendar`;
export const calendarConfigured = () =>
  !!env("GOOGLE_CLIENT_ID") &&
  !!env("GOOGLE_CLIENT_SECRET") &&
  !!env("DEMO_SESSION_SECRET");
// Events only, plus busy times. Chatbud cannot read what is in the calendar.
const scopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

// Keys are derived from the server's existing secret, each for one purpose only.
const key = (purpose: string) =>
  Buffer.from(
    hkdfSync(
      "sha256",
      env("DEMO_SESSION_SECRET"),
      "",
      `chatbud-${purpose}-v1`,
      32,
    ),
  );

// Refresh tokens are encrypted before they are stored, so the database alone cannot use them.
export function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("google-token"), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function open(sealed: string) {
  const [iv, tag, body] = sealed
    .split(".")
    .map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key("google-token"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    "utf8",
  );
}

// The "state" ties Google's reply to the signed-in professional who started it, for ten minutes.
export function signState(actor: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ actor, exp: now + 600000 }),
  ).toString("base64url");
  const mac = createHmac("sha256", key("google-state"))
    .update(payload)
    .digest("base64url");
  return `${payload}.${mac}`;
}
export function stateActor(state: string, now = Date.now()): string | null {
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;
  const expected = createHmac("sha256", key("google-state"))
    .update(payload)
    .digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return null;
  try {
    const { actor, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    return typeof actor === "string" && exp > now ? actor : null;
  } catch {
    return null;
  }
}

export const consentUrl = (actor: string) =>
  `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: scopes,
    // "offline" with "consent" makes Google return a refresh token every time.
    access_type: "offline",
    prompt: "consent",
    state: signState(actor),
  })}`;

async function token(params: Record<string, string>, request: Fetch) {
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      ...params,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok || !body.access_token)
    throw new Error(
      `Google token request failed: ${body.error || response.status}`,
    );
  return body;
}

// Turns the one-time code from Google into a stored connection.
export async function exchangeCode(code: string, request: Fetch = fetch) {
  const body = await token(
    { code, grant_type: "authorization_code", redirect_uri: redirectUri() },
    request,
  );
  if (!body.refresh_token)
    throw new Error("Google did not return a refresh token");
  if (!String(body.scope || "").includes("calendar.events"))
    throw new Error("Calendar access was not granted");
  // The id token comes straight from Google over TLS, so its payload can be read directly.
  const claims = JSON.parse(
    Buffer.from(
      String(body.id_token || "..").split(".")[1] || "",
      "base64url",
    ).toString() || "{}",
  );
  return {
    email: String(claims.email || "Google account"),
    cipher: seal(body.refresh_token),
  };
}

async function google(
  cipher: string,
  path: string,
  init: { method?: string; body?: unknown },
  request: Fetch,
) {
  const { access_token } = await token(
    { refresh_token: open(cipher), grant_type: "refresh_token" },
    request,
  );
  const response = await request(
    `https://www.googleapis.com/calendar/v3${path}`,
    {
      method: init.method || "POST",
      headers: {
        authorization: `Bearer ${access_token}`,
        "content-type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(8000),
    },
  );
  // A deleted event that is already gone is fine.
  if (
    !response.ok &&
    !(init.method === "DELETE" && [404, 410].includes(response.status))
  )
    throw new Error(`Google Calendar request failed: ${response.status}`);
  return response.status === 204
    ? {}
    : ((await response.json().catch(() => ({}))) as Record<string, any>);
}

type Session = {
  id: string;
  startsAt: string;
  endsAt: string;
  clientEmail?: string;
  // An existing link to mention instead of asking Google for a new Meet.
  meetingUrl?: string | null;
};
// What goes on the calendar says nothing about the kind of care, because invitations are emailed and shown on lock screens.
export const eventBody = (session: Session) => ({
  summary: "Chatbud session",
  description: `Your online session booked through Chatbud.${session.meetingUrl ? `\nJoin: ${session.meetingUrl}` : ""}\nDetails: ${web()}/appointments`,
  start: { dateTime: new Date(session.startsAt).toISOString() },
  end: { dateTime: new Date(session.endsAt).toISOString() },
  ...(session.clientEmail
    ? { attendees: [{ email: session.clientEmail }] }
    : {}),
  ...(session.meetingUrl
    ? {}
    : {
        conferenceData: {
          createRequest: {
            // The appointment id makes a repeated request return the same Meet.
            requestId: session.id,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
});

// Adds the session to the professional's calendar; Google emails the client an invitation.
export async function createEvent(
  cipher: string,
  session: Session,
  request: Fetch = fetch,
) {
  const event = await google(
    cipher,
    "/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    { body: eventBody(session) },
    request,
  );
  if (!event.id) throw new Error("Google Calendar did not create the event");
  return {
    eventId: String(event.id),
    meetingUrl: (event.hangoutLink as string) || null,
  };
}
export const moveEvent = (
  cipher: string,
  eventId: string,
  session: Session,
  request: Fetch = fetch,
) =>
  google(
    cipher,
    `/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "PATCH",
      body: {
        start: { dateTime: new Date(session.startsAt).toISOString() },
        end: { dateTime: new Date(session.endsAt).toISOString() },
      },
    },
    request,
  );
export const removeEvent = (
  cipher: string,
  eventId: string,
  request: Fetch = fetch,
) =>
  google(
    cipher,
    `/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE" },
    request,
  );

// Drops the offered times that overlap something already in the professional's calendar.
export const freeSlots = (
  slots: string[],
  durationMinutes: number,
  busy: { start: string; end: string }[],
) =>
  slots.filter((slot) => {
    const start = Date.parse(slot);
    const end = start + durationMinutes * 60000;
    return !busy.some(
      (b) => start < Date.parse(b.end) && end > Date.parse(b.start),
    );
  });
export async function busyTimes(
  cipher: string,
  from: string,
  to: string,
  request: Fetch = fetch,
) {
  const result = await google(
    cipher,
    "/freeBusy",
    { body: { timeMin: from, timeMax: to, items: [{ id: "primary" }] } },
    request,
  );
  return (result.calendars?.primary?.busy || []) as {
    start: string;
    end: string;
  }[];
}
