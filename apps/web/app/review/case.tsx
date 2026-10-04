"use client";
import { useState } from "react";
import { FileText } from "lucide-react";
import { useApp } from "../_components/app";
import { professions } from "../_components/ui";
const documentLabels: Record<string, string> = {
  identity: "Government photo ID",
  qualification: "Qualification certificate",
  registration: "Registration certificate",
  experience: "Experience letter",
  photo: "Profile photo",
};
const caseStatus: Record<string, string> = {
  SUBMITTED: "New",
  UNDER_REVIEW: "Under review",
  NEEDS_INFORMATION: "Waiting for applicant",
};
function Facts({ title, rows }: { title: string; rows: [string, any][] }) {
  const shown = rows.filter(([, value]) => value !== undefined && value !== "");
  if (!shown.length) return null;
  return (
    <div className="facts">
      <h4>{title}</h4>
      <dl>
        {shown.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
export function Application({
  item,
  reload,
}: {
  item: any;
  reload: () => Promise<void>;
}) {
  const { api, run, busy, setNotice, setError } = useApp();
  const [rationale, setRationale] = useState(item.rationale || "");
  const details = item.application || {};
  const { practice, identity, registration, declarations } = details;
  const decide = (decision: string, notice: string) =>
    run(async () => {
      await api("admin/review", "POST", {
        caseId: item.id,
        decision,
        rationale: rationale.trim(),
      });
      await reload();
      setNotice(notice);
    });
  async function open(path: string) {
    // Opened before the request so the browser treats it as a user-initiated tab.
    const tab = window.open("", "_blank");
    try {
      const { url } = await api("admin/document", "POST", {
        caseId: item.id,
        path,
      });
      if (tab) tab.location.href = url;
    } catch (e) {
      tab?.close();
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(e instanceof Error ? e.message : "Please try again.");
    }
  }
  const needsReason = rationale.trim().length < 10;
  return (
    <article className="case">
      <header>
        <div>
          <h3>{item.name}</h3>
          <p>
            {professions[item.profession] || "Profession not recorded"} ·{" "}
            {item.email} · submitted{" "}
            {new Date(item.submittedAt).toLocaleDateString("en-NP", {
              dateStyle: "medium",
            })}
          </p>
        </div>
        <span className="status">{caseStatus[item.status] || item.status}</span>
      </header>
      <p className="case-bio">{item.bio}</p>
      {practice && (
        <Facts
          title="Practice"
          rows={[
            ["Title", practice.title],
            ["Years in practice", practice.yearsExperience],
            ["Setting", practice.setting],
            ["Workplace", practice.workplace],
            ["City", practice.city],
            ["Consults", practice.modes?.join(", ").replace("_", " ")],
            ["Languages", practice.languages?.join(", ")],
            ["Works with", practice.clientGroups?.join(", ")],
            ["Focus", practice.focus],
          ]}
        />
      )}
      {identity && (
        <Facts
          title="Identity"
          rows={[
            ["Legal name", identity.legalName],
            ["Date of birth", identity.dateOfBirth],
            ["Mobile", identity.phone],
            [
              "ID",
              `${identity.idType?.replaceAll("_", " ")} ${identity.idNumber}`,
            ],
            ["Issued by", identity.idIssuer],
          ]}
        />
      )}
      {details.qualifications?.map((q: any, i: number) => (
        <Facts
          key={i}
          title={i === 0 ? "Highest qualification" : "Additional qualification"}
          rows={[
            ["Qualification", `${q.level}, ${q.field}`],
            ["Institution", `${q.institution}, ${q.country}`],
            ["Year", q.year],
          ]}
        />
      ))}
      {registration && (
        <Facts
          title="Registration"
          rows={
            registration.held
              ? [
                  ["Body", registration.body],
                  ["Number", registration.number],
                  ["Registered", registration.issuedOn],
                  ["Valid until", registration.validUntil],
                ]
              : [
                  ["Statutory registration", "None declared"],
                  ["Can be confirmed by", registration.association],
                ]
          }
        />
      )}
      {details.references?.map((r: any, i: number) => (
        <Facts
          key={i}
          title={i === 0 ? "Referee" : "Second referee"}
          rows={[
            ["Name", r.name],
            ["Role", `${r.role}, ${r.organization}`],
            ["Contact", r.contact],
          ]}
        />
      ))}
      {declarations && (
        <Facts
          title="Declarations"
          rows={[
            [
              "Professional standing",
              declarations.goodStanding
                ? "Nothing to declare"
                : `Declared: ${declarations.standingDetails}`,
            ],
            [
              "Consent to verify",
              declarations.consentToVerify ? "Given" : "No",
            ],
          ]}
        />
      )}
      {!practice && (
        <p className="empty-inline">
          This application was submitted before the detailed form and has no
          verification details. Ask the applicant to apply again.
        </p>
      )}
      {details.documents?.length > 0 && (
        <div className="facts">
          <h4>Documents</h4>
          <div className="case-documents">
            {details.documents.map((d: any) => (
              <button
                key={d.path}
                className="button secondary"
                onClick={() => open(d.path)}
              >
                <FileText size={15} /> {documentLabels[d.kind] || d.kind}
              </button>
            ))}
          </div>
          <p className="field-hint">
            Links expire after two minutes, and each view is recorded.
          </p>
        </div>
      )}
      {item.own ? (
        <p className="form-note">
          This is your own application. Another reviewer must decide it.
        </p>
      ) : (
        <div className="case-decision">
          <div className="field">
            <label htmlFor={`reason-${item.id}`}>
              Note to the applicant
              <span className="optional">Required unless approving</span>
            </label>
            <textarea
              id={`reason-${item.id}`}
              rows={3}
              maxLength={1000}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="What is missing, or why the application cannot be approved…"
            />
          </div>
          <div className="request-actions">
            <button
              className="button"
              disabled={busy || !practice}
              onClick={() => decide("APPROVED", `${item.name} is approved.`)}
            >
              Approve
            </button>
            <button
              className="button secondary"
              disabled={busy || needsReason}
              onClick={() =>
                decide("NEEDS_INFORMATION", "Requested more information.")
              }
            >
              Request information
            </button>
            <button
              className="text-button"
              disabled={busy || needsReason}
              onClick={() => decide("REJECTED", "Application rejected.")}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
