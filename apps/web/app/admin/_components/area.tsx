"use client";
import { useApp } from "../../_components/app";
import { canOpen, type TeamArea } from "../../_lib/roles";
// Calls a team action; the server checks the caller's role for that action.
export function useOps() {
  const app = useApp();
  const ops = (action: string, data: unknown = {}) =>
    app.api("admin/ops", "POST", { action, data });
  return { ...app, ops };
}
// Shows a clear message when a team member opens an area their role does not cover.
export function Area({
  area,
  children,
}: {
  area: TeamArea;
  children: React.ReactNode;
}) {
  const { mode, dashboard } = useApp();
  if (mode === "live" && !canOpen(dashboard.roles, area))
    return (
      <section className="panel portal-login">
        <h2>Your role does not include this area</h2>
        <p className="section-copy">
          Ask an administrator if you need access to it.
        </p>
      </section>
    );
  return <>{children}</>;
}
