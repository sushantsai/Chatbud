// Assessments a field researcher can record, and how each is scored.
// Scores are worked out here, on the server, so every record is scored the same way.
// PHQ-9 and GAD-7 are free to reproduce. The validated Nepali wording must come
// from the study's research partner before it is used with participants.
const frequency = [
  "Not at all",
  "Several days",
  "More than half the days",
  "Nearly every day",
];
type Referral = { profession: string; urgency: "ROUTINE" | "SOON" | "URGENT" };
export type Result = {
  score: number;
  severity: string;
  flags: string[];
  refer: Referral | null;
};
const band = (score: number, bands: [number, string][]) =>
  bands.find(([upTo]) => score <= upTo)![1];

export const instruments = {
  PHQ9: {
    name: "PHQ-9",
    about: "Depression screening",
    kind: "scale" as const,
    lead: "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
    options: frequency,
    items: [
      "Little interest or pleasure in doing things",
      "Feeling down, depressed, or hopeless",
      "Trouble falling or staying asleep, or sleeping too much",
      "Feeling tired or having little energy",
      "Poor appetite or overeating",
      "Feeling bad about yourself, or that you are a failure or have let yourself or your family down",
      "Trouble concentrating on things, such as reading the newspaper or watching television",
      "Moving or speaking so slowly that other people could have noticed. Or the opposite: being so fidgety or restless that you have been moving around a lot more than usual",
      "Thoughts that you would be better off dead, or of hurting yourself in some way",
    ],
  },
  GAD7: {
    name: "GAD-7",
    about: "Anxiety screening",
    kind: "scale" as const,
    lead: "Over the last 2 weeks, how often have you been bothered by the following problems?",
    options: frequency,
    items: [
      "Feeling nervous, anxious, or on edge",
      "Not being able to stop or control worrying",
      "Worrying too much about different things",
      "Trouble relaxing",
      "Being so restless that it is hard to sit still",
      "Becoming easily annoyed or irritable",
      "Feeling afraid, as if something awful might happen",
    ],
  },
  MEASURES: {
    name: "Body measures",
    about: "Weight, height and blood pressure",
    kind: "measures" as const,
    fields: [
      { key: "weightKg", label: "Weight (kg)", min: 20, max: 300 },
      { key: "heightCm", label: "Height (cm)", min: 100, max: 230 },
      {
        key: "systolic",
        label: "Blood pressure, upper (mmHg)",
        min: 60,
        max: 260,
      },
      {
        key: "diastolic",
        label: "Blood pressure, lower (mmHg)",
        min: 30,
        max: 160,
      },
    ],
  },
};
export type InstrumentCode = keyof typeof instruments;
export const instrumentCodes = Object.keys(instruments) as [
  InstrumentCode,
  ...InstrumentCode[],
];

function scale(code: "PHQ9" | "GAD7", answers: unknown): number[] {
  const count = instruments[code].items.length;
  if (
    !Array.isArray(answers) ||
    answers.length !== count ||
    answers.some((a) => !Number.isInteger(a) || a < 0 || a > 3)
  )
    throw new Error(`Answer all ${count} questions.`);
  return answers;
}

export function score(code: InstrumentCode, answers: unknown): Result {
  if (code === "PHQ9") {
    const a = scale(code, answers);
    const total = a.reduce((sum, n) => sum + n, 0);
    const selfHarm = a[8] > 0;
    return {
      score: total,
      severity: band(total, [
        [4, "Minimal"],
        [9, "Mild"],
        [14, "Moderate"],
        [19, "Moderately severe"],
        [27, "Severe"],
      ]),
      flags: selfHarm ? ["SELF_HARM"] : [],
      // 10 or more is the cut-off validated in Nepal. Any thought of self-harm is urgent whatever the total.
      refer: selfHarm
        ? { profession: "psychiatrist", urgency: "URGENT" }
        : total >= 20
          ? { profession: "psychiatrist", urgency: "SOON" }
          : total >= 10
            ? { profession: "clinical_psychologist", urgency: "SOON" }
            : null,
    };
  }
  if (code === "GAD7") {
    const total = scale(code, answers).reduce((sum, n) => sum + n, 0);
    return {
      score: total,
      severity: band(total, [
        [4, "Minimal"],
        [9, "Mild"],
        [14, "Moderate"],
        [21, "Severe"],
      ]),
      flags: [],
      refer:
        total >= 15
          ? { profession: "psychiatrist", urgency: "SOON" }
          : total >= 10
            ? { profession: "clinical_psychologist", urgency: "ROUTINE" }
            : null,
    };
  }
  const m = answers as Record<string, number>;
  for (const f of instruments.MEASURES.fields)
    if (typeof m?.[f.key] !== "number" || m[f.key] < f.min || m[f.key] > f.max)
      throw new Error(`${f.label} must be between ${f.min} and ${f.max}.`);
  const bmi = Math.round((m.weightKg / (m.heightCm / 100) ** 2) * 10) / 10;
  const crisis = m.systolic >= 180 || m.diastolic >= 120;
  const high = m.systolic >= 140 || m.diastolic >= 90;
  // WHO body-mass bands.
  const severity = band(bmi, [
    [18.4, "Underweight"],
    [24.9, "Normal weight"],
    [29.9, "Overweight"],
    [Infinity, "Obese"],
  ]);
  return {
    score: bmi,
    severity,
    flags: crisis ? ["VERY_HIGH_BP"] : high ? ["HIGH_BP"] : [],
    // Blood pressure needs a doctor, which Chatbud does not list; the flag tells the researcher to send the person to a health facility.
    refer:
      severity === "Normal weight"
        ? null
        : { profession: "dietitian", urgency: "ROUTINE" },
  };
}
