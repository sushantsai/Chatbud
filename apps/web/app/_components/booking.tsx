"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./app";
import { PayStep } from "./pay";
import { nepalTime } from "./ui";
const nepalDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(date);
export function BookingForm({
  provider,
  close,
}: {
  provider: any;
  close: () => void;
}) {
  const { token, api, run, busy, error, setNotice, setDashboard, openAuth } =
    useApp();
  const router = useRouter();
  const days = Array.from(
    { length: 14 },
    (_, i) => new Date(Date.now() + i * 86400000),
  );
  const [day, setDay] = useState(nepalDay(days[0])),
    [slots, setSlots] = useState<string[] | null>(null),
    [slot, setSlot] = useState(""),
    [failed, setFailed] = useState(""),
    // Set once the time is held; the client then chooses how to pay.
    [requested, setRequested] = useState("");
  useEffect(() => {
    let active = true;
    setSlots(null);
    setSlot("");
    setFailed("");
    api(`appointments/slots?serviceId=${provider.serviceId}&date=${day}`)
      .then((data) => {
        if (active) setSlots(data.slots);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setSlots([]);
          setFailed("Times could not be loaded. Try another day.");
        }
      });
    return () => {
      active = false;
    };
  }, [day, provider.serviceId]);
  if (requested)
    return (
      <>
        <p className="form-note held">
          {nepalTime(slot)} NPT is held for you. Pay to send your request.
        </p>
        <PayStep
          appointmentId={requested}
          amount={provider.price}
          provider={provider.name}
          done={() => {
            close();
            router.push("/appointments");
          }}
        />
      </>
    );
  return (
    <form
      className="booking"
      onSubmit={(e) => {
        e.preventDefault();
        if (!slot) return setFailed("Choose a time to continue.");
        run(async () => {
          const held = await api("appointments", "POST", {
            serviceId: provider.serviceId,
            startsAt: slot,
            idempotencyKey: crypto.randomUUID(),
          });
          setDashboard(await api("me"));
          // Free services need no payment step.
          if (!provider.price) {
            setNotice(`Request sent to ${provider.name}.`);
            close();
            return router.push("/appointments");
          }
          setRequested(held.id);
        });
      }}
    >
      <fieldset>
        <legend>Day</legend>
        <div className="day-strip">
          {days.map((d) => {
            const value = nepalDay(d);
            return (
              <label key={value} className="choice day">
                <input
                  type="radio"
                  name="day"
                  checked={day === value}
                  onChange={() => setDay(value)}
                />
                <span>
                  <small>
                    {d.toLocaleDateString("en-NP", {
                      weekday: "short",
                      timeZone: "Asia/Kathmandu",
                    })}
                  </small>
                  {d.toLocaleDateString("en-NP", {
                    day: "numeric",
                    month: "short",
                    timeZone: "Asia/Kathmandu",
                  })}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend>Time · Nepal time</legend>
        {slots === null ? (
          <p className="empty-inline" role="status">
            Loading times…
          </p>
        ) : slots.length === 0 ? (
          <p className="empty-inline">
            {failed || "No times are open on this day. Try another day."}
          </p>
        ) : (
          <div className="slot-grid">
            {slots.map((s) => (
              <label key={s} className="choice">
                <input
                  type="radio"
                  name="slot"
                  checked={slot === s}
                  onChange={() => {
                    setSlot(s);
                    setFailed("");
                  }}
                />
                <span>{nepalTime(s, false)}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <p className="form-note">
        Next you choose how to pay. {provider.name} then confirms your request
        and shares a meeting link.
      </p>
      {(failed || error) && slots && slots.length > 0 && (
        <p role="alert" className="form-error">
          {failed || error}
        </p>
      )}
      {token ? (
        <button className="button full" disabled={busy || !slot}>
          {busy ? "Holding your time…" : "Continue to payment"}
        </button>
      ) : (
        <button type="button" className="button full" onClick={openAuth}>
          Sign in to request this time
        </button>
      )}
    </form>
  );
}
