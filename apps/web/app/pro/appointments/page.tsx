"use client";
import Link from "next/link";
import { Requests } from "../_components/sections";
import { usePro } from "../_components/gate";
import { nepalTime } from "../../_components/ui";
export default function ProAppointments() {
  const { workspace } = usePro();
  return (
    <>
      <Requests />
      <section className="panel">
        <h2>Confirmed sessions</h2>
        {workspace.appointments
          .filter((a: any) => a.status === "CONFIRMED")
          .map((a: any) => (
            <article className="service-card" key={a.id}>
              <h3>{a.client}</h3>
              <p>
                {a.service} · {nepalTime(a.startsAt)} NPT
              </p>
              <Link className="button secondary" href={`/appointments/${a.id}`}>
                Open session
              </Link>
            </article>
          ))}
      </section>
    </>
  );
}
