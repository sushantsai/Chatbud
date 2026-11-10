"use client";
import Link from "next/link";
import { usePro } from "../_components/gate";
import { pendingRequests } from "../_components/sections";
import { appointmentStatus } from "../../_components/ui";
import {
  RequestRow,
  SessionRow,
  byDay,
  clock,
  dayLabel,
  useMinute,
} from "../_components/desk";

export default function ProAppointments() {
  const { workspace } = usePro();
  const now = useMinute();
  const requests = pendingRequests(workspace);
  const upcoming = workspace.appointments.filter(
    (a: any) =>
      a.status === "CONFIRMED" && Date.parse(a.startsAt) + 60 * 60000 > now,
  );
  const past = workspace.appointments
    .filter(
      (a: any) =>
        !upcoming.includes(a) &&
        !requests.includes(a) &&
        !(a.status === "HELD" && a.paymentStatus === "UNPAID"),
    )
    .sort((a: any, b: any) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
    .slice(0, 30);

  return (
    <div className="pro-desk">
      <section className="pro-requests" aria-labelledby="req-title">
        <div className="pro-section-head">
          <h2 id="req-title">
            Requests{requests.length > 0 && <span>{requests.length}</span>}
          </h2>
          <p>
            Paid requests wait here for you. Approve within 60 minutes; Chatbud
            calls you at 30 minutes and refunds unanswered requests.
          </p>
        </div>
        {requests.length === 0 ? (
          <p className="pro-empty">No requests waiting.</p>
        ) : (
          <ul>
            {requests.map((a: any) => (
              <RequestRow a={a} now={now} key={a.id} />
            ))}
          </ul>
        )}
      </section>

      <section className="pro-today" aria-labelledby="up-title">
        <div className="pro-section-head">
          <h2 id="up-title">Upcoming sessions</h2>
          <p>
            Open a session to see intake answers, propose another time or
            cancel.
          </p>
        </div>
        {upcoming.length === 0 ? (
          <p className="pro-empty">
            No confirmed sessions yet. Approved requests appear here.
          </p>
        ) : (
          byDay(upcoming).map((day) => (
            <div className="pro-week-day" key={day[0].id}>
              <h3>{dayLabel(day[0].startsAt)}</h3>
              <ol className="pro-sessions">
                {day.map((a: any) => (
                  <SessionRow a={a} now={now} key={a.id} />
                ))}
              </ol>
            </div>
          ))
        )}
      </section>

      {past.length > 0 && (
        <details className="pro-past">
          <summary>Past and closed ({past.length})</summary>
          <ul>
            {past.map((a: any) => (
              <li key={a.id}>
                <time dateTime={a.startsAt}>
                  {dayLabel(a.startsAt)}, {clock(a.startsAt)}
                </time>
                <span>
                  {a.client} · {a.service}
                </span>
                <span className="status">
                  {appointmentStatus[a.status] || a.status}
                </span>
                <Link href={`/appointments/${a.id}`}>Open</Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
