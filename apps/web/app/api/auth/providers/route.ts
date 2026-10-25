import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
// Supabase's public Auth settings expose provider availability, never secrets.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return NextResponse.json(
      { google: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Auth settings unavailable");
    const settings = await response.json();
    return NextResponse.json(
      { google: settings.external?.google === true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { google: false, message: "Google sign-in is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
