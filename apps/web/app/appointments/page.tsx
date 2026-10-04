"use client";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useApp } from "../_components/app";
import { SignInPrompt, money } from "../_components/ui";
export default function Appointments() {
  const { mode, token, dashboard, openAuth } = useApp();
  if (mode === "live" && !token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in to see your appointments.
      </SignInPrompt>
    );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Appointments</h2>
        <Link href="/professionals">Find a professional</Link>
      </div>
      {dashboard.appointments.length === 0 ? (
        <p className="empty-inline">
          Your appointments will appear here when you book.
        </p>
      ) : (
        dashboard.appointments.map((a: any) => (
          <div className="record" key={a.id}>
            <span className="record-icon">
              <CalendarDays size={22} />
            </span>
            <div>
              <strong>{a.provider}</strong>
              <p>
                {a.service} ·{" "}
                {new Date(a.startsAt).toLocaleString("en-NP", {
                  timeZone: "Asia/Kathmandu",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                NPT
              </p>
            </div>
            <span className="status">{a.status.replaceAll("_", " ")}</span>
            <strong>{money(a.price)}</strong>
          </div>
        ))
      )}
    </section>
  );
}
