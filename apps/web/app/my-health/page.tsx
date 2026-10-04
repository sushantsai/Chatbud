"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  Heart,
  Package,
  Plus,
  ShoppingBag,
  Target,
  Umbrella,
} from "lucide-react";
import { useApp } from "../_components/app";
import {
  SignInPrompt,
  Summary,
  careAreas,
  money,
  professions,
} from "../_components/ui";
import { features } from "../_lib/features";
const areas = careAreas.filter((a) => features[a.id] === "live");
const emptyGoal = { domain: "", title: "", targetDate: "" };
export default function MyHealth() {
  const {
    mode,
    token,
    dashboard,
    api,
    run,
    busy,
    setNotice,
    setError,
    openAuth,
  } = useApp();
  const live = mode === "live";
  const [health, setHealth] = useState<any>(null),
    [goal, setGoal] = useState(emptyGoal);
  const reload = async () => setHealth(await api("health/mine"));
  useEffect(() => {
    if (!live || !token) return;
    let active = true;
    api("health/mine")
      .then((data) => {
        if (active) setHealth(data);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setError(e.message);
          setHealth({ plans: [], goals: [], professionals: [], consent: "" });
        }
      });
    return () => {
      active = false;
    };
  }, [live, token]);
  if (live && !token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in to see your plans, goals and purchases.
      </SignInPrompt>
    );
  const act = (action: () => Promise<unknown>, notice: string) =>
    run(async () => {
      await action();
      await reload();
      setNotice(notice);
    });
  const activeGoals =
    health?.goals.filter((g: any) => g.status === "ACTIVE").length ?? 0;
  return (
    <>
      <div className="summary-grid">
        <Summary
          icon={CalendarDays}
          label="Appointments"
          value={
            dashboard.appointments.filter((a: any) => a.status !== "EXPIRED")
              .length
          }
        />
        <Summary
          icon={live ? Target : ShoppingBag}
          label={live ? "Active goals" : "Orders"}
          value={live ? activeGoals : dashboard.orders.length}
        />
        <Summary icon={Heart} label="Your next step" value="At your pace" />
      </div>
      {live && !health && (
        <div className="loading" role="status">
          Loading your health records…
        </div>
      )}
      {live &&
        health &&
        areas.map((area) => {
          const plans = health.plans.filter((p: any) => p.domain === area.id);
          const goals = health.goals.filter((g: any) => g.domain === area.id);
          const adding = goal.domain === area.id;
          return (
            <section className="panel compartment" key={area.id}>
              <div className="panel-heading">
                <h2>{area.label}</h2>
                {!adding && (
                  <button
                    onClick={() => setGoal({ ...emptyGoal, domain: area.id })}
                  >
                    <Plus size={15} /> Add a goal
                  </button>
                )}
              </div>
              <h3>Plans from your professionals</h3>
              {plans.length === 0 ? (
                <p className="empty-inline">
                  A plan appears here when a {area.label.toLowerCase()}{" "}
                  professional writes one for you after a consultation.
                </p>
              ) : (
                plans.map((p: any) => (
                  <details className="plan" key={p.id}>
                    <summary>
                      <strong>{p.title}</strong>
                      <span>
                        {p.professional} · updated{" "}
                        {new Date(p.updatedAt).toLocaleDateString("en-NP", {
                          dateStyle: "medium",
                        })}
                      </span>
                    </summary>
                    <p>{p.body}</p>
                  </details>
                ))
              )}
              <h3>Your goals</h3>
              {goals.length === 0 && !adding && (
                <p className="empty-inline">
                  Set a goal to keep track of what you are working towards.
                </p>
              )}
              {goals.map((g: any) => (
                <div
                  className={`goal${g.status === "DONE" ? " done" : ""}`}
                  key={g.id}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={g.status === "DONE"}
                      disabled={busy}
                      onChange={(e) =>
                        act(
                          () =>
                            api("health/goal", "POST", {
                              id: g.id,
                              status: e.target.checked ? "DONE" : "ACTIVE",
                            }),
                          e.target.checked
                            ? "Goal completed."
                            : "Goal reopened.",
                        )
                      }
                    />
                    <span>
                      {g.title}
                      {g.targetDate && (
                        <small>
                          by{" "}
                          {new Date(g.targetDate).toLocaleDateString("en-NP", {
                            dateStyle: "medium",
                          })}
                        </small>
                      )}
                    </span>
                  </label>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () =>
                          api("health/goal", "POST", {
                            id: g.id,
                            status: "ARCHIVED",
                          }),
                        "Goal removed.",
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              {adding && (
                <form
                  className="goal-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      await api("health/goal", "POST", {
                        domain: area.id,
                        title: goal.title.trim(),
                        note: "",
                        targetDate: goal.targetDate,
                      });
                      setGoal(emptyGoal);
                    }, "Goal added.");
                  }}
                >
                  <div className="field">
                    <label htmlFor={`goal-${area.id}`}>Goal</label>
                    <input
                      id={`goal-${area.id}`}
                      required
                      minLength={3}
                      maxLength={160}
                      autoFocus
                      value={goal.title}
                      onChange={(e) =>
                        setGoal({ ...goal, title: e.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`goal-date-${area.id}`}>
                      Target date<span className="optional">Optional</span>
                    </label>
                    <input
                      id={`goal-date-${area.id}`}
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={goal.targetDate}
                      onChange={(e) =>
                        setGoal({ ...goal, targetDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="request-actions">
                    <button className="button small" disabled={busy}>
                      Save goal
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setGoal(emptyGoal)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>
          );
        })}
      {live && health && (
        <section className="panel">
          <h2>Who can see what</h2>
          <p className="section-copy">
            Each professional sees only the plans they wrote for you. Tick an
            area to also let them see your goals and other professionals’ plans
            in that area. You can stop sharing at any time.
          </p>
          {health.professionals.length === 0 ? (
            <p className="empty-inline">
              After your first confirmed appointment, you can choose here what
              each professional sees.
            </p>
          ) : (
            <>
              {health.professionals.map((p: any) => (
                <fieldset className="sharing" key={p.id}>
                  <legend>
                    {p.name}
                    <small>
                      {p.professions
                        .map((code: string) => professions[code] || code)
                        .join(", ")}
                    </small>
                  </legend>
                  <div>
                    {areas.map((area) => (
                      <label className="choice" key={area.id}>
                        <input
                          type="checkbox"
                          checked={p.shared.includes(area.id)}
                          disabled={busy}
                          onChange={(e) =>
                            act(
                              () =>
                                api("health/share", "POST", {
                                  providerId: p.id,
                                  domain: area.id,
                                  share: e.target.checked,
                                }),
                              e.target.checked
                                ? `${p.name} can now see your ${area.label.toLowerCase()} records.`
                                : `Stopped sharing ${area.label.toLowerCase()} with ${p.name}.`,
                            )
                          }
                        />
                        <span>{area.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <p className="field-hint consent">
                <Check size={14} /> By ticking an area you agree: “
                {health.consent}”
              </p>
            </>
          )}
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Purchases</h2>
          <Link href="/store">Visit the store</Link>
        </div>
        {dashboard.orders.length === 0 ? (
          <p className="empty-inline">Your product orders will appear here.</p>
        ) : (
          dashboard.orders.map((o: any) => (
            <div className="record" key={o.id}>
              <span className="record-icon">
                <Package size={22} />
              </span>
              <div>
                <strong>Order #{o.id.slice(0, 8)}</strong>
                <p>{new Date(o.createdAt).toLocaleDateString()}</p>
              </div>
              <span className="status">{o.status.replaceAll("_", " ")}</span>
              <strong>{money(o.total)}</strong>
            </div>
          ))
        )}
      </section>
      {features.protect !== "off" && (
        <div className="area-grid">
          <div className="area-card">
            <Umbrella size={22} />
            <strong>Insurance</strong>
            <p>Your cover from licensed partners.</p>
            <span className="soon-badge">Coming soon</span>
          </div>
        </div>
      )}
      {mode === "demo" && (
        <section className="nutrition-panel">
          <span className="eyebrow">EXAMPLE CARE RESOURCE</span>
          <h2>A practical approach to everyday meals</h2>
          <p>
            This sample resource shows where a provider-authored nutrition plan
            will appear. Personalized plans require a consultation and explicit
            consent.
          </p>
          <div className="nutrition-steps">
            <span>
              <b>01</b>Build regular meal routines
            </span>
            <span>
              <b>02</b>Make room for varied foods
            </span>
            <span>
              <b>03</b>Review your goals with a professional
            </span>
          </div>
        </section>
      )}
    </>
  );
}
