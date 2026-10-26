"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../../_components/app";
import { useLanguage } from "../../_components/language";
import { IntakeForm } from "../../_components/intake";
import { PayStep } from "../../_components/pay";
import { SignInPrompt, money, nepalTime } from "../../_components/ui";
export default function Appointment({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { api, token, openAuth, run, busy, setError, setNotice } = useApp();
  const { t } = useLanguage();
  const [a, setA] = useState<any>(null),
    [intake, setIntake] = useState(false),
    [pay, setPay] = useState(false),
    [now, setNow] = useState(Date.now());
  const load = async () =>
    setA(
      await api("workflow", "POST", {
        action: "appointment_detail",
        data: { id },
      }),
    );
  useEffect(() => {
    if (!token) return;
    let active = true;
    const reload = () =>
      api("workflow", "POST", { action: "appointment_detail", data: { id } })
        .then((d) => active && setA(d))
        .catch((e) => active && setError(e.message));
    reload();
    const timer = setInterval(reload, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, token]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in to view this appointment.
      </SignInPrompt>
    );
  if (!a) return <p role="status">Loading appointment…</p>;
  const active = ["HELD", "CONFIRMED"].includes(a.status);
  const awaitingReplacement =
    a.status === "CANCELLED" &&
    a.cases.some(
      (c: any) =>
        c.title ===
          "Client chose replacement after professional cancellation" &&
        !["RESOLVED", "CLOSED"].includes(c.status),
    );
  const status = awaitingReplacement
    ? "Rescheduling requested"
    : a.refund?.status === "SUCCEEDED"
      ? "Refund completed"
      : a.refund
        ? a.refund.eligibility === "ELIGIBLE"
          ? "Refund eligible"
          : "Refund under review"
        : a.status === "HELD"
          ? a.paymentStatus === "UNPAID"
            ? "Payment needed"
            : "Awaiting approval"
          : a.status === "CONFIRMED"
            ? "Confirmed"
            : a.status.replaceAll("_", " ");
  const contact = (action: string) => {
    const note = window.prompt(
      "Describe what you need. Please keep clinical details in your intake.",
    );
    if (note)
      run(async () => {
        await api("workflow", "POST", { action, data: { id, note } });
        await load();
        setNotice("Chatbud has received your request.");
      });
  };
  return (
    <>
      <Link href={a.isClient ? "/appointments" : "/pro/appointments"}>
        ← {t("Appointments")}
      </Link>
      <h1>{t("Appointment details")}</h1>
      {a.proposedStartsAt && (
        <section className="panel">
          <h2>Replacement time offered</h2>
          <p>{nepalTime(a.proposedStartsAt)} NPT</p>
          <p>
            Your original confirmed time remains valid until you accept the
            replacement.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("appointments/reschedule", "POST", {
                  id,
                  accept: true,
                });
                await load();
              })
            }
          >
            Accept replacement
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("appointments/reschedule", "POST", {
                  id,
                  accept: false,
                });
                await load();
              })
            }
          >
            Keep current arrangement
          </button>
        </section>
      )}
      {a.status === "CANCELLED" &&
        !awaitingReplacement &&
        a.refund?.eligibility === "REVIEW" &&
        a.refund?.reason?.startsWith("Professional cancelled") && (
          <section className="panel">
            <h2>Your professional cancelled</h2>
            <p>
              Choose a full refund or let Chatbud arrange a replacement with
              your consent. A professional change does not use your free
              reschedule.
            </p>
            {["REFUND", "RESCHEDULE"].map((choice) => (
              <button
                key={choice}
                className="button secondary"
                onClick={() =>
                  run(async () => {
                    await api("workflow", "POST", {
                      action: "cancellation_choice",
                      data: { id, choice },
                    });
                    await load();
                  })
                }
              >
                {choice === "REFUND" ? "Full refund" : "Help me reschedule"}
              </button>
            ))}
          </section>
        )}
      <div className="clinical-layout">
        <section>
          <div className="workflow-status">
            <h2>{t(status)}</h2>
            <p>
              {a.provider} · {a.service}
            </p>
            <dl className="clinical-summary">
              <div>
                <dt>Session · Nepal time</dt>
                <dd>{nepalTime(a.startsAt)} NPT</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{money(a.refund?.amount ?? a.price)}</dd>
              </div>
              <div>
                <dt>Next action / deadline</dt>
                <dd>
                  {a.refund
                    ? a.refund.status === "SUCCEEDED"
                      ? `Completed ${a.refund.completedOn || ""}`
                      : a.refund.initiateBy
                        ? `Finance initiates by ${nepalTime(a.refund.initiateBy)} NPT`
                        : "Awaiting authorized review"
                    : a.status === "HELD"
                      ? a.paymentStatus === "UNPAID"
                        ? `Pay by ${nepalTime(a.expiresAt)} NPT`
                        : `Approval by ${nepalTime(a.approvalDueAt || a.expiresAt)} NPT`
                      : a.status === "CONFIRMED"
                        ? "Prepare for your session"
                        : "Contact support if you need help"}
                </dd>
              </div>
            </dl>
            {a.refund &&
              !awaitingReplacement &&
              a.refund.status !== "SUCCEEDED" && (
                <p className="workflow-note">
                  A refund case has been created. Finance processes eligible
                  refunds manually; gateway settlement time is separate. A case
                  does not mean the money has already been returned.
                </p>
              )}
            {a.status === "HELD" && a.paymentStatus === "PAID" && (
              <p className="workflow-note">
                Chatbud follows up by phone at 30 minutes. If approval is not
                received within 60 minutes after payment, the request expires
                and a full-refund case is created.
              </p>
            )}
            <div className="workflow-actions">
              {a.status === "CONFIRMED" &&
                (now >= Date.parse(a.joinOpensAt) &&
                now <= Date.parse(a.endsAt) ? (
                  <button
                    className="button"
                    onClick={() =>
                      run(async () => {
                        const { url } = await api("workflow", "POST", {
                          action: "join",
                          data: { id },
                        });
                        window.location.assign(url);
                      })
                    }
                  >
                    {t("Join session")}
                  </button>
                ) : (
                  <button className="button" disabled>
                    Join opens 10 minutes before start
                  </button>
                ))}
              {a.status === "HELD" &&
                a.paymentStatus === "UNPAID" &&
                Date.parse(a.expiresAt) > now && (
                  <button className="button" onClick={() => setPay(!pay)}>
                    Pay now
                  </button>
                )}
              <button
                className="button secondary"
                onClick={() => contact("coordination")}
              >
                {t("Contact support")}
              </button>
            </div>
          </div>
          {pay && (
            <section className="panel">
              <PayStep
                appointmentId={id}
                amount={a.price}
                provider={a.provider}
              />
            </section>
          )}
          {!a.isClient && a.status === "HELD" && a.paymentStatus === "PAID" && (
            <section className="panel">
              <h2>Review paid request</h2>
              <p>
                {a.client} · {nepalTime(a.startsAt)} NPT
              </p>
              <p className="workflow-note">
                Confirm only if you can attend. Declining creates the eligible
                refund case.
              </p>
              <div className="workflow-actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("provider/appointments", "POST", {
                        id,
                        decision: "CONFIRM",
                      });
                      await load();
                    })
                  }
                >
                  Accept request
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Decline this paid request and create its refund case?",
                      )
                    )
                      run(async () => {
                        await api("provider/appointments", "POST", {
                          id,
                          decision: "DECLINE",
                        });
                        await load();
                      });
                  }}
                >
                  Decline request
                </button>
              </div>
            </section>
          )}
          <section className="panel">
            <h2>Preparation</h2>
            {a.policy?.intakeStage && a.policy.intakeStage !== "NONE" ? (
              <>
                <p>
                  {a.intakeComplete ? "Intake submitted" : "Intake incomplete"}.
                  Only your assigned professional can read your answers
                  internally.
                </p>
                {!a.intakeComplete &&
                  a.status === "CONFIRMED" &&
                  a.isClient && (
                    <button className="button" onClick={() => setIntake(true)}>
                      Complete intake
                    </button>
                  )}
                {intake && (
                  <IntakeForm
                    serviceId={a.serviceId}
                    appointmentId={id}
                    done={() => {
                      setIntake(false);
                      load();
                    }}
                  />
                )}
              </>
            ) : (
              <p>No required intake is listed.</p>
            )}
          </section>
          <details className="panel workflow-timeline">
            <summary>{t("Detailed timeline")}</summary>
            <ol>
              {a.timeline.map((e: any, i: number) => (
                <li key={i}>
                  {e.event.replaceAll("_", " ")}
                  <time>{nepalTime(e.at)} NPT</time>
                </li>
              ))}
            </ol>
          </details>
        </section>
        <aside className="panel">
          <h3>Manage appointment</h3>
          <p className="workflow-note">
            Chatbud coordinates all booking changes. Your original time remains
            valid until a replacement is confirmed.
          </p>
          {active && Date.parse(a.startsAt) > now && (
            <>
              <button
                className="text-button"
                onClick={() => {
                  if (
                    window.confirm(
                      a.status === "HELD"
                        ? "Cancel this request? A paid request awaiting approval is eligible for a full refund."
                        : "Cancel this appointment? Refund eligibility depends on the 24-hour notice rule.",
                    )
                  )
                    run(async () => {
                      await api("appointments/cancel", "POST", { id });
                      await load();
                      setNotice(
                        "Cancellation recorded. Any eligible refund appears in your case progress.",
                      );
                    });
                }}
              >
                Cancel {a.status === "HELD" ? "request" : "appointment"}
              </button>
              {a.status === "CONFIRMED" && (
                <button
                  className="text-button"
                  onClick={() => contact("reschedule_request")}
                >
                  {t("Request reschedule")}
                </button>
              )}
            </>
          )}
          <button
            className="text-button"
            onClick={() => contact("session_incident")}
          >
            Report attendance or technical issue
          </button>
          <h3>Case progress</h3>
          {a.cases.length === 0 ? (
            <p className="workflow-note">No open coordination cases.</p>
          ) : (
            a.cases.map((c: any) => (
              <div className="service-card" key={c.id}>
                <strong>{c.title}</strong>
                <p>{c.status.replaceAll("_", " ")}</p>
              </div>
            ))
          )}
        </aside>
      </div>
    </>
  );
}
