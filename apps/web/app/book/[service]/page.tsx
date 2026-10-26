"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../../_components/app";
import { useLanguage } from "../../_components/language";
import { IntakeForm } from "../../_components/intake";
import { PayStep } from "../../_components/pay";
import { money, nepalTime } from "../../_components/ui";
const dayOf = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(d);
export default function Book({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service } = use(params);
  const { api, catalog, loading, token, openAuth, run, busy, setError } =
    useApp();
  const { t } = useLanguage();
  const p = catalog.providers.find((p: any) => p.serviceId === service);
  const [day, setDay] = useState(dayOf(new Date())),
    [slots, setSlots] = useState<string[] | null>(null),
    [slot, setSlot] = useState(""),
    [step, setStep] = useState("time"),
    [held, setHeld] = useState<any>(null),
    [now, setNow] = useState(Date.now()),
    [ready, setReady] = useState(false),
    [key, setKey] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(`chatbud-book-${service}`) || "null",
      );
      if (saved) {
        setDay(saved.day);
        setSlot(saved.slot);
        setStep(saved.step === "account" && token ? "intake" : saved.step);
        setHeld(saved.held);
        setKey(saved.key || crypto.randomUUID());
      } else setKey(crypto.randomUUID());
    } catch {
      setKey(crypto.randomUUID());
    }
    setReady(true);
  }, [service]);
  useEffect(() => {
    if (ready)
      sessionStorage.setItem(
        `chatbud-book-${service}`,
        JSON.stringify({ day, slot, step, held, key }),
      );
  }, [day, slot, step, held, key, ready, service]);
  useEffect(() => {
    let active = true;
    setSlots(null);
    api(`appointments/slots?serviceId=${service}&date=${day}`)
      .then((d) => active && setSlots(d.slots))
      .catch((e) => {
        if (active) {
          setSlots([]);
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [day, service]);
  useEffect(() => {
    if (step === "account" && token) setStep("intake");
  }, [token, step]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (loading || !ready) return <p role="status">Loading booking…</p>;
  if (!p)
    return (
      <section className="panel">
        <h1>Service unavailable</h1>
        <Link href="/professionals">{t("Browse care")}</Link>
      </section>
    );
  const intake = p.intakeStage === "BEFORE_PAYMENT";
  const reserve = async () => {
    const reservation = await api("appointments", "POST", {
      serviceId: service,
      startsAt: slot,
      idempotencyKey: key,
    });
    setHeld(reservation);
    setStep("pay");
  };
  const review = () => run(reserve);
  const steps = [
    "Date & time",
    ...(!token ? ["Account"] : []),
    ...(intake ? ["Intake"] : []),
    "Review & pay",
  ];
  const expired = held?.expiresAt && Date.parse(held.expiresAt) <= now;
  const remaining = held?.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(held.expiresAt) - now) / 1000))
    : 0;
  return (
    <>
      <Link href={`/professionals/${p.id}`}>← {p.name}</Link>
      <h1>{t("Choose a time")}</h1>
      <ol className="flow-steps">
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={
              (step === "time" && i === 0) ||
              (step === "account" && label === "Account") ||
              (step === "intake" && label === "Intake") ||
              (step === "pay" && label === "Review & pay")
                ? "step"
                : undefined
            }
          >
            {i + 1}. {t(label)}
          </li>
        ))}
      </ol>
      <div className="clinical-layout">
        <section className="panel">
          {step === "time" ? (
            <>
              <h2>{t("Date & time")}</h2>
              <label>
                Day · Nepal time
                <input
                  type="date"
                  min={dayOf(new Date())}
                  max={dayOf(new Date(Date.now() + 60 * 86400000))}
                  value={day}
                  onChange={(e) => {
                    setDay(e.target.value);
                    setSlot("");
                    setHeld(null);
                    setKey(crypto.randomUUID());
                  }}
                />
              </label>
              {slots === null ? (
                <p role="status">Loading available times…</p>
              ) : slots.length === 0 ? (
                <p>No times are available. Choose another day.</p>
              ) : (
                <fieldset>
                  <legend>Available times · NPT</legend>
                  <div className="slot-grid">
                    {slots.map((s) => (
                      <label key={s} className="choice">
                        <input
                          name="slot"
                          type="radio"
                          checked={slot === s}
                          onChange={() => {
                            setSlot(s);
                            setHeld(null);
                            setKey(crypto.randomUUID());
                          }}
                        />
                        <span>{nepalTime(s, false)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <p className="workflow-note">
                Your selection is rechecked when you enter Review & pay. The
                slot is not reserved during sign-in or intake.
              </p>
              <button
                className="button"
                disabled={!slot}
                onClick={() => setStep(token ? "intake" : "account")}
              >
                {t("Continue")}
              </button>
            </>
          ) : step === "account" ? (
            <>
              <h2>{t("Account")}</h2>
              <p>
                Sign in to book. Your professional, service and selected time
                are preserved.
              </p>
              <button className="button" onClick={openAuth}>
                {t("Sign in")}
              </button>
            </>
          ) : step === "intake" ? (
            <>
              <h2>{intake ? t("Intake") : "Ready to review"}</h2>
              {intake ? (
                <IntakeForm
                  serviceId={service}
                  bookingKey={key}
                  done={reserve}
                />
              ) : (
                <>
                  <p>
                    {p.intakeStage === "AFTER_CONFIRMATION"
                      ? "Your professional requires intake after confirmation, before the session."
                      : "No intake is required during checkout."}
                  </p>
                  <button className="button" disabled={busy} onClick={review}>
                    {busy ? "Rechecking availability…" : t("Review & pay")}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <h2>{t("Review & pay")}</h2>
              {expired ? (
                <div role="status">
                  <h3>Slot reservation expired</h3>
                  <p>
                    Payment has not been confirmed. Recheck availability before
                    starting a new payment. If you already paid, open your
                    appointment to verify the payment rather than paying again.
                  </p>
                  <div className="workflow-actions">
                    <Link className="button" href={`/appointments/${held.id}`}>
                      Check payment status
                    </Link>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setStep("time");
                        setHeld(null);
                        setKey(crypto.randomUUID());
                      }}
                    >
                      Choose a time again
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="care-warning" role="timer">
                    Slot reserved · {Math.floor(remaining / 60)}:
                    {String(remaining % 60).padStart(2, "0")} remaining
                  </p>
                  <p>
                    {p.service} · {nepalTime(slot)} NPT
                  </p>
                  {(held.price ?? p.price) === 0 ? (
                    <>
                      <p>
                        Your zero-fee request was submitted without a payment
                        step.
                      </p>
                      <Link
                        className="button"
                        href={`/appointments/${held.id}`}
                      >
                        View appointment
                      </Link>
                    </>
                  ) : (
                    <PayStep
                      appointmentId={held.id}
                      amount={held.price ?? p.price}
                      provider={p.name}
                    />
                  )}
                </>
              )}
            </>
          )}
          <div className="workflow-actions">
            {step !== "time" && step !== "pay" && (
              <button className="text-button" onClick={() => setStep("time")}>
                {t("Back")}
              </button>
            )}
          </div>
        </section>
        <aside className="panel">
          <h2>{p.name}</h2>
          <p>{p.service}</p>
          <p>
            {p.duration} minutes · {money(held?.price ?? p.price)}
          </p>
          <span className="status">
            {(held?.policy?.confirmationMode ?? p.confirmationMode) ===
            "INSTANT"
              ? "Instant confirmation after payment"
              : "Approval after payment"}
          </span>
          <p className="workflow-note">
            {(held?.policy?.confirmationMode ?? p.confirmationMode) ===
            "INSTANT"
              ? "Successful payment confirms your available appointment."
              : "The professional has 60 minutes after successful payment to approve. Chatbud follows up at 30 minutes. Declined or expired paid requests create a full-refund-eligible case."}
          </p>
          <p className="workflow-note">
            Cancel a confirmed appointment at least 24 hours before the session
            for a full refund. Later cancellations are reviewed individually.
          </p>
          <Link href="/help">{t("Contact support")}</Link>
        </aside>
      </div>
    </>
  );
}
