"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, Check } from "lucide-react";
import { useApp } from "../../_components/app";
export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="loading" role="status">
          Loading…
        </div>
      }
    >
      <Calendar />
    </Suspense>
  );
}
function Calendar() {
  const { api, run, busy, setNotice, setError } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code"),
    state = params.get("state"),
    refused = params.get("error");
  const [status, setStatus] = useState<any>(null);
  const call = (action: string, data: unknown = {}) =>
    api("provider/google", "POST", { action, data });
  useEffect(() => {
    let active = true;
    // Coming back from Google: finish the connection, then tidy the address bar.
    (code && state ? call("finish", { code, state }) : call("status"))
      .then((s) => {
        if (!active) return;
        setStatus(s);
        if (code) setNotice("Google Calendar connected.");
      })
      .catch(async (e) => {
        if (!active || e.name === "AbortError") return;
        setError(e.message);
        setStatus(await call("status").catch(() => ({ failed: true })));
      })
      .finally(() => {
        if (active && (code || refused)) router.replace("/pro/calendar");
      });
    if (refused)
      setError(
        "Google Calendar was not connected because access was declined.",
      );
    return () => {
      active = false;
    };
  }, [code, state]);
  if (!status)
    return (
      <div className="loading" role="status">
        {code ? "Connecting your calendar…" : "Checking your calendar…"}
      </div>
    );
  if (status.failed)
    return (
      <section className="panel portal-login">
        <h2>Calendar is available once you are approved</h2>
        <p className="section-copy">
          After your application is approved you can connect Google Calendar
          here.
        </p>
      </section>
    );
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>{status.connected ? "Connected" : "Connect Google Calendar"}</h2>
          {status.connected && (
            <span className="status status-confirmed">{status.email}</span>
          )}
        </div>
        {status.connected ? (
          <>
            <p className="section-copy">
              Confirmed sessions are added to this calendar with a Google Meet
              link, and times when you are busy are not offered to clients.
            </p>
            {status.lastError && (
              <p className="field-error" role="alert">
                Chatbud could not reach your calendar last time. Disconnect and
                connect again to fix it.
              </p>
            )}
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Disconnect Google Calendar? Sessions already on your calendar stay there, but new ones will not be added.",
                  )
                )
                  run(async () => {
                    setStatus(await call("disconnect"));
                    setNotice("Google Calendar disconnected.");
                  });
              }}
            >
              Disconnect
            </button>
          </>
        ) : status.available ? (
          <>
            <p className="section-copy">
              You will be taken to Google to agree. Tick both calendar
              permissions when asked.
            </p>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  window.location.assign((await call("start")).url);
                })
              }
            >
              <CalendarCheck size={18} /> Connect Google Calendar
            </button>
          </>
        ) : (
          <p className="empty-inline">
            Google Calendar is being set up by Chatbud and will be available
            here soon.
          </p>
        )}
      </section>
      <section className="panel">
        <h2>What connecting does</h2>
        <ul className="plain-list">
          <li>
            <Check size={18} /> Each session you confirm appears on your
            calendar with its own Google Meet link.
          </li>
          <li>
            <Check size={18} /> Your client gets a calendar invitation by email.
          </li>
          <li>
            <Check size={18} /> Rescheduled sessions move, and cancelled ones
            are removed.
          </li>
          <li>
            <Check size={18} /> Times when your calendar shows you as busy are
            not offered for booking.
          </li>
        </ul>
        <p className="field-hint">
          Chatbud can add and change its own sessions and see when you are busy.
          It cannot read what your other events are. Calendar entries are titled
          “Chatbud session” and never mention the kind of care.
        </p>
      </section>
    </>
  );
}
