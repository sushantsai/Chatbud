"use client";
import { useState } from "react";
import { CalendarDays, Check, Plus } from "lucide-react";
import { useApp } from "../_components/app";
import { Clients } from "./clients";
import {
  appointmentStatus,
  money,
  nepalTime,
  professions,
} from "../_components/ui";
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
type Service = {
  id?: string;
  profession: string;
  title: string;
  durationMinutes: number;
  price: number;
  active: boolean;
};
type Hours = { on: boolean; start: string; end: string };
export function PracticeWorkspace({
  workspace,
  reload,
}: {
  workspace: any;
  reload: () => Promise<void>;
}) {
  const { api, run, busy, setNotice } = useApp();
  const [editing, setEditing] = useState<Service | null>(null),
    [links, setLinks] = useState<Record<string, string>>({}),
    [hours, setHours] = useState<Hours[]>(() =>
      weekdays.map((_, day) => {
        const rule = workspace.availability.find((r: any) => r.weekday === day);
        return {
          on: !!rule,
          start: rule?.start || "09:00",
          end: rule?.end || "17:00",
        };
      }),
    );
  const requests = workspace.appointments.filter(
    (a: any) => a.status === "HELD",
  );
  const upcoming = workspace.appointments.filter(
    (a: any) => a.status === "CONFIRMED",
  );
  const listed =
    workspace.services.some((s: Service) => s.active) &&
    workspace.availability.length > 0;
  const act = (action: () => Promise<void>, notice: string) =>
    run(async () => {
      await action();
      await reload();
      setNotice(notice);
    });
  const invalidHours = hours.some((h) => h.on && h.end <= h.start);
  return (
    <>
      {!listed && (
        <div className="application-status">
          <Check size={19} />
          <div>
            <strong>You are approved. Two steps to go live.</strong>
            <p>
              Add at least one active service and your weekly hours. Your
              profile then appears in the directory and clients can request
              times.
            </p>
          </div>
        </div>
      )}
      <section className="panel">
        <h2>Appointment requests</h2>
        {requests.length === 0 ? (
          <p className="empty-inline">
            New requests appear here. You have 24 hours to confirm each one.
          </p>
        ) : (
          requests.map((a: any) => (
            <div className="request" key={a.id}>
              <div>
                <strong>{a.client}</strong>
                <p>
                  {a.service} · {nepalTime(a.startsAt)} NPT
                </p>
              </div>
              <label>
                Meeting link
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://meet.google.com/…"
                  value={links[a.id] || ""}
                  onChange={(e) =>
                    setLinks((l) => ({ ...l, [a.id]: e.target.value }))
                  }
                />
              </label>
              <div className="request-actions">
                <button
                  className="button small"
                  disabled={busy || !/^https:\/\/\S+$/.test(links[a.id] || "")}
                  onClick={() =>
                    act(
                      () =>
                        api("provider/appointments", "POST", {
                          id: a.id,
                          decision: "CONFIRM",
                          meetingUrl: links[a.id],
                        }),
                      "Appointment confirmed. Your client can now see the meeting link.",
                    )
                  }
                >
                  Confirm
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () =>
                        api("provider/appointments", "POST", {
                          id: a.id,
                          decision: "DECLINE",
                        }),
                      "Request declined.",
                    )
                  }
                >
                  Decline
                </button>
              </div>
            </div>
          ))
        )}
      </section>
      <section className="panel">
        <h2>Upcoming appointments</h2>
        {upcoming.length === 0 ? (
          <p className="empty-inline">Confirmed appointments appear here.</p>
        ) : (
          upcoming.map((a: any) => (
            <div className="record appointment" key={a.id}>
              <span className="record-icon">
                <CalendarDays size={22} />
              </span>
              <div>
                <strong>{a.client}</strong>
                <p>
                  {a.service} · {nepalTime(a.startsAt)} NPT
                </p>
              </div>
              <span className="status status-confirmed">
                {appointmentStatus[a.status]}
              </span>
              <div className="record-actions">
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
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => api("appointments/cancel", "POST", { id: a.id }),
                      "Appointment cancelled.",
                    )
                  }
                >
                  Cancel
                </button>
              </div>
            </div>
          ))
        )}
      </section>
      <Clients />
      <section className="panel">
        <div className="panel-heading">
          <h2>Services</h2>
          {!editing && workspace.services.length < 5 && (
            <button
              onClick={() =>
                setEditing({
                  profession: workspace.professions[0],
                  title: "",
                  durationMinutes: 50,
                  price: 1500,
                  active: true,
                })
              }
            >
              <Plus size={15} /> Add a service
            </button>
          )}
        </div>
        {workspace.services.length === 0 && !editing && (
          <p className="empty-inline">
            Describe what clients can book with you, how long it lasts and what
            it costs.
          </p>
        )}
        {!editing &&
          workspace.services.map((s: Service) => (
            <div className="record" key={s.id}>
              <div>
                <strong>{s.title}</strong>
                <p>
                  {professions[s.profession]} · {s.durationMinutes} min ·{" "}
                  {money(s.price)}
                </p>
              </div>
              <span className="status">{s.active ? "Bookable" : "Hidden"}</span>
              <button className="text-button" onClick={() => setEditing(s)}>
                Edit
              </button>
            </div>
          ))}
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api("provider/service", "POST", editing);
                setEditing(null);
              }, "Service saved.");
            }}
          >
            <div className="field-grid">
              <div className="field wide">
                <label htmlFor="service-title">Service name</label>
                <input
                  id="service-title"
                  required
                  minLength={3}
                  maxLength={120}
                  placeholder="Individual consultation"
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="service-profession">Offered as</label>
                <select
                  id="service-profession"
                  value={editing.profession}
                  onChange={(e) =>
                    setEditing({ ...editing, profession: e.target.value })
                  }
                >
                  {workspace.professions.map((p: string) => (
                    <option key={p} value={p}>
                      {professions[p] || p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="service-duration">Length in minutes</label>
                <input
                  id="service-duration"
                  type="number"
                  inputMode="numeric"
                  required
                  min={15}
                  max={180}
                  step={5}
                  value={editing.durationMinutes}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      durationMinutes: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="service-price">Fee in NPR</label>
                <input
                  id="service-price"
                  type="number"
                  inputMode="numeric"
                  required
                  min={0}
                  max={100000}
                  value={editing.price}
                  onChange={(e) =>
                    setEditing({ ...editing, price: Number(e.target.value) })
                  }
                />
              </div>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) =>
                    setEditing({ ...editing, active: e.target.checked })
                  }
                />
                <span>Clients can book this service</span>
              </label>
            </div>
            <div className="request-actions">
              <button className="button" disabled={busy}>
                {busy ? "Saving…" : "Save service"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
      <section className="panel">
        <h2>Weekly hours</h2>
        <p className="section-copy">
          Nepal time. Clients are offered back-to-back times within these hours,
          starting at least two hours ahead.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () =>
                api("provider/availability", "POST", {
                  rules: hours.flatMap((h, weekday) =>
                    h.on ? [{ weekday, start: h.start, end: h.end }] : [],
                  ),
                }),
              "Weekly hours saved.",
            );
          }}
        >
          <div className="hours">
            {weekdays.map((name, day) => {
              const h = hours[day];
              const change = (patch: Partial<Hours>) =>
                setHours((all) =>
                  all.map((x, i) => (i === day ? { ...x, ...patch } : x)),
                );
              return (
                <div key={name} className={h.on ? "" : "off"}>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={h.on}
                      onChange={(e) => change({ on: e.target.checked })}
                    />
                    <span>{name}</span>
                  </label>
                  {h.on ? (
                    <>
                      <input
                        type="time"
                        aria-label={`${name} start`}
                        value={h.start}
                        onChange={(e) => change({ start: e.target.value })}
                      />
                      <span>to</span>
                      <input
                        type="time"
                        aria-label={`${name} end`}
                        value={h.end}
                        aria-invalid={h.end <= h.start}
                        onChange={(e) => change({ end: e.target.value })}
                      />
                    </>
                  ) : (
                    <span className="hours-off">Not available</span>
                  )}
                </div>
              );
            })}
          </div>
          {invalidHours && (
            <p className="field-error" role="alert">
              Each day must end after it starts.
            </p>
          )}
          <div className="request-actions">
            <button className="button" disabled={busy || invalidHours}>
              {busy ? "Saving…" : "Save weekly hours"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
