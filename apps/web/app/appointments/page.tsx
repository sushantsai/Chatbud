"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Video } from "lucide-react";
import { useApp } from "../_components/app";
import {
  SignInPrompt,
  appointmentStatus,
  money,
  nepalTime,
} from "../_components/ui";
// Whether the client is still offered the Cancel button for this appointment.
function canCancel(a: any) {
  // TODO(human): decide how close to the start a client may still cancel.
  return (
    ["HELD", "CONFIRMED"].includes(a.status) &&
    Date.parse(a.startsAt) > Date.now()
  );
}
export default function Appointments() {
  const {
    mode,
    token,
    dashboard,
    api,
    run,
    busy,
    setNotice,
    setError,
    openAuth,
  } = useApp();
  const [mine, setMine] = useState<any[] | null>(null);
  const live = mode === "live";
  useEffect(() => {
    if (!live || !token) return;
    let active = true;
    api("appointments")
      .then((data) => {
        if (active) setMine(data.appointments);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [live, token]);
  if (live && !token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in to see your appointments.
      </SignInPrompt>
    );
  const appointments: any[] | null = live ? mine : dashboard.appointments;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Appointments</h2>
        <Link href="/professionals">Find a professional</Link>
      </div>
      {appointments === null ? (
        <p className="empty-inline" role="status">
          Loading your appointments…
        </p>
      ) : appointments.length === 0 ? (
        <p className="empty-inline">
          Your appointments will appear here when you book.
        </p>
      ) : (
        appointments.map((a: any) => (
          <div className="record appointment" key={a.id}>
            <span className="record-icon">
              <CalendarDays size={22} />
            </span>
            <div>
              <strong>{a.provider}</strong>
              <p>
                {a.service} · {nepalTime(a.startsAt)} NPT · {money(a.price)}
              </p>
            </div>
            <span className={`status status-${a.status.toLowerCase()}`}>
              {appointmentStatus[a.status] || a.status.replaceAll("_", " ")}
            </span>
            <div className="record-actions">
              {a.meetingUrl && (
                <a
                  className="button small"
                  href={a.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Video size={15} /> Join
                </a>
              )}
              {live && canCancel(a) && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("appointments/cancel", "POST", { id: a.id });
                      setMine((await api("appointments")).appointments);
                      setNotice("Appointment cancelled.");
                    })
                  }
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
