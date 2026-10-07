// Calendar connections hold a professional's Google access, so the token and the sign-in state are pinned here.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  busyTimes,
  consentUrl,
  createEvent,
  eventBody,
  exchangeCode,
  freeSlots,
  open,
  removeEvent,
  seal,
  signState,
  stateActor,
} from "../src/calendar";
const keys = [
  "DEMO_SESSION_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "PUBLIC_WEB_URL",
];
beforeEach(() => {
  process.env.DEMO_SESSION_SECRET = "test-value-for-derived-keys";
  process.env.GOOGLE_CLIENT_ID = "client.test";
  process.env.GOOGLE_CLIENT_SECRET = "test-value";
});
afterEach(() => keys.forEach((key) => delete process.env[key]));
const actor = "3f2b8c1e-7a4d-4e9b-9c55-0d6a1f2e3b4c";
const session = {
  id: actor,
  startsAt: "2026-10-10T04:15:00+00:00",
  endsAt: "2026-10-10T05:05:00+00:00",
  clientEmail: "c@example.invalid",
};
// Answers Google's token endpoint, then hands the next call to `then`.
const google = (then: (url: string, init: RequestInit) => Response) =>
  (async (url: string, init: RequestInit) =>
    url.includes("oauth2.googleapis.com")
      ? new Response(JSON.stringify({ access_token: "at" }))
      : then(url, init)) as unknown as typeof fetch;

test("a stored token cannot be read or altered without the server key", () => {
  const sealed = seal("refresh-token-value");
  assert.ok(!sealed.includes("refresh-token-value"));
  assert.equal(open(sealed), "refresh-token-value");
  assert.notEqual(seal("refresh-token-value"), sealed);
  const [iv, tag, body] = sealed.split(".");
  assert.throws(() => open([iv, tag, body.slice(0, -2) + "AA"].join(".")));
  process.env.DEMO_SESSION_SECRET = "a-different-secret";
  assert.throws(() => open(sealed));
});

test("the sign-in state names its professional, expires, and cannot be forged", () => {
  const state = signState(actor, 1000);
  assert.equal(stateActor(state, 2000), actor);
  assert.equal(stateActor(state, 1000 + 600001), null);
  const [payload, mac] = state.split(".");
  const other = Buffer.from(
    JSON.stringify({ actor: "someone-else", exp: 9e15 }),
  ).toString("base64url");
  assert.equal(stateActor(`${other}.${mac}`, 2000), null);
  assert.equal(stateActor(`${payload}.AAAA`, 2000), null);
  assert.equal(stateActor("nonsense", 2000), null);
});

test("consent asks for events and busy times only, and for a lasting connection", () => {
  const url = new URL(consentUrl(actor));
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://chatbud-web.vercel.app/pro/calendar",
  );
  assert.equal(url.searchParams.get("access_type"), "offline");
  const scope = url.searchParams.get("scope") || "";
  assert.ok(
    scope.includes("calendar.events") && scope.includes("calendar.freebusy"),
  );
  assert.ok(
    !scope.split(" ").includes("https://www.googleapis.com/auth/calendar"),
  );
  assert.equal(stateActor(url.searchParams.get("state") || ""), actor);
});

test("connecting needs a refresh token and calendar access", async () => {
  const idToken = `x.${Buffer.from(JSON.stringify({ email: "pro@example.invalid" })).toString("base64url")}.y`;
  const reply = (body: unknown) =>
    (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
  const scope = "openid email https://www.googleapis.com/auth/calendar.events";
  const done = await exchangeCode(
    "code",
    reply({
      access_token: "at",
      refresh_token: "rt",
      scope,
      id_token: idToken,
    }),
  );
  assert.equal(done.email, "pro@example.invalid");
  assert.equal(open(done.cipher), "rt");
  await assert.rejects(
    exchangeCode(
      "code",
      reply({ access_token: "at", scope, id_token: idToken }),
    ),
  );
  await assert.rejects(
    exchangeCode(
      "code",
      reply({ access_token: "at", refresh_token: "rt", scope: "openid email" }),
    ),
  );
});

test("the calendar entry is discreet and asks Google for a Meet", () => {
  const body = eventBody(session);
  assert.equal(body.summary, "Chatbud session");
  assert.ok(!/psych|counsel|therap|diet|mental/i.test(JSON.stringify(body)));
  assert.deepEqual(body.attendees, [{ email: "c@example.invalid" }]);
  assert.equal(body.conferenceData?.createRequest.requestId, actor);
  assert.equal(body.start.dateTime, "2026-10-10T04:15:00.000Z");
  const linked = eventBody({
    ...session,
    meetingUrl: "https://meet.example.invalid/x",
  });
  assert.equal(linked.conferenceData, undefined);
  assert.ok(linked.description.includes("https://meet.example.invalid/x"));
});

test("creating an event returns its id and Meet link; a missing event is an error", async () => {
  const cipher = seal("rt");
  const seen: string[] = [];
  const created = await createEvent(
    cipher,
    session,
    google((url, init) => {
      seen.push(`${init.method} ${url}`);
      return new Response(
        JSON.stringify({
          id: "ev1",
          hangoutLink: "https://meet.google.com/abc-defg-hij",
        }),
      );
    }),
  );
  assert.deepEqual(created, {
    eventId: "ev1",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
  });
  assert.match(
    seen[0],
    /^POST .*\/calendars\/primary\/events\?conferenceDataVersion=1&sendUpdates=all$/,
  );
  await assert.rejects(
    createEvent(
      cipher,
      session,
      google(() => new Response("{}", { status: 403 })),
    ),
  );
  // Removing an event that is already gone is not an error.
  await removeEvent(
    cipher,
    "ev1",
    google(() => new Response("", { status: 410 })),
  );
});

test("times that clash with the professional's calendar are not offered", async () => {
  const slots = [
    "2026-10-10T04:15:00+00:00",
    "2026-10-10T05:15:00+00:00",
    "2026-10-10T06:15:00+00:00",
  ];
  const busy = [{ start: "2026-10-10T05:00:00Z", end: "2026-10-10T05:30:00Z" }];
  // A 50-minute session from 04:15 ends at 05:05, inside the busy half hour.
  assert.deepEqual(freeSlots(slots, 50, busy), ["2026-10-10T06:15:00+00:00"]);
  assert.deepEqual(freeSlots(slots, 30, busy), [
    "2026-10-10T04:15:00+00:00",
    "2026-10-10T06:15:00+00:00",
  ]);
  assert.deepEqual(freeSlots(slots, 50, []), slots);
  const read = await busyTimes(
    seal("rt"),
    "2026-10-10T00:00:00Z",
    "2026-10-11T00:00:00Z",
    google(
      () => new Response(JSON.stringify({ calendars: { primary: { busy } } })),
    ),
  );
  assert.deepEqual(read, busy);
});
