"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ShoppingBag,
  Umbrella,
  Users,
} from "lucide-react";
import { useApp } from "./_components/app";
import { TodayList, useHealth } from "./_components/goals";
import { NeedIcon } from "./_components/need-icon";
import { Urgent, nepalTime } from "./_components/ui";
import { features } from "./_lib/features";
import { areas, needs } from "./_lib/needs";
export default function Home() {
  const { userName, token, mode, dashboard, openAuth } = useApp();
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
        ["HELD", "CONFIRMED"].includes(a.status) &&
        Date.parse(a.startsAt) > Date.now(),
    )
    .sort(
      (a: any, b: any) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
    )[0];
  const signedIn = mode === "demo" || !!token;
  return (
    <>
      <section className="home-greeting">
        <h1>
          {greeting}
          {userName ? `, ${userName.split(" ")[0]}` : ""}.
        </h1>
        <p>What would you like help with?</p>
      </section>
      {health && <TodayList health={health} act={act} />}
      {next && (
        <Link className="next-up" href="/appointments">
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
      <div className="area-tiles">
        {areas
          .filter((a) => features[a.id] !== "off")
          .map((area) => (
            <section className="area-tile" data-area={area.id} key={area.id}>
              <header>
                <h2>{area.name}</h2>
                <p>{area.line}</p>
                {features[area.id] === "soon" && (
                  <span className="soon-badge">Coming soon</span>
                )}
              </header>
              {needs
                .filter((n) => n.area === area.id)
                .map((n) => (
                  <Link
                    className="need-row"
                    href={`/need/${n.slug}`}
                    key={n.slug}
                  >
                    <NeedIcon slug={n.slug} size={22} />
                    <span>
                      <strong>{n.title}</strong>
                      <small>{n.summary}</small>
                    </span>
                    <ArrowRight size={18} />
                  </Link>
                ))}
            </section>
          ))}
      </div>
      <div className="quick-links">
        <Link href="/professionals">
          <Users size={20} />
          <strong>Browse all professionals</strong>
          <span>Verified before they are listed</span>
        </Link>
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
      {!signedIn && (
        <p className="empty-inline">
          <button className="text-button" onClick={openAuth}>
            Sign in
          </button>{" "}
          to keep goals, see your appointments and track your progress.
        </p>
      )}
      <Urgent />
    </>
  );
}
