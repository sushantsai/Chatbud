"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
  memberRoles,
  studyStatus,
  useResearch,
  useWorkspace,
} from "./_components/lib";
export default function Studies() {
  const { workspace, reload } = useWorkspace();
  const { call, run, busy, setNotice } = useResearch();
  const [study, setStudy] = useState({ code: "", title: "" }),
    [email, setEmail] = useState("");
  const setLead = (address: string, grant: boolean) =>
    run(async () => {
      await call("lead_set", { email: address, grant });
      await reload();
      setEmail("");
      setNotice(grant ? "Research lead added." : "Research lead removed.");
    });
  return (
    <>
      <section className="panel">
        <h2>Your studies</h2>
        {workspace.studies.length === 0 ? (
          <p className="empty-inline">
            {workspace.canCreate
              ? "No studies yet. Set one up below."
              : "You are not part of a study yet."}
          </p>
        ) : (
          workspace.studies.map((s) => (
            <Link
              className="record product-link"
              href={`/research/${s.id}`}
              key={s.id}
            >
              <span className="record-icon">{s.code}</span>
              <div>
                <strong>{s.title}</strong>
                <p>
                  {memberRoles[s.role]} · {s.participants} participants ·{" "}
                  {s.openReferrals} open referrals
                </p>
              </div>
              <span className={`status status-${s.status.toLowerCase()}`}>
                {studyStatus[s.status]}
              </span>
              <ArrowRight size={16} />
            </Link>
          ))
        )}
      </section>
      {workspace.canCreate && (
        <section className="panel">
          <h2>Set up a study</h2>
          <p className="section-copy">
            A new study starts as a draft. It can enrol participants only after
            you record its ethics approval and consent wording.
          </p>
          <form
            className="goal-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await call("study_save", {
                  code: study.code.trim(),
                  title: study.title.trim(),
                });
                await reload();
                setStudy({ code: "", title: "" });
                setNotice("Study created as a draft.");
              });
            }}
          >
            <div className="field">
              <label htmlFor="study-title">Study title</label>
              <input
                id="study-title"
                required
                minLength={3}
                maxLength={160}
                value={study.title}
                onChange={(e) => setStudy({ ...study, title: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="study-code">Short code</label>
              <input
                id="study-code"
                required
                pattern="[A-Za-z]{2,6}"
                maxLength={6}
                placeholder="e.g. SLP"
                aria-describedby="study-code-hint"
                value={study.code}
                onChange={(e) =>
                  setStudy({ ...study, code: e.target.value.toUpperCase() })
                }
              />
              <p className="field-hint" id="study-code-hint">
                2 to 6 letters. Participants are numbered from it, like
                SLP-0001.
              </p>
            </div>
            <div className="request-actions">
              <button className="button small" disabled={busy}>
                Create draft
              </button>
            </div>
          </form>
        </section>
      )}
      {workspace.isAdmin && (
        <section className="panel">
          <h2>Research leads</h2>
          <p className="section-copy">
            Research leads can set up studies and choose their teams. They need
            a Chatbud account and must have signed in once.
          </p>
          {workspace.leads.map((l) => (
            <div className="record" key={l.email}>
              <div>
                <strong>{l.name}</strong>
                <p>{l.email}</p>
              </div>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setLead(l.email, false)}
              >
                Remove
              </button>
            </div>
          ))}
          <form
            className="goal-form"
            onSubmit={(e) => {
              e.preventDefault();
              setLead(email.trim(), true);
            }}
          >
            <div className="field">
              <label htmlFor="lead-email">Their account email</label>
              <input
                id="lead-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="request-actions">
              <button className="button small" disabled={busy}>
                Make research lead
              </button>
            </div>
          </form>
        </section>
      )}
      <div className="care-note">
        <ShieldCheck size={21} />
        <div>
          <strong>Participants are recorded under study codes.</strong>
          <p>
            Names and phone numbers are kept apart from study data, shown only
            on request, and every view is recorded.
          </p>
        </div>
      </div>
    </>
  );
}
