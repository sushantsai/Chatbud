"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  CalendarCheck,
  Check,
  ClipboardList,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useApp } from "../../_components/app";
import { AuthForm } from "../../_components/auth-form";
import { ApplicationForm } from "./application";
type Pro = { workspace: any; reload: () => Promise<void> };
const ProContext = createContext<Pro | null>(null);
export function usePro() {
  const pro = useContext(ProContext);
  if (!pro) throw new Error("usePro must be used inside ProGate");
  return pro;
}
const stages = [
  ["Submitted", "We have your application and documents."],
  ["Under review", "We verify your identity, qualifications and registration."],
  ["Decision", "Your written outcome appears in Chatbud."],
];
// Everything under /pro passes through here: sign-in, then application, then the practice pages.
export function ProGate({ children }: { children: React.ReactNode }) {
  const {
    mode,
    token,
    dashboard,
    api,
    setError,
    signOut,
    busy,
    run,
    setNotice,
  } = useApp();
  const [workspace, setWorkspace] = useState<any>(null),
    [failed, setFailed] = useState(false);
  const live = mode === "live";
  // Each appointment carries its payment state, so unpaid requests can be held back.
  const load = async () => {
    const [data, pay] = await Promise.all([
      api("provider/workspace"),
      api("pay/status").catch(() => ({ appointments: [] })),
    ]);
    const paid = Object.fromEntries(
      pay.appointments.map((a: any) => [a.id, a.paymentStatus]),
    );
    return data.appointments
      ? {
          ...data,
          appointments: data.appointments.map((a: any) => ({
            ...a,
            paymentStatus: paid[a.id],
          })),
        }
      : data;
  };
  const reload = async () => setWorkspace(await load());
  // Reloads whenever the application status changes, including right after applying.
  const applied = dashboard.providerApplication?.status;
  useEffect(() => {
    if (!live || !token) return;
    let active = true;
    load()
      .then((data) => {
        if (active) setWorkspace(data);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setError(e.message);
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [live, token, applied]);
  if (live && !token)
    return (
      <div className="pro-entry">
        <section className="pro-entry-pitch">
          <h1>Your practice, online and paid upfront.</h1>
          <p className="pro-entry-lede">
            Chatbud connects verified mental-health, nutrition and fitness
            professionals with clients across Nepal. You set the services, fees
            and hours; clients pay when they book.
          </p>
          <ul className="pro-benefits">
            <li>
              <Wallet size={20} />
              <div>
                <strong>Requests arrive paid</strong>
                <span>
                  Clients pay online when they book, before the request reaches
                  you. You approve it, then the time is theirs.
                </span>
              </div>
            </li>
            <li>
              <CalendarCheck size={20} />
              <div>
                <strong>Your calendar, kept in step</strong>
                <span>
                  Connect Google Calendar: confirmed sessions appear with their
                  video link, and your busy times are never offered.
                </span>
              </div>
            </li>
            <li>
              <ClipboardList size={20} />
              <div>
                <strong>Notes and care plans in one place</strong>
                <span>
                  Intake answers, private notes and plans you publish to the
                  client. Records are shared only as each client allows.
                </span>
              </div>
            </li>
          </ul>
          <div className="pro-joining">
            <h2>How joining works</h2>
            <ol>
              <li>
                <strong>Apply</strong>
                <span>
                  About 12 minutes. Have your government photo ID, highest
                  qualification and registration certificate ready.
                </span>
              </li>
              <li>
                <strong>Get verified</strong>
                <span>
                  We confirm identity, qualifications and registration with the
                  bodies that issued them. Feedback within 2 Nepal working
                  days.
                </span>
              </li>
              <li>
                <strong>Go live</strong>
                <span>
                  Add a service and your weekly hours, and your profile appears
                  in the Chatbud directory.
                </span>
              </li>
            </ol>
          </div>
        </section>
        <section className="pro-entry-signin" aria-labelledby="pro-signin">
          <h2 id="pro-signin">Sign in to your practice</h2>
          <p>New to Chatbud? Create an account below, then apply.</p>
          <AuthForm />
          <p className="pro-entry-note">
            Looking for care for yourself?{" "}
            <a href="/">Go to Chatbud for clients</a>
          </p>
        </section>
      </div>
    );
  if (live && !workspace && failed)
    return (
      <section className="panel portal-login">
        <h2>We could not open your practice</h2>
        <p className="section-copy">
          Your sign-in may have expired. Sign out, then sign in again.
        </p>
        <button className="button" disabled={busy} onClick={signOut}>
          Sign out
        </button>
      </section>
    );
  if (live && !workspace)
    return (
      <div className="loading" role="status">
        Loading your practice…
      </div>
    );
  const status = live ? workspace.status : applied;
  if (live && status === "APPROVED")
    return (
      <ProContext.Provider value={{ workspace, reload }}>
        {children}
      </ProContext.Provider>
    );
  if (status && !["APPLIED", "REJECTED"].includes(status)) {
    const stage = status === "UNDER_REVIEW" ? 1 : 2;
    return (
      <section className="panel application-progress">
        <h2>
          {status === "SUSPENDED"
            ? "Your profile is suspended"
            : "Your application is being reviewed"}
        </h2>
        <p className="section-copy">
          {status === "SUSPENDED"
            ? "Contact Chatbud support to discuss your profile."
            : "Your profile is not published yet. You do not need to do anything unless we contact you."}
        </p>
        <ol>
          {stages.map(([title, copy], i) => (
            <li
              key={title}
              className={i < stage ? "done" : i === stage ? "current" : ""}
            >
              <span className="step-mark">
                {i < stage ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              <div>
                <strong>{title}</strong>
                <p>{copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }
  return (
    <>
      {(status === "REJECTED" ||
        workspace?.caseStatus === "NEEDS_INFORMATION") && (
        <div className="application-status">
          <ShieldCheck size={19} />
          <div>
            <strong>
              {status === "REJECTED"
                ? "Your previous application was not approved"
                : "We need more information to continue"}
            </strong>
            <p>
              {workspace?.rationale ||
                "You can update your details and apply again."}
            </p>
            {workspace?.rationale && (
              <p>Update your details below and submit again.</p>
            )}
          </div>
        </div>
      )}
      {workspace?.corrections?.length > 0 && (
        <section className="panel">
          <h3>Requested corrections</h3>
          {workspace.corrections.map((c: any, i: number) => (
            <p key={i}>
              <strong>{c.field}</strong> · {c.reason}
            </p>
          ))}
          <p>Accepted fields and documents remain saved.</p>
        </section>
      )}
      {workspace?.caseStatus === "REJECTED" && (
        <section className="panel">
          <h3>Request human re-review</h3>
          <p>
            You may provide clarification or new evidence. Approval remains a
            human decision.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const reason = String(
                new FormData(e.currentTarget).get("reason") || "",
              );
              run(async () => {
                await api("workflow", "POST", {
                  action: "rereview_request",
                  data: { reason },
                });
                setNotice(
                  "Human re-review requested. Feedback target: 2 Nepal working days.",
                );
                setWorkspace(await api("provider/workspace"));
              });
            }}
          >
            <label>
              Clarification
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={2000}
              />
            </label>
            <button className="button" disabled={busy}>
              Request re-review
            </button>
          </form>
        </section>
      )}
      <ApplicationForm />
    </>
  );
}
