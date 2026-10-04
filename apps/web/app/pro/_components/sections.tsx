"use client";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useApp } from "../../_components/app";
import {
  appointmentStatus,
  money,
  nepalTime,
  professions,
} from "../../_components/ui";
import { usePro } from "./gate";
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
// Shared by every section: run an action, reload the workspace, then confirm.
function useSection() {
  const app = useApp();
  const { workspace, reload } = usePro();
  const act = (action: () => Promise<unknown>, notice: string) =>
    app.run(async () => {
      await action();
      await reload();
      app.setNotice(notice);
    });
  return { ...app, workspace, reload, act };
}
export const pendingRequests = (workspace: any) =>
  workspace.appointments.filter((a: any) => a.status === "HELD");
export const confirmedAppointments = (workspace: any) =>
  workspace.appointments.filter((a: any) => a.status === "CONFIRMED");
export const isBookable = (workspace: any) =>
  workspace.services.some((s: Service) => s.active) &&
  workspace.availability.length > 0;
export function GoLive() {
  const { workspace } = usePro();
  const listed = isBookable(workspace);
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
    </>
  );
}
const nepalDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(date);
// Lets the professional offer the client a different date and time.
function ProposeTime({ a, done }: { a: any; done: () => void }) {
  const { api, busy, act } = useSection();
  const [date, setDate] = useState(nepalDay(new Date(a.startsAt))),
    [time, setTime] = useState("10:00");
  const startsAt = new Date(`${date}T${time}:00+05:45`);
  const valid =
    !Number.isNaN(startsAt.getTime()) &&
    startsAt.getTime() > Date.now() + 3600000;
  return (
    <form
      className="booking-action"
      onSubmit={(e) => {
        e.preventDefault();
        act(async () => {
          await api("provider/reschedule", "POST", {
            id: a.id,
            startsAt: startsAt.toISOString(),
          });
          done();
        }, `New time sent to ${a.client}. It is final once they accept.`);
      }}
    >
      <div className="propose-fields">
        <div className="field">
          <label htmlFor={`date-${a.id}`}>New date</label>
          <input
            id={`date-${a.id}`}
            type="date"
            required
            min={nepalDay(new Date())}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`time-${a.id}`}>New time · Nepal time</label>
          <input
            id={`time-${a.id}`}
            type="time"
            required
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>
      <div className="request-actions">
        <button className="button small" disabled={busy || !valid}>
          Send new time
        </button>
        <button type="button" className="text-button" onClick={done}>
          Back
        </button>
      </div>
      {!valid && (
        <p className="field-error" role="alert">
          Choose a time at least one hour from now.
        </p>
      )}
    </form>
  );
}
function Proposed({ a }: { a: any }) {
  return a.proposedStartsAt ? (
    <p className="proposal-note">
      You proposed {nepalTime(a.proposedStartsAt)} NPT. Waiting for {a.client}{" "}
      to accept.
    </p>
  ) : null;
}
export function Requests() {
  const { workspace, api, busy, act } = useSection();
  const [links, setLinks] = useState<Record<string, string>>({}),
    [moving, setMoving] = useState("");
  const requests = pendingRequests(workspace);
  return (
    <section className="panel">
      <h2>Appointment requests</h2>
      {requests.length === 0 ? (
        <p className="empty-inline">
          New requests appear here. You have 24 hours to confirm each one.
        </p>
      ) : (
        requests.map((a: any) => {
          const own = (links[a.id] || "").trim();
          return (
            <div className="booking-row" key={a.id}>
              <div>
                <strong>{a.client}</strong>
                <p>
                  {a.service} · {nepalTime(a.startsAt)} NPT
                </p>
                <Proposed a={a} />
              </div>
              <span className="status status-held">
                {appointmentStatus[a.status]}
              </span>
              <div className="request-actions wrap">
                <button
                  className="button small"
                  disabled={busy || (!!own && !/^https:\/\/\S+$/.test(own))}
                  onClick={() =>
                    act(
                      () =>
                        api("provider/appointments", "POST", {
                          id: a.id,
                          decision: "CONFIRM",
                          ...(own ? { meetingUrl: own } : {}),
                        }),
                      "Confirmed. The meeting link is now on your client’s appointment.",
                    )
                  }
                >
                  Confirm
                </button>
                <button
                  className="button secondary small"
                  onClick={() => setMoving(moving === a.id ? "" : a.id)}
                >
                  Propose another time
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
              {moving === a.id ? (
                <ProposeTime a={a} done={() => setMoving("")} />
              ) : (
                <details className="own-link">
                  <summary>Use my own meeting link</summary>
                  <div className="field">
                    <label htmlFor={`link-${a.id}`}>
                      Meeting link<span className="optional">Optional</span>
                    </label>
                    <input
                      id={`link-${a.id}`}
                      type="url"
                      inputMode="url"
                      placeholder="https://meet.google.com/…"
                      value={links[a.id] || ""}
                      onChange={(e) =>
                        setLinks((l) => ({ ...l, [a.id]: e.target.value }))
                      }
                    />
                    <p className="field-hint">
                      Leave empty and Chatbud creates the meeting link when you
                      confirm.
                    </p>
                  </div>
                </details>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
export function Upcoming() {
  const { workspace, api, busy, act } = useSection();
  const [moving, setMoving] = useState("");
  const upcoming = confirmedAppointments(workspace);
  return (
    <section className="panel">
      <h2>Upcoming appointments</h2>
      {upcoming.length === 0 ? (
        <p className="empty-inline">Confirmed appointments appear here.</p>
      ) : (
        upcoming.map((a: any) => (
          <div className="booking-row" key={a.id}>
            <div>
              <strong>{a.client}</strong>
              <p>
                {a.service} · {nepalTime(a.startsAt)} NPT
              </p>
              <Proposed a={a} />
            </div>
            <span className="status status-confirmed">
              {appointmentStatus[a.status]}
            </span>
            <div className="request-actions wrap">
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
                className="button secondary small"
                onClick={() => setMoving(moving === a.id ? "" : a.id)}
              >
                Propose another time
              </button>
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
            {moving === a.id && (
              <ProposeTime a={a} done={() => setMoving("")} />
            )}
          </div>
        ))
      )}
    </section>
  );
}
export function ProfileName() {
  const { api, run, busy, setNotice, dashboard, setDashboard } = useApp();
  const [name, setName] = useState<string>(dashboard.displayName || "");
  return (
    <section className="panel">
      <h2>Public profile</h2>
      <p className="section-copy">
        This is the name clients see in the directory and on appointments.
      </p>
      <form
        className="goal-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api("provider/profile", "POST", {
              displayName: name.trim(),
            });
            setDashboard(await api("me"));
            setNotice("Profile name updated.");
          });
        }}
      >
        <div className="field">
          <label htmlFor="profile-name">Name on your profile</label>
          <input
            id="profile-name"
            required
            minLength={3}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="request-actions">
          <button
            className="button small"
            disabled={busy || name.trim() === (dashboard.displayName || "")}
          >
            Save name
          </button>
        </div>
      </form>
    </section>
  );
}
export function Services() {
  const { workspace, api, busy, act } = useSection();
  const [editing, setEditing] = useState<Service | null>(null);
  return (
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
          Describe what clients can book with you, how long it lasts and what it
          costs.
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
  );
}
export function WeeklyHours() {
  const { workspace, api, busy, act } = useSection();
  const [hours, setHours] = useState<Hours[]>(() =>
    weekdays.map((_, day) => {
      const rule = workspace.availability.find((r: any) => r.weekday === day);
      return {
        on: !!rule,
        start: rule?.start || "09:00",
        end: rule?.end || "17:00",
      };
    }),
  );
  const invalidHours = hours.some((h) => h.on && h.end <= h.start);
  return (
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
  );
}
