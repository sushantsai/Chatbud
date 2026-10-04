"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, Check, Plus } from "lucide-react";
import { useApp } from "./app";
import {
  needs,
  rhythm,
  type Area,
  type GoalTemplate,
  type Need,
} from "../_lib/needs";

const DAY = 86400000;
const stamp = (day: string) => Date.parse(`${day}T00:00:00Z`);
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
// Sunday to Saturday of the week that holds `today`, as the server counts it.
const weekOf = (today: string) => {
  const start = stamp(today) - new Date(stamp(today)).getUTCDay() * DAY;
  return Array.from({ length: 7 }, (_, i) => iso(start + i * DAY));
};
const emptyHealth = {
  plans: [],
  goals: [],
  professionals: [],
  wellbeing: [],
  consent: "",
  today: iso(Date.now()),
};

const noProgress = {
  doneToday: false,
  doneYesterday: false,
  week: 0,
  weeksOnTrack: 0,
  milestone: null,
  earned: [],
  next: null,
};
// Fills in anything an older API version does not send yet, so the page never breaks mid-release.
const shape = (data: any) => ({
  ...emptyHealth,
  ...data,
  goals: (data.goals || []).map((g: any) => ({
    days: [],
    total: 0,
    weeklyTarget: 7,
    ...g,
    progress: g.progress || noProgress,
  })),
});

// A signed-in person's plans, goals and weekly notes, with a helper that saves and reloads.
export function useHealth() {
  const { mode, token, api, run, setNotice, setError } = useApp();
  const signedIn = mode === "live" && !!token;
  const [health, setHealth] = useState<any>(null);
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    api("health/mine")
      .then((data) => {
        if (active) setHealth(shape(data));
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setError(e.message);
          setHealth(emptyHealth);
        }
      });
    return () => {
      active = false;
    };
  }, [signedIn]);
  const act = (action: () => Promise<unknown>, notice: string) =>
    run(async () => {
      await action();
      setHealth(shape(await api("health/mine")));
      setNotice(notice);
    });
  return { signedIn, health: signedIn ? health : null, act };
}
export type Act = ReturnType<typeof useHealth>["act"];

export const activeGoals = (health: any) =>
  (health?.goals || []).filter((g: any) => g.status === "ACTIVE");

export function useGoalActions(act: Act) {
  const { api } = useApp();
  return {
    check: (goal: any, date?: string) => {
      const done = date ? true : !goal.progress.doneToday;
      const reached =
        done && goal.progress.next?.left === 1 ? goal.progress.next.name : "";
      return act(
        () =>
          api("health/checkin", "POST", {
            id: goal.id,
            done,
            ...(date ? { date } : {}),
          }),
        reached
          ? `Milestone reached: ${reached}.`
          : done
            ? "Done. Well played."
            : "Unmarked for today.",
      );
    },
    add: (area: Area, template: GoalTemplate) =>
      act(
        () =>
          api("health/goal", "POST", {
            domain: area,
            title: template.title,
            note: "",
            targetDate: "",
            action: template.action,
            weeklyTarget: template.weeklyTarget,
            template: template.code,
          }),
        `“${template.title}” added to your goals.`,
      ),
    custom: (area: Area, title: string, weeklyTarget: number) =>
      act(
        () =>
          api("health/goal", "POST", {
            domain: area,
            title,
            note: "",
            targetDate: "",
            action: title,
            weeklyTarget,
          }),
        "Goal added.",
      ),
    setStatus: (goal: any, status: string, notice: string) =>
      act(() => api("health/goal", "POST", { id: goal.id, status }), notice),
  };
}

function CheckButton({ goal, act }: { goal: any; act: Act }) {
  const { busy } = useApp();
  const { check } = useGoalActions(act);
  const done = goal.progress.doneToday;
  return (
    <button
      className={`check${done ? " done" : ""}`}
      aria-pressed={done}
      aria-label={`${goal.action || goal.title}: ${done ? "done today, tap to undo" : "mark done today"}`}
      disabled={busy}
      onClick={() => check(goal)}
    >
      <Check size={18} strokeWidth={2.6} />
    </button>
  );
}

