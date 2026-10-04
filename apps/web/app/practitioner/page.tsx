"use client";
import { Check, FileText, ShieldCheck, Timer } from "lucide-react";
import { useApp } from "../_components/app";
import { SignInPrompt } from "../_components/ui";
import { ApplicationForm } from "./application";
const stages = [
  ["Submitted", "We have your application and documents."],
  ["Under review", "We verify your identity, qualifications and registration."],
  ["Decision", "You will hear from us by email with the outcome."],
];
export default function Practitioner() {
  const { mode, token, dashboard, openAuth } = useApp();
  if (mode === "live" && !token)
    return (
      <>
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
        <SignInPrompt open={openAuth}>
          Sign in or create an account to start your application.
        </SignInPrompt>
      </>
    );
  const status = dashboard.providerApplication?.status;
  if (status && !["APPLIED", "REJECTED"].includes(status)) {
    const stage = status === "UNDER_REVIEW" ? 1 : 2;
    return (
      <section className="panel application-progress">
        <h2>
          {status === "APPROVED"
            ? "Your application is approved"
            : status === "SUSPENDED"
              ? "Your profile is suspended"
              : "Your application is being reviewed"}
        </h2>
        <p className="section-copy">
          {status === "APPROVED"
            ? "Your professional scope has been approved."
            : status === "SUSPENDED"
              ? "Contact Chatbud support to discuss your profile."
              : "Your profile is not published yet. You do not need to do anything unless we contact you."}
        </p>
        <ol>
          {stages.map(([title, copy], i) => (
            <li
              key={title}
              className={
                i < stage || status === "APPROVED"
                  ? "done"
                  : i === stage
                    ? "current"
                    : ""
              }
            >
              <span className="step-mark">
                {i < stage || status === "APPROVED" ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  i + 1
                )}
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
      {status === "REJECTED" && (
        <div className="application-status">
          <ShieldCheck size={19} />
          <div>
            <strong>Your previous application was not approved</strong>
            <p>You can update your details and apply again.</p>
          </div>
        </div>
      )}
      <ApplicationForm />
    </>
  );
}
