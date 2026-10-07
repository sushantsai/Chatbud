"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "../_components/app";
import { PayStep } from "../_components/pay";
import { SignInPrompt, money } from "../_components/ui";
import { features } from "../_lib/features";
const blank = {
  recipient: "",
  phone: "",
  address: "",
  city: "",
  district: "",
  note: "",
};
export default function Checkout() {
  const {
    mode,
    token,
    cart,
    setCart,
    api,
    run,
    busy,
    error,
    setNotice,
    openAuth,
  } = useApp();
  const router = useRouter();
  const [delivery, setDelivery] = useState(blank),
    [code, setCode] = useState(""),
    [applied, setApplied] = useState(""),
    [method, setMethod] = useState("ONLINE"),
    [quote, setQuote] = useState<any>(null),
    [problem, setProblem] = useState(""),
    [placed, setPlaced] = useState<any>(null);
  // One key per order, so a double tap cannot place two.
  const [key] = useState(() => crypto.randomUUID());
  const items = Object.entries(cart)
    .filter(([, quantity]) => quantity > 0)
    .map(([skuId, quantity]) => ({ skuId, quantity }));
  const bag = JSON.stringify(items);
  const live = mode === "live";
  // Prices always come from the server: live offers, the promo code and delivery.
  useEffect(() => {
    if (!live || !token || items.length === 0 || placed) return;
    let active = true;
    api("shop", "POST", {
      action: "quote",
      data: { items, promoCode: applied },
    })
      .then((q) => {
        if (!active) return;
        setQuote(q);
        setProblem("");
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setProblem(e.message);
      });
    return () => {
      active = false;
    };
  }, [bag, applied, live, token]);
  if (features.store !== "live" || !live)
    return (
      <section className="empty">
        <h2>Checkout is not available here</h2>
        <Link className="button" href="/store">
          Back to the store
        </Link>
      </section>
    );
  if (!token)
    return <SignInPrompt open={openAuth}>Sign in to check out.</SignInPrompt>;
  if (placed)
    return (
      <section className="panel checkout-pay">
        <h2>Pay for order {placed.reference}</h2>
        <PayStep orderId={placed.id} amount={placed.total} />
        <p className="field-hint">
          Changed your mind? You can cancel this order under{" "}
          <Link href="/orders">Orders</Link>.
        </p>
      </section>
    );
  if (items.length === 0)
    return (
      <section className="empty">
        <h2>Your bag is empty</h2>
        <p>Add something from the store, then come back to check out.</p>
        <Link className="button" href="/store">
          Go to the store
        </Link>
      </section>
    );
  const set = (patch: Partial<typeof blank>) =>
    setDelivery({ ...delivery, ...patch });
  return (
    <form
      className="checkout"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const order = await api("shop", "POST", {
            action: "order_create",
            data: {
              items,
              promoCode: quote?.promoCode || "",
              delivery: Object.fromEntries(
                Object.entries(delivery).map(([k, v]) => [k, v.trim()]),
              ),
              method,
              idempotencyKey: key,
            },
          });
          setCart({});
          if (method === "COD") {
            setNotice(
              `Order ${order.reference} placed. Pay ${money(order.total)} in cash when it arrives.`,
            );
            return router.push("/orders");
          }
          setPlaced(order);
        });
      }}
    >
      <section className="panel">
        <h2>Delivery details</h2>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="d-name">Full name</label>
            <input
              id="d-name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              value={delivery.recipient}
              onChange={(e) => set({ recipient: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="d-phone">Mobile number</label>
            <input
              id="d-phone"
              type="tel"
              required
              pattern="[0-9+ \-]{7,30}"
              title="Digits only, for example 9800000000"
              autoComplete="tel"
              aria-describedby="d-phone-hint"
              value={delivery.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
            <p className="field-hint" id="d-phone-hint">
              The courier calls this number before delivery.
            </p>
          </div>
          <div className="field">
            <label htmlFor="d-address">Street address, ward or landmark</label>
            <input
              id="d-address"
              required
              minLength={5}
              maxLength={300}
              autoComplete="street-address"
              value={delivery.address}
              onChange={(e) => set({ address: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="d-city">City or municipality</label>
            <input
              id="d-city"
              required
              minLength={2}
              maxLength={80}
              autoComplete="address-level2"
              value={delivery.city}
              onChange={(e) => set({ city: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="d-district">District</label>
            <input
              id="d-district"
              required
              minLength={2}
              maxLength={80}
              value={delivery.district}
              onChange={(e) => set({ district: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="d-note">
              Note for delivery<span className="optional">Optional</span>
            </label>
            <input
              id="d-note"
              maxLength={300}
              value={delivery.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </div>
        </div>
      </section>
      <section className="panel">
        <h2>Payment</h2>
        <fieldset className="pay-step">
          <legend>When would you like to pay?</legend>
          <label className="choice method">
            <input
              type="radio"
              name="pay"
              checked={method === "ONLINE"}
              onChange={() => setMethod("ONLINE")}
            />
            <span>
              <strong>Pay now</strong>
              <small>eSewa or Khalti, on the next step</small>
            </span>
          </label>
          <label className="choice method">
            <input
              type="radio"
              name="pay"
              checked={method === "COD"}
              onChange={() => setMethod("COD")}
            />
            <span>
              <strong>Cash on delivery</strong>
              <small>Pay the courier in cash when your order arrives</small>
            </span>
          </label>
        </fieldset>
      </section>
      <section className="panel order-summary">
        <h2>Your order</h2>
        {!quote ? (
          <p className="empty-inline" role="status">
            {problem || "Working out your total…"}
          </p>
        ) : (
          <>
            {quote.lines.map((l: any) => (
              <div className="cart-total line" key={l.skuId}>
                <span>
                  {l.title} × {l.quantity}
                </span>
                <span>{money(l.line)}</span>
              </div>
            ))}
            <div className="promo">
              <div className="field">
                <label htmlFor="promo-entry">Promo code</label>
                <input
                  id="promo-entry"
                  value={code}
                  maxLength={20}
                  autoComplete="off"
                  onChange={(e) =>
                    setCode(
                      e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
                    )
                  }
                />
              </div>
              <button
                type="button"
                className="button secondary small"
                disabled={code === applied}
                onClick={() => setApplied(code)}
              >
                Apply
              </button>
            </div>
            {quote.promoMessage && (
              <p className="field-error" role="alert">
                {quote.promoMessage}
              </p>
            )}
            <div className="cart-total">
              <span>Subtotal</span>
              <span>{money(quote.subtotal)}</span>
            </div>
            {quote.discount > 0 && (
              <div className="cart-total discount">
                <span>{quote.promoCode}</span>
                <span>− {money(quote.discount)}</span>
              </div>
            )}
            <div className="cart-total">
              <span>Delivery</span>
              <span>{quote.shipping ? money(quote.shipping) : "Free"}</span>
            </div>
            <div className="cart-total grand">
              <span>Total</span>
              <strong>{money(quote.total)}</strong>
            </div>
          </>
        )}
        {(problem || error) && quote && (
          <p role="alert" className="form-error">
            {problem || error}
          </p>
        )}
        <button className="button full" disabled={busy || !quote || !!problem}>
          {busy
            ? "Placing your order…"
            : method === "COD"
              ? "Place order"
              : "Continue to payment"}
        </button>
        <p className="form-note">
          You can cancel free of charge until the order is dispatched.
        </p>
      </section>
    </form>
  );
}
