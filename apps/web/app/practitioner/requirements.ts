// What each profession must show a reviewer before its scope can be approved.
export const professionGroups = [
  {
    label: "Mental health",
    options: [
      ["psychiatrist", "Psychiatrist"],
      ["clinical_psychologist", "Clinical psychologist"],
      ["counselor", "Counselor"],
    ],
  },
  {
    label: "Nutrition",
    options: [
      ["dietitian", "Dietitian"],
      ["nutritionist", "Nutritionist"],
    ],
  },
] as const;
export const registeringBodies = [
  "Nepal Medical Council",
  "Nepal Health Professional Council",
  "Nepal Nursing Council",
  "Other",
];
export type Requirements = {
  // Pre-selected registering body, or "" to let the applicant choose.
  body: string;
  // When true the applicant cannot continue without a registration number
  // and a registration certificate.
  registrationRequired: boolean;
};
export function requirementsFor(profession: string): Requirements {
  // TODO(human): set the registering body and whether registration is
  // mandatory for each profession in Nepal. Only the psychiatrist rule below
  // is filled in; the rest fall through to "optional, applicant chooses".
  if (profession === "psychiatrist")
    return { body: "Nepal Medical Council", registrationRequired: true };
  return { body: "", registrationRequired: false };
}
export const documentKinds = [
  {
    kind: "identity",
    label: "Government photo ID",
    hint: "Citizenship certificate, passport, national ID or driving licence.",
  },
  {
    kind: "qualification",
    label: "Highest qualification certificate",
    hint: "Degree certificate or final transcript.",
  },
  {
    kind: "registration",
    label: "Registration certificate",
    hint: "Current certificate from your registering body.",
  },
  {
    kind: "experience",
    label: "Experience letter",
    hint: "From a current or recent employer or supervisor.",
  },
  {
    kind: "photo",
    label: "Profile photo",
    hint: "A recent, clear photo of your face for your public profile.",
  },
] as const;
export type DocumentKind = (typeof documentKinds)[number]["kind"];
