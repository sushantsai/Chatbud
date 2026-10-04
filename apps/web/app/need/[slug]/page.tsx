"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useApp } from "../../_components/app";
import { TemplateList, useHealth } from "../../_components/goals";
import { NeedIcon } from "../../_components/need-icon";
import { ComingSoon, Urgent, money, professions } from "../../_components/ui";
import { features } from "../../_lib/features";
import { findNeed } from "../../_lib/needs";
import { productCategories, unitPrice } from "../../_lib/store";
export default function NeedPage() {
  const { slug } = useParams<{ slug: string }>();
  const { catalog, loading, openBooking } = useApp();
  const { health, act } = useHealth();
  const need = findNeed(slug);
  if (!need || features[need.area] === "off")
    return (
      <section className="empty">
        <h2>We could not find that page</h2>
        <p>Choose what you would like help with from the home page.</p>
        <Link className="button" href="/">
          Back to home
        </Link>
      </section>
    );
  if (features[need.area] === "soon")
    return (
      <ComingSoon title={`${need.title} is on its way`}>
        Professionals and plans for this will be listed here soon.
      </ComingSoon>
    );
  const people = catalog.providers
    .filter((p: any) => need.professions.includes(p.profession))
    // Professionals who can be booked today come first.
    .sort((a: any, b: any) => Number(!!b.serviceId) - Number(!!a.serviceId))
    .slice(0, 4);
  const products = catalog.products
    .filter((p: any) => need.productCategories.includes(p.category))
    .slice(0, 4);
  return (
    <>
      <section className="need-hero">
        <span className="need-icon">
          <NeedIcon slug={need.slug} size={30} />
        </span>
        <p>
          Three ways forward. Start with whichever feels easiest today: a small
          daily step, a conversation with a professional, or something practical
          to have at home.
        </p>
      </section>
      <section className="panel">
        <h2>Start with one small step</h2>
        <p className="section-copy">
          Pick one. It appears on your home page each day, and one tap marks it
          done.
        </p>
        <TemplateList need={need} health={health} act={act} />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Talk to a professional</h2>
          <Link href={`/professionals?category=${need.area}`}>See all</Link>
        </div>
        {loading ? (
          <div className="loading" role="status">
            Loading professionals…
          </div>
        ) : people.length === 0 ? (
          <p className="empty-inline">
            Professionals for this are being verified and will appear here.
          </p>
        ) : (
          people.map((p: any) => (
            <div className="record person" key={p.serviceId || p.id}>
              <span className="record-icon">
                {p.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{p.name}</strong>
                <p>
                  {professions[p.profession] || p.profession}
                  {p.serviceId && ` · ${p.duration} min · ${money(p.price)}`}
                </p>
              </div>
              {p.serviceId ? (
                <button
                  className="button secondary small"
                  onClick={() => openBooking(p)}
                >
                  See times
                </button>
              ) : (
                <span className="status">Bookings open soon</span>
              )}
            </div>
          ))
        )}
      </section>
      {features.store === "live" && products.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Things that can help</h2>
            <Link href="/store">Visit the store</Link>
          </div>
          {products.map((p: any) => (
            <Link className="record product-link" href="/store" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <p>{productCategories[p.category] || p.category}</p>
              </div>
              <strong>{money(unitPrice(p))}</strong>
              <ArrowRight size={16} />
            </Link>
          ))}
          <p className="field-hint">
            Products are optional. A professional can tell you what, if
            anything, is right for you.
          </p>
        </section>
      )}
      {need.area === "mental" && <Urgent />}
    </>
  );
}
