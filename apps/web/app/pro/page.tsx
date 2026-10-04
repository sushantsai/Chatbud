"use client";
import Link from "next/link";
import { CalendarDays, Clock, Eye, Stethoscope } from "lucide-react";
import { Summary, nepalTime } from "../_components/ui";
import { usePro } from "./_components/gate";
import {
  GoLive,
  Requests,
  confirmedAppointments,
  isBookable,
  pendingRequests,
} from "./_components/sections";
export default function ProDashboard() {
  const { workspace } = usePro();
  const upcoming = confirmedAppointments(workspace);
  return (
    <>
      <GoLive />
      <div className="summary-grid">
        <Summary
          icon={Clock}
          label="Requests waiting"
          value={pendingRequests(workspace).length}
        />
        <Summary
          icon={CalendarDays}
          label="Upcoming appointments"
          value={upcoming.length}
        />
        <Summary
          icon={Eye}
          label="Directory listing"
          value={isBookable(workspace) ? "Bookable" : "Listed, not bookable"}
        />
      </div>
      <Requests />
      <section className="panel">
        <div className="panel-heading">
          <h2>Next appointments</h2>
          <Link href="/pro/appointments">All appointments</Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="empty-inline">Confirmed appointments appear here.</p>
        ) : (
          upcoming.slice(0, 3).map((a: any) => (
            <div className="record" key={a.id}>
              <span className="record-icon">
                <CalendarDays size={22} />
              </span>
              <div>
                <strong>{a.client}</strong>
                <p>
                  {a.service} · {nepalTime(a.startsAt)} NPT
                </p>
              </div>
            </div>
          ))
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Your services</h2>
          <Link href="/pro/services">Manage services and hours</Link>
        </div>
        {workspace.services.length === 0 ? (
          <p className="empty-inline">
            You have not added a service yet, so clients cannot book you.
          </p>
        ) : (
          workspace.services.map((s: any) => (
            <div className="record" key={s.id}>
              <span className="record-icon">
                <Stethoscope size={22} />
              </span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.durationMinutes} min</p>
              </div>
              <span className="status">{s.active ? "Bookable" : "Hidden"}</span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
