"use client";
import { Clock, ShieldCheck } from "lucide-react";
import { useApp } from "../_components/app";
import { SignInPrompt, professions } from "../_components/ui";
export default function Practitioner() {
  const {
    mode,
    token,
    dashboard,
    setDashboard,
    api,
    run,
    busy,
    setNotice,
    openAuth,
  } = useApp();
  if (mode === "live" && !token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in to apply and manage your professional application.
      </SignInPrompt>
    );
  return (
    <div className="application-layout">
      <section className="panel">
        <h2>Join the professional network</h2>
        <p className="section-copy">
          Tell us about your practice. This is the first step; identity,
          qualifications, and relevant registration must be reviewed before your
          profile can be published.
        </p>
        {dashboard.providerApplication && (
          <div className="application-status">
            <Clock size={19} />
            <div>
              <strong>
                Application{" "}
                {dashboard.providerApplication.status
                  .toLowerCase()
                  .replaceAll("_", " ")}
              </strong>
              <p>Your profile is not yet published.</p>
            </div>
          </div>
        )}
        {mode === "demo" && (
          <p className="form-note">
            Use fictional information in this preview. Submit your real
            application in Live database mode.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              await api("providers/applications", "POST", {
                profession: f.get("profession"),
                bio: f.get("bio"),
                experience: f.get("experience"),
              });
              setNotice(
                mode === "demo"
                  ? "Preview application submitted."
                  : "Application submitted for review.",
              );
              setDashboard(await api("me"));
            });
          }}
        >
          <label>
            Professional category
            <select name="profession" required>
              {Object.entries(professions).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            About your practice
            <textarea
              name="bio"
              required
              minLength={30}
              maxLength={1500}
              placeholder="Your approach, services, languages, and who you work with…"
              rows={4}
            />
          </label>
          <label>
            Qualifications and experience
            <textarea
              name="experience"
              required
              minLength={10}
              maxLength={1000}
              placeholder="Relevant degrees, training, registration, and practice experience…"
              rows={3}
            />
          </label>
          <button className="button" disabled={busy}>
            {busy ? "Submitting…" : "Submit application"}
          </button>
        </form>
      </section>
      <aside className="onboarding-note">
        <ShieldCheck size={27} />
        <h2>Built around trust.</h2>
        <ol>
          <li>
            <b>Apply</b>
            <span>Share your professional background.</span>
          </li>
          <li>
            <b>Verify</b>
            <span>Identity, qualifications, and registration review.</span>
          </li>
          <li>
            <b>Set up</b>
            <span>Define services and availability after approval.</span>
          </li>
          <li>
            <b>Practice</b>
            <span>Connect with clients within your approved scope.</span>
          </li>
        </ol>
      </aside>
    </div>
  );
}
