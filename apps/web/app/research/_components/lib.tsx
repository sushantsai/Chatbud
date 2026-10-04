"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useApp } from "../../_components/app";
import { AuthForm } from "../../_components/auth-form";

export const memberRoles: Record<string, string> = {
  LEAD: "Study lead",
  CLINICIAN: "Clinician",
  HEALTH_WORKER: "Health worker",
};
export const studyStatus: Record<string, string> = {
  DRAFT: "Being set up",
  ACTIVE: "Open",
  CLOSED: "Closed",
};
export const urgencies: Record<string, string> = {
  ROUTINE: "Routine",
  SOON: "Within a week",
  URGENT: "Urgent, today",
};
export const flagLabels: Record<string, string> = {
  SELF_HARM: "Thoughts of self-harm",
  HIGH_BP: "High blood pressure",
  VERY_HIGH_BP: "Very high blood pressure",
};
export const sexes: Record<string, string> = {
  FEMALE: "Female",
  MALE: "Male",
  OTHER: "Other",
  UNDISCLOSED: "Prefers not to say",
};

type Workspace = {
  canCreate: boolean;
  isAdmin: boolean;
  leads: any[];
  studies: any[];
  instruments: Record<string, any>;
};
const ResearchContext = createContext<{
  workspace: Workspace;
  reload: () => Promise<void>;
} | null>(null);
export const useWorkspace = () => useContext(ResearchContext)!;

// Calls a research action; the server checks study membership and role for each one.
export function useResearch() {
  const app = useApp();
  const call = (action: string, data: unknown = {}) =>
    app.api("research", "POST", { action, data });
  return { ...app, call };
}

// Loads one research dataset and returns it with a reload function.
export function useLoad<T = any>(action: string, data: Record<string, string>) {
  const { call, setError } = useResearch();
  const [value, setValue] = useState<T | null>(null);
  const [failed, setFailed] = useState("");
  const key = JSON.stringify(data);
  const reload = async () => setValue(await call(action, data));
  useEffect(() => {
    let active = true;
    call(action, data)
      .then((d) => {
        if (active) setValue(d);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setFailed(e.message);
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [action, key]);
  return { data: value, reload, failed };
}

// Everything under /research needs a signed-in account that belongs to a study,
// may set one up, or administers Chatbud. The server enforces this on every request.
export function ResearchGate({ children }: { children: React.ReactNode }) {
  const { mode, token, call, signOut, busy } = useResearch();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = async () => setWorkspace(await call("workspace"));
  useEffect(() => {
    if (mode !== "live" || !token) return;
    let active = true;
    setFailed(false);
    call("workspace")
      .then((w) => {
        if (active) setWorkspace(w);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [mode, token]);
  if (mode !== "live")
    return (
      <section className="panel portal-login">
        <h2>Research is not part of the preview</h2>
      </section>
    );
  if (!token)
    return (
      <section className="panel portal-login">
        <h2>Research sign in</h2>
        <p className="section-copy">
          For study leads and field researchers. A study lead adds you to a
          study using your Chatbud account email.
        </p>
        <AuthForm allowSignup={false} />
      </section>
    );
  if (failed)
    return (
      <section className="panel portal-login">
        <h2>We could not open the research workspace</h2>
        <p className="section-copy">
          Your sign-in may have expired. Sign out and sign in again.
        </p>
        <button className="button" disabled={busy} onClick={signOut}>
          Sign out
        </button>
      </section>
    );
  if (!workspace)
    return (
      <div className="loading" role="status">
        Checking your access…
      </div>
    );
  if (!workspace.studies.length && !workspace.canCreate && !workspace.isAdmin)
    return (
      <section className="panel portal-login">
        <h2>This account is not part of a study</h2>
        <p className="section-copy">
          Ask your study lead to add this account’s email to the study, then
          sign in again.
        </p>
        <button className="button" disabled={busy} onClick={signOut}>
          Sign out
        </button>
      </section>
    );
  return (
    <ResearchContext.Provider value={{ workspace, reload }}>
      {children}
    </ResearchContext.Provider>
  );
}
