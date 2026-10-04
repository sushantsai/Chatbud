"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Award,
  CalendarDays,
  Check,
  Package,
  Plus,
  ShoppingBag,
  Target,
  Umbrella,
} from "lucide-react";
import { useApp } from "../_components/app";
import {
  Achievements,
  GoalCard,
  GoalPicker,
  TodayList,
  WeeklyCheckin,
  activeGoals,
  useGoalActions,
  useHealth,
} from "../_components/goals";
import {
  SignInPrompt,
  Summary,
  careAreas,
  money,
  professions,
} from "../_components/ui";
import { features } from "../_lib/features";
import { areaName } from "../_lib/needs";
const areas = careAreas.filter((a) => features[a.id] === "live");
export default function MyHealth() {
  const { mode, token, dashboard, api, busy, openAuth } = useApp();
  const live = mode === "live";
  const { health, act } = useHealth();
  const [adding, setAdding] = useState("");
  const { setStatus } = useGoalActions(act);
  if (live && !token)
    return (
      <SignInPrompt open={openAuth}>
        Sign in to see your plans, goals and purchases.
      </SignInPrompt>
    );
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
          value={live ? activeGoals(health).length : dashboard.orders.length}
        />
        <Summary
          icon={Award}
          label="Days done"
          value={(health?.goals || []).reduce(
            (sum: number, g: any) => sum + g.total,
            0,
          )}
        />
      </div>
      {live && !health && (
        <div className="loading" role="status">
          Loading your health records…
        </div>
      )}
      {live && health && <TodayList health={health} act={act} />}
      {live &&
        health &&
        areas.map((area) => {
          const plans = health.plans.filter((p: any) => p.domain === area.id);
          const goals = health.goals.filter((g: any) => g.domain === area.id);
          const active = goals.filter((g: any) => g.status === "ACTIVE");
          const achieved = goals.filter((g: any) => g.status === "DONE");
          return (
            <section
              className="panel compartment"
              data-area={area.id}
              key={area.id}
            >
              <div className="panel-heading">
                <h2>
                  {areaName(area.id)} <small>{area.label}</small>
                </h2>
                {adding !== area.id && (
                  <button onClick={() => setAdding(area.id)}>
                    <Plus size={15} /> Add a goal
                  </button>
                )}
              </div>
              <h3>Your goals</h3>
              {active.length === 0 && adding !== area.id && (
                <p className="empty-inline">
                  No goals here yet. Add one small step you can repeat.
                </p>
              )}
              {active.map((g: any) => (
                <GoalCard goal={g} today={health.today} act={act} key={g.id} />
              ))}
              {adding === area.id && (
                <GoalPicker
                  area={area.id}
                  health={health}
                  act={act}
                  close={() => setAdding("")}
                />
              )}
              {achieved.length > 0 && (
                <details className="achieved">
                  <summary>
                    {achieved.length} achieved{" "}
                    {achieved.length === 1 ? "goal" : "goals"}
                  </summary>
                  {achieved.map((g: any) => (
                    <div className="goal done" key={g.id}>
                      <span>
                        {g.title}
                        <small>{g.total} days done</small>
                      </span>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setStatus(g, "ACTIVE", "Goal reopened.")}
                      >
                        Start again
                      </button>
                    </div>
                  ))}
                </details>
              )}
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
            </section>
          );
        })}
      {live && health && <Achievements health={health} />}
      {live && health && <WeeklyCheckin health={health} act={act} />}
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
