"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../_components/app";
import { useLanguage } from "../_components/language";
import { SignInPrompt, money, nepalTime } from "../_components/ui";
export default function Appointments() {
  const { token, api, openAuth, setError } = useApp();
  const { t } = useLanguage();
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => {
    if (!token) return;
    let active = true;
    api("appointments")
      .then((d) => active && setItems(d.appointments))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [token]);
  if (!token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in to see your appointments.
      </SignInPrompt>
    );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t("Appointments")}</h2>
        <Link href="/professionals">{t("Browse care")}</Link>
      </div>
      {items === null ? (
        <p role="status">Loading appointments…</p>
      ) : items.length === 0 ? (
        <p>Your appointments will appear here.</p>
      ) : (
        items.map((a) => (
          <article className="service-card" key={a.id}>
            <h3>{a.provider}</h3>
            <p>
              {a.service} · {nepalTime(a.startsAt)} NPT · {money(a.price)}
            </p>
            <span className="status">
              {t(
                a.status === "HELD"
                  ? a.paymentStatus === "UNPAID"
                    ? "Payment needed"
                    : "Awaiting approval"
                  : a.status === "CONFIRMED"
                    ? "Confirmed"
                    : a.status.replaceAll("_", " "),
              )}
            </span>
            <footer>
              <Link className="button secondary" href={`/appointments/${a.id}`}>
                {t("View appointment")}
              </Link>
            </footer>
          </article>
        ))
      )}
    </section>
  );
}