// Today's small actions, one tap each.
export function TodayList({ health, act }: { health: any; act: Act }) {
  const goals = activeGoals(health);
  const done = goals.filter((g: any) => g.progress.doneToday).length;
  return (
    <section className="panel today">
      <div className="panel-heading">
        <h2>Today</h2>
        {goals.length > 0 && (
          <span className="today-count">
            {done} of {goals.length} done
          </span>
        )}
      </div>
      {goals.length === 0 ? (
        <p className="empty-inline">
          Pick one small step below and it will wait for you here each day.
        </p>
      ) : (
        goals.map((g: any) => (
          <div className="today-row" data-area={g.domain} key={g.id}>
            <CheckButton goal={g} act={act} />
            <div>
              <strong>{g.action || g.title}</strong>
              <p>
                {g.progress.week} of {g.weeklyTarget} this week
                {g.progress.weeksOnTrack > 1 &&
                  ` · ${g.progress.weeksOnTrack} weeks on track`}
              </p>
            </div>
          </div>
        ))
      )}
    </section>
  );
}

export function GoalCard({
  goal,
  today,
  act,
}: {
  goal: any;
  today: string;
  act: Act;
}) {
  const { busy } = useApp();
  const { check, setStatus } = useGoalActions(act);
  const p = goal.progress;
  const yesterday = iso(stamp(today) - DAY);
  return (
    <div className="goal-card">
      <CheckButton goal={goal} act={act} />
      <div className="goal-body">
        <div className="goal-title">
          <strong>{goal.title}</strong>
          {p.milestone && (
            <span className="badge">
              <Award size={13} /> {p.milestone}
            </span>
          )}
        </div>
        <p>
          {goal.action && goal.action !== goal.title ? `${goal.action} · ` : ""}
          {rhythm(goal.weeklyTarget)}
        </p>
        <div className="week" aria-hidden="true">
          {weekOf(today).map((day, i) => (
            <span
              key={day}
              className={`${goal.days.includes(day) ? "on" : ""}${day === today ? " now" : ""}`}
            >
              {"SMTWTFS"[i]}
            </span>
          ))}
        </div>
        <p className="goal-stats">
          {p.week} of {goal.weeklyTarget} this week · {goal.total}{" "}
          {goal.total === 1 ? "day" : "days"} in total
          {p.weeksOnTrack > 0 &&
            ` · ${p.weeksOnTrack} ${p.weeksOnTrack === 1 ? "week" : "weeks"} on track`}
          {p.next && ` · ${p.next.left} more for “${p.next.name}”`}
        </p>
        <div className="goal-actions">
          {!p.doneYesterday && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => check(goal, yesterday)}
            >
              I did it yesterday
            </button>
          )}
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              setStatus(goal, "DONE", "Goal completed. That took commitment.")
            }
          >
            I’ve achieved this
          </button>
          <button
            className="text-button quiet"
            disabled={busy}
            onClick={() => setStatus(goal, "ARCHIVED", "Goal removed.")}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// Ready-made goals for one need. Already-chosen ones show as added.
