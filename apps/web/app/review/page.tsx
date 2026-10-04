"use client";
import { useEffect, useState } from "react";
import { Activity, ShieldCheck, Stethoscope } from "lucide-react";
import { useApp } from "../_components/app";
import { SignInPrompt, Summary } from "../_components/ui";
export default function Review() {
  const { mode, token, api, run, busy, setNotice, setError, openAuth } =
    useApp();
  const [admin, setAdmin] = useState<any>({ applications: [], audit: [] });
  useEffect(() => {
    if (mode === "live" && !token) return;
    let active = true;
    api("admin/overview")
      .then((data) => {
        if (active) setAdmin(data);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [mode, token]);
  if (mode === "live" && !token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in with a reviewer account to open the review workspace.
      </SignInPrompt>
    );
  return (
    <>
      <div className="summary-grid">
        <Summary
          icon={Stethoscope}
          label="Applications"
          value={admin.applications.length}
        />
        <Summary
          icon={ShieldCheck}
          label="Approval policy"
          value="Human review"
        />
        <Summary
          icon={Activity}
          label="Environment"
          value={mode === "demo" ? "Preview" : "Live"}
        />
      </div>
      <section className="panel">
        <h2>Provider review queue</h2>
        <p className="section-copy">
          Credential approval is a separate clinical workflow. Request more
          information or reject incomplete preview applications.
        </p>
        {admin.applications.length === 0 ? (
          <p className="empty-inline">No applications awaiting review.</p>
        ) : (
          admin.applications.map((a: any) => (
            <div className="review-card" key={a.id}>
              <div>
                <h3>{a.name}</h3>
                <span className="status">{a.status.replaceAll("_", " ")}</span>
                <p>{a.bio}</p>
              </div>
              {mode === "demo" && (
                <div className="review-actions">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api("admin/review", "POST", {
                          id: a.id,
                          decision: "NEEDS_INFORMATION",
                        });
                        setAdmin(await api("admin/overview"));
                        setNotice("Requested additional information.");
                      })
                    }
                  >
                    Request information
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api("admin/review", "POST", {
                          id: a.id,
                          decision: "REJECTED",
                        });
                        setAdmin(await api("admin/overview"));
                        setNotice("Preview application rejected.");
                      })
                    }
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>
      <section className="panel">
        <h2>Recent activity</h2>
        {admin.audit?.length ? (
          admin.audit.slice(0, 8).map((a: any, i: number) => (
            <div className="record" key={i}>
              <Activity size={17} />
              <strong>{a.action}</strong>
              <span>{new Date(a.at).toLocaleString()}</span>
            </div>
          ))
        ) : (
          <p className="empty-inline">Review activity will appear here.</p>
        )}
      </section>
    </>
  );
}
