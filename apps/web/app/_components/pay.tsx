"use client";
import { useEffect, useState } from "react";
import { useApp } from "./app";
import { money } from "./ui";

export const paymentLabels: Record<string, string> = {
  UNPAID: "Payment needed",
  PAY_LATER: "Pay before your session",
  PAID: "Paid",
  REFUND_DUE: "Refund being processed",
  REFUNDED: "Refunded",
  NOT_REFUNDED: "Not refundable",
};

// Payment state of each of the signed-in person's appointments, by appointment id.
export function usePayStatuses(enabled: boolean) {
  const { api } = useApp();
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const reload = async () => {
    const { appointments } = await api("pay/status");
    setStatuses(
      Object.fromEntries(appointments.map((a: any) => [a.id, a.paymentStatus])),
    );
  };
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    api("pay/status")
      .then(({ appointments }) => {
        if (active)
          setStatuses(
            Object.fromEntries(
              appointments.map((a: any) => [a.id, a.paymentStatus]),
            ),
          );
      })
      // Appointments still show without payment labels if this fails.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled]);
  return { statuses, reload };
}

// Sends the browser to eSewa with the signed form the server prepared.
function postForm(url: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

// Choose how to pay for one requested appointment.
export function PayStep({
  appointmentId,
  amount,
  provider,
  done,
}: {
  appointmentId: string;
  amount: number;
  provider: string;
  // Called when no redirect is needed: the client chose to pay later.
  done: () => void;
}) {
  const { api, run, busy, error, setNotice } = useApp();
  const [methods, setMethods] = useState<any[] | null>(null),
    [method, setMethod] = useState(""),
    [leaving, setLeaving] = useState(false);
  // One key per payment attempt, so a double tap cannot start two payments.
  const [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let active = true;
    api("pay/methods")
      .then((data) => {
        if (!active) return;
        setMethods(data.methods);
        setMethod(data.methods.find((m: any) => m.available)?.id || "");
      })
      .catch(() => active && setMethods([]));
    return () => {
      active = false;
    };
  }, []);
  const chosen = methods?.find((m) => m.id === method);
  return (
    <form
      className="pay-step"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const started = await api("pay/start", "POST", {
            appointmentId,
            gateway: method,
            idempotencyKey: key,
          });
          if (started.payLater) {
            setNotice(
              `Request sent to ${provider}. Please pay Chatbud before your session.`,
            );
            return done();
          }
          setLeaving(true);
          if (started.redirect) window.location.assign(started.redirect);
          else postForm(started.form.url, started.form.fields);
        });
      }}
    >
      <p className="pay-amount">
        <span>To pay</span>
        <strong>{money(amount)}</strong>
      </p>
      {methods === null ? (
        <p className="empty-inline" role="status">
          Loading payment methods…
        </p>
      ) : (
        <fieldset>
          <legend>How would you like to pay?</legend>
          {methods.map((m) => (
            <label
              key={m.id}
              className={`choice method${m.available ? "" : " unavailable"}`}
            >
              <input
                type="radio"
                name="method"
                disabled={!m.available}
                checked={method === m.id}
                onChange={() => setMethod(m.id)}
              />
              <span>
                <strong>{m.label}</strong>
                <small>{m.detail}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {chosen?.test && (
        <p className="test-mode" role="note">
          Test mode: {chosen.label} is using its practice system. No real money
          moves.
        </p>
      )}
      <p className="form-note">
        Your time is held for 30 minutes while you pay. {provider} then has 24
        hours to confirm. If they cannot, or you cancel at least 24 hours before
        the session, you are refunded in full.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button full" disabled={busy || leaving || !method}>
        {leaving
          ? `Taking you to ${chosen?.label}…`
          : method === "LATER"
            ? "Send request and pay later"
            : `Pay ${money(amount)}`}
      </button>
    </form>
  );
}
