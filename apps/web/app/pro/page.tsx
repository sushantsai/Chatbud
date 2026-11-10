"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useApp } from "../_components/app";
import { Notifications } from "../_components/notifications";
import { usePro } from "./_components/gate";
import { pendingRequests } from "./_components/sections";
import {
  CalendarProblem,
  RequestRow,
  SessionRow,
  Setup,
  byDay,
  dayLabel,
  nepalDayKey,
  useMinute,
} from "./_components/desk";

const greetingFor = (now: number) => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kathmandu",
    }).format(new Date(now)),
  );
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
};

export default function ProHome() {
  const { api, dashboard } = useApp();
  const { workspace } = usePro();
  const now = useMinute();
  const [summary, setSummary] = useState<any>(null);
  useEffect(() => {
    let active = true;
    api("workflow", "POST", { action: "provider_summary", data: {} })
      .then((d) => active && setSummary(d))
      .catch(() => active && setSummary({ failed: true }));
    return () => {
      active = false;
    };
  }, []);

  const todayKey = nepalDayKey(new Date(now));
  const confirmed = workspace.appointments.filter(
    (a: any) => a.status === "CONFIRMED",
  );
  const today = confirmed.filter(
    (a: any) =>
      nepalDayKey(a.startsAt) === todayKey &&
      Date.parse(a.startsAt) + 60 * 60000 > now,
  );
  const week = confirmed.filter(
    (a: any) =>
      nepalDayKey(a.startsAt) !== todayKey &&
      Date.parse(a.startsAt) > now &&
      Date.parse(a.startsAt) < now + 7 * 86400000,
  );
  const requests = pendingRequests(workspace).sort(
    (a: any, b: any) =>
      Date.parse(a.approvalDueAt || a.startsAt) -
      Date.parse(b.approvalDueAt || b.startsAt),
  );
  const first = (dashboard.displayName || "").split(" ")[0];
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(now));
  const clientWork =
    (summary?.draftPlans ?? 0) + (summary?.followups ?? 0) > 0;

  return (
    <div className="pro-desk">
      <header className="pro-desk-head">
        <div>
          <h1>
            {greetingFor(now)}
            {first ? `, ${first}` : ""}
          </h1>
          <p>
            {date} ·{" "}
            {today.length === 0
              ? "no sessions today"
              : `${today.length} ${today.length === 1 ? "session" : "sessions"} today`}
            {requests.length > 0 &&
              ` · ${requests.length} ${requests.length === 1 ? "request" : "requests"} waiting`}
          </p>
        </div>
        <Link className="button secondary small" href="/pro/services">
          Services &amp; hours
        </Link>
      </header>

      <CalendarProblem />
      <Setup workspace={workspace} />

      {requests.length > 0 && (
        <section className="pro-requests" aria-labelledby="pro-req-title">
          <div className="pro-section-head">
            <h2 id="pro-req-title">Waiting for your response</h2>
            <p>
              Approve within 60 minutes of payment. Chatbud calls you at 30
              minutes; unanswered requests are refunded.
            </p>
          </div>
          <ul>
            {requests.map((a: any) => (
              <RequestRow a={a} now={now} key={a.id} />
            ))}
          </ul>
        </section>
      )}

      <div className="pro-desk-grid">
        <section className="pro-today" aria-labelledby="pro-today-title">
          <div className="pro-section-head">
            <h2 id="pro-today-title">Today</h2>
            <Link href="/pro/appointments">
              All appointments <ArrowRight size={15} />
            </Link>
          </div>
          {today.length === 0 ? (
            <p className="pro-empty">
              No sessions left today.{" "}
              {week.length > 0
                ? `Next: ${dayLabel(week[0].startsAt)}.`
                : "New bookings appear here once you approve them."}
            </p>
          ) : (
            <ol className="pro-sessions">
              {today.map((a: any) => (
                <SessionRow a={a} now={now} key={a.id} />
              ))}
            </ol>
          )}
        </section>

        <aside className="pro-side">
          <section aria-labelledby="pro-week-title">
            <h2 id="pro-week-title">Next 7 days</h2>
            {week.length === 0 ? (
              <p className="pro-empty">Nothing booked yet.</p>
            ) : (
              byDay(week).map((day) => (
                <div className="pro-week-day" key={day[0].id}>
                  <h3>{dayLabel(day[0].startsAt)}</h3>
                  <ol className="pro-sessions compact">
                    {day.map((a: any) => (
                      <SessionRow a={a} now={now} key={a.id} />
                    ))}
                  </ol>
                </div>
              ))
            )}
          </section>
          <section aria-labelledby="pro-work-title">
            <h2 id="pro-work-title">Client work</h2>
            {summary === null ? (
              <p className="pro-empty">Checking…</p>
            ) : summary.failed ? (
              <p className="pro-empty">Could not load. Refresh to try again.</p>
            ) : clientWork ? (
              <dl className="pro-counts">
                <div>
                  <dt>Care plans not yet published</dt>
                  <dd>{summary.draftPlans}</dd>
                </div>
                <div>
                  <dt>Follow-ups to schedule</dt>
                  <dd>{summary.followups}</dd>
                </div>
              </dl>
            ) : (
              <p className="pro-empty">
                No unfinished plans or follow-ups.
              </p>
            )}
            <Link className="pro-link" href="/pro/clients">
              Open clients <ArrowRight size={15} />
            </Link>
          </section>
        </aside>
      </div>

      <Notifications />
    </div>
  );
}
