"use client";
import { useState } from "react";
import { useApp } from "../../_components/app";
import { money, professions } from "../../_components/ui";
import { usePro } from "./gate";
const stages = [
  "Basics",
  "Booking & Intake",
  "Availability",
  "Preview & Publish",
];
type Service = {
  id?: string;
  profession: string;
  title: string;
  durationMinutes: number;
  price: number;
  active: boolean;
  confirmationMode: "INSTANT" | "APPROVAL";
  minimumNoticeMinutes: number;
  intakeStage: "NONE" | "BEFORE_PAYMENT" | "AFTER_CONFIRMATION";
  intakeQuestions: { id: string; label: string; required: boolean }[];
};
export function ServiceWizard() {
  const { api, run, busy, setNotice } = useApp();
  const { workspace, reload } = usePro();
  const [draft, setDraft] = useState<Service | null>(null),
    [step, setStep] = useState(0);
  const edit = (s: Partial<Service> = {}) => {
    setDraft({
      profession: workspace.professions[0],
      title: "",
      durationMinutes: 45,
      price: 0,
      active: false,
      confirmationMode: "APPROVAL",
      minimumNoticeMinutes: 240,
      intakeStage: "NONE",
      intakeQuestions: [],
      ...s,
    });
    setStep(0);
  };
  const save = (publish: boolean) =>
    run(async () => {
      if (!draft) return;
      const result = await api("provider/service", "POST", {
        ...draft,
        active: publish,
      });
      await reload();
      setNotice(
        publish
          ? "Service published. Existing bookings retain their agreed terms."
          : "Service draft saved to your account.",
      );
      if (publish) setDraft(null);
      else setDraft({ ...draft, id: result.id, active: false });
    });
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Services</h2>
        <button className="button small" onClick={() => edit()}>
          New service
        </button>
      </div>
      {workspace.services.map((s: Service) => (
        <article className="service-card" key={s.id}>
          <h3>{s.title}</h3>
          <p>
            {s.durationMinutes} min · {money(s.price)} ·{" "}
            {s.active ? "Published" : "Draft / hidden"}
          </p>
          <span className="status">
            {s.confirmationMode === "INSTANT"
              ? "Instant after payment"
              : "Approval after payment"}
          </span>
          <footer>
            <button className="button secondary" onClick={() => edit(s)}>
              Edit service
            </button>
          </footer>
        </article>
      ))}
      {draft && (
        <div>
          <ol className="flow-steps">
            {stages.map((name, i) => (
              <li key={name} aria-current={i === step ? "step" : undefined}>
                {i + 1}. {name}
              </li>
            ))}
          </ol>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 3) setStep(step + 1);
              else save(true);
            }}
          >
            {step === 0 ? (
              <>
                <label>
                  Service title
                  <input
                    minLength={3}
                    maxLength={120}
                    required
                    value={draft.title}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Approved scope
                  <select
                    value={draft.profession}
                    onChange={(e) =>
                      setDraft({ ...draft, profession: e.target.value })
                    }
                  >
                    {workspace.professions.map((p: string) => (
                      <option value={p} key={p}>
                        {professions[p] || p}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Duration in minutes
                  <input
                    type="number"
                    min={15}
                    max={180}
                    step={5}
                    value={draft.durationMinutes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        durationMinutes: Number(e.target.value),
                      })
                    }
                    required
                  />
                </label>
                <label>
                  Fee · NPR
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    required
                    value={draft.price}
                    onChange={(e) =>
                      setDraft({ ...draft, price: Number(e.target.value) })
                    }
                  />
                </label>
              </>
            ) : step === 1 ? (
              <>
                <label>
                  Booking confirmation
                  <select
                    value={draft.confirmationMode}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        confirmationMode: e.target
                          .value as Service["confirmationMode"],
                        minimumNoticeMinutes:
                          e.target.value === "APPROVAL"
                            ? Math.max(draft.minimumNoticeMinutes, 240)
                            : Math.max(draft.minimumNoticeMinutes, 60),
                      })
                    }
                  >
                    <option value="APPROVAL">
                      Professional approval after full payment
                    </option>
                    <option value="INSTANT">
                      Instant confirmation after full payment
                    </option>
                  </select>
                </label>
                <label>
                  Minimum notice · minutes
                  <input
                    required
                    type="number"
                    min={draft.confirmationMode === "APPROVAL" ? 240 : 60}
                    max={43200}
                    value={draft.minimumNoticeMinutes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        minimumNoticeMinutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Required intake stage
                  <select
                    value={draft.intakeStage}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        intakeStage: e.target.value as Service["intakeStage"],
                      })
                    }
                  >
                    <option value="NONE">No required intake</option>
                    <option value="BEFORE_PAYMENT">Before payment</option>
                    <option value="AFTER_CONFIRMATION">
                      After confirmation, before session
                    </option>
                  </select>
                </label>
                {draft.intakeStage !== "NONE" && (
                  <>
                    <p className="workflow-note">
                      Only you can read the clinical answers internally. Support
                      sees completion status.
                    </p>
                    {draft.intakeQuestions.map((q, i) => (
                      <label key={q.id}>
                        Question {i + 1}
                        <input
                          required
                          maxLength={240}
                          value={q.label}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              intakeQuestions: draft.intakeQuestions.map(
                                (v, j) =>
                                  j === i ? { ...v, label: e.target.value } : v,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      className="button secondary"
                      disabled={draft.intakeQuestions.length >= 30}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          intakeQuestions: [
                            ...draft.intakeQuestions,
                            {
                              id: crypto.randomUUID(),
                              label: "",
                              required: true,
                            },
                          ],
                        })
                      }
                    >
                      Add required question
                    </button>
                  </>
                )}
              </>
            ) : step === 2 ? (
              <>
                <h3>Chatbud availability</h3>
                <p>
                  Services use the weekly hours and blocked time set below. Save
                  a draft before adjusting hours; return to edit when ready.
                </p>
                <p>
                  {workspace.availability.length} weekly availability periods
                  configured.
                </p>
                <p className="workflow-note">
                  Google Calendar is optional. A connection warning does not
                  pause new bookings: Chatbud availability remains
                  authoritative.
                </p>
              </>
            ) : (
              <article className="service-card">
                <h3>{draft.title}</h3>
                <p>
                  {professions[draft.profession]} · {draft.durationMinutes}{" "}
                  minutes · {money(draft.price)}
                </p>
                <p>
                  {draft.confirmationMode === "INSTANT"
                    ? "Instant confirmation after payment"
                    : "Approval after payment: call escalation at 30 minutes; expiry at 60 minutes"}
                </p>
                <p>Minimum notice: {draft.minimumNoticeMinutes / 60} hours</p>
                <p>Intake: {draft.intakeStage.replaceAll("_", " ")}</p>
                <button type="button" className="button" disabled>
                  Choose a time · client preview
                </button>
              </article>
            )}
            <div className="workflow-actions">
              {step > 0 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </button>
              )}
              <button
                className="button"
                disabled={
                  busy || (step === 3 && workspace.availability.length === 0)
                }
              >
                {step === 3 ? "Publish service" : "Continue"}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || draft.title.trim().length < 3}
                onClick={() => save(false)}
              >
                Save draft
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setDraft(null)}
              >
                Close
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
