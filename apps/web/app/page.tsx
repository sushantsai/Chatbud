"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Lock,
  ShoppingBag,
  Umbrella,
  Video,
} from "lucide-react";
import { TodayAssignedTasks } from "./_components/care-records";
import { Notifications } from "./_components/notifications";
import { useLanguage } from "./_components/language";
import { useApp } from "./_components/app";
import { TodayList, useHealth } from "./_components/goals";
import { NeedIcon } from "./_components/need-icon";
import { Urgent, nepalTime, professions } from "./_components/ui";
import { features } from "./_lib/features";
import { areas, needs } from "./_lib/needs";
const steps = [
  ["Tell us what you need", "Sleep, stress, food, strength and more."],
  ["Meet a verified professional", "Book an online session that suits you."],
  [
    "Follow your plan, one day at a time",
    "Small goals you can tick off daily.",
  ],
];
export default function Home() {
  const { t } = useLanguage();
  const { userName, token, mode, dashboard, catalog, openAuth } = useApp();
  const { health, act } = useHealth();
  const [greeting, setGreeting] = useState("Welcome");
  useEffect(() => {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        hour12: false,
        timeZone: "Asia/Kathmandu",
      }).format(new Date()),
    );
    setGreeting(
      hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening",
    );
  }, []);
  const next = dashboard.appointments
    .filter(
      (a: any) =>
        a.status === "CONFIRMED" && Date.parse(a.startsAt) > Date.now(),
    )
    .sort(
      (a: any, b: any) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
    )[0];
  const signedIn = mode === "demo" || !!token;
  // Professionals who can be booked today are shown first.
  const people = [...catalog.providers]
    .sort((a: any, b: any) => Number(!!b.serviceId) - Number(!!a.serviceId))
    .slice(0, 3);
  return (
    <>
      {signedIn ? (
        <section className="home-greeting">
          <h1>
            {greeting}
            {userName ? `, ${userName.split(" ")[0]}` : ""}.
          </h1>
          <p>Here is where things stand today.</p>
        </section>
      ) : (
        <section className="need-first">
          <span className="eyebrow">CHATBUD CARE</span>
          <h1>What would you like help with?</h1>
          <p>Choose your care need and find an approved professional.</p>
          <div className="workflow-actions">
            {areas.map((a) => (
              <Link key={a.id} href={`/professionals?category=${a.id}`}>
                {t(a.name)} →
              </Link>
            ))}
          </div>
        </section>
      )}
      {next && (
        <Link className="next-up" href={`/appointments/${next.id}`}>
          <CalendarDays size={22} />
          <div>
            <strong>
              {next.status === "CONFIRMED"
                ? "Next session"
                : "Awaiting confirmation"}
              : {next.provider}
            </strong>
            <p>
              {next.service} · {nepalTime(next.startsAt)} NPT
            </p>
          </div>
          <ArrowRight size={18} />
        </Link>
      )}
      {signedIn && (
        <section className="panel required-actions">
          <h2>{t("Your next steps")}</h2>
          {dashboard.appointments
            .filter((a: any) => a.status === "HELD")
            .map((a: any) => (
              <Link href={`/appointments/${a.id}`} key={a.id}>
                <span>
                  {a.paymentStatus === "UNPAID"
                    ? "Complete payment"
                    : "Awaiting professional approval"}{" "}
                  · {a.provider}
                </span>
                <span>View →</span>
              </Link>
            ))}
          {dashboard.appointments
            .filter(
              (a: any) =>
                a.status === "CONFIRMED" &&
                a.intakeStage === "AFTER_CONFIRMATION" &&
                !a.intakeComplete,
            )
            .map((a: any) => (
              <Link href={`/appointments/${a.id}`} key={`intake-${a.id}`}>
                <span>Complete intake before your session · {a.provider}</span>
                <span>Open →</span>
              </Link>
            ))}
          {!next && (
            <p className="workflow-note">
              {t("No upcoming appointments")} ·{" "}
              <Link href="/professionals">{t("Browse care")}</Link>
            </p>
          )}
          <Link href="/my-health">
            <span>Intake, care plans and today’s tasks</span>
            <span>Review →</span>
          </Link>
        </section>
      )}
      {signedIn && <TodayAssignedTasks />}
      {signedIn && <Notifications />}
      {health && <TodayList health={health} act={act} />}
      <div className="section-title">
        <h2>What would you like help with?</h2>
      </div>
      {areas
        .filter((a) => features[a.id] !== "off")
        .map((area) => (
          <section className="area-group" data-area={area.id} key={area.id}>
            <h3>
              {area.name} <span>{area.line}</span>
              {features[area.id] === "soon" && (
                <span className="soon-badge">Coming soon</span>
              )}
            </h3>
            <div className="need-grid">
              {needs
                .filter((n) => n.area === area.id)
                .map((n) => (
                  <Link
                    className="need-card"
                    href={`/need/${n.slug}`}
                    key={n.slug}
                  >
                    <span className="need-icon">
                      <NeedIcon slug={n.slug} size={22} />
                    </span>
                    <span>
                      <strong>{n.title}</strong>
                      <small>{n.summary}</small>
                    </span>
                  </Link>
                ))}
            </div>
          </section>
        ))}
      {people.length > 0 && (
        <>
          <div className="section-title">
            <h2>Professionals you can trust</h2>
            <Link href="/professionals">See all</Link>
          </div>
          <div className="people">
            {people.map((p: any) => (
              <Link
                className="person-card"
                href={`/professionals/${p.id}`}
                key={p.serviceId || p.id}
              >
                <span className="record-icon">
                  {p.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <strong>{p.name}</strong>
                <span>{professions[p.profession] || p.profession}</span>
                <span className="verified">
                  <BadgeCheck size={16} />{" "}
                  {p.name.includes("(Sample)")
                    ? "Sample profile"
                    : "Credentials checked"}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
      <div className="quick-links">
        {features.store !== "off" && (
          <Link href="/store">
            <ShoppingBag size={20} />
            <strong>Health store</strong>
            <span>Food, devices and everyday wellness</span>
          </Link>
        )}
        {features.protect !== "off" && (
          <Link href="/protect">
            <Umbrella size={20} />
            <strong>Protect your family</strong>
            <span>
              Health insurance
              {features.protect === "soon" && " · coming soon"}
            </span>
          </Link>
        )}
      </div>
      <Urgent />
    </>
  );
}
