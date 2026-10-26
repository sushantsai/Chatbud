"use client";
import { useEffect, useState } from "react";
import { useApp } from "../../_components/app";
export default function Settings() {
  const { api, run, busy, setNotice, setError, dashboard } = useApp();
  const [data, setData] = useState<any>(null),
    [holiday, setHoliday] = useState(""),
    [label, setLabel] = useState(""),
    [city, setCity] = useState("Kathmandu"),
    [area, setArea] = useState(""),
    [fee, setFee] = useState(0),
    [cod, setCod] = useState(false);
  const request = (action: string, data: any = {}) =>
    api("workflow", "POST", { action, data });
  const load = () => request("operating_settings").then(setData);
  useEffect(() => {
    if (!dashboard.roles.includes("SECURITY_ADMIN")) return;
    let active = true;
    request("operating_settings")
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <section className="panel">
        <h1>Operating settings</h1>
        <p>
          These settings do not grant access to clinical intake or private
          session notes.
        </p>
        {data && (
          <>
            <h2>Supervisor permission</h2>
            <p>
              Supervisors decide exceptions and receive escalations. Finance
              remains a separate team role.
            </p>
            {data.members.map((m: any) => (
              <label className="record" key={m.id}>
                <input
                  type="checkbox"
                  checked={m.permissions.includes("SUPERVISOR")}
                  disabled={busy}
                  onChange={(e) =>
                    run(async () => {
                      await request("permission_set", {
                        userId: m.id,
                        permission: "SUPERVISOR",
                        grant: e.target.checked,
                      });
                      await load();
                    })
                  }
                />
                {m.name} · {m.email}
              </label>
            ))}
            <h2>Nepal public holidays</h2>
            <p className="workflow-note">
              Maintain the published Nepal holiday calendar here. Refund
              initiation is due by 6 PM on the next Monday–Friday working day,
              excluding these dates. Verification feedback uses the same
              working-day calendar.
            </p>
            {data.holidays.length === 0 && (
              <p className="care-warning">
                No Nepal public holidays have been entered. Add the current
                official calendar before relying on holiday-adjusted deadlines.
              </p>
            )}
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await request("holiday_save", { day: holiday, label });
                  await load();
                  setNotice("Holiday saved.");
                });
              }}
            >
              <label>
                Date · Nepal calendar date
                <input
                  type="date"
                  required
                  value={holiday}
                  onChange={(e) => setHoliday(e.target.value)}
                />
              </label>
              <label>
                Holiday name
                <input
                  required
                  minLength={3}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <button className="button" disabled={busy}>
                Add holiday
              </button>
            </form>
            {data.holidays.map((h: any) => (
              <p key={h.day}>
                {h.day} · {h.label}
              </p>
            ))}
          </>
        )}
      </section>
      {dashboard.roles.some((r: string) =>
        ["CATALOG", "FULFILLMENT"].includes(r),
      ) && (
        <section className="panel">
          <h2>Kathmandu Valley delivery areas</h2>
          <p>
            Publish only areas Chatbud can fulfill. No area or fee is assumed
            automatically.
          </p>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await request("zone_save", {
                  city,
                  area,
                  fee,
                  cod,
                  active: true,
                });
                setNotice("Delivery area published.");
              });
            }}
          >
            <label>
              City
              <input
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </label>
            <label>
              Delivery area
              <input
                required
                value={area}
                onChange={(e) => setArea(e.target.value)}
              />
            </label>
            <label>
              Delivery fee · NPR
              <input
                required
                type="number"
                min={0}
                value={fee}
                onChange={(e) => setFee(Number(e.target.value))}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={cod}
                onChange={(e) => setCod(e.target.checked)}
              />{" "}
              Cash on delivery supported
            </label>
            <button className="button" disabled={busy}>
              Publish area & fee
            </button>
          </form>
        </section>
      )}
    </>
  );
}
