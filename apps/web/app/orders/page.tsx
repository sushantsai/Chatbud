"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../_components/app";
import { PayStep } from "../_components/pay";
import { Dialog, SignInPrompt, money, nepalTime } from "../_components/ui";
// What the customer reads for each stage of an order.
const orderStage = (o: any) =>
  o.status === "AWAITING_PAYMENT"
    ? "Waiting for payment"
    : o.status === "EXPIRED"
      ? "Not paid in time"
      : o.status === "CANCELLED"
        ? "Cancelled"
        : o.status === "FULFILLED"
          ? "Delivered"
          : o.dispatchedAt
            ? "On its way"
            : "Being packed";
const payNote: Record<string, string> = {
  COD_DUE: "Pay in cash on delivery",
  PAID: "Paid",
  REFUND_DUE: "Refund being processed",
  REFUNDED: "Refunded",
  NOT_REFUNDED: "Not refundable",
};
export default function Orders() {
  const { mode, token, api, run, busy, setNotice, setError, openAuth } =
    useApp();
  const [orders, setOrders] = useState<any[] | null>(null),
    [paying, setPaying] = useState<any>(null);
  const live = mode === "live";
  const call = (action: string, data: unknown = {}) =>
    api("shop", "POST", { action, data });
  useEffect(() => {
    if (!live || !token) return;
    let active = true;
    call("orders_mine")
      .then((d) => {
        if (active) setOrders(d.orders);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setError(e.message);
          setOrders([]);
        }
      });
    return () => {
      active = false;
    };
  }, [live, token]);
  if (!live)
    return (
      <section className="empty">
        <h2>Orders are not part of the preview</h2>
      </section>
    );
  if (!token)
    return (
      <SignInPrompt open={openAuth}>Sign in to see your orders.</SignInPrompt>
    );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Orders</h2>
        <Link href="/store">Visit the store</Link>
      </div>
      {orders === null ? (
        <p className="empty-inline" role="status">
          Loading your orders…
        </p>
      ) : orders.length === 0 ? (
        <p className="empty-inline">
          Your orders will appear here after you check out.
        </p>
      ) : (
        orders.map((o) => (
          <div className="booking-row" key={o.id}>
            <div>
              <strong>
                {o.reference} · {money(o.total)}
              </strong>
              <p>
                {o.items
                  .map((i: any) => `${i.title} × ${i.quantity}`)
                  .join(", ")}
              </p>
              <p>
                Ordered {nepalTime(o.createdAt)}
                {payNote[o.paymentStatus] && ` · ${payNote[o.paymentStatus]}`}
              </p>
              <p>Deliver to: {o.deliverTo}</p>
              {o.dispatchedAt && (
                <p>
                  Sent with {o.courier}
                  {o.tracking && `, tracking ${o.tracking}`}
                </p>
              )}
            </div>
            <span className={`status status-${o.status.toLowerCase()}`}>
              {orderStage(o)}
            </span>
            <div className="request-actions wrap">
              {o.status === "AWAITING_PAYMENT" && (
                <button className="button small" onClick={() => setPaying(o)}>
                  Pay now
                </button>
              )}
              {o.canCancel && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Cancel order ${o.reference}?`))
                      run(async () => {
                        await call("order_cancel", { id: o.id });
                        setOrders((await call("orders_mine")).orders);
                        setNotice(
                          o.paymentStatus === "PAID"
                            ? "Order cancelled. Your refund is being processed."
                            : "Order cancelled.",
                        );
                      });
                  }}
                >
                  Cancel order
                </button>
              )}
            </div>
          </div>
        ))
      )}
      {paying && (
        <Dialog
          title={`Pay for order ${paying.reference}`}
          close={() => setPaying(null)}
        >
          <PayStep orderId={paying.id} amount={paying.total} />
        </Dialog>
      )}
    </section>
  );
}
