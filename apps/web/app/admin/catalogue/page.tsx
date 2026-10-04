"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { money } from "../../_components/ui";
import { discountLabel, productCategories } from "../../_lib/store";
import { Area, useOps } from "../_components/area";
import { useLoad } from "../_components/use-load";
const day = (value: string | null) => (value ? value.slice(0, 10) : "");
// Offers and codes run to the end of the chosen day, so show the day before the stored end.
const lastDay = (endsAt: string | null) =>
  endsAt
    ? new Date(Date.parse(endsAt) - 86400000).toISOString().slice(0, 10)
    : "";
const emptyProduct = {
  title: "",
  description: "",
  category: "WELLNESS",
  price: "",
};
const emptyOffer = {
  title: "",
  kind: "PERCENT",
  value: "",
  productId: "",
  endsOn: "",
  active: true,
};
const emptyPromo = {
  code: "",
  kind: "PERCENT",
  value: "",
  minSubtotal: "",
  endsOn: "",
  maxRedemptions: "",
  active: true,
};
export default function Catalogue() {
  const { ops, run, busy, setNotice } = useOps();
  const { data, reload } = useLoad("catalogue");
  const [product, setProduct] = useState<any>(null),
    [offer, setOffer] = useState<any>(null),
    [promo, setPromo] = useState<any>(null),
    [stock, setStock] = useState<{ id: string; quantity: string } | null>(null);
  const act = (
    action: string,
    payload: object,
    notice: string,
    done?: () => void,
  ) =>
    run(async () => {
      await ops(action, payload);
      done?.();
      await reload();
      setNotice(notice);
    });
  if (!data)
    return (
      <Area area="catalogue">
        <div className="loading" role="status">
          Loading the catalogue…
        </div>
      </Area>
    );
  return (
    <Area area="catalogue">
      <section className="panel">
        <div className="panel-heading">
          <h2>Products</h2>
          {!product && (
            <button onClick={() => setProduct(emptyProduct)}>
              <Plus size={15} /> Add a product
            </button>
          )}
        </div>
        {product && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                "product_save",
                {
                  ...(product.id ? { id: product.id } : {}),
                  title: product.title.trim(),
                  description: product.description.trim(),
                  category: product.category,
                  price: Number(product.price),
                },
                product.id ? "Product updated." : "Product saved as a draft.",
                () => setProduct(null),
              );
            }}
          >
            <div className="field-grid">
              <div className="field wide">
                <label htmlFor="product-title">Product name</label>
                <input
                  id="product-title"
                  required
                  minLength={3}
                  maxLength={120}
                  value={product.title}
                  onChange={(e) =>
                    setProduct({ ...product, title: e.target.value })
                  }
                />
              </div>
              <div className="field wide">
                <label htmlFor="product-description">Description</label>
                <textarea
                  id="product-description"
                  required
                  minLength={10}
                  maxLength={1000}
                  rows={3}
                  value={product.description}
                  onChange={(e) =>
                    setProduct({ ...product, description: e.target.value })
                  }
                />
                <p className="field-hint">
                  Describe the product. Do not make health claims.
                </p>
              </div>
              <div className="field">
                <label htmlFor="product-category">Category</label>
                <select
                  id="product-category"
                  value={product.category}
                  onChange={(e) =>
                    setProduct({ ...product, category: e.target.value })
                  }
                >
                  {Object.entries(productCategories).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="product-price">Price in NPR</label>
                <input
                  id="product-price"
                  type="number"
                  inputMode="decimal"
                  required
                  min={0}
                  max={1000000}
                  value={product.price}
                  onChange={(e) =>
                    setProduct({ ...product, price: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="request-actions">
              <button className="button" disabled={busy}>
                {busy ? "Saving…" : "Save product"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setProduct(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {data.products.length === 0 && !product && (
          <p className="empty-inline">No products yet.</p>
        )}
        {!product &&
          data.products.map((p: any) => (
            <div className="booking-row" key={p.id}>
              <div>
                <strong>{p.title}</strong>
                <p>
                  {productCategories[p.category] || p.category} ·{" "}
                  {money(p.price)} · {p.stock} in stock
                  {p.kind === "SUPPLEMENT" ? " · supplement" : ""}
                </p>
              </div>
              <span
                className={`status ${p.status === "PUBLISHED" ? "status-confirmed" : ""}`}
              >
                {p.status === "PUBLISHED" ? "On sale" : p.status.toLowerCase()}
              </span>
              {p.kind !== "SUPPLEMENT" && (
                <div className="request-actions wrap">
                  <button
                    className="text-button"
                    onClick={() =>
                      setProduct({
                        id: p.id,
                        title: p.title,
                        description: p.description,
                        category: p.category,
                        price: String(p.price),
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setStock({ id: p.id, quantity: "" })}
                  >
                    Add stock
                  </button>
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() =>
                      act(
                        "product_status",
                        {
                          id: p.id,
                          status:
                            p.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
                        },
                        p.status === "PUBLISHED"
                          ? "Taken off sale."
                          : "Now on sale in the store.",
                      )
                    }
                  >
                    {p.status === "PUBLISHED" ? "Take off sale" : "Put on sale"}
                  </button>
                </div>
              )}
              {stock && stock.id === p.id && (
                <form
                  className="booking-action"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(
                      "stock_receive",
                      { id: p.id, quantity: Number(stock.quantity) },
                      `${stock.quantity} units added to stock.`,
                      () => setStock(null),
                    );
                  }}
                >
                  <div className="field">
                    <label htmlFor={`stock-${p.id}`}>Units received</label>
                    <input
                      id={`stock-${p.id}`}
                      autoFocus
                      type="number"
                      inputMode="numeric"
                      required
                      min={1}
                      max={10000}
                      value={stock.quantity}
                      onChange={(e) =>
                        setStock({ id: p.id, quantity: e.target.value })
                      }
                    />
                  </div>
                  <div className="request-actions">
                    <button className="button small" disabled={busy}>
                      Add to stock
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setStock(null)}
                    >
                      Back
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Offers</h2>
          {!offer && (
            <button onClick={() => setOffer(emptyOffer)}>
              <Plus size={15} /> Add an offer
            </button>
          )}
        </div>
        <p className="section-copy">
          An offer lowers the price shown in the store, for one product or for
          everything, until its last day.
        </p>
        {offer && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                "offer_save",
                {
                  ...(offer.id ? { id: offer.id } : {}),
                  title: offer.title.trim(),
                  kind: offer.kind,
                  value: Number(offer.value),
                  productId: offer.productId,
                  endsOn: offer.endsOn,
                  active: offer.active,
                },
                "Offer saved.",
                () => setOffer(null),
              );
            }}
          >
            <div className="field-grid">
              <div className="field wide">
                <label htmlFor="offer-title">
                  Offer name, shown to customers
                </label>
                <input
                  id="offer-title"
                  required
                  minLength={3}
                  maxLength={80}
                  value={offer.title}
                  onChange={(e) =>
                    setOffer({ ...offer, title: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="offer-kind">Discount type</label>
                <select
                  id="offer-kind"
                  value={offer.kind}
                  onChange={(e) => setOffer({ ...offer, kind: e.target.value })}
                >
                  <option value="PERCENT">Percentage</option>
                  <option value="FIXED">Fixed amount in NPR</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="offer-value">
                  {offer.kind === "PERCENT" ? "Percent off" : "NPR off"}
                </label>
                <input
                  id="offer-value"
                  type="number"
                  inputMode="decimal"
                  required
                  min={1}
                  max={offer.kind === "PERCENT" ? 90 : 1000000}
                  value={offer.value}
                  onChange={(e) =>
                    setOffer({ ...offer, value: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="offer-product">Applies to</label>
                <select
                  id="offer-product"
                  value={offer.productId}
                  onChange={(e) =>
                    setOffer({ ...offer, productId: e.target.value })
                  }
                >
                  <option value="">Every product</option>
                  {data.products.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="offer-end">
                  Last day<span className="optional">Optional</span>
                </label>
                <input
                  id="offer-end"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={offer.endsOn}
                  onChange={(e) =>
                    setOffer({ ...offer, endsOn: e.target.value })
                  }
                />
              </div>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={offer.active}
                  onChange={(e) =>
                    setOffer({ ...offer, active: e.target.checked })
                  }
                />
                <span>Offer is switched on</span>
              </label>
            </div>
            <div className="request-actions">
              <button className="button" disabled={busy}>
                Save offer
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setOffer(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {!offer &&
          (data.offers.length === 0 ? (
            <p className="empty-inline">No offers yet.</p>
          ) : (
            data.offers.map((o: any) => (
              <div className="booking-row" key={o.id}>
                <div>
                  <strong>{o.title}</strong>
                  <p>
                    {discountLabel(o.kind, o.value)} on{" "}
                    {o.product || "every product"}
                    {o.endsAt
                      ? ` · until ${lastDay(o.endsAt)}`
                      : " · no end date"}
                  </p>
                </div>
                <span className={`status ${o.live ? "status-confirmed" : ""}`}>
                  {o.live ? "Live" : o.active ? "Ended" : "Off"}
                </span>
                <div className="request-actions">
                  <button
                    className="text-button"
                    onClick={() =>
                      setOffer({
                        id: o.id,
                        title: o.title,
                        kind: o.kind,
                        value: String(Number(o.value)),
                        productId: o.productId || "",
                        endsOn: lastDay(o.endsAt),
                        active: o.active,
                      })
                    }
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))
          ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Promo codes</h2>
          {!promo && (
            <button onClick={() => setPromo(emptyPromo)}>
              <Plus size={15} /> Add a promo code
            </button>
          )}
        </div>
        <p className="section-copy">
          A code the customer types into their bag for a discount on the whole
          order.
        </p>
        {promo && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                "promo_save",
                {
                  ...(promo.id ? { id: promo.id } : {}),
                  code: promo.code.trim(),
                  kind: promo.kind,
                  value: Number(promo.value),
                  minSubtotal: Number(promo.minSubtotal || 0),
                  endsOn: promo.endsOn,
                  maxRedemptions: promo.maxRedemptions
                    ? Number(promo.maxRedemptions)
                    : "",
                  active: promo.active,
                },
                "Promo code saved.",
                () => setPromo(null),
              );
            }}
          >
            <div className="field-grid">
              <div className="field">
                <label htmlFor="promo-code">Code</label>
                <input
                  id="promo-code"
                  required
                  pattern="[A-Za-z0-9]{4,20}"
                  disabled={!!promo.id}
                  value={promo.code}
                  onChange={(e) =>
                    setPromo({ ...promo, code: e.target.value.toUpperCase() })
                  }
                />
                <p className="field-hint">4 to 20 letters and numbers.</p>
              </div>
              <div className="field">
                <label htmlFor="promo-kind">Discount type</label>
                <select
                  id="promo-kind"
                  value={promo.kind}
                  onChange={(e) => setPromo({ ...promo, kind: e.target.value })}
                >
                  <option value="PERCENT">Percentage</option>
                  <option value="FIXED">Fixed amount in NPR</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="promo-value">
                  {promo.kind === "PERCENT" ? "Percent off" : "NPR off"}
                </label>
                <input
                  id="promo-value"
                  type="number"
                  inputMode="decimal"
                  required
                  min={1}
                  max={promo.kind === "PERCENT" ? 90 : 1000000}
                  value={promo.value}
                  onChange={(e) =>
                    setPromo({ ...promo, value: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="promo-min">
                  Minimum order in NPR<span className="optional">Optional</span>
                </label>
                <input
                  id="promo-min"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={promo.minSubtotal}
                  onChange={(e) =>
                    setPromo({ ...promo, minSubtotal: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="promo-end">
                  Last day<span className="optional">Optional</span>
                </label>
                <input
                  id="promo-end"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={promo.endsOn}
                  onChange={(e) =>
                    setPromo({ ...promo, endsOn: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="promo-max">
                  Total uses allowed<span className="optional">Optional</span>
                </label>
                <input
                  id="promo-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={promo.maxRedemptions}
                  onChange={(e) =>
                    setPromo({ ...promo, maxRedemptions: e.target.value })
                  }
                />
              </div>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={promo.active}
                  onChange={(e) =>
                    setPromo({ ...promo, active: e.target.checked })
                  }
                />
                <span>Code is switched on</span>
              </label>
            </div>
            <div className="request-actions">
              <button className="button" disabled={busy}>
                Save promo code
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setPromo(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {!promo &&
          (data.promos.length === 0 ? (
            <p className="empty-inline">No promo codes yet.</p>
          ) : (
            data.promos.map((c: any) => (
              <div className="booking-row" key={c.id}>
                <div>
                  <strong className="ticket-ref">{c.code}</strong>
                  <p>
                    {discountLabel(c.kind, c.value)}
                    {Number(c.minSubtotal) > 0
                      ? ` on orders from ${money(c.minSubtotal)}`
                      : ""}
                    {c.endsAt ? ` · until ${lastDay(c.endsAt)}` : ""}
                    {c.maxRedemptions
                      ? ` · used ${c.redeemed} of ${c.maxRedemptions}`
                      : ""}
                  </p>
                </div>
                <span className={`status ${c.live ? "status-confirmed" : ""}`}>
                  {c.live ? "Live" : c.active ? "Ended" : "Off"}
                </span>
                <div className="request-actions">
                  <button
                    className="text-button"
                    onClick={() =>
                      setPromo({
                        id: c.id,
                        code: c.code,
                        kind: c.kind,
                        value: String(Number(c.value)),
                        minSubtotal: String(Number(c.minSubtotal) || ""),
                        endsOn: lastDay(c.endsAt),
                        maxRedemptions: c.maxRedemptions
                          ? String(c.maxRedemptions)
                          : "",
                        active: c.active,
                      })
                    }
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))
          ))}
      </section>
    </Area>
  );
}
