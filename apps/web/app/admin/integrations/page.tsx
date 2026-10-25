"use client";
import { useEffect, useState } from "react";
import { Video } from "lucide-react";
import { useApp } from "../../_components/app";
import { Area } from "../_components/area";
type ConnectionStatus = {
  configured: boolean;
  videoProvider: string;
  signInEnabled: boolean;
};
type TestResult = { url: string; provider: "google_meet" };
function GoogleConnections() {
  const { api, mode, token, run, busy } = useApp();
  const [data, setData] = useState<ConnectionStatus | null>(null),
    [result, setResult] = useState<TestResult | null>(null),
    [error, setError] = useState(""),
    [testError, setTestError] = useState("");
  useEffect(() => {
    if (mode !== "live" || !token) return;
    let active = true;
    Promise.all([
      api("integrations/google/status"),
      fetch("/api/auth/providers").then((r) => r.json()),
    ])
      .then(([meet, auth]) => {
        if (active) setData({ ...meet, signInEnabled: auth.google });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [mode, token]);
  if (mode !== "live")
    return (
      <p className="empty-inline">
        Google connection status is available in Live database mode.
      </p>
    );
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!data) return <p role="status">Checking Google connections…</p>;
  return (
    <>
      <section className="panel">
        <h2>Google sign-in</h2>
        <p className="section-copy">
          Clients, professionals and team members use the same account system.
          Google sign-in does not grant professional or team permissions.
        </p>
        <span className="status">
          {data.signInEnabled ? "Provider enabled" : "Provider setup required"}
        </span>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Google Meet</h2>
          <Video size={24} />
        </div>
        <p className="section-copy">
          Meeting links are created when an authorized professional or support
          team member confirms an appointment. Accepting a reschedule reuses its
          existing room.
        </p>
        <span className="status">
          {data.configured
            ? "Credentials configured · test to verify"
            : "Google account connection required"}
        </span>
        <p className="section-copy">
          The test creates an empty Google Meet room. It does not invite anyone,
          send notifications or change a booking.
        </p>
        <button
          className="button"
          disabled={busy || !data.configured}
          onClick={() =>
            run(async () => {
              setResult(null);
              setTestError("");
              try {
                setResult(await api("integrations/google/test", "POST", {}));
              } catch (e) {
                setTestError(
                  e instanceof Error ? e.message : "The Meet test failed.",
                );
              }
            })
          }
        >
          {busy ? "Testing Google Meet…" : "Create test Meet room"}
        </button>
        {testError && (
          <p className="form-error" role="alert">
            {testError}
          </p>
        )}
        {result && (
          <p className="notice" role="status">
            Google Meet created a room successfully.{" "}
            <a href={result.url} target="_blank" rel="noopener noreferrer">
              Open test room
            </a>
          </p>
        )}
      </section>
    </>
  );
}
export default function IntegrationsPage() {
  return (
    <Area area="support">
      <GoogleConnections />
    </Area>
  );
}
