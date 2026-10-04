// The meeting link must always come back, whichever provider is available.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createMeetingLink, videoProvider } from "../src/meeting";
const keys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
];
const connect = () => keys.forEach((key) => (process.env[key] = "test-value"));
afterEach(() => keys.forEach((key) => delete process.env[key]));
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

test("without Google connected, a private Jitsi room is created", async () => {
  const called: string[] = [];
  const result = await createMeetingLink((async (url: string) => {
    called.push(url);
    return reply(500, {});
  }) as typeof fetch);
  assert.equal(result.provider, "jitsi");
  assert.match(result.url, /^https:\/\/meet\.jit\.si\/chatbud-[a-f0-9]{24}$/);
  assert.deepEqual(called, []);
  assert.equal(videoProvider(), "jitsi");
  assert.notEqual(result.url, (await createMeetingLink()).url);
});

test("with Google connected, an open Meet space is requested", async () => {
  connect();
  const seen: { url: string; body: string; auth: string | null }[] = [];
  const result = await createMeetingLink((async (
    url: string,
    init: RequestInit,
  ) => {
    seen.push({
      url,
      body: String(init.body),
      auth: new Headers(init.headers).get("authorization"),
    });
    return url.includes("oauth2")
      ? reply(200, { access_token: "token-1", expires_in: 3600 })
      : reply(200, { meetingUri: "https://meet.google.com/abc-defg-hij" });
  }) as typeof fetch);
  assert.deepEqual(result, {
    url: "https://meet.google.com/abc-defg-hij",
    provider: "google_meet",
  });
  assert.equal(seen[0].url, "https://oauth2.googleapis.com/token");
  assert.match(seen[0].body, /grant_type=refresh_token/);
  assert.equal(seen[1].url, "https://meet.googleapis.com/v2/spaces");
  assert.equal(seen[1].auth, "Bearer token-1");
  assert.deepEqual(JSON.parse(seen[1].body), {
    config: { accessType: "OPEN" },
  });
});

test("a Google failure falls back so confirmation never fails", async () => {
  connect();
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    for (const failing of [
      async () => reply(400, { error: "invalid_grant" }),
      async (url: string) =>
        url.includes("oauth2")
          ? reply(200, { access_token: "token-2", expires_in: 3600 })
          : reply(403, { error: { message: "API not enabled" } }),
      async () => {
        throw new Error("network down");
      },
    ]) {
      const result = await createMeetingLink(failing as typeof fetch);
      assert.equal(result.provider, "jitsi");
      assert.match(result.url, /^https:\/\/meet\.jit\.si\/chatbud-/);
    }
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 3);
});
