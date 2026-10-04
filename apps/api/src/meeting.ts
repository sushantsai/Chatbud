// Creates the video link for a confirmed appointment.
// Google Meet is used when a Google account is connected; otherwise a private Jitsi room.
// A failure here must never block a confirmation, so every Google error falls back.
import { randomBytes } from "node:crypto";

const google = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
});
export const googleMeetConfigured = () =>
  Object.values(google()).every((value) => !!value);
export const videoProvider = () =>
  googleMeetConfigured() ? "google_meet" : "jitsi";

type Fetch = typeof fetch;
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(request: Fetch): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
  const { clientId, clientSecret, refreshToken } = google();
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken!,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!response.ok || !body.access_token)
    throw new Error(
      `Google token request failed: ${body.error || response.status}`,
    );
  cached = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in || 3600) * 1000,
  };
  return cached.token;
}

async function googleMeetLink(request: Fetch): Promise<string> {
  const response = await request("https://meet.googleapis.com/v2/spaces", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken(request)}`,
      "Content-Type": "application/json",
    },
    // OPEN: anyone with the link joins without waiting to be admitted.
    body: JSON.stringify({ config: { accessType: "OPEN" } }),
    signal: AbortSignal.timeout(8000),
  });
  const body = (await response.json()) as {
    meetingUri?: string;
    error?: { message?: string };
  };
  if (!response.ok || !body.meetingUri?.startsWith("https://meet.google.com/"))
    throw new Error(
      `Google Meet space request failed: ${body.error?.message || response.status}`,
    );
  return body.meetingUri;
}

const jitsiLink = () =>
  `https://meet.jit.si/chatbud-${randomBytes(12).toString("hex")}`;

export async function createMeetingLink(
  request: Fetch = fetch,
): Promise<{ url: string; provider: "google_meet" | "jitsi" }> {
  if (googleMeetConfigured())
    try {
      return { url: await googleMeetLink(request), provider: "google_meet" };
    } catch (error) {
      cached = null;
      console.error(
        "Falling back to a Jitsi room:",
        error instanceof Error ? error.message : error,
      );
    }
  return { url: jitsiLink(), provider: "jitsi" };
}
