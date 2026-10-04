"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import {
  flagLabels,
  memberRoles,
  sexes,
  studyStatus,
  useLoad,
  useResearch,
  useWorkspace,
} from "../_components/lib";
const blankPerson = {
  fullName: "",
  phone: "",
  locality: "",
  sex: "FEMALE",
  birthYear: "",
  district: "",
  participation: false,
  recording: false,
  futureUse: false,
  method: "SIGNED",
  witness: "",
};
export default function Study() {
  const { study: studyId } = useParams<{ study: string }>();
  const { workspace, reload: reloadWorkspace } = useWorkspace();
  const { call, run, busy, setNotice } = useResearch();
  const { data, reload, failed } = useLoad("study_view", { studyId });
  const [person, setPerson] = useState(blankPerson),
    [enrolling, setEnrolling] = useState(false),
    [member, setMember] = useState({ email: "", role: "HEALTH_WORKER" });
  if (failed)
    return (
      <section className="panel portal-login">
        <h2>This study could not be opened</h2>
        <p className="section-copy">{failed}</p>
        <Link className="button" href="/research">
          Back to studies
        </Link>
      </section>
    );
  if (!data)
    return (
      <div className="loading" role="status">
        Loading the study…
      </div>
    );
  const { study, role, participants, members } = data;
  const lead = role === "LEAD";
  const act = (action: () => Promise<unknown>, notice: string) =>
    run(async () => {
      await action();
      await reload();
      setNotice(notice);
    });
  const exportCsv = () =>
    run(async () => {
      const { rows } = await call("export", { studyId });
      const columns = [
        "code",
        "sex",
        "birthYear",
        "district",
        "futureUse",
        "instrument",
        "score",
        "severity",
        "flags",
        "answers",
        "assessedOn",
      ];
      const cell = (value: unknown) => {
        const text = Array.isArray(value)
          ? value.join(" ")
          : typeof value === "object" && value
            ? JSON.stringify(value)
            : String(value ?? "");
        return `"${text.replaceAll('"', '""')}"`;
      };
      const csv = [
        columns.join(","),
        ...rows.map((r: any) => columns.map((c) => cell(r[c])).join(",")),
      ].join("\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      link.download = `${study.code}-deidentified.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      setNotice(`${rows.length} records exported. This export was recorded.`);
    });
  return (
    <>
      <Link className="back-link" href="/research">
        <ArrowLeft size={15} /> All studies
      </Link>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {study.code} · {study.title}
          </h2>
          <span className={`status status-${study.status.toLowerCase()}`}>
            {studyStatus[study.status]}
          </span>
        </div>
        <p className="section-copy">
          {study.partner && `${study.partner} · `}
          {study.ethicsReference
            ? `Ethics approval ${study.ethicsReference}`
            : "No ethics approval recorded yet"}{" "}
          · You are: {memberRoles[role]}
        </p>
        {study.summary && <p className="section-copy">{study.summary}</p>}
      </section>
      {lead && (
        <StudySetup
          key={study.consentVersion + study.status}
          study={study}
          instruments={workspace.instruments}
          save={(values) =>
            act(async () => {
              await call("study_save", { id: study.id, ...values });
              await reloadWorkspace();
            }, "Study saved.")
          }
          busy={busy}
        />
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Participants</h2>
          {study.status === "ACTIVE" && !enrolling && (
            <button onClick={() => setEnrolling(true)}>
              Enrol a participant
            </button>
          )}
        </div>
        {study.status === "DRAFT" && (
          <p className="empty-inline">
            Enrolment opens when the study lead records the ethics approval and
            consent wording and opens the study.
          </p>
        )}
        {enrolling && (
          <form
            className="enrol"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const done = await call("participant_enroll", {
                  studyId,
                  sex: person.sex,
                  birthYear: Number(person.birthYear),
                  district: person.district.trim(),
                  identity: {
                    fullName: person.fullName.trim(),
                    phone: person.phone.trim(),
                    locality: person.locality.trim(),
                  },
                  consent: {
                    participation: person.participation,
                    recording: person.recording,
                    futureUse: person.futureUse,
                    method: person.method,
                    witness: person.witness.trim(),
                  },
                });
                await reload();
                setPerson(blankPerson);
                setEnrolling(false);
                setNotice(`Enrolled as ${done.code}.`);
              });
            }}
          >
            <h3>1. Read the consent to the person</h3>
            <blockquote className="consent-text">
              {study.consentText}
            </blockquote>
            <label className="choice">
              <input
                type="checkbox"
                required
                checked={person.participation}
                onChange={(e) =>
                  setPerson({ ...person, participation: e.target.checked })
                }
              />
              <span>They understood and agreed to take part.</span>
            </label>
            <label className="choice">
              <input
                type="checkbox"
                checked={person.recording}
                onChange={(e) =>
                  setPerson({ ...person, recording: e.target.checked })
                }
              />
              <span>They agreed to audio recording.</span>
            </label>
            <label className="choice">
              <input
                type="checkbox"
                checked={person.futureUse}
                onChange={(e) =>
                  setPerson({ ...person, futureUse: e.target.checked })
                }
              />
              <span>
                They agreed that their answers, without their name, may be used
                in future research and to build health tools.
              </span>
            </label>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="consent-method">How consent was given</label>
                <select
                  id="consent-method"
                  value={person.method}
                  onChange={(e) =>
                    setPerson({ ...person, method: e.target.value })
                  }
                >
                  <option value="SIGNED">Signed form</option>
                  <option value="THUMBPRINT">Thumbprint, with a witness</option>
                  <option value="VERBAL_WITNESSED">
                    Spoken, with a witness
                  </option>
                </select>
              </div>
              {person.method !== "SIGNED" && (
                <div className="field">
                  <label htmlFor="consent-witness">Witness’s full name</label>
                  <input
                    id="consent-witness"
                    required
                    minLength={3}
                    maxLength={120}
                    value={person.witness}
                    onChange={(e) =>
                      setPerson({ ...person, witness: e.target.value })
                    }
                  />
                </div>
              )}
            </div>
            <h3>2. Contact details</h3>
            <p className="section-copy">
              Kept apart from study data and used only to follow up.
            </p>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="p-name">Full name</label>
                <input
                  id="p-name"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="off"
                  value={person.fullName}
                  onChange={(e) =>
                    setPerson({ ...person, fullName: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="p-phone">
                  Phone<span className="optional">Optional</span>
                </label>
                <input
                  id="p-phone"
                  type="tel"
                  maxLength={30}
                  autoComplete="off"
                  value={person.phone}
                  onChange={(e) =>
                    setPerson({ ...person, phone: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="p-locality">
                  Ward or village<span className="optional">Optional</span>
                </label>
                <input
                  id="p-locality"
                  maxLength={160}
                  autoComplete="off"
                  value={person.locality}
                  onChange={(e) =>
                    setPerson({ ...person, locality: e.target.value })
                  }
                />
              </div>
            </div>
            <h3>3. Study record</h3>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="p-sex">Sex</label>
                <select
                  id="p-sex"
                  value={person.sex}
                  onChange={(e) =>
                    setPerson({ ...person, sex: e.target.value })
                  }
                >
                  {Object.entries(sexes).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="p-year">Year of birth (AD)</label>
                <input
                  id="p-year"
                  type="number"
                  required
                  min={1900}
                  max={new Date().getFullYear() - 18}
                  aria-describedby="p-year-hint"
                  value={person.birthYear}
                  onChange={(e) =>
                    setPerson({ ...person, birthYear: e.target.value })
                  }
                />
                <p className="field-hint" id="p-year-hint">
                  Participants must be 18 or older.
                </p>
              </div>
              <div className="field">
                <label htmlFor="p-district">District</label>
                <input
                  id="p-district"
                  required
                  minLength={2}
                  maxLength={80}
                  value={person.district}
                  onChange={(e) =>
                    setPerson({ ...person, district: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="request-actions">
              <button className="button" disabled={busy}>
                Enrol participant
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setEnrolling(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {participants.length === 0 &&
          study.status !== "DRAFT" &&
          !enrolling && (
            <p className="empty-inline">No participants enrolled yet.</p>
          )}
        {participants.map((p: any) => (
          <Link
            className="record product-link"
            href={`/research/${studyId}/${p.id}`}
            key={p.id}
          >
            <span className="record-icon">{p.code.split("-")[1]}</span>
            <div>
              <strong>{p.code}</strong>
              <p>
                {sexes[p.sex]} · born {p.birthYear} · {p.district}
                {p.last &&
                  ` · ${workspace.instruments[p.last.instrument]?.name || p.last.instrument}: ${p.last.score} (${p.last.severity})`}
              </p>
            </div>
            {p.withdrawn ? (
              <span className="status status-cancelled">Withdrew</span>
            ) : p.last?.flags.length ? (
              <span className="status status-escalated">
                {p.last.flags.map((f: string) => flagLabels[f] || f).join(", ")}
              </span>
            ) : p.openReferrals > 0 ? (
              <span className="status status-held">Referral open</span>
            ) : null}
            <ArrowRight size={16} />
          </Link>
        ))}
      </section>
      {lead && (
        <section className="panel">
          <h2>Study team</h2>
          <p className="section-copy">
            Health workers screen and refer. Only clinicians can record a
            treatment suggestion.
          </p>
          {members.map((m: any) => (
            <div className="record" key={m.email}>
              <div>
                <strong>
                  {m.name}
                  {m.me ? " (you)" : ""}
                </strong>
                <p>
                  {m.email} · {memberRoles[m.role]}
                </p>
              </div>
              {!m.me && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        call("member_set", {
                          studyId,
                          email: m.email,
                          role: m.role,
                          grant: false,
                        }),
                      `${m.name} removed from the study.`,
                    )
                  }
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <form
            className="goal-form"
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () =>
                  call("member_set", {
                    studyId,
                    email: member.email.trim(),
                    role: member.role,
                    grant: true,
                  }),
                "Added to the study.",
              );
              setMember({ ...member, email: "" });
            }}
          >
            <div className="field">
              <label htmlFor="member-email">Their Chatbud account email</label>
              <input
                id="member-email"
                type="email"
                required
                value={member.email}
                onChange={(e) =>
                  setMember({ ...member, email: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="member-role">Role</label>
              <select
                id="member-role"
                value={member.role}
                onChange={(e) => setMember({ ...member, role: e.target.value })}
              >
                {Object.entries(memberRoles).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="request-actions">
              <button className="button small" disabled={busy}>
                Add to study
              </button>
            </div>
          </form>
        </section>
      )}
      {lead && (
        <section className="panel">
          <h2>Study data</h2>
          <p className="section-copy">
            Downloads every assessment under study codes only: no names, phone
            numbers or free-text notes, and nobody who withdrew. Each download
            is recorded.
          </p>
          <button
            className="button secondary"
            disabled={busy || participants.length === 0}
            onClick={exportCsv}
          >
            <Download size={16} /> Download de-identified data (CSV)
          </button>
        </section>
      )}
    </>
  );
}

function StudySetup({
  study,
  instruments,
  save,
  busy,
}: {
  study: any;
  instruments: Record<string, any>;
  save: (values: any) => void;
  busy: boolean;
}) {
  const [v, setV] = useState({
    title: study.title,
    summary: study.summary,
    partner: study.partner,
    ethicsReference: study.ethicsReference,
    ethicsApprovedOn: study.ethicsApprovedOn || "",
    instruments: study.instruments as string[],
    consentText: study.consentText,
    status: study.status,
  });
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch });
  return (
    <details className="panel setup" open={study.status === "DRAFT"}>
      <summary>
        <h2>Study setup</h2>
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(v);
        }}
      >
        <div className="field-grid">
          <div className="field">
            <label htmlFor="s-title">Title</label>
            <input
              id="s-title"
              required
              minLength={3}
              maxLength={160}
              value={v.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="s-partner">Research partner institution</label>
            <input
              id="s-partner"
              maxLength={160}
              value={v.partner}
              onChange={(e) => set({ partner: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="s-ethics">Ethics approval reference</label>
            <input
              id="s-ethics"
              maxLength={120}
              aria-describedby="s-ethics-hint"
              value={v.ethicsReference}
              onChange={(e) => set({ ethicsReference: e.target.value })}
            />
            <p className="field-hint" id="s-ethics-hint">
              From the Nepal Health Research Council or an approved review
              committee.
            </p>
          </div>
          <div className="field">
            <label htmlFor="s-ethics-date">Approved on</label>
            <input
              id="s-ethics-date"
              type="date"
              value={v.ethicsApprovedOn}
              onChange={(e) => set({ ethicsApprovedOn: e.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="s-summary">
            What the study is about<span className="optional">Optional</span>
          </label>
          <textarea
            id="s-summary"
            rows={3}
            maxLength={2000}
            value={v.summary}
            onChange={(e) => set({ summary: e.target.value })}
          />
        </div>
        <fieldset className="sharing">
          <legend>Assessments used in this study</legend>
          <div>
            {Object.entries(instruments).map(([code, i]) => (
              <label className="choice" key={code}>
                <input
                  type="checkbox"
                  checked={v.instruments.includes(code)}
                  onChange={(e) =>
                    set({
                      instruments: e.target.checked
                        ? [...v.instruments, code]
                        : v.instruments.filter((c) => c !== code),
                    })
                  }
                />
                <span>
                  {i.name} · {i.about}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="s-consent">
            Consent wording read to participants
          </label>
          <textarea
            id="s-consent"
            rows={8}
            maxLength={6000}
            aria-describedby="s-consent-hint"
            value={v.consentText}
            onChange={(e) => set({ consentText: e.target.value })}
          />
          <p className="field-hint" id="s-consent-hint">
            Use the wording your ethics committee approved, in the language
            participants speak. Each participant’s record keeps the exact
            wording they agreed to.
          </p>
        </div>
        <div className="field">
          <label htmlFor="s-status">Status</label>
          <select
            id="s-status"
            value={v.status}
            onChange={(e) => set({ status: e.target.value })}
          >
            <option value="DRAFT">Being set up (no enrolment)</option>
            <option value="ACTIVE">Open (enrolment and data collection)</option>
            <option value="CLOSED">Closed (read only)</option>
          </select>
        </div>
        <button className="button" disabled={busy}>
          Save study
        </button>
      </form>
    </details>
  );
}
