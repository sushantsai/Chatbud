"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "../../_components/app";
import { CareRecords } from "../../_components/care-records";

const initials = (name: string) =>
  (name || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function Clients() {
  const { api, setError } = useApp();
  const [data, setData] = useState<any>(null),
    [client, setClient] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    api("provider/clients")
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  const list: any[] = (data?.clients || []).filter((c: any) =>
    (c.name || "").toLowerCase().includes(query.toLowerCase()),
  );
  const chosen = data?.clients?.find((c: any) => c.id === client);

  return (
    <div className="pro-clients">
      <section className="pro-client-list" aria-label="Your clients">
        <div className="pro-section-head">
          <h2>Clients</h2>
          <p>People you have seen. Records open only as each client allows.</p>
        </div>
        {data && data.clients.length > 6 && (
          <label className="pro-client-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Find a client"
              placeholder="Find a client"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        )}
        {!data ? (
          <p className="pro-empty" role="status">
            Loading clients…
          </p>
        ) : data.clients.length === 0 ? (
          <p className="pro-empty">
            Clients appear here after their first confirmed session.
          </p>
        ) : (
          <ul>
            {list.map((c: any) => (
              <li key={c.id}>
                <button
                  className={c.id === client ? "selected" : ""}
                  aria-pressed={c.id === client}
                  onClick={() => setClient(c.id)}
                >
                  <span className="pro-avatar" aria-hidden="true">
                    {initials(c.name)}
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {c.plans?.length
                        ? `${c.plans.length} active ${c.plans.length === 1 ? "plan" : "plans"}`
                        : "No active plan"}
                      {c.sharedDomains?.length
                        ? ` · shares ${c.sharedDomains.length} ${c.sharedDomains.length === 1 ? "record" : "records"}`
                        : ""}
                    </small>
                  </span>
                </button>
              </li>
            ))}
            {list.length === 0 && (
              <li className="pro-empty">No client matches “{query}”.</li>
            )}
          </ul>
        )}
      </section>
      <div className="pro-client-detail">
        {chosen ? (
          <>
            <h2 className="pro-client-name">{chosen.name}</h2>
            <CareRecords
              key={client}
              clientId={client}
              domains={data.domains}
            />
          </>
        ) : (
          <div className="pro-client-placeholder">
            <h2>Choose a client</h2>
            <p>
              See their intake answers, your private notes and the care plans
              you have published to them.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
