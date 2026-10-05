"use client";
import { useEffect, useState } from "react";
import { Summary, money, nepalTime } from "../../_components/ui";
import { paymentLabels } from "../../_components/pay";
import { Banknote, RotateCcw, Wallet } from "lucide-react";
import { Area, useOps } from "../_components/area";
const gateways: Record<string, string> = {
  KHALTI: "Khalti",
  ESEWA: "eSewa",
  MANUAL: "Cash or transfer",
};
export default function Payments() {
  const { api, run, busy, setNotice, setError, mode, token } = useOps();
  const [data, setData] = useState<any>(null),
    [refs, setRefs] = useState<Record<string, string>>({});
  const call = (action: string, input: unknown = {}) =>
    api("admin/pay", "POST", { action, data: input });
  useEffect(() => {
    if (mode !== "live" || !token) return;
    let active = true;
    call("team_overview")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [mode, token]);
  const act = (action: string, input: unknown, notice: string) =>
    run(async () => {
      await call(action, input);
      setData(await call("team_overview"));
      setNotice(notice);
    });
  const ref = (id: string) => (refs[id] || "").trim();
  return (
    <Area area="support">
      {!data ? (
        <div className="loading" role="status">
          Loading payments…
        </div>
      ) : (
        <>
          <div className="summary-grid">
            <Summary
              icon={Wallet}
              label="Received"
              value={money(data.received)}
            />
            <Summary
              icon={RotateCcw}
              label="Refunded"
              value={money(data.refunded)}
            />
            <Summary
              icon={Banknote}
              label="Refunds to send"
              value={data.refunds.length}
            />
          </div>
          <section className="panel">
            <h2>Refunds to send</h2>
            <p className="section-copy">
              Send each refund from the payment provider’s own dashboard, then
              record its reference here. Decline only when the reason says a
              refund is not owed.
            </p>
            {data.refunds.length === 0 ? (
              <p className="empty-inline">No refunds are waiting.</p>
            ) : (
              data.refunds.map((r: any) => (
                <div className="booking-row" key={r.id}>
                  <div>
                    <strong>
                      {money(r.amount)} to {r.client}
                    </strong>
                    <p>
                      {r.email} · paid by {gateways[r.gateway] || r.gateway}
                      {r.reference && ` · ${r.reference}`}
                    </p>
                    <p>
                      Session with {r.provider}, {nepalTime(r.startsAt)} NPT
                    </p>
                    <p>
                      <b>{r.reason}</b>
                    </p>
                  </div>
                  <div className="booking-action">
                    <div className="field">
                      <label htmlFor={`refund-${r.id}`}>Refund reference</label>
                      <input
                        id={`refund-${r.id}`}
                        maxLength={80}
                        value={refs[r.id] || ""}
                        onChange={(e) =>
                          setRefs({ ...refs, [r.id]: e.target.value })
                        }
                      />
                    </div>
                    <div className="request-actions">
                      <button
                        className="button small"
                        disabled={busy || ref(r.id).length < 3}
                        onClick={() =>
                          act(
                            "refund_decide",
                            {
                              refundId: r.id,
                              decision: "SENT",
                              reference: ref(r.id),
                            },
                            "Refund recorded as sent.",
                          )
                        }
                      >
                        Refund sent
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Decline the refund of ${money(r.amount)} to ${r.client}? They will see “Not refundable”.`,
                            )
                          )
                            act(
                              "refund_decide",
                              {
                                refundId: r.id,
                                decision: "REJECTED",
                                reference: "",
                              },
                              "Refund declined.",
                            );
                        }}
                      >
                        Decline refund
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
          <section className="panel">
            <h2>Paying later</h2>
            <p className="section-copy">
              Bookings where the client chose to pay by cash or bank transfer.
              Record the receipt or transfer reference when the money arrives.
            </p>
            {data.payLater.length === 0 ? (
              <p className="empty-inline">Nobody is paying later.</p>
            ) : (
              data.payLater.map((b: any) => (
                <div className="booking-row" key={b.id}>
                  <div>
                    <strong>
                      {money(b.amount)} from {b.client}
                    </strong>
                    <p>
                      {b.email} · session with {b.provider},{" "}
                      {nepalTime(b.startsAt)} NPT
                    </p>
                  </div>
                  <div className="booking-action">
                    <div className="field">
                      <label htmlFor={`cash-${b.id}`}>
                        Receipt or transfer reference
                      </label>
                      <input
                        id={`cash-${b.id}`}
                        maxLength={80}
                        value={refs[b.id] || ""}
                        onChange={(e) =>
                          setRefs({ ...refs, [b.id]: e.target.value })
                        }
                      />
                    </div>
                    <div className="request-actions">
                      <button
                        className="button small"
                        disabled={busy || ref(b.id).length < 3}
                        onClick={() =>
                          act(
                            "mark_paid",
                            { appointmentId: b.id, reference: ref(b.id) },
                            "Payment recorded.",
                          )
                        }
                      >
                        Mark as paid
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </section>
          <section className="panel">
            <h2>Recent payments</h2>
            {data.payments.length === 0 ? (
              <p className="empty-inline">
                No payments have been received yet.
              </p>
            ) : (
              data.payments.map((p: any) => (
                <div className="record" key={p.id}>
                  <div>
                    <strong>
                      {money(p.amount)} · {p.client}
                    </strong>
                    <p>
                      {gateways[p.gateway] || p.gateway} · {p.reference} ·{" "}
                      {nepalTime(p.at)} · session with {p.provider}
                    </p>
                  </div>
                  <span className="status">
                    {paymentLabels[p.paymentStatus] || p.paymentStatus}
                  </span>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </Area>
  );
}
