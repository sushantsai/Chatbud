"use client";
import { useState } from "react";
import { nepalTime } from "../../_components/ui";
import { Area, useOps } from "../_components/area";
import { useLoad } from "../_components/use-load";
const statusLabels: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
const categoryLabels: Record<string, string> = {
  BOOKING: "Booking",
  PROFESSIONAL: "A professional",
  ORDER: "Order",
  ACCOUNT: "Account",
  PAYMENT: "Payment",
  OTHER: "Other",
};
const views = [
  ["active", "Active"],
  ["escalated", "Escalated"],
  ["mine", "Assigned to me"],
  ["done", "Resolved"],
];
function Ticket({ t, reload }: { t: any; reload: () => Promise<void> }) {
  const { ops, run, busy, setNotice } = useOps();
  const [body, setBody] = useState(""),
    [internal, setInternal] = useState(false);
  const act = (action: string, data: object, notice: string) =>
    run(async () => {
      await ops(action, { id: t.id, ...data });
      await reload();
      setNotice(notice);
    });
  const open = !["RESOLVED", "CLOSED"].includes(t.status);
  return (
    <details className="ticket">
      <summary>
        <span className="ticket-ref">{t.reference}</span>
        <strong>{t.subject}</strong>
        <span className={`status status-${t.status.toLowerCase()}`}>
          {statusLabels[t.status]}
        </span>
        {t.priority !== "NORMAL" && (
          <span className="status status-held">{t.priority.toLowerCase()}</span>
        )}
        <small>
          {t.raisedBy} (
          {t.raisedAs === "PROFESSIONAL" ? "professional" : "client"}) ·{" "}
          {categoryLabels[t.category]} · updated {nepalTime(t.updatedAt)} ·{" "}
          {t.assignedTo ? `with ${t.assignedTo}` : "unassigned"}
        </small>
      </summary>
      <p className="field-hint">
        {t.email}
        {t.appointment ? ` · About: ${t.appointment}` : ""}
      </p>
      <ol className="thread">
        {t.messages.map((m: any, i: number) => (
          <li key={i} className={m.internal ? "internal" : ""}>
            <small>
              {m.author} · {nepalTime(m.at)}
              {m.internal ? " · internal note" : ""}
            </small>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await ops("ticket_note", { id: t.id, body: body.trim(), internal });
            setBody("");
            await reload();
            setNotice(internal ? "Internal note added." : "Reply sent.");
          });
        }}
      >
        <div className="field">
          <label htmlFor={`reply-${t.id}`}>
            {internal ? "Internal note" : `Reply to ${t.raisedBy}`}
          </label>
          <textarea
            id={`reply-${t.id}`}
            rows={3}
            required
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <div className="request-actions wrap">
          <label className="choice">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            <span>Internal note, not shown to them</span>
          </label>
          <button className="button small" disabled={busy || !body.trim()}>
            {internal ? "Add note" : "Send reply"}
          </button>
        </div>
      </form>
      <div className="request-actions wrap ticket-actions">
        {!t.assignedToMe && (
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() =>
              act("ticket_update", { assign: "me" }, "Assigned to you.")
            }
          >
            Assign to me
          </button>
        )}
        {open && t.status !== "ESCALATED" && (
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() =>
              act("ticket_update", { status: "ESCALATED" }, "Escalated.")
            }
          >
            Escalate
          </button>
        )}
        {open ? (
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() =>
              act("ticket_update", { status: "RESOLVED" }, "Marked resolved.")
            }
          >
            Mark resolved
          </button>
        ) : (
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() =>
              act("ticket_update", { status: "OPEN" }, "Reopened.")
            }
          >
            Reopen
          </button>
        )}
        {t.status === "RESOLVED" && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              act("ticket_update", { status: "CLOSED" }, "Closed.")
            }
          >
            Close
          </button>
        )}
        <label className="inline-select">
          Priority
          <select
            value={t.priority}
            disabled={busy}
            onChange={(e) =>
              act(
                "ticket_update",
                { priority: e.target.value },
                "Priority updated.",
              )
            }
          >
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
      </div>
    </details>
  );
}
export default function Support() {
  const { data, reload } = useLoad("tickets_queue");
  const [view, setView] = useState("active");
  const tickets = (data?.tickets || []).filter((t: any) =>
    view === "escalated"
      ? t.status === "ESCALATED"
      : view === "mine"
        ? t.assignedToMe && !["RESOLVED", "CLOSED"].includes(t.status)
        : view === "done"
          ? ["RESOLVED", "CLOSED"].includes(t.status)
          : !["RESOLVED", "CLOSED"].includes(t.status),
  );
  return (
    <Area area="support">
      <section className="panel">
        <h2>Grievances</h2>
        <p className="section-copy">
          Raised by clients and professionals. Escalated and urgent requests are
          listed first.
        </p>
        <div className="chips">
          {views.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={view === id}
              className={view === id ? "chip chosen" : "chip"}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {!data ? (
          <p className="empty-inline" role="status">
            Loading grievances…
          </p>
        ) : tickets.length === 0 ? (
          <p className="empty-inline">Nothing in this view.</p>
        ) : (
          tickets.map((t: any) => <Ticket key={t.id} t={t} reload={reload} />)
        )}
      </section>
    </Area>
  );
}
