"use client";
import { use } from "react";
import Link from "next/link";
import { useApp } from "../../_components/app";
import { money } from "../../_components/ui";
import { unitPrice } from "../../_lib/store";
export default function Product({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { catalog, cart, setCart, loading, setNotice } = useApp();
  const p = catalog.products.find((p: any) => p.id === id);
  if (loading) return <p role="status">Loading product…</p>;
  if (!p)
    return (
      <section className="panel">
        <h1>Product unavailable</h1>
        <Link href="/store">Back to Store</Link>
      </section>
    );
  return (
    <>
      <Link href="/store">← Store</Link>
      <section className="panel">
        <span className="eyebrow">
          {p.kind === "SUPPLEMENT" ? "SUPPLEMENT" : "WELLNESS PRODUCT"}
        </span>
        <h1>{p.name}</h1>
        <p>{p.description}</p>
        <h2>{money(unitPrice(p))}</h2>
        <p>{p.stock > 0 ? `${p.stock} available` : "Out of stock"}</p>
        <button
          className="button"
          disabled={p.stock <= 0 || (cart[id] || 0) >= Math.min(p.stock, 10)}
          onClick={() => {
            setCart({ ...cart, [id]: (cart[id] || 0) + 1 });
            setNotice("Added to your bag.");
          }}
        >
          Add to bag
        </button>
        <Link className="button secondary" href="/bag">
          View bag
        </Link>
        <dl>
          {[
            ["Ingredients", p.ingredients],
            ["Allergens", p.allergens],
            ["Warnings", p.warnings],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
        <h3>Delivery & returns</h3>
        <p className="workflow-note">
          Kathmandu Valley coverage and area-based delivery fees are checked at
          checkout. Change-of-mind returns are accepted within 7 days of
          delivery for unopened, unused products, with seals intact where
          applicable. Damaged, incorrect or faulty items receive separate
          support review. Chatbud pays approved return shipping. The original
          delivery fee is refunded for damaged, incorrect or faulty products and
          retained for change-of-mind returns.
        </p>
        {p.kind === "SUPPLEMENT" && (
          <p className="care-warning">
            Read the product label and consult a qualified professional where
            appropriate. Supplements are not a substitute for individual medical
            advice.
          </p>
        )}
      </section>
    </>
  );
}
