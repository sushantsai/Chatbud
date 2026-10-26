"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "./app";
import { nepalTime } from "./ui";
export function Notifications() {
  const { api, token } = useApp();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    api("workflow", "POST", { action: "notifications", data: {} })
      .then((d) => active && setItems(d.notifications))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  return items.length > 0 ? (
    <section className="panel">
      <h2>Updates</h2>
      {items.slice(0, 8).map((n) => (
        <Link className="record" href={n.href} key={n.id}>
          <div>
            <strong>{n.message}</strong>
            <p>{nepalTime(n.created_at)} NPT</p>
          </div>
        </Link>
      ))}
    </section>
  ) : null;
}
export function SupportCases() {
  const { api, token, run, setError } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const load = () =>
    api("workflow", "POST", { action: "cases_mine", data: {} }).then((d) =>
      setItems(d.cases),
    );
  useEffect(() => {
    if (!token) return;
    let active = true;
    api("workflow", "POST", { action: "cases_mine", data: {} })
      .then((d) => active && setItems(d.cases))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [token]);
  return (
    <section className="panel">
      <h2>Booking, order & follow-up cases</h2>
      {items.length === 0 ? (
        <p>No coordination cases.</p>
      ) : (
        items.map((c) => (
          <article className="service-card" key={c.id}>
            <h3>{c.title}</h3>
            <span className="status">{c.status}</span>
            {c.dueAt && <p>Next target: {nepalTime(c.dueAt)} NPT</p>}
            {c.appointmentId && (
              <Link href={`/appointments/${c.appointmentId}`}>
                View appointment
              </Link>
            )}
            {c.kind === "FOLLOWUP" && !c.contactStopped && (
              <button
                className="text-button"
                onClick={() =>
                  run(async () => {
                    await api("workflow", "POST", {
                      action: "contact_optout",
                      data: { id: c.id },
                    });
                    await load();
                  })
                }
              >
                Stop follow-up scheduling contact
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}
