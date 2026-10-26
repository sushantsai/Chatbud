"use client";
import Link from "next/link";
import { useApp } from "../_components/app";
import { useLanguage } from "../_components/language";
import { money } from "../_components/ui";
import { unitPrice } from "../_lib/store";
export default function Bag() {
  const { catalog, cart, setCart, loading } = useApp();
  const { t } = useLanguage();
  const items = catalog.products.filter((p: any) => cart[p.id]);
  const total = items.reduce(
    (s: number, p: any) => s + cart[p.id] * unitPrice(p),
    0,
  );
  return (
    <section className="panel">
      <h1>{t("Your bag")}</h1>
      {loading ? (
        <p role="status">Loading bag…</p>
      ) : items.length === 0 ? (
        <>
          <p>Your bag is empty.</p>
          <Link href="/store">Browse products</Link>
        </>
      ) : (
        <>
          {items.map((p: any) => (
            <article className="service-card" key={p.id}>
              <h2>
                <Link href={`/store/${p.id}`}>{p.name}</Link>
              </h2>
              <p>{money(unitPrice(p))} each</p>
              <label>
                Quantity
                <input
                  type="number"
                  min={1}
                  max={Math.min(p.stock, 10)}
                  value={cart[p.id]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (
                      Number.isInteger(n) &&
                      n > 0 &&
                      n <= Math.min(p.stock, 10)
                    )
                      setCart({ ...cart, [p.id]: n });
                  }}
                />
              </label>
              <button
                className="text-button"
                onClick={() =>
                  setCart(
                    Object.fromEntries(
                      Object.entries(cart).filter(([id]) => id !== p.id),
                    ),
                  )
                }
              >
                Remove
              </button>
            </article>
          ))}
          <h2>Subtotal · {money(total)}</h2>
          <p className="workflow-note">
            Delivery is priced by your covered Kathmandu Valley area and shown
            before you commit. Stock is rechecked at Review & Payment.
          </p>
          <Link className="button" href="/checkout">
            Checkout
          </Link>
        </>
      )}
    </section>
  );
}
