"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../_components/app";
import { Notifications } from "../_components/notifications";
import { nepalTime } from "../_components/ui";
import { usePro } from "./_components/gate";
import { GoLive, Requests } from "./_components/sections";
const day = (s: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(
    new Date(s),
  );
export default function ProHome() {
  const { api } = useApp();
  const { workspace } = usePro();
  const [summary, setSummary] = useState<any>(null);
  useEffect(() => {
    let active = true;
    api("workflow", "POST", { action: "provider_summary", data: {} })
      .then((d) => active && setSummary(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const today = workspace.appointments.filter(
    (a: any) =>
      a.status === "CONFIRMED" &&
      day(a.startsAt) === day(new Date().toISOString()),
  );
  return (
    <>
      <GoLive />
      {summary?.calendar.some(
        (c: any) =>
          c.status !== "ACTIVE" ||
          !c.lastSyncedAt ||
          Date.parse(c.lastSyncedAt) < Date.now() - 1800000,
      ) && (
        <div className="care-warning">
          <strong>Google Calendar needs attention</strong>
          <p>
            Chatbud continues accepting bookings using your published
            availability. Check external commitments and block time in Chatbud
            until syncing is restored.
          </p>
          {summary.calendar.map((c: any, i: number) => (
            <small key={i}>
              Last sync:{" "}
              {c.lastSyncedAt
                ? nepalTime(c.lastSyncedAt) + " NPT"
                : "not available"}
            </small>
          ))}
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h1>Today’s sessions</h1>
          <Link href="/pro/appointments">All appointments</Link>
        </div>
        {today.length === 0 ? (
          <p>No confirmed sessions today.</p>
        ) : (
          today.map((a: any) => (
            <article className="service-card" key={a.id}>
              <h3>{a.client}</h3>
              <p>
                {a.service} · {nepalTime(a.startsAt, false)} NPT
              </p>
              <Link className="button" href={`/appointments/${a.id}`}>
                Open session
              </Link>
            </article>
          ))
        )}
      </section>
      <Requests />
      <section className="panel">
        <h2>Care plans & follow-ups</h2>
        <p>
          {summary?.draftPlans ?? "—"} unfinished care plans ·{" "}
          {summary?.followups ?? "—"} scheduling follow-ups
        </p>
        <Link className="button secondary" href="/pro/clients">
          Review client work
        </Link>
      </section>
      <Notifications />
    </>
  );
}
