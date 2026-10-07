"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Video } from "lucide-react";
import { useApp } from "../_components/app";
import { PayStep, paymentLabels, usePayStatuses } from "../_components/pay";
import {
  Dialog,
  SignInPrompt,
  appointmentStatus,
  money,
  nepalTime,
} from "../_components/ui";
// Whether the client is still offered the Cancel button for this appointment.
function canCancel(a: any) {
  // Any pending or confirmed appointment, until it starts.
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
  const { statuses, reload: reloadStatuses } = usePayStatuses(live && !!token);
  const [paying, setPaying] = useState<any>(null);
  useEffect(() => {
    if (!live || !token) return;
    let active = true;
    api("appointments")
      .then((data) => {
        if (active) setMine(data.appointments);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setError(e.message);
          setMine([]);
        }
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
  const respond = (a: any, accept: boolean) =>
    run(async () => {
      await api("appointments/reschedule", "POST", { id: a.id, accept });
      setMine((await api("appointments")).appointments);
      setNotice(
        accept
          ? "New time accepted. Your consultation is confirmed."
          : "You kept the original time.",
      );
    });
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
          <div className="booking-row" key={a.id}>
            <div>
              <strong>{a.provider}</strong>
              <p>
                {a.service} · {nepalTime(a.startsAt)} NPT · {money(a.price)}
                {statuses[a.id] &&
                  a.price > 0 &&
                  !(statuses[a.id] === "UNPAID" && a.status !== "HELD") &&
                  ` · ${paymentLabels[statuses[a.id]]}`}
              </p>
              {a.meetingUrl && (
                <p className="meeting-link">
                  <Video size={14} /> Meeting link:{" "}
                  <a
                    href={a.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {a.meetingUrl}
                  </a>
                </p>
              )}
            </div>
            <span className={`status status-${a.status.toLowerCase()}`}>
              {(a.status === "HELD" && statuses[a.id] === "UNPAID"
                ? "Awaiting payment"
                : appointmentStatus[a.status]) || a.status.replaceAll("_", " ")}
            </span>
            <div className="request-actions wrap">
              {live && a.status === "HELD" && statuses[a.id] === "UNPAID" && (
                <button className="button small" onClick={() => setPaying(a)}>
                  Pay now
                </button>
              )}
              {a.meetingUrl && (
                <a
                  className="button small"
                  href={a.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Join
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
                      await reloadStatuses();
                      setNotice("Appointment cancelled.");
                    })
                  }
                >
                  Cancel
                </button>
              )}
            </div>
            {live &&
              a.proposedStartsAt &&
              ["HELD", "CONFIRMED"].includes(a.status) && (
                <div className="booking-action proposal">
                  <p>
                    <strong>{a.provider} has proposed a new time:</strong>{" "}
                    {nepalTime(a.proposedStartsAt)} NPT. Accepting makes this
                    your confirmed appointment.
                  </p>
                  <div className="request-actions">
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() => respond(a, true)}
                    >
                      Accept new time
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => respond(a, false)}
                    >
                      Keep the original time
                    </button>
                  </div>
                </div>
              )}
          </div>
        ))
      )}
      {paying && (
        <Dialog
          title={`Pay for your session with ${paying.provider}`}
          close={() => setPaying(null)}
        >
          <PayStep
            appointmentId={paying.id}
            amount={paying.price}
            provider={paying.provider}
            done={() => {
              setPaying(null);
              reloadStatuses();
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
