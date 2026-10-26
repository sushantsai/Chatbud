"use client";
import { useEffect, useState } from "react";
import { useApp } from "./app";
export function IntakeForm({
  serviceId,
  appointmentId,
  bookingKey,
  done,
  parentId,
}: {
  serviceId: string;
  appointmentId?: string;
  bookingKey?: string;
  parentId?: string;
  done: () => void | Promise<void>;
}) {
  const { api, run, busy } = useApp();
  const [form, setForm] = useState<any>(null),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [failed, setFailed] = useState("");
  useEffect(() => {
    let active = true;
    api("workflow", "POST", {
      action: "intake_form",
      data: {
        serviceId,
        ...(appointmentId ? { appointmentId } : {}),
        ...(bookingKey ? { bookingKey } : {}),
      },
    })
      .then((d) => active && setForm(d))
      .catch((e) => active && setFailed(e.message));
    return () => {
      active = false;
    };
  }, [serviceId]);
  if (failed) return <p role="alert">{failed}</p>;
  if (!form) return <p role="status">Loading intake requirements…</p>;
  if (form.submitted && !parentId)
    return (
      <div>
        <p>Your intake is submitted. The original is preserved.</p>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await done();
            })
          }
        >
          Continue
        </button>
      </div>
    );
  const questions = parentId
    ? [
        {
          id: "update",
          label: "Dated correction or new information",
          required: true,
        },
      ]
    : form.questions;
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await api("workflow", "POST", {
            action: "intake_submit",
            data: {
              serviceId,
              ...(bookingKey ? { bookingKey } : {}),
              ...(appointmentId ? { appointmentId } : {}),
              ...(parentId ? { parentId } : {}),
              answers,
            },
          });
          await done();
        });
      }}
    >
      <p className="care-warning">
        Your answers are shared internally only with the assigned professional.
        Booking support and booking AI see completion status and scheduling
        details.
      </p>
      {questions.length === 0 ? (
        <label>
          Information for your professional
          <textarea
            required
            value={answers.summary || ""}
            onChange={(e) => setAnswers({ summary: e.target.value })}
          />
        </label>
      ) : (
        questions.map((q: any) => (
          <label key={q.id}>
            {q.label}
            {q.required ? " *" : " (optional)"}
            <textarea
              required={q.required}
              maxLength={8000}
              value={answers[q.id] || ""}
              onChange={(e) =>
                setAnswers({ ...answers, [q.id]: e.target.value })
              }
            />
          </label>
        ))
      )}
      <button className="button" disabled={busy}>
        Submit intake
      </button>
    </form>
  );
}
