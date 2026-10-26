"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../_components/app";
import { PhoneVerification } from "../_components/phone-verification";
import { PayStep } from "../_components/pay";
import { money } from "../_components/ui";
export default function Checkout() {
  const { api, token, cart, setCart, run, busy, openAuth, setError } = useApp();
  const [zones, setZones] = useState<any>(null),
    [zoneId, setZoneId] = useState(""),
    [recipient, setRecipient] = useState(""),
    [address, setAddress] = useState(""),
    [method, setMethod] = useState("ONLINE"),
    [quote, setQuote] = useState<any>(null),
    [placed, setPlaced] = useState<any>(null),
    [review, setReview] = useState(false),
    [now, setNow] = useState(Date.now());
  const [key] = useState(() => crypto.randomUUID());
  const request = (action: string, data: any = {}) =>
    api("workflow", "POST", { action, data });
  const items = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([skuId, quantity]) => ({ skuId, quantity }));
  const bag = JSON.stringify(items);
  const load = () => request("delivery_zones").then(setZones);
  useEffect(() => {
    if (!token) return;
    let active = true;
    request("delivery_zones")
      .then((d) => active && setZones(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    if (!zoneId || !token || items.length === 0) return;
    let active = true;
    request("delivery_quote", { zoneId, items, promoCode: "" })
      .then((d) => active && setQuote(d))
      .catch((e) => {
        if (active) {
          setQuote(null);
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [zoneId, bag, token]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const zone = zones?.zones.find((z: any) => z.id === zoneId);
  const create = async () =>
    api("shop", "POST", {
      action: "order_create",
      data: {
        items,
        expectedTotal: quote.total,
        promoCode: "",
        delivery: {
          recipient,
          phone: zones.phone,
          address,
          city: zone.city,
          district: zone.area,
          note: "",
        },
        method,
        idempotencyKey: key,
      },
    });
  if (!token)
    return (
      <>
        <ol className="flow-steps">
          <li aria-current="step">1. Phone</li>
          <li>2. Delivery</li>
          <li>3. Review & Payment</li>
        </ol>
        <PhoneVerification done={load} />
        <button className="text-button" onClick={openAuth}>
          Sign in to an existing care account first
        </button>
      </>
    );
  if (!zones) return <p role="status">Checking phone and delivery coverage…</p>;
  if (!zones.phone) return <PhoneVerification done={load} />;
  if (placed?.paymentMethod === "COD")
    return (
      <section className="panel">
        <h1>Order placed</h1>
        <p>
          {placed.reference} · Pay {money(placed.total)} on delivery.
        </p>
        <p>
          Stock, verified phone, address and COD coverage were checked. Chatbud
          calls only flagged orders.
        </p>
        <Link className="button" href="/orders">
          Track order
        </Link>
      </section>
    );
  if (placed) {
    const left = Math.max(
      0,
      Math.ceil((Date.parse(placed.expiresAt) - now) / 1000),
    );
    return (
      <section className="panel">
        <ol className="flow-steps">
          <li>1. Phone ✓</li>
          <li>2. Delivery ✓</li>
          <li aria-current="step">3. Review & Payment</li>
        </ol>
        <h1>Review & Payment</h1>
        <p>{placed.reference}</p>
        <p className="care-warning" role="timer">
          Stock reserved · {Math.floor(left / 60)}:
          {String(left % 60).padStart(2, "0")} remaining
        </p>
        <p>
          {recipient} · {address} · {zone?.city}, {zone?.area}
        </p>
        {left > 0 ? (
          <PayStep orderId={placed.id} amount={placed.total} />
        ) : (
          <>
            <p>
              The unpaid stock reservation has expired. If payment has already
              been sent, check your order before paying again. Chatbud rechecks
              stock and coverage for late payments, or creates a
              full-refund-eligible case if fulfillment is not possible.
            </p>
            <Link className="button" href="/orders">
              Check order
            </Link>
          </>
        )}
      </section>
    );
  }
  if (items.length === 0)
    return (
      <section className="panel">
        <h1>Your bag is empty</h1>
        <Link href="/store">Browse products</Link>
      </section>
    );
  return (
    <>
      <ol className="flow-steps">
        <li>1. Phone ✓</li>
        <li aria-current={review ? undefined : "step"}>2. Delivery</li>
        <li aria-current={review ? "step" : undefined}>3. Review & Payment</li>
      </ol>
      <form
        className="panel form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!review) {
            if (method === "ONLINE")
              run(async () => {
                const order = await create();
                setPlaced({ ...order, expiresAt: order.expiresAt });
                setCart({});
              });
            else setReview(true);
          } else
            run(async () => {
              const order = await create();
              setPlaced({ ...order, paymentMethod: "COD" });
              setCart({});
            });
        }}
      >
        <h1>{review ? "Review & Payment" : "Delivery"}</h1>
        <p>Verified phone: {zones.phone}</p>
        {zones.zones.length === 0 ? (
          <p className="care-warning">
            Delivery areas and fees have not been published yet. Orders cannot
            be placed until coverage is configured.
          </p>
        ) : (
          <>
            <label>
              Recipient
              <input
                required
                maxLength={100}
                value={recipient}
                readOnly={review}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </label>
            <label>
              Covered Kathmandu Valley area
              <select
                required
                value={zoneId}
                disabled={review}
                onChange={(e) => {
                  setZoneId(e.target.value);
                  setMethod("ONLINE");
                }}
              >
                <option value="">Choose delivery area</option>
                {zones.zones.map((z: any) => (
                  <option value={z.id} key={z.id}>
                    {z.city} · {z.area} · {money(z.fee)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Full address & landmark
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={address}
                readOnly={review}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            {quote && (
              <>
                <dl className="clinical-summary">
                  <div>
                    <dt>Subtotal</dt>
                    <dd>{money(quote.subtotal)}</dd>
                  </div>
                  <div>
                    <dt>Delivery</dt>
                    <dd>{money(quote.shipping)}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{money(quote.total)}</dd>
                  </div>
                </dl>
                <label>
                  Payment method
                  <select
                    value={method}
                    disabled={review}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="ONLINE">Online payment</option>
                    {zone?.cod && <option value="COD">Cash on delivery</option>}
                  </select>
                </label>
                <p className="workflow-note">
                  Online orders reserve stock for 15 minutes upon entry to
                  Review & Payment. Cash-on-delivery orders are placed only when
                  you confirm the reviewed order.
                </p>
                <button className="button" disabled={busy || !quote}>
                  {review
                    ? `Place COD order · ${money(quote.total)}`
                    : "Continue to Review & Payment"}
                </button>
                {review && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setReview(false)}
                  >
                    Edit delivery
                  </button>
                )}
              </>
            )}
          </>
        )}
      </form>
    </>
  );
}
