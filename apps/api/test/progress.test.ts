// Goal progress must be forgiving: totals never drop and an unfinished week does not break a run.
import assert from "node:assert/strict";
import { test } from "node:test";
import { progress, weekStart } from "../src/progress";

// 2026-10-04 is a Sunday.
test("weeks start on Sunday", () => {
  assert.equal(weekStart("2026-10-04"), "2026-10-04");
  assert.equal(weekStart("2026-10-10"), "2026-10-04");
  assert.equal(weekStart("2026-10-03"), "2026-09-27");
});

test("a new goal has no progress and a first milestone ahead", () => {
  const p = progress({ days: [], total: 0, weeklyTarget: 7 }, "2026-10-07");
  assert.deepEqual(
    [p.doneToday, p.week, p.weeksOnTrack, p.milestone],
    [false, 0, 0, null],
  );
  assert.deepEqual(p.next, { name: "First step", left: 1 });
});

test("today, yesterday and this week are counted", () => {
  const p = progress(
    {
      days: ["2026-10-03", "2026-10-06", "2026-10-07"],
      total: 3,
      weeklyTarget: 5,
    },
    "2026-10-07",
  );
  assert.equal(p.doneToday, true);
  assert.equal(p.doneYesterday, true);
  assert.equal(p.week, 2);
  assert.equal(p.milestone, "Finding your rhythm");
  assert.deepEqual(p.next, { name: "Seven days done", left: 4 });
});

test("an unfinished week keeps earlier weeks on track", () => {
  const days = [
    "2026-09-21",
    "2026-09-23",
    "2026-09-25", // week of 20 Sep: 3
    "2026-09-28",
    "2026-09-30",
    "2026-10-02", // week of 27 Sep: 3
    "2026-10-05", // this week so far: 1
  ];
  const goal = { days, total: 7, weeklyTarget: 3 };
  assert.equal(progress(goal, "2026-10-05").weeksOnTrack, 2);
  const met = {
    ...goal,
    days: [...days, "2026-10-06", "2026-10-07"],
    total: 9,
  };
  assert.equal(progress(met, "2026-10-07").weeksOnTrack, 3);
});

test("a missed week ends the run but not the total", () => {
  const p = progress(
    {
      days: ["2026-09-14", "2026-09-15", "2026-09-16", "2026-10-05"],
      total: 40,
      weeklyTarget: 3,
    },
    "2026-10-05",
  );
  assert.equal(p.weeksOnTrack, 0);
  assert.equal(p.milestone, "Thirty-day habit");
  assert.equal(p.earned.length, 5);
});

test("the last milestone has nothing after it", () => {
  assert.equal(
    progress({ days: [], total: 250, weeklyTarget: 7 }, "2026-10-05").next,
    null,
  );
});
