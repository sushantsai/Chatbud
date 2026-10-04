// Screening scores decide who is referred, so the cut-offs are pinned here.
import assert from "node:assert/strict";
import { test } from "node:test";
import { score } from "../src/instruments";

test("PHQ-9 totals, bands and the Nepal cut-off of 10", () => {
  assert.deepEqual(score("PHQ9", [0, 0, 0, 0, 0, 0, 0, 0, 0]), {
    score: 0,
    severity: "Minimal",
    flags: [],
    refer: null,
  });
  assert.equal(score("PHQ9", [1, 1, 1, 1, 1, 1, 1, 1, 0]).refer, null);
  const moderate = score("PHQ9", [2, 2, 1, 1, 1, 1, 1, 1, 0]);
  assert.equal(moderate.score, 10);
  assert.equal(moderate.severity, "Moderate");
  assert.deepEqual(moderate.refer, {
    profession: "clinical_psychologist",
    urgency: "SOON",
  });
  assert.equal(score("PHQ9", [3, 3, 3, 3, 3, 3, 2, 0, 0]).severity, "Severe");
});

test("any thought of self-harm is urgent, however low the total", () => {
  const result = score("PHQ9", [0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(result.score, 1);
  assert.deepEqual(result.flags, ["SELF_HARM"]);
  assert.deepEqual(result.refer, {
    profession: "psychiatrist",
    urgency: "URGENT",
  });
});

test("GAD-7 bands", () => {
  assert.equal(score("GAD7", [1, 1, 1, 1, 0, 0, 0]).severity, "Minimal");
  assert.equal(score("GAD7", [2, 2, 2, 2, 1, 1, 0]).refer?.urgency, "ROUTINE");
  assert.equal(
    score("GAD7", [3, 3, 3, 3, 3, 0, 0]).refer?.profession,
    "psychiatrist",
  );
});

test("incomplete or out-of-range answers are refused", () => {
  assert.throws(() => score("PHQ9", [0, 0, 0]));
  assert.throws(() => score("GAD7", [0, 0, 0, 0, 0, 0, 4]));
  assert.throws(() => score("PHQ9", "000000000"));
  assert.throws(() =>
    score("MEASURES", { weightKg: 70, heightCm: 170, systolic: 120 }),
  );
  assert.throws(() =>
    score("MEASURES", {
      weightKg: 700,
      heightCm: 170,
      systolic: 120,
      diastolic: 80,
    }),
  );
});

test("body measures give BMI, a WHO band and blood-pressure flags", () => {
  const normal = score("MEASURES", {
    weightKg: 65,
    heightCm: 170,
    systolic: 118,
    diastolic: 76,
  });
  assert.deepEqual(normal, {
    score: 22.5,
    severity: "Normal weight",
    flags: [],
    refer: null,
  });
  const high = score("MEASURES", {
    weightKg: 90,
    heightCm: 170,
    systolic: 150,
    diastolic: 85,
  });
  assert.equal(high.severity, "Obese");
  assert.deepEqual(high.flags, ["HIGH_BP"]);
  assert.equal(high.refer?.profession, "dietitian");
  assert.deepEqual(
    score("MEASURES", {
      weightKg: 65,
      heightCm: 170,
      systolic: 190,
      diastolic: 100,
    }).flags,
    ["VERY_HIGH_BP"],
  );
});
