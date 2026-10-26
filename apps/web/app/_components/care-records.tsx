"use client";
import { useEffect, useState } from "react";
import { useApp } from "./app";
import { IntakeForm } from "./intake";
import { nepalTime } from "./ui";
type Task = {
  id?: string;
  title: string;
  schedule: "DAILY" | "WEEKLY";
  weekdays: number[];
  measurements: string[];
};
export function CareRecords({
  clientId,
  domains = ["mental"],
}: {
  clientId?: string;
  domains?: string[];
}) {
  const { api, run, busy, setError, setNotice } = useApp();
  const [data, setData] = useState<any>(null),
    [editor, setEditor] = useState<any>(null),
    [updating, setUpdating] = useState(""),
    [note, setNote] = useState(""),
    [appointment, setAppointment] = useState(""),
    [target, setTarget] = useState("");
  const request = (action: string, data: any = {}) =>
    api("workflow", "POST", { action, data });
  const reload = async () =>
    setData(
      await request(
        clientId ? "client_care" : "my_care",
        clientId ? { clientId } : {},
      ),
    );
  useEffect(() => {
    let active = true;
    request(clientId ? "client_care" : "my_care", clientId ? { clientId } : {})
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [clientId]);
  if (!data) return <p role="status">Loading care records…</p>;
  const save = () =>
    run(async () => {
      const result = await request("plan_save", { ...editor, clientId });
      await reload();
      setEditor({ ...editor, id: result.id, revisionId: result.revisionId });
      setNotice(
        "Private plan draft saved. Nothing is shared until you publish.",
      );
    });
  const edit = (p?: any, v?: any) =>
    setEditor({
      ...(p ? { id: p.id } : {}),
      domain: p?.domain || domains[0],
      title: p?.title || "",
      body: v?.body || "",
      tasks: v?.tasks || [],
    });
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>{clientId ? "Care plans" : "Your published care plans"}</h2>
          {clientId && (
            <button className="button small" onClick={() => edit()}>
              New plan
            </button>
          )}
        </div>
        {data.plans.length === 0 ? (
          <p>No plans yet.</p>
        ) : (
          data.plans.map((p: any) => (
            <article className="service-card" key={p.id}>
              <h3>{p.title}</h3>
              {p.versions.map((v: any) => (
                <details key={v.id} open={v.current || !v.publishedAt}>
                  <summary>
                    Version {v.version} ·{" "}
                    {v.publishedAt
                      ? v.current
                        ? "Current published"
                        : "Published history"
                      : "Private draft"}
                  </summary>
                  <p style={{ whiteSpace: "pre-wrap" }}>{v.body}</p>
                  {v.publishedAt && (
                    <small>Published {nepalTime(v.publishedAt)} NPT</small>
                  )}
                  {clientId && (
                    <div className="workflow-actions">
                      <button
                        className="text-button"
                        onClick={() => edit(p, v)}
                      >
                        Revise in a draft
                      </button>
                      {!v.publishedAt && (
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Publish this version to the client? The previous version and task history remain available.",
                              )
                            )
                              run(async () => {
                                await request("plan_publish", {
                                  revisionId: v.id,
                                });
                                await reload();
                                setNotice(
                                  "Plan version published and client notified in Chatbud.",
                                );
                              });
                          }}
                        >
                          Publish to client
                        </button>
                      )}
                    </div>
                  )}
                  {v.tasks.map((task: Task) => (
                    <TaskEntry
                      key={task.id}
                      task={task}
                      version={v}
                      progress={data.progress.filter(
                        (g: any) => g.task_key === task.id,
                      )}
                      preference={data.reminders.find(
                        (r: any) => r.task_key === task.id,
                      )}
                      professional={!!clientId}
                      current={v.current}
                      reload={reload}
                    />
                  ))}
                </details>
              ))}
            </article>
          ))
        )}
      </section>
      {clientId && editor && (
        <section className="panel">
          <h2>Private care-plan draft</h2>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label>
              Area of approved care
              <select
                value={editor.domain}
                onChange={(e) =>
                  setEditor({ ...editor, domain: e.target.value })
                }
              >
                {domains.map((d) => (
                  <option value={d} key={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plan title
              <input
                required
                minLength={3}
                maxLength={160}
                value={editor.title}
                onChange={(e) =>
                  setEditor({ ...editor, title: e.target.value })
                }
              />
            </label>
            <label>
              Client-facing plan
              <textarea
                required
                maxLength={16000}
                value={editor.body}
                onChange={(e) => setEditor({ ...editor, body: e.target.value })}
              />
            </label>
            {editor.tasks.map((task: Task, i: number) => (
              <fieldset key={i}>
                <legend>Task {i + 1}</legend>
                <label>
                  Task title
                  <input
                    required
                    maxLength={200}
                    value={task.title}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        tasks: editor.tasks.map((v: Task, j: number) =>
                          j === i ? { ...v, title: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Schedule
                  <select
                    value={task.schedule}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        tasks: editor.tasks.map((v: Task, j: number) =>
                          j === i ? { ...v, schedule: e.target.value } : v,
                        ),
                      })
                    }
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                  </select>
                </label>
                {task.schedule === "WEEKLY" && (
                  <div className="chips">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (d, k) => (
                        <label key={d}>
                          <input
                            type="checkbox"
                            checked={task.weekdays.includes(k)}
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                tasks: editor.tasks.map((v: Task, j: number) =>
                                  j === i
                                    ? {
                                        ...v,
                                        weekdays: e.target.checked
                                          ? [...v.weekdays, k]
                                          : v.weekdays.filter((x) => x !== k),
                                      }
                                    : v,
                                ),
                              })
                            }
                          />
                          {d}
                        </label>
                      ),
                    )}
                  </div>
                )}
                <label>
                  Optional measurements · comma-separated labels
                  <input
                    value={task.measurements.join(", ")}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        tasks: editor.tasks.map((v: Task, j: number) =>
                          j === i
                            ? {
                                ...v,
                                measurements: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }
                            : v,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setEditor({
                      ...editor,
                      tasks: editor.tasks.filter(
                        (_: Task, j: number) => i !== j,
                      ),
                    })
                  }
                >
                  Remove task
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setEditor({
                  ...editor,
                  tasks: [
                    ...editor.tasks,
                    {
                      title: "",
                      schedule: "DAILY",
                      weekdays: [],
                      measurements: [],
                    },
                  ],
                })
              }
            >
              Add task
            </button>
            <p className="workflow-note">
              Unchanged tasks retain progress when the plan is revised. Changed
              or removed tasks keep separate history. The currently published
              plan stays visible while you draft.
            </p>
            <div className="workflow-actions">
              <button className="button" disabled={busy}>
                Save private draft
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setEditor(null)}
              >
                Close editor
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="panel">
        <h2>Intake & dated updates</h2>
        <p className="workflow-note">
          Clinical answers are restricted internally to the assigned
          professional. Original submissions are preserved.
        </p>
        {data.intake.length === 0 ? (
          <p>No submitted intake.</p>
        ) : (
          data.intake.map((i: any) => (
            <article className="service-card" key={i.id}>
              <strong>
                {i.parentId ? "Dated update" : "Original submission"} ·{" "}
                {nepalTime(i.createdAt)} NPT
              </strong>
              <dl>
                {Object.entries(i.answers).map(([label, value]) => (
                  <div key={label}>
                    <dt>
                      {i.questions?.find((q: any) => q.id === label)?.label ||
                        (label === "update"
                          ? "Dated update"
                          : label === "summary"
                            ? "Information for your professional"
                            : label)}
                    </dt>
                    <dd style={{ whiteSpace: "pre-wrap" }}>{String(value)}</dd>
                  </div>
                ))}
              </dl>
              {!clientId && !i.parentId && (
                <button
                  className="text-button"
                  onClick={() => setUpdating(updating === i.id ? "" : i.id)}
                >
                  Add dated update
                </button>
              )}
              {updating === i.id && (
                <IntakeForm
                  serviceId={i.serviceId}
                  appointmentId={i.appointmentId || undefined}
                  parentId={i.id}
                  done={() => {
                    setUpdating("");
                    reload();
                  }}
                />
              )}
            </article>
          ))
        )}
      </section>
      {clientId && (
        <section className="panel">
          <h2>Private session notes</h2>
          <p className="workflow-note">
            Only you, the author, can read these notes. They are separate from
            published care plans.
          </p>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await request("private_note", {
                  appointmentId: appointment,
                  body: note,
                });
                setNote("");
                await reload();
              });
            }}
          >
            <label>
              Session
              <select
                required
                value={appointment}
                onChange={(e) => setAppointment(e.target.value)}
              >
                <option value="">Choose session</option>
                {data.appointments.map((a: any) => (
                  <option value={a.id} key={a.id}>
                    {a.service} · {nepalTime(a.startsAt)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Author-only note
              <textarea
                required
                maxLength={16000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button className="button" disabled={busy}>
              Save private note
            </button>
          </form>
          {data.notes.map((n: any) => (
            <article className="service-card" key={n.id}>
              <time>{nepalTime(n.created_at)}</time>
              <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
            </article>
          ))}
          <h3>Follow-up recommendation</h3>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await request("followup_create", {
                  appointmentId: appointment,
                  targetDate: target,
                });
                setNotice(
                  "Scheduling coordination case created. The client still chooses and pays for their booking.",
                );
              });
            }}
          >
            <label>
              Related session
              <select
                required
                value={appointment}
                onChange={(e) => setAppointment(e.target.value)}
              >
                <option value="">Choose session</option>
                {data.appointments.map((a: any) => (
                  <option value={a.id} key={a.id}>
                    {a.service} · {nepalTime(a.startsAt)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target date
              <input
                type="date"
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </label>
            <button className="button" disabled={busy}>
              Recommend follow-up
            </button>
          </form>
        </section>
      )}
    </>
  );
}
function TaskEntry({
  task,
  version,
  progress,
  preference,
  professional,
  current,
  reload,
}: {
  task: Task;
  version: any;
  progress: any[];
  preference: any;
  professional: boolean;
  current: boolean;
  reload: () => Promise<void>;
}) {
  const { api, run, busy, setNotice } = useApp();
  const [note, setNote] = useState(""),
    [measurements, setMeasurements] = useState<Record<string, string>>({}),
    [muted, setMuted] = useState(!!preference?.muted),
    [completed, setCompleted] = useState(false),
    [time, setTime] = useState(preference?.local_time?.slice(0, 5) || "09:00");
  const last = progress[0];
  return (
    <div className="service-card">
      <strong>{task.title}</strong>
      <p className="workflow-note">
        {task.schedule === "DAILY"
          ? "Daily"
          : `Weekly · ${(task.weekdays || []).map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}`}
      </p>
      {last && (
        <p>
          {last.completed ? "Completed" : "Progress submitted"} ·{" "}
          {nepalTime(last.created_at)} NPT
        </p>
      )}
      {!professional && current && (
        <>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("workflow", "POST", {
                  action: "progress_submit",
                  data: {
                    revisionId: version.id,
                    taskId: task.id,
                    completed,
                    note,
                    measurements,
                  },
                });
                setNote("");
                await reload();
                setNotice("Progress shared with your assigned professional.");
              });
            }}
          >
            <p className="workflow-note">
              Submitting shares this entry with your assigned professional.
              Customer support does not see clinical notes or measurements.
            </p>
            <label>
              <input
                type="checkbox"
                checked={completed}
                onChange={(e) => setCompleted(e.target.checked)}
              />{" "}
              Task completed
            </label>
            <label>
              Optional note
              <textarea
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {task.measurements.map((m) => (
              <label key={m}>
                {m}
                <input
                  maxLength={80}
                  value={measurements[m] || ""}
                  onChange={(e) =>
                    setMeasurements({ ...measurements, [m]: e.target.value })
                  }
                />
              </label>
            ))}
            <button className="button secondary" disabled={busy}>
              Share task progress
            </button>
          </form>
          <details>
            <summary>Reminder preferences</summary>
            <label>
              <input
                type="checkbox"
                checked={muted}
                onChange={(e) => setMuted(e.target.checked)}
              />{" "}
              Mute this task’s reminders
            </label>
            <label>
              Time · Nepal time
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("workflow", "POST", {
                    action: "reminder_save",
                    data: { taskId: task.id, muted, time },
                  });
                  setNotice("Reminder preference saved.");
                })
              }
            >
              Save preferences
            </button>
            <p className="workflow-note">
              Reminders use generic wording. External delivery is not enabled
              yet; Chatbud notifications are available in your account.
            </p>
          </details>
        </>
      )}
      {progress.length > 0 && (
        <details>
          <summary>Progress history</summary>
          {progress.map((g: any) => (
            <div key={g.id}>
              <time>{nepalTime(g.created_at)} NPT</time>
              <p>{g.note}</p>
              {Object.entries(g.measurements).map(([key, value]) => (
                <p key={key}>
                  {key}: {String(value)}
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

export function TodayAssignedTasks() {
  const { api, token } = useApp();
  const [tasks, setTasks] = useState<any[]>([]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    api("workflow", "POST", { action: "client_tasks", data: {} })
      .then((d) => active && setTasks(d.tasks))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  return tasks.length > 0 ? (
    <section className="panel">
      <h2>Today’s care tasks</h2>
      {tasks.map((task) => (
        <a className="record" key={task.id} href="/my-health">
          <div>
            <strong>{task.title}</strong>
            <p>{task.plan} · Record progress in My Health</p>
          </div>
        </a>
      ))}
    </section>
  ) : null;
}
