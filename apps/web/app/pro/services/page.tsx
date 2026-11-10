"use client";
import { useState } from "react";
import { WeeklyHours } from "../_components/sections";
import { ServiceWizard } from "../_components/service-wizard";
import { Setup } from "../_components/desk";
import { usePro } from "../_components/gate";
import { useApp } from "../../_components/app";

export default function Services() {
  const { api, run, busy, setNotice } = useApp();
  const { workspace } = usePro();
  const [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const invalid = !!start && !!end && end <= start;
  return (
    <div className="pro-desk">
      <Setup workspace={workspace} />
      <ServiceWizard />
      <WeeklyHours />
      <section className="panel pro-block" aria-labelledby="block-title">
        <div className="pro-section-head">
          <h2 id="block-title">Block time off</h2>
          <p>
            Holidays, training or anything else. New bookings will not be
            offered in this time; sessions already confirmed stay as they are.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api("workflow", "POST", {
                action: "availability_block",
                data: {
                  startsAt: new Date(`${start}:00+05:45`).toISOString(),
                  endsAt: new Date(`${end}:00+05:45`).toISOString(),
                },
              });
              setStart("");
              setEnd("");
              setNotice("Time blocked.");
            });
          }}
        >
          <div className="field">
            <label htmlFor="block-start">From · Nepal time</label>
            <input
              id="block-start"
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="block-end">Until · Nepal time</label>
            <input
              id="block-end"
              type="datetime-local"
              required
              min={start || undefined}
              aria-invalid={invalid}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <button className="button" disabled={busy || invalid}>
            Block this time
          </button>
        </form>
        {invalid && (
          <p className="field-error" role="alert">
            The end must be after the start.
          </p>
        )}
      </section>
    </div>
  );
}
