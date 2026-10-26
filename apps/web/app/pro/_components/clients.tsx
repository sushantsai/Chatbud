"use client";
import { useEffect, useState } from "react";
import { useApp } from "../../_components/app";
import { CareRecords } from "../../_components/care-records";
export function Clients() {
  const { api, setError } = useApp();
  const [data, setData] = useState<any>(null),
    [client, setClient] = useState("");
  useEffect(() => {
    let active = true;
    api("provider/clients")
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <section className="panel">
        <h1>Clients & follow-ups</h1>
        <p>Intake, author-only notes and explicitly published care plans.</p>
        {!data ? (
          <p role="status">Loading clients…</p>
        ) : (
          <label>
            Client
            <select value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">Choose client</option>
              {data.clients.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      {client && (
        <CareRecords key={client} clientId={client} domains={data.domains} />
      )}
    </>
  );
}
