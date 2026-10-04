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
