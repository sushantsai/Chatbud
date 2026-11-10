"use client";
// Shared pieces of the professional desk: time formatting in Nepal time,
// session rows, the request countdown and the go-live checklist.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Video } from "lucide-react";
import { useApp } from "../../_components/app";
import { isBookable } from "./sections";

const zone = "Asia/Kathmandu";
export const nepalDayKey = (value: string | Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date(value));
export const clock = (value: string | Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
// "Today", "Tomorrow", or "Thu 14 Nov", all in Nepal time.
export function dayLabel(value: string | Date) {
  const key = nepalDayKey(value);
  const today = nepalDayKey(new Date());
  const tomorrow = nepalDayKey(new Date(Date.now() + 86400000));
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
// Groups appointments by Nepal day, earliest first.
export function byDay(list: any[]) {
  const groups = new Map<string, any[]>();
  [...list]
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .forEach((a) => {
      const key = nepalDayKey(a.startsAt);
      groups.set(key, [...(groups.get(key) || []), a]);
    });
  return [...groups.values()];
}
// Re-renders once a minute so countdowns and "starts soon" stay true.
export function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  return now;
}
// The join link opens 15 minutes before the start and stays until an hour after.
export const joinable = (a: any, now: number) =>
  !!a.meetingUrl &&
  now >= Date.parse(a.startsAt) - 15 * 60000 &&
  now <= Date.parse(a.startsAt) + 60 * 60000;

export function SessionRow({ a, now }: { a: any; now: number }) {
  const live = joinable(a, now);
  return (
    <li className="pro-session">
      <time dateTime={a.startsAt}>{clock(a.startsAt)}</time>
      <div>
        <strong>{a.client}</strong>
        <span>{a.service}</span>
        {a.proposedStartsAt && (
          <span className="pro-session-note">
            You proposed {dayLabel(a.proposedStartsAt)},{" "}
            {clock(a.proposedStartsAt)}. Waiting for the client.
          </span>
        )}
      </div>
      {live ? (
        <a
          className="button small"
          href={a.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Video size={16} /> Join
        </a>
      ) : (
        <Link className="button secondary small" href={`/appointments/${a.id}`}>
          Open
        </Link>
      )}
    </li>
  );
}

// Minutes left to respond, shown in amber and red as the deadline nears.
export function DueBy({ a, now }: { a: any; now: number }) {
  if (!a.approvalDueAt) return null;
  const left = Math.round((Date.parse(a.approvalDueAt) - now) / 60000);
  const tone = left <= 10 ? "late" : left <= 30 ? "soon" : "";
  return (
    <span className={`pro-due ${tone}`}>
      {left > 0 ? `Respond within ${left} min` : "Response overdue"}
    </span>
  );
}

export function RequestRow({ a, now }: { a: any; now: number }) {
  return (
    <li className="pro-request">
      <div>
        <strong>{a.client}</strong>
        <span>
          {a.service} · {dayLabel(a.startsAt)}, {clock(a.startsAt)}
        </span>
      </div>
      <DueBy a={a} now={now} />
      <Link className="button small" href={`/appointments/${a.id}`}>
        Review
      </Link>
    </li>
  );
}

// What still stands between an approved professional and a full practice.
export function Setup({ workspace }: { workspace: any }) {
  const { api } = useApp();
  const [calendar, setCalendar] = useState<any>(null);
  useEffect(() => {
    let active = true;
    api("provider/google", "POST", { action: "status", data: {} })
      .then((s) => active && setCalendar(s))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const services = workspace.services.some((s: any) => s.active);
  const hours = workspace.availability.length > 0;
  const steps = [
    { done: true, label: "Verified and approved", href: "/pro/profile" },
    { done: services, label: "Add a bookable service", href: "/pro/services" },
    { done: hours, label: "Set your weekly hours", href: "/pro/services" },
    ...(calendar?.available
      ? [
          {
            done: !!calendar.connected,
            label: "Connect Google Calendar",
            href: "/pro/calendar",
            optional: true,
          },
        ]
      : []),
  ];
  const left = steps.filter((s) => !s.done);
  if (left.length === 0) return null;
  const live = isBookable(workspace);
  return (
    <section className="pro-setup" aria-labelledby="pro-setup-title">
      <div>
        <h2 id="pro-setup-title">
          {live
            ? "One more step for a smoother practice"
            : "Finish setting up to start taking bookings"}
        </h2>
        <p>
          {live
            ? "Clients can already book you."
            : "Your profile appears in the directory once you have a service and weekly hours."}
        </p>
      </div>
      <ol>
        {steps.map((s) => (
          <li key={s.label} className={s.done ? "done" : ""}>
            <span className="pro-step-mark" aria-hidden="true">
              {s.done && <Check size={14} strokeWidth={3} />}
            </span>
            {s.done ? (
              <span>{s.label}</span>
            ) : (
              <Link href={s.href}>
                {s.label}
                {"optional" in s && s.optional && (
                  <small> · optional</small>
                )}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// Shown when Chatbud could not reach the professional's Google Calendar.
export function CalendarProblem() {
  const { api } = useApp();
  const [status, setStatus] = useState<any>(null);
  useEffect(() => {
    let active = true;
    api("provider/google", "POST", { action: "status", data: {} })
      .then((s) => active && setStatus(s))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!status?.connected || !status.lastError) return null;
  return (
    <div className="care-warning" role="status">
      <strong>Google Calendar needs reconnecting</strong>
      <p>
        Chatbud could not reach your calendar. Bookings still work from your
        weekly hours, but new sessions are not being added and busy times are
        not being checked.
      </p>
      <Link href="/pro/calendar">Reconnect Google Calendar</Link>
    </div>
  );
}
