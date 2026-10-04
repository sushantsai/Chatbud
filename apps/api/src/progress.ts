// Turns a goal's check-in days into what the client sees: this week, weeks on
// track and milestones. Milestones count every day ever done, so a missed day
// never takes progress away.
export const milestones = [
  { at: 1, name: "First step" },
  { at: 3, name: "Finding your rhythm" },
  { at: 7, name: "Seven days done" },
  { at: 14, name: "Two weeks strong" },
  { at: 30, name: "Thirty-day habit" },
  { at: 60, name: "Sixty and steady" },
  { at: 100, name: "Hundred days" },
];
export type GoalDays = { days: string[]; total: number; weeklyTarget: number };
const DAY = 86400000;
const stamp = (day: string) => Date.parse(`${day}T00:00:00Z`);
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
// Weeks start on Sunday, as they do in Nepal.
export const weekStart = (day: string) =>
  iso(stamp(day) - new Date(stamp(day)).getUTCDay() * DAY);

export function progress(goal: GoalDays, today: string) {
  const done = new Set(goal.days);
  const perWeek = new Map<string, number>();
  for (const day of done)
    perWeek.set(weekStart(day), (perWeek.get(weekStart(day)) || 0) + 1);
  const thisWeek = weekStart(today);
  const week = perWeek.get(thisWeek) || 0;
  // A week still under way cannot break the run; it only adds to it once met.
  let weeksOnTrack = week >= goal.weeklyTarget ? 1 : 0;
  for (
    let start = stamp(thisWeek) - 7 * DAY;
    (perWeek.get(iso(start)) || 0) >= goal.weeklyTarget;
    start -= 7 * DAY
  )
    weeksOnTrack++;
  const earned = milestones.filter((m) => goal.total >= m.at);
  const next = milestones[earned.length];
  return {
    doneToday: done.has(today),
    doneYesterday: done.has(iso(stamp(today) - DAY)),
    week,
    weeksOnTrack,
    milestone: earned.at(-1)?.name ?? null,
    earned: earned.map((m) => m.name),
    next: next ? { name: next.name, left: next.at - goal.total } : null,
  };
}
