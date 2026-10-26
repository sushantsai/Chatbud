"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../../_components/app";
import { money, nepalTime } from "../../_components/ui";
export function WorkQueue({ financeOnly = false }: { financeOnly?: boolean }) {
  const { api, run, busy, setError, setNotice } = useApp();
  const [data, setData] = useState<any>(null),
    [selected, setSelected] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [note, setNote] = useState(""),
    [reference, setReference] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [completedOn, setCompletedOn] = useState(""),
    [amount, setAmount] = useState(""),
    [ready, setReady] = useState(false),
    [available, setAvailable] = useState(false),
    [replacement, setReplacement] = useState(""),
    [inspected, setInspected] = useState(false);
  const request = (action: string, data: any = {}) =>
    api("workflow", "POST", { action, data });
  const reload = async () => setData(await request("queue"));
  useEffect(() => {
    let active = true;
    request("queue")
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    const timer = setInterval(
      () =>
        request("queue")
          .then((d) => active && setData(d))
          .catch(() => {}),
      30000,
    );
    try {
      const saved = JSON.parse(sessionStorage.getItem("chatbud-queue") || "{}");
      setFilter(saved.filter || "ALL");
      setSelected(saved.selected || "");
    } catch {}
    setReady(true);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (ready)
      sessionStorage.setItem(
        "chatbud-queue",
        JSON.stringify({ filter, selected }),
      );
  }, [filter, selected, ready]);
  useEffect(() => {
    if (!available) return;
    const timer = setInterval(
      () =>
        request("staff_presence", { available: true }).catch((e) =>
          setError(e.message),
        ),
      300000,
    );
    return () => clearInterval(timer);
  }, [available]);
  if (!data) return <p role="status">Loading assigned work…</p>;
  const cases = data.cases.filter(
    (c: any) =>
      (!financeOnly || c.kind === "REFUND") &&
      (filter === "ALL" || filter === "URGENT"
        ? filter !== "URGENT" || c.priority === "URGENT"
        : c.kind === filter),
  );
  const c = cases.find((c: any) => c.id === selected);
  const act = (action: string, payload: any) =>
    run(async () => {
      await request(action, payload);
      await reload();
      setNote("");
      setNotice("Case updated.");
    });
  return (
    <>
      <div className="panel">
        <div className="panel-heading">
          <h1>{financeOnly ? "Finance & refunds" : "Work queue"}</h1>
          <label>
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => {
                const on = e.target.checked;
                run(async () => {
                  await request("staff_presence", { available: on });
                  setAvailable(on);
                });
              }}
            />{" "}
            Available for assignment
          </label>
        </div>
        <div className="clinical-summary">
          <div>
            <strong>{cases.length}</strong>
            <p>Open cases</p>
          </div>
          <div>
            <strong>
              {cases.filter((c: any) => c.priority === "URGENT").length}
            </strong>
            <p>Urgent</p>
          </div>
          <div>
            <strong>
              {
                cases.filter(
                  (c: any) => c.dueAt && Date.parse(c.dueAt) < Date.now(),
                ).length
              }
            </strong>
            <p>Past deadline</p>
          </div>
        </div>
        <label>
          Filter queue
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected("");
            }}
          >
            {[
              "ALL",
              "URGENT",
              "CONFIRMATION_CALL",
              "REFUND",
              "FOLLOWUP",
              "RESCHEDULE",
              "SESSION_REVIEW",
              "RETURN",
            ].map((f) => (
              <option key={f} value={f}>
                {f.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={`queue-split ${c ? "case-open" : ""}`}>
        <section className="queue-list" aria-label="Work cases">
          {cases.length === 0 ? (
            <p className="panel">No cases in this view.</p>
          ) : (
            cases.map((row: any) => (
              <button
                key={row.id}
                aria-pressed={selected === row.id}
                onClick={() => {
                  setSelected(row.id);
                  setNote("");
                  setAmount(String(row.refund?.amount || ""));
                  setReference("");
                  setConfirmation("");
                  setCompletedOn("");
                }}
              >
                <strong>{row.title}</strong>
                <small>
                  {row.client} · {row.priority}
                </small>
                <small>Owner: {row.owner || "Unassigned"}</small>
                <small>
                  {row.dueAt
                    ? `Due ${nepalTime(row.dueAt)} NPT`
                    : "Deadline awaits eligibility decision"}
                </small>
                {row.escalatedAt && (
                  <span className="status">Supervisor alerted</span>
                )}
              </button>
            ))
          )}
        </section>
        <section className="panel queue-detail">
          {!c ? (
            <p>Select a case to see its deadline and next action.</p>
          ) : (
            <>
              <button className="text-button" onClick={() => setSelected("")}>
                ← Return to queue
              </button>
              <h2>{c.title}</h2>
              {c.kind === "SUPPORT" && (
                <p>
                  <Link href="/admin/support">
                    Open conversation · {c.context?.reference}
                  </Link>
                </p>
              )}
              <p>
                {c.client} · {c.status.replaceAll("_", " ")}
              </p>
              <dl className="clinical-summary">
                <div>
                  <dt>Owner</dt>
                  <dd>{c.owner || "Unassigned"}</dd>
                </div>
                <div>
                  <dt>Deadline · Nepal time</dt>
                  <dd>{c.dueAt ? nepalTime(c.dueAt) : "Review required"}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{c.priority}</dd>
                </div>
              </dl>
              <p className="workflow-note">
                This workspace contains scheduling and operational information.
                Clinical intake, private notes and clinical progress are
                excluded.
              </p>
              {c.kind === "REFUND" ? (
                <>
                  <h3>{money(c.refund?.amount || 0)}</h3>
                  <p>{c.refund?.reason}</p>
                  {c.refund?.payment && (
                    <dl className="clinical-summary">
                      <div>
                        <dt>Gateway</dt>
                        <dd>{c.refund.payment.gateway}</dd>
                      </div>
                      <div>
                        <dt>Verified receipt</dt>
                        <dd>{c.refund.payment.reference}</dd>
                      </div>
                      <div>
                        <dt>Received amount</dt>
                        <dd>{money(c.refund.payment.receivedAmount)}</dd>
                      </div>
                    </dl>
                  )}
                  <span className="status">{c.refund?.eligibility}</span>
                  {c.refund?.initiatedAt && (
                    <p>
                      Initiated {nepalTime(c.refund.initiatedAt)} NPT. Awaiting
                      payout confirmation.
                    </p>
                  )}
                  {c.refund?.eligibility === "REVIEW" && data.isSupervisor && (
                    <form
                      className="form-stack"
                      onSubmit={(e) => {
                        e.preventDefault();
                        act("refund_exception", {
                          refundId: c.refund.id,
                          approve: true,
                          amount: Number(amount),
                          reason: note,
                        });
                      }}
                    >
                      <label>
                        Approved amount
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={c.refund.amount}
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Exception rationale
                        <textarea
                          minLength={10}
                          required
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                        />
                      </label>
                      <button className="button" disabled={busy}>
                        Approve exception for finance
                      </button>
                    </form>
                  )}
                  {c.refund?.eligibility === "ELIGIBLE" && data.isFinance ? (
                    <form
                      className="form-stack"
                      onSubmit={(e) => {
                        e.preventDefault();
                        act("finance_update", {
                          refundId: c.refund.id,
                          stage: "COMPLETED",
                          reference,
                          amount: Number(amount),
                          confirmation,
                          completedOn,
                        });
                      }}
                    >
                      <p className="care-warning">
                        Process the refund in the payment gateway first. Record
                        completion only after evidence that the money was
                        returned.
                      </p>
                      <label>
                        Gateway refund reference
                        <input
                          required
                          minLength={3}
                          maxLength={100}
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy || reference.trim().length < 3}
                        onClick={() =>
                          act("finance_update", {
                            refundId: c.refund.id,
                            stage: "INITIATED",
                            reference,
                          })
                        }
                      >
                        Record initiation
                      </button>
                      <label>
                        Returned amount
                        <input
                          required
                          type="number"
                          step="0.01"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </label>
                      <label>
                        Completion date
                        <input
                          required
                          type="date"
                          value={completedOn}
                          onChange={(e) => setCompletedOn(e.target.value)}
                        />
                      </label>
                      <label>
                        Payout confirmation / evidence reference
                        <textarea
                          required
                          minLength={3}
                          value={confirmation}
                          onChange={(e) => setConfirmation(e.target.value)}
                        />
                      </label>
                      <button className="button" disabled={busy}>
                        Record completed refund
                      </button>
                    </form>
                  ) : (
                    <p className="workflow-note">
                      Only designated finance staff can record payout initiation
                      or completion. Routine eligible refunds require no second
                      approval.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label>
                    Scheduling note
                    <textarea
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  {c.kind === "RETURN" && (
                    <section>
                      <p className="workflow-note">
                        Chatbud pays approved return shipping. Receipt and
                        inspection are required before refund eligibility,
                        unless an authorized supervisor waives return.
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          checked={inspected}
                          onChange={(e) => setInspected(e.target.checked)}
                        />{" "}
                        Returned items received and inspected
                      </label>
                      <button
                        className="button"
                        disabled={busy || !inspected || note.trim().length < 10}
                        onClick={() =>
                          act("return_inspect", {
                            id: c.id,
                            receivedAndInspected: true,
                            waive: false,
                            evidence: note,
                          })
                        }
                      >
                        Record inspection & create eligible refund
                      </button>
                      {data.isSupervisor && (
                        <button
                          className="text-button"
                          disabled={busy || note.trim().length < 10}
                          onClick={() =>
                            act("return_inspect", {
                              id: c.id,
                              receivedAndInspected: false,
                              waive: true,
                              evidence: note,
                            })
                          }
                        >
                          Authorize return waiver
                        </button>
                      )}
                    </section>
                  )}
                  {c.kind === "RESCHEDULE" && (
                    <section>
                      <label>
                        Replacement · Nepal time
                        <input
                          type="datetime-local"
                          value={replacement}
                          onChange={(e) => setReplacement(e.target.value)}
                        />
                      </label>
                      <button
                        className="button"
                        disabled={busy || !replacement}
                        onClick={() =>
                          act("reschedule_offer", {
                            caseId: c.id,
                            startsAt: new Date(
                              `${replacement}:00+05:45`,
                            ).toISOString(),
                          })
                        }
                      >
                        Offer replacement for client approval
                      </button>
                      <p className="workflow-note">
                        The original confirmed session remains valid until the
                        client accepts an available replacement.
                      </p>
                    </section>
                  )}
                  <div className="workflow-actions">
                    <button
                      className="button secondary"
                      disabled={busy || note.trim().length < 3}
                      onClick={() =>
                        act("case_action", {
                          id: c.id,
                          status: "IN_PROGRESS",
                          note,
                        })
                      }
                    >
                      Record action
                    </button>
                    {c.kind === "CONFIRMATION_CALL" && (
                      <button
                        className="button"
                        disabled={busy || note.trim().length < 10}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Did the professional explicitly approve this exact booking? Your note must record the evidence. Unclear responses require human review.",
                            )
                          )
                            act("call_approval", {
                              id: c.id,
                              explicitApproval: true,
                              evidence: note,
                            });
                        }}
                      >
                        Record explicit approval
                      </button>
                    )}
                    {c.kind === "FOLLOWUP" &&
                      [
                        "UNANSWERED",
                        "CONNECTED",
                        "BOOKED",
                        "DECLINED",
                        "OPTED_OUT",
                      ].map((outcome) => (
                        <button
                          className="button secondary"
                          key={outcome}
                          disabled={
                            busy ||
                            note.trim().length < 3 ||
                            c.contactStopped ||
                            c.attempts >= 3
                          }
                          onClick={() =>
                            act("followup_contact", { id: c.id, outcome, note })
                          }
                        >
                          {outcome.replaceAll("_", " ")}
                        </button>
                      ))}
                    <button
                      className="text-button"
                      disabled={busy || note.trim().length < 3}
                      onClick={() =>
                        act("case_action", { id: c.id, status: "REVIEW", note })
                      }
                    >
                      Supervisor review
                    </button>
                    <button
                      className="text-button"
                      disabled={busy || note.trim().length < 3}
                      onClick={() =>
                        act("case_action", {
                          id: c.id,
                          status: "RESOLVED",
                          note,
                        })
                      }
                    >
                      Resolve case
                    </button>
                  </div>
                  {c.kind === "FOLLOWUP" && (
                    <p className="workflow-note">
                      {c.attempts}/3 contact attempts. At least 24 hours between
                      attempts. Decline or opt-out stops contact. No appointment
                      is reserved or confirmed by recording a contact.
                    </p>
                  )}
                </>
              )}
              <details className="workflow-timeline">
                <summary>Case history</summary>
                <ol>
                  {c.events.map((e: any, i: number) => (
                    <li key={i}>
                      {e.event}
                      <p>{e.detail}</p>
                      <time>{nepalTime(e.at)} NPT</time>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </section>
      </div>
    </>
  );
}
