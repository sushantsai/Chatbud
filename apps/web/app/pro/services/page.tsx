"use client";
import { GoLive, WeeklyHours } from "../_components/sections";
import { ServiceWizard } from "../_components/service-wizard";
import { useApp } from "../../_components/app";
import { useState } from "react";
export default function Services() {
  const { api, run, setNotice } = useApp();
  const [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  return (
    <>
      <GoLive />
      <ServiceWizard />
      <WeeklyHours />
      <section className="panel">
        <h2>Block time</h2>
        <p>
          Blocked time removes overlapping slots from new bookings. Existing
          confirmed appointments remain valid.
        </p>
        <form
          className="form-stack"
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
              setNotice("Time blocked.");
            });
          }}
        >
          <label>
            Start · Nepal time
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            End · Nepal time
            <input
              type="datetime-local"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <button className="button">Block time</button>
        </form>
      </section>
    </>
  );
}
