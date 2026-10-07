"use client";
import { useEffect, useState } from "react";
import { money, nepalTime } from "../../_components/ui";
import { Area, useOps } from "../_components/area";
const views = [
  ["todo", "To pack and send"],
  ["sent", "On the way"],
  ["all", "All (90 days)"],
];
const gateways: Record<string, string> = {
  KHALTI: "Khalti",
  ESEWA: "eSewa",
  MANUAL: "Cash",
};
const stage = (o: any) =>
  o.status === "AWAITING_PAYMENT"
    ? "Waiting for payment"
    : o.status === "EXPIRED"
      ? "Not paid in time"
      : o.status === "CANCELLED"
        ? "Cancelled"
        : o.status === "FULFILLED"
          ? "Delivered"
          : o.dispatchedAt
            ? "On the way"
            : "To pack";
const toPack = (o: any) =>
  ["PAID", "PROCESSING"].includes(o.status) && !o.dispatchedAt;
const onTheWay = (o: any) => o.status === "PROCESSING" && !!o.dispatchedAt;
export default function Orders() {
  const { api, run, busy, setNotice, setError, mode, token } = useOps();
  const [data, setData] = useState<any>(null),
    [view, setView] = useState("todo"),
    [open, setOpen] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({});
  const call = (action: string, input: unknown = {}) =>
    api("admin/shop", "POST", { action, data: input });
  useEffect(() => {
    if (mode !== "live" || !token) return;
    let active = true;
    call("team_orders")
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
      setData(await call("team_orders"));
      setOpen("");
      setFields({});
      setNotice(notice);
    });
  const field = (name: string) => (fields[name] || "").trim();
  const input = (name: string, label: string, hint?: string) => (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        maxLength={300}
        value={fields[name] || ""}
        onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
      />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
  const shown = (data?.orders || []).filter((o: any) =>
    view === "todo" ? toPack(o) : view === "sent" ? onTheWay(o) : true,
  );
  return (
    <Area area="orders">
      {!data ? (
        <div className="loading" role="status">
          Loading orders…
        </div>
      ) : (
        <>
          {data.refunds.length > 0 && (
            <section className="panel">
              <h2>Order refunds to send</h2>
              <p className="section-copy">
                Send each refund from the payment provider’s dashboard, then
                record its reference.
              </p>
              {data.refunds.map((r: any) => (
                <div className="booking-row" key={r.id}>
                  <div>
                    <strong>
                      {money(r.amount)} to {r.client} · {r.order}
                    </strong>
                    <p>
                      {r.email} · paid by {gateways[r.gateway] || r.gateway}
                      {r.reference && ` · ${r.reference}`}
                    </p>
                    <p>
                      <b>{r.reason}</b>
                    </p>
                  </div>
                  <div className="booking-action">
                    {input(`refund-${r.id}`, "Refund reference")}
                    <div className="request-actions">
                      <button
                        className="button small"
                        disabled={busy || field(`refund-${r.id}`).length < 3}
                        onClick={() =>
                          act(
                            "order_refund_decide",
                            {
                              refundId: r.id,
                              decision: "SENT",
                              reference: field(`refund-${r.id}`),
                            },
                            "Refund recorded as sent.",
                          )
                        }
                      >
                        Refund sent
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
          <section className="panel">
            <h2>Orders</h2>
            <div className="chips" role="group" aria-label="Which orders">
              {views.map(([id, label]) => (
                <button
                  key={id}
                  className={view === id ? "chip chosen" : "chip"}
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                >
                  {label}
                  {id === "todo" && ` (${data.orders.filter(toPack).length})`}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="empty-inline">Nothing here right now.</p>
            ) : (
              shown.map((o: any) => (
                <div className="booking-row" key={o.id}>
                  <div>
                    <strong>
                      {o.reference} · {money(o.total)} ·{" "}
                      {o.method === "COD"
                        ? o.paymentStatus === "PAID"
                          ? "cash collected"
                          : "collect cash on delivery"
                        : o.paymentStatus === "PAID"
                          ? "paid online"
                          : "not paid"}
                    </strong>
                    <p>
                      {o.items
                        .map(
                          (i: any) => `${i.title} × ${i.quantity} (${i.code})`,
                        )
                        .join(", ")}
                    </p>
                    {o.delivery && (
                      <p>
                        {o.delivery.recipient}, {o.delivery.phone} ·{" "}
                        {o.delivery.address}, {o.delivery.city},{" "}
                        {o.delivery.district}
                        {o.delivery.note && ` · “${o.delivery.note}”`}
                      </p>
                    )}
                    <p>
                      Ordered {nepalTime(o.createdAt)} by {o.client} ({o.email})
                      {o.dispatchedAt &&
                        ` · sent ${nepalTime(o.dispatchedAt)} with ${o.courier}${o.tracking ? `, ${o.tracking}` : ""}`}
                      {o.cancelReason && ` · ${o.cancelReason}`}
                    </p>
                  </div>
                  <span className={`status status-${o.status.toLowerCase()}`}>
                    {stage(o)}
                  </span>
                  <div className="request-actions wrap">
                    {toPack(o) && (
                      <>
                        <button
                          className="button small"
                          onClick={() => setOpen(`send-${o.id}`)}
                        >
                          Dispatch
                        </button>
                        <button
                          className="text-button"
                          onClick={() => setOpen(`cancel-${o.id}`)}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {onTheWay(o) && (
                      <button
                        className="button small"
                        onClick={() => setOpen(`done-${o.id}`)}
                      >
                        Mark delivered
                      </button>
                    )}
                  </div>
                  {open === `send-${o.id}` && (
                    <div className="booking-action">
                      {input("courier", "Courier")}
                      {input("tracking", "Tracking number (optional)")}
                      <div className="request-actions">
                        <button
                          className="button small"
                          disabled={busy || field("courier").length < 2}
                          onClick={() =>
                            act(
                              "order_dispatch",
                              {
                                id: o.id,
                                courier: field("courier"),
                                tracking: field("tracking"),
                              },
                              `${o.reference} dispatched. Stock updated.`,
                            )
                          }
                        >
                          Confirm dispatch
                        </button>
                      </div>
                    </div>
                  )}
                  {open === `done-${o.id}` && (
                    <div className="booking-action">
                      {o.paymentStatus === "COD_DUE" &&
                        input(
                          "cash",
                          `Cash receipt reference for ${money(o.total)}`,
                          "Needed because this order is cash on delivery.",
                        )}
                      <div className="request-actions">
                        <button
                          className="button small"
                          disabled={
                            busy ||
                            (o.paymentStatus === "COD_DUE" &&
                              field("cash").length < 3)
                          }
                          onClick={() =>
                            act(
                              "order_deliver",
                              { id: o.id, cashReference: field("cash") },
                              `${o.reference} marked delivered.`,
                            )
                          }
                        >
                          Confirm delivery
                        </button>
                      </div>
                    </div>
                  )}
                  {open === `cancel-${o.id}` && (
                    <div className="booking-action">
                      {input(
                        "reason",
                        "Reason, shown on the order",
                        "At least 10 characters. A paid order goes to the refund list.",
                      )}
                      <div className="request-actions">
                        <button
                          className="button small"
                          disabled={busy || field("reason").length < 10}
                          onClick={() =>
                            act(
                              "order_team_cancel",
                              { id: o.id, reason: field("reason") },
                              `${o.reference} cancelled.`,
                            )
                          }
                        >
                          Cancel this order
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        </>
      )}
    </Area>
  );
}
