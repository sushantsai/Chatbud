import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
export const dynamic = "force-dynamic";
const limits = new Map<string, { at: number; count: number }>();
function valid(value: string, secret: string) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-f0-9]{64}$/.test(
      value,
    )
  )
    return false;
  const [id, sig] = value.split(".");
  if (!/^[a-f0-9-]{36}$/.test(id) || !sig) return false;
  const expected = createHmac("sha256", secret).update(id).digest("hex");
  return (
    sig.length === expected.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  );
}
async function proxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const target = path.join("/");
  if (
    ![
      "health",
      "catalog",
      "me",
      "providers/applications",
      "appointments/holds",
      "orders",
      "admin/overview",
      "admin/review",
    ].includes(target)
  )
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  const secret = process.env.DEMO_SESSION_SECRET;
  let session = req.cookies.get("chatbud_preview")?.value || "";
  const isDemo = req.nextUrl.searchParams.get("mode") === "demo";
  if (isDemo && process.env.NODE_ENV === "production")
    return NextResponse.json(
      { message: "Development preview is unavailable" },
      { status: 404 },
    );
  if (!secret)
    return NextResponse.json(
      { message: "Server session configuration is incomplete" },
      { status: 503 },
    );
  if (!valid(session, secret)) {
    const id = randomUUID();
    session = id + "." + createHmac("sha256", secret).update(id).digest("hex");
  }
  const auth = req.headers.get("authorization") || "";
  // Development traffic guard; production also needs a shared edge/IP rate limiter.
  const identity = session.split(".")[0];
  const now = Date.now(),
    limit = limits.get(identity) || { at: now, count: 0 };
  if (now - limit.at > 60000) {
    limit.at = now;
    limit.count = 0;
  }
  limit.count++;
  limits.set(identity, limit);
  if (limits.size > 10000) limits.clear();
  if (limit.count > 120)
    return NextResponse.json(
      { message: "Please try again shortly." },
      { status: 429 },
    );
  try {
    const response = await fetch(
      `${process.env.CHATBUD_API_URL || "http://127.0.0.1:3001"}/${target}${req.nextUrl.search}`,
      {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
          ...(isDemo ? { "x-chatbud-demo-session": session } : {}),
        },
        body: req.method === "GET" ? undefined : await req.text(),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    const result = new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
    result.cookies.set("chatbud_preview", session, {
      httpOnly: true,
      sameSite: "strict",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 43200,
    });
    return result;
  } catch {
    return NextResponse.json(
      { message: "The service is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
