"use client";
import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { Clock, UserRound, X } from "lucide-react";
export const money = (value: number) =>
  `NPR ${Number(value).toLocaleString("en-NP")}`;
export const professions: Record<string, string> = {
  clinical_psychologist: "Clinical psychologist",
  psychiatrist: "Psychiatrist",
  counselor: "Counselor",
  dietitian: "Dietitian",
  nutritionist: "Nutritionist",
  personal_trainer: "Personal trainer",
  fitness_coach: "Fitness coach",
  yoga_instructor: "Yoga instructor",
};
export const fitnessProfessions = [
  "personal_trainer",
  "fitness_coach",
  "yoga_instructor",
];
// Areas of care. Records in one area are not visible to professionals in another unless the client shares them.
export const careAreas = [
  { id: "mental", label: "Mental health" },
  { id: "nutrition", label: "Nutrition" },
  { id: "fitness", label: "Fitness" },
] as const;
export const areaLabel = (id: string) =>
  careAreas.find((a) => a.id === id)?.label || id;
// Appointment times are always shown in Nepal time, wherever the visitor is.
export const nepalTime = (value: string | Date, withDate = true) =>
  new Date(value).toLocaleString("en-NP", {
    timeZone: "Asia/Kathmandu",
    ...(withDate ? { dateStyle: "medium" } : {}),
    timeStyle: "short",
  });
export const appointmentStatus: Record<string, string> = {
  HELD: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  EXPIRED: "Not confirmed in time",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  NO_SHOW: "Missed",
};
export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | number;
}) {
  return (
    <div className="summary">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function SignInPrompt({
  open,
  children,
}: {
  open: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="empty">
      <UserRound size={36} />
      <h2>Your own space for care</h2>
      <p>
        {children ||
          "Sign in to see your appointments, orders, and professional application."}
      </p>
      <button className="button" onClick={open}>
        Sign in
      </button>
    </section>
  );
}
export function ComingSoon({
  icon: Icon = Clock,
  title,
  children,
}: {
  icon?: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="empty coming-soon">
      <Icon size={36} />
      <span className="soon-badge">Coming soon</span>
      <h2>{title}</h2>
      <p>{children}</p>
      <Link className="button" href="/">
        Back to home
      </Link>
    </section>
  );
}
