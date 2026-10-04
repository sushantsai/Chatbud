"use client";
import { useState } from "react";
import { appointmentStatus, nepalTime } from "../../_components/ui";
import { Area, useOps } from "../_components/area";
import { useLoad } from "../_components/use-load";
const views = [
  ["attention", "Needs attention"],
  ["upcoming", "Upcoming"],
  ["all", "All (30 days)"],
];
function Booking({ b, reload }: { b: any; reload: () => Promise<void> }) {
  const { ops, run, busy, setNotice } = useOps();
  const [mode, setMode] = useState<"" | "confirm" | "cancel">(""),
    [value, setValue] = useState("");
  const future = Date.parse(b.startsAt) > Date.now();
  const submit = () =>
    run(async () => {
      await ops(
        mode === "confirm" ? "booking_confirm" : "booking_cancel",
        mode === "confirm"
          ? { id: b.id, meetingUrl: value.trim() }
          : { id: b.id, reason: value.trim() },
      );
      setMode("");
      setValue("");
      await reload();
      setNotice(
        mode === "confirm"
          ? "Confirmed on the professional’s behalf."
          : "Appointment cancelled.",
      );
    });
  const valid =
    mode === "confirm"
      ? /^https:\/\/\S+$/.test(value.trim())
      : value.trim().length >= 10;
  return (
    <div className="booking-row">
      <div>
        <strong>
          {b.client} with {b.professional}
        </strong>
        <p>
          {b.service} · {nepalTime(b.startsAt)} NPT · {b.clientEmail}
        </p>
      </div>
      <span className={`status status-${b.status.toLowerCase()}`}>
        {appointmentStatus[b.status] || b.status}
      </span>
      <div className="request-actions">
        {b.status === "HELD" && future && (
          <button
            className="button secondary small"
            onClick={() => (setMode("confirm"), setValue(""))}
          >
            Confirm for them
          </button>
        )}
        {["HELD", "CONFIRMED"].includes(b.status) && (
          <button
            className="text-button"
            onClick={() => (setMode("cancel"), setValue(""))}
          >
            Cancel
          </button>
        )}
      </div>
      {mode && (
        <form
          className="booking-action"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="field">
            <label htmlFor={`act-${b.id}`}>
              {mode === "confirm"
                ? "Meeting link agreed with the professional"
                : "Reason, recorded on the appointment"}
            </label>
            <input
              id={`act-${b.id}`}
              autoFocus
              type={mode === "confirm" ? "url" : "text"}
              maxLength={mode === "confirm" ? 300 : 500}
              placeholder={mode === "confirm" ? "https://…" : ""}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div className="request-actions">
            <button className="button small" disabled={busy || !valid}>
              {mode === "confirm"
                ? "Confirm appointment"
                : "Cancel appointment"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setMode("")}
            >
              Back
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
export default function Bookings() {
  const { data, reload } = useLoad("bookings_list");
  const [view, setView] = useState("attention");
  const now = Date.now();
  const bookings = (data?.bookings || []).filter((b: any) =>
    view === "attention"
      ? b.status === "HELD" ||
        (b.status === "EXPIRED" && Date.parse(b.startsAt) > now)
      : view === "upcoming"
        ? b.status === "CONFIRMED" && Date.parse(b.startsAt) > now
        : true,
  );
  return (
    <Area area="support">
      <section className="panel">
        <h2>Bookings</h2>
        <p className="section-copy">
          Requests waiting on a professional, lapsed requests, and confirmed
          appointments. Step in when a professional has not responded.
        </p>
        <div className="chips">
          {views.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={view === id}
              className={view === id ? "chip chosen" : "chip"}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {!data ? (
          <p className="empty-inline" role="status">
            Loading bookings…
          </p>
        ) : bookings.length === 0 ? (
          <p className="empty-inline">Nothing in this view.</p>
        ) : (
          bookings.map((b: any) => <Booking key={b.id} b={b} reload={reload} />)
        )}
      </section>
    </Area>
  );
}
