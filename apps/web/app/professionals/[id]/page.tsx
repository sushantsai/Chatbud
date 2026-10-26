"use client";
import { use } from "react";
import Link from "next/link";
import { useApp } from "../../_components/app";
import { useLanguage } from "../../_components/language";
import { money, professions } from "../../_components/ui";
export default function Profile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { catalog, loading } = useApp();
  const { t } = useLanguage();
  const services = catalog.providers.filter((p: any) => p.id === id);
  const p = services[0];
  if (loading) return <p role="status">Loading profile…</p>;
  if (!p)
    return (
      <section className="panel">
        <h1>Profile unavailable</h1>
        <Link href="/professionals">{t("Browse care")}</Link>
      </section>
    );
  return (
    <>
      <Link href="/professionals">← {t("Care")}</Link>
      <section className="panel">
        <div className="profile-heading">
          <div className="avatar">
            {p.name
              .split(" ")
              .map((s: string) => s[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div>
            <h1>{p.name}</h1>
            <p>{professions[p.profession] || p.profession}</p>
            <span className="status">
              {p.name.includes("(Sample)")
                ? "Sample profile · demonstration only"
                : "Approved professional scope"}
            </span>
          </div>
        </div>
        <dl className="clinical-summary">
          <div>
            <dt>Qualifications</dt>
            <dd>{p.qualifications || "Credentials reviewed by Chatbud"}</dd>
          </div>
          <div>
            <dt>Approved services</dt>
            <dd>
              {[
                ...new Set(
                  services.map(
                    (s: any) => professions[s.profession] || s.profession,
                  ),
                ),
              ].join(", ")}
            </dd>
          </div>
          <div>
            <dt>Languages</dt>
            <dd>
              {p.languages
                .map(
                  (l: string) =>
                    ({ en: "English", ne: "Nepali", hi: "Hindi" })[l] || l,
                )
                .join(", ")}
            </dd>
          </div>
        </dl>
      </section>
      <div className="clinical-layout">
        <section className="panel">
          <h2>{t("Services")}</h2>
          {services
            .filter((s: any) => s.serviceId)
            .map((s: any) => (
              <article className="service-card" key={s.serviceId}>
                <h3>{s.service}</h3>
                <p>{s.duration} minutes · Online consultation</p>
                <span className="status">
                  {s.confirmationMode === "INSTANT"
                    ? "Instant confirmation after payment"
                    : "Professional approval after payment"}
                </span>
                <p className="workflow-note">
                  {s.intakeStage === "BEFORE_PAYMENT"
                    ? "Required intake before payment"
                    : s.intakeStage === "AFTER_CONFIRMATION"
                      ? "Intake after confirmation, before your session"
                      : "No checkout intake required"}
                  . Book at least {s.minimumNoticeMinutes / 60 || 4} hours in
                  advance.
                </p>
                <footer>
                  <strong>{money(s.price)}</strong>
                  <Link className="button" href={`/book/${s.serviceId}`}>
                    {t("Choose a time")}
                  </Link>
                </footer>
              </article>
            ))}
          {!services.some((s: any) => s.serviceId) && (
            <p>Services are not yet open for booking.</p>
          )}
          <h2>{t("About")}</h2>
          <p>{p.bio}</p>
        </section>
        <aside className="panel">
          <h3>Booking with Chatbud</h3>
          <p className="workflow-note">
            Full payment is required to secure a paid appointment. Approval
            requests are followed up after 30 minutes and expire after 60
            minutes if unaccepted.
          </p>
          <p className="workflow-note">
            Chatbud coordinates preparation, schedule changes and support.
          </p>
          <Link href="/help">{t("Contact support")}</Link>
        </aside>
      </div>
    </>
  );
}
