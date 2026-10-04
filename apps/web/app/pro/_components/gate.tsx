"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { Check, FileText, ShieldCheck, Timer } from "lucide-react";
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
  ["Decision", "You will hear from us by email with the outcome."],
];
// Everything under /pro passes through here: sign-in, then application, then the practice pages.
export function ProGate({ children }: { children: React.ReactNode }) {
  const { mode, token, dashboard, api, setError, signOut, busy } = useApp();
  const [workspace, setWorkspace] = useState<any>(null),
    [failed, setFailed] = useState(false);
  const live = mode === "live";
  const reload = async () => setWorkspace(await api("provider/workspace"));
  // Reloads whenever the application status changes, including right after applying.
  const applied = dashboard.providerApplication?.status;
  useEffect(() => {
    if (!live || !token) return;
    let active = true;
    api("provider/workspace")
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
      <div className="portal-entry">
        <section className="apply-intro">
          <h2>Join Chatbud as a verified professional</h2>
          <p>
            Every professional on Chatbud is verified before their profile is
            published. The application takes about 12 minutes.
          </p>
          <ul>
            <li>
              <FileText size={18} />
              <span>
                <strong>Have these ready</strong>
                Government photo ID, your highest qualification certificate, and
                your registration certificate if your profession has one.
              </span>
            </li>
            <li>
              <ShieldCheck size={18} />
              <span>
                <strong>What we check</strong>
                Identity, qualifications and registration, confirmed with the
                bodies that issued them.
              </span>
            </li>
            <li>
              <Timer size={18} />
              <span>
                <strong>What happens next</strong>A reviewer assesses your
                application and emails you the outcome.
              </span>
            </li>
          </ul>
        </section>
        <section className="panel portal-login">
          <h2>Professional sign in</h2>
          <p className="section-copy">
            Sign in to your practice, or create an account to apply.
          </p>
          <AuthForm />
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
      <ApplicationForm />
    </>
  );
}
