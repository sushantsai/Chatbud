"use client";
import { useState } from "react";
import { teamRoleLabels } from "../../_lib/roles";
import { Area, useOps } from "../_components/area";
import { useLoad } from "../_components/use-load";
const roles = Object.entries(teamRoleLabels);
export default function Team() {
  const { ops, run, busy, setNotice } = useOps();
  const { data, reload } = useLoad("team_list");
  const [email, setEmail] = useState(""),
    [role, setRole] = useState("SUPPORT");
  const set = (target: string, r: string, grant: boolean) =>
    run(async () => {
      await ops("team_role_set", { email: target, role: r, grant });
      await reload();
      setNotice(
        `${teamRoleLabels[r]} ${grant ? "given to" : "removed from"} ${target}.`,
      );
    });
  return (
    <Area area="team">
      <section className="panel">
        <h2>Team members</h2>
        <p className="section-copy">
          Each role opens one area of this portal. Changes take effect the next
          time the person loads a page, and every change is recorded.
        </p>
        {!data ? (
          <p className="empty-inline" role="status">
            Loading the team…
          </p>
        ) : (
          data.members.map((m: any) => (
            <fieldset className="sharing" key={m.id}>
              <legend>
                {m.name}
                <small>
                  {m.email}
                  {m.me ? " · you" : ""}
                </small>
              </legend>
              <div>
                {roles.map(([id, label]) => (
                  <label className="choice" key={id}>
                    <input
                      type="checkbox"
                      checked={m.roles.includes(id)}
                      disabled={busy || (m.me && id === "SECURITY_ADMIN")}
                      onChange={(e) => set(m.email, id, e.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))
        )}
      </section>
      <section className="panel">
        <h2>Add someone to the team</h2>
        <p className="section-copy">
          They need a Chatbud account and must have signed in once.
        </p>
        <form
          className="goal-form"
          onSubmit={(e) => {
            e.preventDefault();
            set(email.trim(), role, true).then(() => setEmail(""));
          }}
        >
          <div className="field">
            <label htmlFor="team-email">Their account email</label>
            <input
              id="team-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="team-role">Role</label>
            <select
              id="team-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {roles.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="request-actions">
            <button className="button small" disabled={busy || !email.trim()}>
              Give role
            </button>
          </div>
        </form>
      </section>
    </Area>
  );
}
