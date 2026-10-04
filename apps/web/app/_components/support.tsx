"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useApp } from "./app";
import { SignInPrompt, nepalTime } from "./ui";
const categories = [
  ["BOOKING", "A booking or appointment"],
  ["PROFESSIONAL", "A professional’s conduct"],
  ["ORDER", "A product or order"],
  ["PAYMENT", "A payment"],
  ["ACCOUNT", "My account"],
  ["OTHER", "Something else"],
];
const statusLabels: Record<string, string> = {
  OPEN: "Received",
  IN_PROGRESS: "Being handled",
  ESCALATED: "With a senior team member",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
const empty = { category: "BOOKING", subject: "", body: "", appointmentId: "" };
// Help for clients and professionals: raise a grievance and follow it to resolution.
export function SupportDesk({ as }: { as: "CLIENT" | "PROFESSIONAL" }) {
  const { mode, token, api, run, busy, setNotice, setError, openAuth } =
    useApp();
  const live = mode === "live";
  const [data, setData] = useState<any>(null),
    [draft, setDraft] = useState<typeof empty | null>(null),
    [replies, setReplies] = useState<Record<string, string>>({});
  const call = (action: string, payload: object = {}) =>
    api("support", "POST", { action, data: payload });
  const reload = async () => setData(await call("tickets_mine"));
  useEffect(() => {
    if (!live || !token) return;
    let active = true;
    call("tickets_mine")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setError(e.message);
          setData({ tickets: [], appointments: [] });
        }
      });
    return () => {
      active = false;
    };
  }, [live, token]);
  if (!live)
    return (
      <p className="empty-inline">Help requests are not part of the preview.</p>
    );
  if (!token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in to raise a concern with the Chatbud team and follow its
        progress.
      </SignInPrompt>
    );
  if (!data)
    return (
      <div className="loading" role="status">
        Loading your requests…
      </div>
    );
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Raise a concern</h2>
          {!draft && (
            <button onClick={() => setDraft(empty)}>
              <Plus size={15} /> New request
            </button>
          )}
        </div>
        <p className="section-copy">
          Tell us what went wrong. A member of the Chatbud team will reply here.
          If you or someone else is in immediate danger, contact local emergency
          services; Chatbud is not an emergency service.
        </p>
        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const made = await call("ticket_create", {
                  ...draft,
                  subject: draft.subject.trim(),
                  body: draft.body.trim(),
                  as,
                });
                setDraft(null);
                await reload();
                setNotice(`Request ${made.reference} received.`);
              });
            }}
          >
            <div className="field-grid">
              <div className="field">
                <label htmlFor="help-category">What is it about?</label>
                <select
                  id="help-category"
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                >
                  {categories.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="help-appointment">
                  Related appointment<span className="optional">Optional</span>
                </label>
                <select
                  id="help-appointment"
                  value={draft.appointmentId}
                  onChange={(e) =>
                    setDraft({ ...draft, appointmentId: e.target.value })
                  }
                >
                  <option value="">None</option>
                  {data.appointments.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field wide">
                <label htmlFor="help-subject">Summary</label>
                <input
                  id="help-subject"
                  required
                  minLength={3}
                  maxLength={160}
                  value={draft.subject}
                  onChange={(e) =>
                    setDraft({ ...draft, subject: e.target.value })
                  }
                />
              </div>
              <div className="field wide">
                <label htmlFor="help-body">What happened?</label>
                <textarea
                  id="help-body"
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={5}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                />
              </div>
            </div>
            <div className="request-actions">
              <button className="button" disabled={busy}>
                {busy ? "Sending…" : "Send to Chatbud"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
      <section className="panel">
        <h2>Your requests</h2>
        {data.tickets.length === 0 ? (
          <p className="empty-inline">You have not raised anything yet.</p>
        ) : (
          data.tickets.map((t: any) => (
            <details className="ticket" key={t.id}>
              <summary>
                <span className="ticket-ref">{t.reference}</span>
                <strong>{t.subject}</strong>
                <span className={`status status-${t.status.toLowerCase()}`}>
                  {statusLabels[t.status]}
                </span>
                <small>Updated {nepalTime(t.updatedAt)}</small>
              </summary>
              <ol className="thread">
                {t.messages.map((m: any, i: number) => (
                  <li key={i} className={m.mine ? "mine" : ""}>
                    <small>
                      {m.author} · {nepalTime(m.at)}
                    </small>
                    <p>{m.body}</p>
                  </li>
                ))}
              </ol>
              {t.status !== "CLOSED" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await call("ticket_reply", {
                        id: t.id,
                        body: (replies[t.id] || "").trim(),
                      });
                      setReplies((r) => ({ ...r, [t.id]: "" }));
                      await reload();
                      setNotice("Reply sent.");
                    });
                  }}
                >
                  <div className="field">
                    <label htmlFor={`reply-${t.id}`}>
                      {t.status === "RESOLVED"
                        ? "Still not right? Reply to reopen"
                        : "Add a reply"}
                    </label>
                    <textarea
                      id={`reply-${t.id}`}
                      rows={3}
                      required
                      maxLength={4000}
                      value={replies[t.id] || ""}
                      onChange={(e) =>
                        setReplies((r) => ({ ...r, [t.id]: e.target.value }))
                      }
                    />
                  </div>
                  <div className="request-actions">
                    <button
                      className="button small"
                      disabled={busy || !(replies[t.id] || "").trim()}
                    >
                      Send reply
                    </button>
                  </div>
                </form>
              )}
            </details>
          ))
        )}
      </section>
    </>
  );
}
