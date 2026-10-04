"use client";
import { useApp } from "../../_components/app";
import { AuthForm } from "../../_components/auth-form";
// Everything under /admin requires a signed-in team member with a reviewer role.
// The server enforces the same rule on every request; this only decides what to show.
export function TeamGate({ children }: { children: React.ReactNode }) {
  const { mode, token, allowAdmin, dashboardLoaded, signOut, busy } = useApp();
  if (mode === "live" && !token)
    return (
      <section className="panel portal-login">
        <h2>Team sign in</h2>
        <p className="section-copy">
          For Chatbud’s review and operations team. Accounts are created by an
          administrator.
        </p>
        <AuthForm allowSignup={false} />
      </section>
    );
  if (mode === "live" && !dashboardLoaded)
    return (
      <div className="loading" role="status">
        Checking your access…
      </div>
    );
  if (!allowAdmin)
    return (
      <section className="panel portal-login">
        <h2>This account is not part of the Chatbud team</h2>
        <p className="section-copy">
          Sign out and use a team account, or ask an administrator to give this
          account a reviewer role.
        </p>
        <button className="button" disabled={busy} onClick={signOut}>
          Sign out
        </button>
      </section>
    );
  return <>{children}</>;
}
