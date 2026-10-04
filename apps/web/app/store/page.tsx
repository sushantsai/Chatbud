"use client";
import { useState } from "react";
import {
  BookOpen,
  Dumbbell,
  Leaf,
  Package,
  Pill,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useApp } from "../_components/app";
import { ComingSoon, money } from "../_components/ui";
import { features } from "../_lib/features";
import { productCategories, unitPrice } from "../_lib/store";
export default function Store() {
  const { mode, catalog, loading, catalogFailed, cart, setCart, setNotice } =
    useApp();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all");
  if (features.store !== "live")
    return (
      <ComingSoon icon={Package} title="The Chatbud Store is on its way">
        Health and wellness products will be available here after supplier,
        label and stock approval.
      </ComingSoon>
    );
  const products = catalog.products.filter(
    (p: any) =>
      (category === "all" || (p.category || p.kind) === category) &&
      `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="searchbar">
        <Search size={20} />
        <input
          aria-label="Search products"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products and everyday essentials…"
        />
        <span>
          <SlidersHorizontal size={17} /> Find your fit
        </span>
      </div>
      <div className="filter-row">
        <div className="chips">
          {[
            ["all", "All products"],
            // Only categories that have something on sale.
            ...Object.entries(productCategories).filter(([id]) =>
              catalog.products.some((p: any) => (p.category || p.kind) === id),
            ),
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
              className={category === id ? "chip chosen" : "chip"}
            >
              {label}
            </button>
          ))}
          {features.medicines === "soon" && (
            <span className="chip chip-soon">
              <Pill size={14} /> Medicines
              <span className="soon-badge">Soon</span>
            </span>
          )}
        </div>
      </div>
      {loading ? (
        <div className="loading" role="status">
          Loading your options…
        </div>
      ) : null}
      {!loading && !catalogFailed && (
        <>
          <div className="results-label">
            <span>
              {products.length} products{" "}
              {mode === "demo" ? "in this preview" : "available"}
            </span>
            <span>Sold and fulfilled by Chatbud</span>
          </div>
          {products.length === 0 ? (
            <div className="empty">
              <Package size={36} />
              <h2>
                {catalog.products.length
                  ? "No matching products"
                  : "Our first collection is coming together"}
              </h2>
              <p>
                {catalog.products.length
                  ? "Try another search or category."
                  : "Products will appear after supplier, label, and stock approval."}
              </p>
            </div>
          ) : (
            <div className="product-grid">
              {products.map((p: any, i: number) => {
                const Icon = [BookOpen, Dumbbell, Leaf, Package][i % 4];
                return (
                  <article className="product-card" key={p.id}>
                    <div
                      className={`product-icon tone-${["blue", "green", "orange", "purple"][i % 4]}`}
                    >
                      <Icon size={47} strokeWidth={1.3} />
                      <span>
                        {p.kind === "SUPPLEMENT" ? "SUPPLEMENT" : "WELLNESS"}
                      </span>
                    </div>
                    <div className="product-body">
                      <small>
                        {productCategories[p.category] ||
                          p.category ||
                          p.kind.toLowerCase()}
                      </small>
                      <h2>{p.name}</h2>
                      <p>{p.description}</p>
                      {p.offerTitle && p.offerPrice < p.price && (
                        <span className="offer-tag">{p.offerTitle}</span>
                      )}
                      <footer>
                        <strong>
                          {money(unitPrice(p))}
                          {p.offerPrice != null && p.offerPrice < p.price && (
                            <s>{money(p.price)}</s>
                          )}
                        </strong>
                        <button
                          className="add-button"
                          disabled={
                            p.stock <= 0 ||
                            (cart[p.id] || 0) >= Math.min(p.stock, 10)
                          }
                          onClick={() => {
                            setCart((c) => ({
                              ...c,
                              [p.id]: (c[p.id] || 0) + 1,
                            }));
                            setNotice("Added to your bag.");
                          }}
                        >
                          <Plus size={16} />{" "}
                          {p.stock ? "Add to bag" : "Out of stock"}
                        </button>
                      </footer>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <div className="care-note">
            <Leaf size={22} />
            <div>
              <strong>Your care comes first.</strong>
              <p>
                Product purchases are optional. Supplements require approved
                labels, supplier evidence, and batch/expiry tracking before
                sale.
                {features.medicines === "soon" &&
                  " Medicines will be offered only through licensed pharmacy partners."}
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
