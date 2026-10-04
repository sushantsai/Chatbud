"use client";
import Link from "next/link";
import {
  CalendarDays,
  Dumbbell,
  Heart,
  Leaf,
  Package,
  ShoppingBag,
  Target,
  Umbrella,
} from "lucide-react";
import { useApp } from "../_components/app";
import { SignInPrompt, Summary, money } from "../_components/ui";
import { features } from "../_lib/features";
const upcomingAreas = [
  {
    icon: Leaf,
    title: "Nutrition plans",
    copy: "Plans written for you by your nutrition professional.",
    show: features.nutrition !== "off",
  },
  {
    icon: Dumbbell,
    title: "Fitness plans",
    copy: "Programs from your fitness coach.",
    show: features.fitness !== "off",
  },
  {
    icon: Target,
    title: "Goals",
    copy: "Track what you are working towards.",
    show: true,
  },
  {
    icon: Umbrella,
    title: "Insurance",
    copy: "Your cover from licensed partners.",
    show: features.protect !== "off",
  },
];
export default function MyHealth() {
  const { mode, token, dashboard, openAuth } = useApp();
  if (mode === "live" && !token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in to see your plans, goals and purchases.
      </SignInPrompt>
    );
  return (
    <>
      <div className="summary-grid">
        <Summary
          icon={CalendarDays}
          label="Appointments"
          value={
            dashboard.appointments.filter((a: any) => a.status !== "EXPIRED")
              .length
          }
        />
        <Summary
          icon={ShoppingBag}
          label="Orders"
          value={dashboard.orders.length}
        />
        <Summary icon={Heart} label="Your next step" value="At your pace" />
      </div>
      <div className="area-grid">
        {upcomingAreas
          .filter((a) => a.show)
          .map((a) => (
            <div className="area-card" key={a.title}>
              <a.icon size={22} />
              <strong>{a.title}</strong>
              <p>{a.copy}</p>
              <span className="soon-badge">Coming soon</span>
            </div>
          ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Purchases</h2>
          <Link href="/store">Visit the store</Link>
        </div>
        {dashboard.orders.length === 0 ? (
          <p className="empty-inline">Your product orders will appear here.</p>
        ) : (
          dashboard.orders.map((o: any) => (
            <div className="record" key={o.id}>
              <span className="record-icon">
                <Package size={22} />
              </span>
              <div>
                <strong>Order #{o.id.slice(0, 8)}</strong>
                <p>{new Date(o.createdAt).toLocaleDateString()}</p>
              </div>
              <span className="status">{o.status.replaceAll("_", " ")}</span>
              <strong>{money(o.total)}</strong>
            </div>
          ))
        )}
      </section>
      {mode === "demo" && (
        <section className="nutrition-panel">
          <span className="eyebrow">EXAMPLE CARE RESOURCE</span>
          <h2>A practical approach to everyday meals</h2>
          <p>
            This sample resource shows where a provider-authored nutrition plan
            will appear. Personalized plans require a consultation and explicit
            consent.
          </p>
          <div className="nutrition-steps">
            <span>
              <b>01</b>Build regular meal routines
            </span>
            <span>
              <b>02</b>Make room for varied foods
            </span>
            <span>
              <b>03</b>Review your goals with a professional
            </span>
          </div>
        </section>
      )}
    </>
  );
}
