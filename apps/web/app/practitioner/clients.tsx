"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useApp } from "../_components/app";
import { areaLabel } from "../_components/ui";
type Draft = {
  id?: string;
  clientId: string;
  domain: string;
  title: string;
  body: string;
};
export function Clients() {
  const { api, run, busy, setNotice, setError } = useApp();
  const [data, setData] = useState<any>(null),
    [draft, setDraft] = useState<Draft | null>(null);
  const reload = async () => setData(await api("provider/clients"));
  useEffect(() => {
    let active = true;
    api("provider/clients")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const save = (plan: Draft & { archived?: boolean }, notice: string) =>
    run(async () => {
      await api("provider/plan", "POST", {
        ...plan,
        title: plan.title.trim(),
      });
      setDraft(null);
      await reload();
      setNotice(notice);
    });
  return (
    <section className="panel">
      <h2>Clients</h2>
      <p className="section-copy">
        You can write plans for clients with a confirmed appointment. You see
        other areas of their care only if they choose to share them with you.
      </p>
      {!data ? (
        <p className="empty-inline" role="status">
          Loading your clients…
        </p>
      ) : data.clients.length === 0 ? (
        <p className="empty-inline">
          Clients appear here after you confirm their first appointment.
        </p>
      ) : (
        data.clients.map((c: any) => (
          <div className="client" key={c.id}>
            <div className="panel-heading">
              <h3>{c.name}</h3>
              {draft?.clientId !== c.id && (
                <button
                  onClick={() =>
                    setDraft({
                      clientId: c.id,
                      domain: data.domains[0],
                      title: "",
                      body: "",
                    })
                  }
                >
                  <Plus size={15} /> Write a plan
                </button>
              )}
            </div>
            {c.plans.map((p: any) =>
              draft?.id === p.id ? null : (
                <details className="plan" key={p.id}>
                  <summary>
                    <strong>{p.title}</strong>
                    <span>
                      {areaLabel(p.domain)} · version {p.version}
                    </span>
                  </summary>
                  <p>{p.body}</p>
                  <div className="request-actions">
                    <button
                      className="text-button"
                      onClick={() =>
                        setDraft({
                          id: p.id,
                          clientId: c.id,
                          domain: p.domain,
                          title: p.title,
                          body: p.body,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        save(
                          {
                            id: p.id,
                            clientId: c.id,
                            domain: p.domain,
                            title: p.title,
                            body: p.body,
                            archived: true,
                          },
                          "Plan withdrawn. Your client no longer sees it.",
                        )
                      }
                    >
                      Withdraw
                    </button>
                  </div>
                </details>
              ),
            )}
            {draft && draft.clientId === c.id && (
              <PlanForm
                draft={draft}
                setDraft={setDraft}
                domains={data.domains}
                busy={busy}
                save={() =>
                  save(
                    draft,
                    "Plan saved. Your client can see it under My Health.",
                  )
                }
              />
            )}
            <div className="shared">
              <h4>Shared with you by {c.name}</h4>
              {c.sharedDomains.length === 0 ? (
                <p className="field-hint">
                  Nothing shared. You see only the plans you wrote.
                </p>
              ) : (
                <>
                  <p className="field-hint">
                    {c.sharedDomains.map(areaLabel).join(", ")}
                  </p>
                  {c.sharedGoals.map((g: any, i: number) => (
                    <p className="shared-goal" key={i}>
                      {g.status === "DONE" ? "Completed goal" : "Goal"} ·{" "}
                      {areaLabel(g.domain)}: {g.title}
                    </p>
                  ))}
                  {c.sharedPlans.map((p: any, i: number) => (
                    <details className="plan" key={i}>
                      <summary>
                        <strong>{p.title}</strong>
                        <span>
                          {areaLabel(p.domain)} · by {p.professional}
                        </span>
                      </summary>
                      <p>{p.body}</p>
                    </details>
                  ))}
                  {c.sharedGoals.length + c.sharedPlans.length === 0 && (
                    <p className="field-hint">
                      No goals or other plans in the shared areas yet.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
function PlanForm({
  draft,
  setDraft,
  domains,
  busy,
  save,
}: {
  draft: Draft;
  setDraft: (draft: Draft | null) => void;
  domains: string[];
  busy: boolean;
  save: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="field-grid">
        <div className="field">
          <label htmlFor="plan-title">Plan title</label>
          <input
            id="plan-title"
            required
            minLength={3}
            maxLength={160}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="plan-domain">Area of care</label>
          <select
            id="plan-domain"
            value={draft.domain}
            onChange={(e) => setDraft({ ...draft, domain: e.target.value })}
          >
            {domains.map((d: string) => (
              <option key={d} value={d}>
                {areaLabel(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="field wide">
          <label htmlFor="plan-body">Plan</label>
          <textarea
            id="plan-body"
            required
            rows={8}
            maxLength={8000}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <p className="field-hint">
            Written for your client to read. Keep to your approved scope.
          </p>
        </div>
      </div>
      <div className="request-actions">
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save plan"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => setDraft(null)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
