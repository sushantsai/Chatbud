"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Dumbbell,
  Heart,
  Leaf,
  ShoppingBag,
  Umbrella,
} from "lucide-react";
import { useApp } from "./_components/app";
import { professions } from "./_components/ui";
import { features, type Feature } from "./_lib/features";
const needs: {
  feature: Feature;
  href: string;
  title: string;
  label: string;
  icon: any;
  tone: string;
}[] = [
  {
    feature: "mental",
    href: "/professionals?category=mental",
    title: "Talk to someone",
    label: "Mental health",
    icon: Heart,
    tone: "blue",
  },
  {
    feature: "nutrition",
    href: "/professionals?category=nutrition",
    title: "Improve your nutrition",
    label: "Dietitian / Nutritionist",
    icon: Leaf,
    tone: "green",
  },
  {
    feature: "fitness",
    href: "/professionals?category=fitness",
    title: "Get fitter",
    label: "Fitness coach",
    icon: Dumbbell,
    tone: "orange",
  },
  {
    feature: "store",
    href: "/store",
    title: "Shop health",
    label: "Health store",
    icon: ShoppingBag,
    tone: "purple",
  },
  {
    feature: "protect",
    href: "/protect",
    title: "Protect your family",
    label: "Health insurance",
    icon: Umbrella,
    tone: "blue",
  },
];
export default function Home() {
  const { userName, token, mode, dashboard, catalog, openAuth } = useApp();
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
  const upcoming = dashboard.appointments.filter(
    (a: any) => a.status !== "EXPIRED" && Date.parse(a.startsAt) > Date.now(),
  );
  const signedIn = mode === "demo" || !!token;
  return (
    <>
      <section className="home-greeting">
        <h2>
          {greeting}
          {userName ? `, ${userName}` : ""}
        </h2>
        <p>What do you need today?</p>
      </section>
      <div className="need-grid">
        {needs
          .filter((n) => features[n.feature] !== "off")
          .map((n) => (
            <Link className="need-card" href={n.href} key={n.title}>
              <span className={`need-icon tone-${n.tone}`}>
                <n.icon size={26} strokeWidth={1.6} />
              </span>
              <strong>{n.title}</strong>
              <span>{n.label}</span>
              {features[n.feature] === "soon" ? (
                <span className="soon-badge">Coming soon</span>
              ) : (
                <ArrowUpRight className="need-arrow" size={18} />
              )}
            </Link>
          ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Your next steps</h2>
          <Link href="/appointments">All appointments</Link>
        </div>
        {!signedIn ? (
          <p className="empty-inline">
            <button className="text-button" onClick={openAuth}>
              Sign in
            </button>{" "}
            to see your appointments, plans and purchases here.
          </p>
        ) : upcoming.length === 0 ? (
          <p className="empty-inline">
            Nothing booked yet. Your upcoming appointments will appear here.
          </p>
        ) : (
          upcoming.slice(0, 3).map((a: any) => (
            <div className="record" key={a.id}>
              <span className="record-icon">
                <CalendarDays size={22} />
              </span>
              <div>
                <strong>{a.provider}</strong>
                <p>
                  {a.service} ·{" "}
                  {new Date(a.startsAt).toLocaleString("en-NP", {
                    timeZone: "Asia/Kathmandu",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  NPT
                </p>
              </div>
              <span className="status">{a.status.replaceAll("_", " ")}</span>
            </div>
          ))
        )}
      </section>
      {catalog.providers.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Professionals on Chatbud</h2>
            <Link href="/professionals">See all</Link>
          </div>
          {catalog.providers.slice(0, 3).map((p: any) => (
            <div className="record" key={p.serviceId}>
              <span className="record-icon">
                <Heart size={22} />
              </span>
              <div>
                <strong>{p.name}</strong>
                <p>
                  {professions[p.profession] || p.profession} · {p.service}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}
      <div className="care-note">
        <Heart size={21} />
        <div>
          <strong>Human expertise, technology and trusted products.</strong>
          <p>
            Recommendations on Chatbud come from qualified professionals, and
            you choose what to act on. Chatbud does not provide emergency care.
          </p>
        </div>
      </div>
    </>
  );
}
