"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Phone } from "lucide-react";
import { nepalTime, professions } from "../../../_components/ui";
import {
  flagLabels,
  sexes,
  urgencies,
  useLoad,
  useResearch,
  useWorkspace,
} from "../../_components/lib";
const referralStatus: Record<string, string> = {
  OPEN: "Open",
  CONTACTED: "Contacted",
  BOOKED: "Appointment booked",
  CLOSED: "Closed",
};
const consentMethods: Record<string, string> = {
  SIGNED: "Signed form",
  THUMBPRINT: "Thumbprint with witness",
  VERBAL_WITNESSED: "Spoken with witness",
};
const blankReferral = {
  assessmentId: "",
  profession: "clinical_psychologist",
  urgency: "ROUTINE",
  note: "",
  treatment: "",
};
export default function Participant() {
  const { study: studyId, participant: participantId } = useParams<{
    study: string;
    participant: string;
  }>();
  const { workspace } = useWorkspace();
  const { call, run, busy, setNotice } = useResearch();
  const { data, reload, failed } = useLoad("participant_view", {
    participantId,
  });
  const [identity, setIdentity] = useState<any>(null),
    [instrument, setInstrument] = useState(""),
    [answers, setAnswers] = useState<Record<string, number>>({}),
    [notes, setNotes] = useState(""),
    [outcome, setOutcome] = useState<any>(null),
    [referral, setReferral] = useState<typeof blankReferral | null>(null);
  if (failed)
    return (
      <section className="panel portal-login">
        <h2>This record could not be opened</h2>
        <p className="section-copy">{failed}</p>
        <Link className="button" href={`/research/${studyId}`}>
          Back to the study
        </Link>
      </section>
    );
  if (!data)
    return (
      <div className="loading" role="status">
        Loading the record…
      </div>
    );
  const { participant, consent, assessments, referrals, study, role } = data;
  const open = study.status === "ACTIVE" && !consent.withdrawnAt;
  const tool = workspace.instruments[instrument];
  const act = (action: () => Promise<unknown>, notice: string) =>
    run(async () => {
      await action();
      await reload();
      setNotice(notice);
    });
  const complete = tool
    ? tool.kind === "scale"
      ? tool.items.every((_: string, i: number) => answers[i] !== undefined)
      : tool.fields.every((f: any) => Number.isFinite(answers[f.key]))
    : false;
  const saveAssessment = () =>
    run(async () => {
      const result = await call("assessment_save", {
        participantId,
        instrument,
        answers:
          tool.kind === "scale"
            ? tool.items.map((_: string, i: number) => answers[i])
            : answers,
        notes: notes.trim(),
      });
      await reload();
      setOutcome({ ...result, name: tool.name });
      setInstrument("");
      setAnswers({});
      setNotes("");
      // The scoring rules suggest a referral; the researcher decides whether to make it.
      setReferral(
        result.refer
          ? { ...blankReferral, ...result.refer, assessmentId: result.id }
          : null,
      );
      setNotice("Assessment saved.");
    });
  return (
    <>
      <Link className="back-link" href={`/research/${studyId}`}>
        <ArrowLeft size={15} /> {study.code} · {study.title}
      </Link>
      <section className="panel">
        <div className="panel-heading">
          <h2>{participant.code}</h2>
          {consent.withdrawnAt && (
            <span className="status status-cancelled">Withdrew consent</span>
          )}
        </div>
        <p className="section-copy">
          {sexes[participant.sex]} · born {participant.birthYear} ·{" "}
          {participant.district} · enrolled {nepalTime(participant.enrolledAt)}
        </p>
        <dl className="rating-summary">
          <div>
            <dt>Consent</dt>
            <dd>
              {consentMethods[consent.method]}
              {consent.witness && ` (${consent.witness})`}
            </dd>
          </div>
          <div>
            <dt>Audio recording</dt>
            <dd>{consent.recording ? "Agreed" : "Not agreed"}</dd>
          </div>
          <div>
            <dt>Future research use</dt>
            <dd>{consent.futureUse ? "Agreed" : "Not agreed"}</dd>
          </div>
        </dl>
        <div className="request-actions">
          {participant.canSeeIdentity && !consent.withdrawnAt && !identity && (
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() =>
                run(async () =>
                  setIdentity(
                    await call("participant_identity", { participantId }),
                  ),
                )
              }
            >
              Show contact details
            </button>
          )}
          {!consent.withdrawnAt && (
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Record that ${participant.code} withdrew consent? Their contact details are deleted, nothing more can be recorded, and their data is left out of exports. This cannot be undone.`,
                  )
                )
                  act(
                    () => call("consent_withdraw", { participantId }),
                    "Withdrawal recorded.",
                  ).then(() => setIdentity(null));
              }}
            >
              Participant withdraws consent
            </button>
          )}
        </div>
        {identity && (
          <p className="identity" role="status">
            <strong>{identity.fullName}</strong>
            {identity.phone && ` · ${identity.phone}`}
            {identity.locality && ` · ${identity.locality}`}
            <small>This view was recorded.</small>
          </p>
        )}
      </section>
      {outcome && (
        <section className="panel result" role="status">
          <h2>
            {outcome.name}: {outcome.score} · {outcome.severity}
          </h2>
          {outcome.flags.includes("SELF_HARM") && (
            <div className="care-note urgent">
              <Phone size={21} />
              <div>
                <strong>They reported thoughts of self-harm.</strong>
                <p>
                  Do not leave them alone if they are at immediate risk. Follow
                  your study’s safety protocol, tell your study lead today, and
                  give them the free helpline number: <b>1166</b>.
                </p>
              </div>
            </div>
          )}
          {outcome.flags.some((f: string) => f.endsWith("HIGH_BP")) && (
            <div className="care-note urgent">
              <Phone size={21} />
              <div>
                <strong>{flagLabels[outcome.flags[0]]}.</strong>
                <p>
                  {outcome.flags.includes("VERY_HIGH_BP")
                    ? "This reading needs medical attention today. Help them reach the nearest health facility."
                    : "Advise them to have it checked at a health post or by a doctor."}
                </p>
              </div>
            </div>
          )}
          <p className="section-copy">
            {outcome.refer
              ? "The scoring rules suggest a referral. Review it below and save it if you agree."
              : "No referral is suggested by the score. You can still make one."}
          </p>
        </section>
      )}
      {open && (
        <section className="panel">
          <h2>New assessment</h2>
          <div className="chips">
            {study.instruments.map((code: string) => (
              <button
                key={code}
                className={instrument === code ? "chip chosen" : "chip"}
                aria-pressed={instrument === code}
                onClick={() => {
                  setInstrument(instrument === code ? "" : code);
                  setAnswers({});
                }}
              >
                {workspace.instruments[code]?.name || code}
              </button>
            ))}
          </div>
          {tool && (
            <form
              className="assessment"
              onSubmit={(e) => {
                e.preventDefault();
                saveAssessment();
              }}
            >
              {tool.kind === "scale" ? (
                <>
                  <p className="section-copy">{tool.lead}</p>
                  {tool.items.map((item: string, i: number) => (
                    <fieldset className="rating" key={item}>
                      <legend>
                        {i + 1}. {item}
                      </legend>
                      <div>
                        {tool.options.map((option: string, value: number) => (
                          <label key={option}>
                            <input
                              type="radio"
                              name={`item-${i}`}
                              checked={answers[i] === value}
                              onChange={() =>
                                setAnswers({ ...answers, [i]: value })
                              }
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </>
              ) : (
                <div className="field-grid">
                  {tool.fields.map((f: any) => (
                    <div className="field" key={f.key}>
                      <label htmlFor={`m-${f.key}`}>{f.label}</label>
                      <input
                        id={`m-${f.key}`}
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        required
                        min={f.min}
                        max={f.max}
                        value={answers[f.key] ?? ""}
                        onChange={(e) =>
                          setAnswers({
                            ...answers,
                            [f.key]: e.target.valueAsNumber,
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="field">
                <label htmlFor="a-notes">
                  Notes<span className="optional">Optional</span>
                </label>
                <textarea
                  id="a-notes"
                  rows={3}
                  maxLength={2000}
                  aria-describedby="a-notes-hint"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <p className="field-hint" id="a-notes-hint">
                  Do not write the person’s name here. Notes are never included
                  in exports.
                </p>
              </div>
              <button className="button" disabled={busy || !complete}>
                Save and score
              </button>
            </form>
          )}
        </section>
      )}
      <section className="panel">
        <h2>Assessments</h2>
        {assessments.length === 0 ? (
          <p className="empty-inline">Nothing recorded yet.</p>
        ) : (
          assessments.map((a: any) => (
            <div className="record" key={a.id}>
              <div>
                <strong>
                  {workspace.instruments[a.instrument]?.name || a.instrument}:{" "}
                  {a.score} · {a.severity}
                </strong>
                <p>
                  {nepalTime(a.at)} · {a.by}
                  {a.notes && ` · ${a.notes}`}
                </p>
              </div>
              {a.flags.length > 0 && (
                <span className="status status-escalated">
                  {a.flags.map((f: string) => flagLabels[f] || f).join(", ")}
                </span>
              )}
            </div>
          ))
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Referrals</h2>
          {open && !referral && (
            <button onClick={() => setReferral(blankReferral)}>
              Refer to a professional
            </button>
          )}
        </div>
        {referral && (
          <form
            className="referral"
            onSubmit={(e) => {
              e.preventDefault();
              act(
                () => call("referral_save", { participantId, ...referral }),
                "Referral saved.",
              );
              setReferral(null);
              setOutcome(null);
            }}
          >
            <div className="field-grid">
              <div className="field">
                <label htmlFor="r-profession">Refer to</label>
                <select
                  id="r-profession"
                  value={referral.profession}
                  onChange={(e) =>
                    setReferral({ ...referral, profession: e.target.value })
                  }
                >
                  {Object.entries(professions).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="r-urgency">How soon</label>
                <select
                  id="r-urgency"
                  value={referral.urgency}
                  onChange={(e) =>
                    setReferral({ ...referral, urgency: e.target.value })
                  }
                >
                  {Object.entries(urgencies).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="r-note">
                Reason for referral<span className="optional">Optional</span>
              </label>
              <textarea
                id="r-note"
                rows={2}
                maxLength={2000}
                value={referral.note}
                onChange={(e) =>
                  setReferral({ ...referral, note: e.target.value })
                }
              />
            </div>
            {role === "CLINICIAN" && (
              <div className="field">
                <label htmlFor="r-treatment">
                  Treatment suggestion<span className="optional">Optional</span>
                </label>
                <textarea
                  id="r-treatment"
                  rows={2}
                  maxLength={2000}
                  aria-describedby="r-treatment-hint"
                  value={referral.treatment}
                  onChange={(e) =>
                    setReferral({ ...referral, treatment: e.target.value })
                  }
                />
                <p className="field-hint" id="r-treatment-hint">
                  Only clinicians on the study can record this.
                </p>
              </div>
            )}
            <div className="request-actions">
              <button className="button small" disabled={busy}>
                Save referral
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setReferral(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {referrals.length === 0 && !referral && (
          <p className="empty-inline">No referrals yet.</p>
        )}
        {referrals.map((r: any) => (
          <div className="record" key={r.id}>
            <div>
              <strong>
                {professions[r.profession] || r.profession} ·{" "}
                {urgencies[r.urgency]}
              </strong>
              <p>
                {nepalTime(r.at)} · {r.by}
                {r.note && ` · ${r.note}`}
              </p>
              {r.treatment && <p>Treatment suggestion: {r.treatment}</p>}
            </div>
            {open ? (
              <select
                aria-label={`Status of referral to ${professions[r.profession]}`}
                value={r.status}
                disabled={busy}
                onChange={(e) =>
                  act(
                    () =>
                      call("referral_save", {
                        participantId,
                        id: r.id,
                        status: e.target.value,
                      }),
                    "Referral updated.",
                  )
                }
              >
                {Object.entries(referralStatus).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="status">{referralStatus[r.status]}</span>
            )}
          </div>
        ))}
        {referrals.length > 0 && (
          <p className="field-hint">
            To book, the participant creates their own Chatbud account and
            chooses a professional under{" "}
            <Link href="/professionals">Professionals</Link>.
          </p>
        )}
      </section>
    </>
  );
}