export function TemplateList({
  need,
  health,
  act,
}: {
  need: Need;
  health: any;
  act: Act;
}) {
  const { busy, openAuth, token, mode } = useApp();
  const { add } = useGoalActions(act);
  const chosen = new Set(activeGoals(health).map((g: any) => g.template));
  return (
    <div className="template-grid">
      {need.goals.map((t) => (
        <div className="template" key={t.code}>
          <strong>{t.title}</strong>
          <p>{t.action}</p>
          <span>{rhythm(t.weeklyTarget)}</span>
          {chosen.has(t.code) ? (
            <span className="added">
              <Check size={15} /> In your goals
            </span>
          ) : (
            <button
              className="button secondary small"
              disabled={busy || mode !== "live"}
              onClick={() => (token ? add(need.area, t) : openAuth())}
            >
              <Plus size={15} /> Add to my goals
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Goal chooser for one area inside My Health: popular goals first, then your own words.
export function GoalPicker({
  area,
  health,
  act,
  close,
}: {
  area: Area;
  health: any;
  act: Act;
  close: () => void;
}) {
  const { busy } = useApp();
  const { custom } = useGoalActions(act);
  const [title, setTitle] = useState(""),
    [target, setTarget] = useState(5);
  return (
    <div className="goal-picker">
      {needs
        .filter((n) => n.area === area)
        .map((need) => (
          <div key={need.slug}>
            <h4>
              <Link href={`/need/${need.slug}`}>{need.title}</Link>
            </h4>
            <TemplateList need={need} health={health} act={act} />
          </div>
        ))}
      <form
        className="goal-form"
        onSubmit={(e) => {
          e.preventDefault();
          custom(area, title.trim(), target);
          setTitle("");
        }}
      >
        <div className="field">
          <label htmlFor={`goal-${area}`}>Or write your own</label>
          <input
            id={`goal-${area}`}
            required
            minLength={3}
            maxLength={160}
            placeholder="One small thing you can do on the day"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`goal-days-${area}`}>How often</label>
          <select
            id={`goal-days-${area}`}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          >
            {[7, 6, 5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {rhythm(n)}
              </option>
            ))}
          </select>
        </div>
        <div className="request-actions">
          <button className="button small" disabled={busy}>
            Save goal
          </button>
          <button type="button" className="text-button" onClick={close}>
            Close
          </button>
        </div>
      </form>
    </div>
  );
}

const scale = ["Hard", "Low", "Okay", "Good", "Great"];
const questions = [
  { key: "mood", label: "Mood" },
  { key: "sleep", label: "Sleep" },
  { key: "energy", label: "Energy" },
] as const;

// A private once-a-week note of how things felt. Nobody else sees it.
export function WeeklyCheckin({ health, act }: { health: any; act: Act }) {
  const { api, busy } = useApp();
  const thisWeek = weekOf(health.today)[0];
  const saved = health.wellbeing.find((w: any) => w.week === thisWeek);
  const [answers, setAnswers] = useState<Record<string, number>>(saved || {});
  const [editing, setEditing] = useState(!saved);
  const complete = questions.every((q) => answers[q.key]);
  const past = health.wellbeing.filter((w: any) => w.week !== thisWeek);
  return (
    <section className="panel checkin">
      <div className="panel-heading">
        <h2>How was this week?</h2>
        {saved && !editing && (
          <button onClick={() => setEditing(true)}>Change</button>
        )}
      </div>
      <p className="section-copy">
        A quick weekly note, just for you. It is never shared with a
        professional.
      </p>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () =>
                api("health/wellbeing", "POST", {
                  mood: answers.mood,
                  sleep: answers.sleep,
                  energy: answers.energy,
                }),
              "Saved. See you next week.",
            );
            setEditing(false);
          }}
        >
          {questions.map((q) => (
            <fieldset className="rating" key={q.key}>
              <legend>{q.label}</legend>
              <div>
                {scale.map((word, i) => (
                  <label key={word}>
                    <input
                      type="radio"
                      name={q.key}
                      checked={answers[q.key] === i + 1}
                      onChange={() =>
                        setAnswers({ ...answers, [q.key]: i + 1 })
                      }
                    />
                    <span>{word}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button className="button small" disabled={busy || !complete}>
            Save this week
          </button>
        </form>
      ) : (
        <dl className="rating-summary">
          {questions.map((q) => (
            <div key={q.key}>
              <dt>{q.label}</dt>
              <dd>{scale[saved[q.key] - 1]}</dd>
            </div>
          ))}
        </dl>
      )}
      {past.length > 0 && (
        <table className="rating-history">
          <caption>Earlier weeks</caption>
          <thead>
            <tr>
              <th scope="col">Week of</th>
              {questions.map((q) => (
                <th scope="col" key={q.key}>
                  {q.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {past
              .slice(-4)
              .reverse()
              .map((w: any) => (
                <tr key={w.week}>
                  <th scope="row">
                    {new Date(stamp(w.week)).toLocaleDateString("en-NP", {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </th>
                  {questions.map((q) => (
                    <td key={q.key}>{scale[w[q.key] - 1]}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// Every milestone earned so far, newest goals first.
export function Achievements({ health }: { health: any }) {
  const earned = health.goals.flatMap((g: any) =>
    g.progress.earned.map((name: string) => ({ name, goal: g })),
  );
  if (earned.length === 0) return null;
  return (
    <section className="panel">
      <h2>Achievements</h2>
      <p className="section-copy">
        Milestones count every day you have done, so a missed day never takes
        one away.
      </p>
      <ul className="achievements">
        {earned.map(({ name, goal }: any) => (
          <li key={`${goal.id}-${name}`} data-area={goal.domain}>
            <Award size={20} />
            <strong>{name}</strong>
            <span>{goal.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
