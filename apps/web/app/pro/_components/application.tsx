"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCheck2,
  Lock,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useApp } from "../../_components/app";
import { professions } from "../../_components/ui";
import { supabase } from "../../_lib/supabase";
import {
  documentKinds,
  professionGroups,
  registeringBodies,
  requirementsFor,
  type DocumentKind,
} from "./requirements";
const steps = [
  { id: "practice", label: "Your practice", time: "2 min" },
  { id: "identity", label: "Identity", time: "2 min" },
  { id: "qualifications", label: "Qualifications", time: "3 min" },
  { id: "registration", label: "Registration & references", time: "3 min" },
  { id: "documents", label: "Documents", time: "2 min" },
  { id: "review", label: "Review & declare", time: "1 min" },
];
const languages = ["English", "Nepali", "Hindi", "Maithili", "Newari"];
const clientGroups = [
  "Adults",
  "Adolescents",
  "Children",
  "Couples",
  "Families",
  "Older adults",
];
type Qualification = {
  level: string;
  field: string;
  institution: string;
  country: string;
  year: string;
};
type Reference = {
  name: string;
  role: string;
  organization: string;
  contact: string;
};
type Uploaded = { path: string; name: string };
const emptyQualification: Qualification = {
  level: "",
  field: "",
  institution: "",
  country: "Nepal",
  year: "",
};
const emptyReference: Reference = {
  name: "",
  role: "",
  organization: "",
  contact: "",
};
const initial = {
  profession: "",
  displayName: "",
  title: "",
  yearsExperience: "",
  setting: "",
  workplace: "",
  city: "",
  modes: ["online"] as string[],
  languages: ["English", "Nepali"] as string[],
  focus: "",
  clientGroups: [] as string[],
  bio: "",
  legalName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  idType: "",
  idNumber: "",
  idIssuer: "",
  qualifications: [{ ...emptyQualification }] as Qualification[],
  experience: "",
  registrationHeld: "yes",
  body: "",
  bodyOther: "",
  registrationNumber: "",
  issuedOn: "",
  validUntil: "",
  association: "",
  references: [{ ...emptyReference }] as Reference[],
  accurate: false,
  goodStanding: "",
  standingDetails: "",
  consentToVerify: false,
  withinScope: false,
};
type Data = typeof initial;
type Errors = Record<string, string>;
const draftKey = "chatbud-practitioner-application";
const today = () => new Date().toISOString().slice(0, 10);
const phoneNumber = (value: string) => {
  const digits = value.replace(/[\s-]/g, "").replace(/^(\+?977)/, "");
  return /^9[678]\d{8}$/.test(digits) ? `+977${digits}` : "";
};
function Field({
  label,
  hint,
  error,
  optional,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  wide?: boolean;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}) {
  const id = useId();
  const described =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className={`field${wide ? " wide" : ""}${error ? " invalid" : ""}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="optional">Optional</span>}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": described })}
      {hint && !error && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
function Choices({
  legend,
  options,
  values,
  toggle,
  error,
  optional,
}: {
  legend: string;
  options: string[][];
  values: string[];
  toggle: (value: string) => void;
  error?: string;
  optional?: boolean;
}) {
  return (
    <fieldset className={`choices wide${error ? " invalid" : ""}`}>
      <legend>
        {legend}
        {optional && <span className="optional">Optional</span>}
      </legend>
      <div>
        {options.map(([value, label]) => (
          <label key={value} className="choice">
            <input
              type="checkbox"
              checked={values.includes(value)}
              onChange={() => toggle(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  );
}
export function ApplicationForm() {
  const { mode, api, run, busy, setNotice, setDashboard } = useApp();
  const [step, setStep] = useState(0),
    [reached, setReached] = useState(0),
    [data, setData] = useState<Data>(initial),
    [errors, setErrors] = useState<Errors>({}),
    [files, setFiles] = useState<Partial<Record<DocumentKind, Uploaded>>>({}),
    [uploading, setUploading] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  // A draft survives a refresh but not the browser tab; identity details never go to disk.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) setData({ ...initial, ...JSON.parse(saved) });
    } catch {}
  }, []);
  useEffect(() => {
    // The untouched form is never worth saving, and must not overwrite a draft.
    if (data === initial) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(data));
    } catch {}
  }, [data]);
  const set = <K extends keyof Data>(key: K, value: Data[K]) => {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      const { [key]: _removed, ...rest } = e;
      return rest;
    });
  };
  const toggle = (key: "modes" | "languages" | "clientGroups", value: string) =>
    set(
      key,
      data[key].includes(value)
        ? data[key].filter((v) => v !== value)
        : [...data[key], value],
    );
  const input = (key: keyof Data) => ({
    value: data[key] as string,
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => set(key, e.target.value as never),
  });
  const requirements = requirementsFor(data.profession);
  const registered = requirements.registrationRequired
    ? true
    : data.registrationHeld === "yes";
  const body = data.body === "Other" ? data.bodyOther : data.body;
  function validate(index: number): Errors {
    const e: Errors = {};
    const need = (key: keyof Data, message: string) => {
      if (!String(data[key]).trim()) e[key] = message;
    };
    if (index === 0) {
      need("profession", "Choose the category you are applying under.");
      if (data.displayName.trim().length < 3)
        e.displayName = "Enter the name clients will see on your profile.";
      need("title", "Enter your professional title.");
      if (
        data.yearsExperience === "" ||
        Number(data.yearsExperience) < 0 ||
        Number(data.yearsExperience) > 60
      )
        e.yearsExperience = "Enter your years in practice, from 0 to 60.";
      need("setting", "Choose where you mainly practise.");
      need("city", "Enter the city or district where you practise.");
      if (!data.modes.length) e.modes = "Choose at least one way you consult.";
      if (!data.languages.length)
        e.languages = "Choose at least one language you consult in.";
      if (data.bio.trim().length < 30)
        e.bio = "Write at least 30 characters about your practice.";
    }
    if (index === 1) {
      if (data.legalName.trim().length < 3)
        e.legalName = "Enter your full name as it appears on your ID.";
      if (!data.dateOfBirth) e.dateOfBirth = "Enter your date of birth.";
      else if (
        Date.now() - Date.parse(data.dateOfBirth) <
        21 * 365.25 * 86400000
      )
        e.dateOfBirth = "Practitioners must be at least 21 years old.";
      if (!phoneNumber(data.phone))
        e.phone = "Enter a Nepali mobile number, for example 98XXXXXXXX.";
      need("idType", "Choose the type of ID you will upload.");
      if (data.idNumber.trim().length < 3)
        e.idNumber = "Enter the number printed on your ID.";
      if (data.idIssuer.trim().length < 2)
        e.idIssuer = "Enter the district or authority that issued your ID.";
    }
    if (index === 2) {
      data.qualifications.forEach((q, i) => {
        if (!q.level.trim()) e[`q${i}level`] = "Enter the qualification.";
        if (!q.field.trim()) e[`q${i}field`] = "Enter the field of study.";
        if (!q.institution.trim())
          e[`q${i}institution`] = "Enter the awarding institution.";
        if (!q.country.trim()) e[`q${i}country`] = "Enter the country.";
        const year = Number(q.year);
        if (!year || year < 1960 || year > new Date().getFullYear())
          e[`q${i}year`] = "Enter the year it was awarded.";
      });
      if (data.experience.trim().length < 10)
        e.experience = "Summarise your experience in at least 10 characters.";
    }
    if (index === 3) {
      if (registered) {
        if (!body.trim()) e.body = "Choose your registering body.";
        if (!data.registrationNumber.trim())
          e.registrationNumber = "Enter your registration number.";
        if (data.validUntil && data.validUntil < today())
          e.validUntil = "This registration has expired. Renew it first.";
      } else if (data.association.trim().length < 5)
        e.association =
          "Name a professional association, training body or supervisor who can confirm your practice.";
      data.references.forEach((r, i) => {
        if (!r.name.trim()) e[`r${i}name`] = "Enter the referee’s name.";
        if (!r.role.trim()) e[`r${i}role`] = "Enter their role.";
        if (!r.organization.trim())
          e[`r${i}organization`] = "Enter their organization.";
        if (r.contact.trim().length < 5)
          e[`r${i}contact`] = "Enter an email address or phone number.";
      });
    }
    if (index === 4) {
      if (!files.identity) e.identity = "Upload your government photo ID.";
      if (!files.qualification)
        e.qualification = "Upload your qualification certificate.";
      if (registered && !files.registration)
        e.registration = "Upload your registration certificate.";
    }
    if (index === 5) {
      if (!data.accurate) e.accurate = "Confirm the information is accurate.";
      if (!data.goodStanding)
        e.goodStanding = "Answer the professional standing question.";
      if (data.goodStanding === "no" && data.standingDetails.trim().length < 10)
        e.standingDetails = "Briefly describe what happened and when.";
      if (!data.consentToVerify)
        e.consentToVerify = "Consent is needed to verify your credentials.";
      if (!data.withinScope)
        e.withinScope = "Confirm you will practise within your approved scope.";
    }
    return e;
  }
  function go(index: number) {
    setErrors({});
    setStep(index);
    setReached((r) => Math.max(r, index));
    requestAnimationFrame(() => heading.current?.focus());
  }
  function next() {
    const found = validate(step);
    setErrors(found);
    if (Object.keys(found).length) {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            ".application [aria-invalid='true'], .application .invalid input",
          )
          ?.focus(),
      );
      return;
    }
    if (step < steps.length - 1) return go(step + 1);
    submit();
  }
  async function upload(kind: DocumentKind, file: File | undefined) {
    if (!file) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
      return setErrors((e) => ({
        ...e,
        [kind]: "Use a PDF, JPG or PNG file.",
      }));
    if (file.size > 5242880)
      return setErrors((e) => ({
        ...e,
        [kind]: "This file is larger than 5 MB. Upload a smaller copy.",
      }));
    setUploading(kind);
    setErrors((e) => {
      const { [kind]: _removed, ...rest } = e;
      return rest;
    });
    try {
      const slot = await api("providers/documents", "POST", {
        kind,
        mediaType: file.type,
        size: file.size,
      });
      if (slot.token) {
        if (!supabase) throw new Error("Document storage is not configured.");
        const { error } = await supabase.storage
          .from("credential-evidence")
          .uploadToSignedUrl(slot.path, slot.token, file, {
            contentType: file.type,
          });
        if (error) throw error;
      }
      setFiles((f) => ({ ...f, [kind]: { path: slot.path, name: file.name } }));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setErrors((e) => ({
          ...e,
          [kind]:
            "The upload did not finish. Check your connection and try again.",
        }));
    } finally {
      setUploading("");
    }
  }
  function submit() {
    run(async () => {
      await api("providers/applications", "POST", {
        profession: data.profession,
        bio: data.bio.trim(),
        experience: data.experience.trim(),
        details: {
          practice: {
            displayName: data.displayName.trim(),
            title: data.title.trim(),
            yearsExperience: Number(data.yearsExperience),
            setting: data.setting,
            workplace: data.workplace.trim(),
            city: data.city.trim(),
            modes: data.modes,
            languages: data.languages,
            focus: data.focus.trim(),
            clientGroups: data.clientGroups,
          },
          identity: {
            legalName: data.legalName.trim(),
            dateOfBirth: data.dateOfBirth,
            gender: data.gender,
            phone: phoneNumber(data.phone),
            idType: data.idType,
            idNumber: data.idNumber.trim(),
            idIssuer: data.idIssuer.trim(),
          },
          qualifications: data.qualifications.map((q) => ({
            level: q.level.trim(),
            field: q.field.trim(),
            institution: q.institution.trim(),
            country: q.country.trim(),
            year: Number(q.year),
          })),
          registration: {
            held: registered,
            body: registered ? body.trim() : "",
            number: registered ? data.registrationNumber.trim() : "",
            issuedOn: registered ? data.issuedOn : "",
            validUntil: registered ? data.validUntil : "",
            association: data.association.trim(),
          },
          references: data.references.map((r) => ({
            name: r.name.trim(),
            role: r.role.trim(),
            organization: r.organization.trim(),
            contact: r.contact.trim(),
          })),
          documents: Object.entries(files).map(([kind, file]) => ({
            kind,
            path: file!.path,
            name: file!.name,
          })),
          declarations: {
            accurate: true,
            goodStanding: data.goodStanding === "yes",
            standingDetails: data.standingDetails.trim(),
            consentToVerify: true,
            withinScope: true,
          },
        },
      });
      try {
        sessionStorage.removeItem(draftKey);
      } catch {}
      setNotice(
        mode === "demo"
          ? "Preview application submitted."
          : "Application submitted for review.",
      );
      setDashboard(await api("me"));
    });
  }
  const listItem = <T,>(
    key: "qualifications" | "references",
    index: number,
    field: keyof T,
    prefix: string,
  ) => ({
    value: (data[key][index] as any)[field] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      set(
        key,
        (data[key] as any[]).map((item, i) =>
          i === index ? { ...item, [field]: e.target.value } : item,
        ) as never,
      );
      setErrors((current) => {
        const { [`${prefix}${index}${String(field)}`]: _removed, ...rest } =
          current;
        return rest;
      });
    },
  });
  const count = Object.keys(errors).length;
  return (
    <div className="application">
      <nav className="stepper" aria-label="Application steps">
        <ol>
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={
                i === step ? "current" : i < reached || i < step ? "done" : ""
              }
            >
              <button
                type="button"
                disabled={i > reached}
                aria-current={i === step ? "step" : undefined}
                onClick={() => go(i)}
              >
                <span className="step-mark">
                  {i < step || (i < reached && i !== step) ? (
                    <Check size={14} strokeWidth={3} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span>
                  <strong>{s.label}</strong>
                  <small>{s.time}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="stepper-note">
          <Lock size={14} />
          Your details are used only to verify your credentials and are visible
          only to Chatbud’s review team.
        </p>
      </nav>
      <form
        className="application-step"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <header>
          <p className="step-count">
            Step {step + 1} of {steps.length}
          </p>
          <h2 ref={heading} tabIndex={-1}>
            {
              [
                "Tell us about your practice",
                "Confirm your identity",
                "Your qualifications",
                "Registration and references",
                "Upload your documents",
                "Review and declare",
              ][step]
            }
          </h2>
          <p>
            {
              [
                "This becomes the basis of your public profile once you are approved.",
                "We match these details against your government ID. They are never shown publicly.",
                "List the qualifications that entitle you to practise, starting with the highest.",
                "We confirm your registration with the issuing body and may contact your referees.",
                "Clear scans or photos. PDF, JPG or PNG, up to 5 MB each.",
                "Check your answers, then confirm the declarations to submit.",
              ][step]
            }
          </p>
        </header>
        {count > 0 && (
          <div className="step-errors" role="alert">
            {count === 1
              ? "One answer needs attention before you continue."
              : `${count} answers need attention before you continue.`}
          </div>
        )}
        {step === 0 && (
          <div className="field-grid">
            <Field label="Professional category" error={errors.profession}>
              {(p) => (
                <select
                  {...p}
                  value={data.profession}
                  onChange={(e) => {
                    set("profession", e.target.value);
                    set("body", requirementsFor(e.target.value).body);
                  }}
                >
                  <option value="">Select a category</option>
                  {professionGroups.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.options.map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </Field>
            <Field
              label="Name on your profile"
              hint="How clients will see you, for example “Dr Maya Sharma”."
              error={errors.displayName}
            >
              {(p) => <input {...p} {...input("displayName")} maxLength={80} />}
            </Field>
            <Field
              label="Professional title"
              hint="As you would like it shown, for example “Consultant psychiatrist”."
              error={errors.title}
            >
              {(p) => <input {...p} {...input("title")} maxLength={120} />}
            </Field>
            <Field label="Years in practice" error={errors.yearsExperience}>
              {(p) => (
                <input
                  {...p}
                  {...input("yearsExperience")}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={60}
                />
              )}
            </Field>
            <Field label="Main practice setting" error={errors.setting}>
              {(p) => (
                <select {...p} {...input("setting")}>
                  <option value="">Select a setting</option>
                  <option value="independent">Independent practice</option>
                  <option value="clinic">Clinic</option>
                  <option value="hospital">Hospital</option>
                  <option value="organization">
                    NGO or other organization
                  </option>
                </select>
              )}
            </Field>
            <Field label="Workplace name" optional error={errors.workplace}>
              {(p) => <input {...p} {...input("workplace")} maxLength={160} />}
            </Field>
            <Field label="City or district" error={errors.city}>
              {(p) => (
                <input
                  {...p}
                  {...input("city")}
                  maxLength={80}
                  autoComplete="address-level2"
                />
              )}
            </Field>
            <Choices
              legend="How you consult"
              options={[
                ["online", "Online"],
                ["in_person", "In person"],
              ]}
              values={data.modes}
              toggle={(v) => toggle("modes", v)}
              error={errors.modes}
            />
            <Choices
              legend="Languages you consult in"
              options={languages.map((l) => [l, l])}
              values={data.languages}
              toggle={(v) => toggle("languages", v)}
              error={errors.languages}
            />
            <Choices
              legend="Who you work with"
              optional
              options={clientGroups.map((g) => [g, g])}
              values={data.clientGroups}
              toggle={(v) => toggle("clientGroups", v)}
            />
            <Field
              wide
              label="Areas of focus"
              optional
              hint="Separate with commas, for example “anxiety, workplace stress, grief”."
            >
              {(p) => <input {...p} {...input("focus")} maxLength={300} />}
            </Field>
            <Field
              wide
              label="About your practice"
              hint={`Your approach and the people you help. ${data.bio.trim().length} of 1,500 characters.`}
              error={errors.bio}
            >
              {(p) => (
                <textarea {...p} {...input("bio")} rows={5} maxLength={1500} />
              )}
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="field-grid">
            <Field
              wide
              label="Full legal name"
              hint="Exactly as printed on your ID."
              error={errors.legalName}
            >
              {(p) => (
                <input
                  {...p}
                  {...input("legalName")}
                  maxLength={120}
                  autoComplete="name"
                />
              )}
            </Field>
            <Field label="Date of birth" error={errors.dateOfBirth}>
              {(p) => (
                <input
                  {...p}
                  {...input("dateOfBirth")}
                  type="date"
                  max={today()}
                  autoComplete="bday"
                />
              )}
            </Field>
            <Field label="Gender" optional>
              {(p) => (
                <select {...p} {...input("gender")}>
                  <option value="">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              )}
            </Field>
            <Field
              label="Mobile number"
              hint="We call or message this number during verification."
              error={errors.phone}
            >
              {(p) => (
                <input
                  {...p}
                  {...input("phone")}
                  type="tel"
                  inputMode="tel"
                  placeholder="98XXXXXXXX"
                  autoComplete="tel-national"
                />
              )}
            </Field>
            <Field label="ID type" error={errors.idType}>
              {(p) => (
                <select {...p} {...input("idType")}>
                  <option value="">Select an ID</option>
                  <option value="citizenship">Citizenship certificate</option>
                  <option value="passport">Passport</option>
                  <option value="national_id">National ID card</option>
                  <option value="driving_licence">Driving licence</option>
                </select>
              )}
            </Field>
            <Field label="ID number" error={errors.idNumber}>
              {(p) => <input {...p} {...input("idNumber")} maxLength={40} />}
            </Field>
            <Field
              label="Issuing district or authority"
              error={errors.idIssuer}
            >
              {(p) => <input {...p} {...input("idIssuer")} maxLength={80} />}
            </Field>
          </div>
        )}
        {step === 2 && (
          <>
            {data.qualifications.map((_, i) => (
              <fieldset className="entry" key={i}>
                <legend>
                  {i === 0
                    ? "Highest qualification"
                    : `Additional qualification ${i}`}
                  {i > 0 && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        set(
                          "qualifications",
                          data.qualifications.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  )}
                </legend>
                <div className="field-grid">
                  <Field
                    label="Qualification"
                    hint="For example MD, MPhil, MSc, PG Diploma."
                    error={errors[`q${i}level`]}
                  >
                    {(p) => (
                      <input
                        {...p}
                        {...listItem<Qualification>(
                          "qualifications",
                          i,
                          "level",
                          "q",
                        )}
                        maxLength={60}
                      />
                    )}
                  </Field>
                  <Field label="Field of study" error={errors[`q${i}field`]}>
                    {(p) => (
                      <input
                        {...p}
                        {...listItem<Qualification>(
                          "qualifications",
                          i,
                          "field",
                          "q",
                        )}
                        maxLength={120}
                      />
                    )}
                  </Field>
                  <Field
                    wide
                    label="Awarding institution"
                    error={errors[`q${i}institution`]}
                  >
                    {(p) => (
                      <input
                        {...p}
                        {...listItem<Qualification>(
                          "qualifications",
                          i,
                          "institution",
                          "q",
                        )}
                        maxLength={160}
                      />
                    )}
                  </Field>
                  <Field label="Country" error={errors[`q${i}country`]}>
                    {(p) => (
                      <input
                        {...p}
                        {...listItem<Qualification>(
                          "qualifications",
                          i,
                          "country",
                          "q",
                        )}
                        maxLength={60}
                      />
                    )}
                  </Field>
                  <Field label="Year awarded" error={errors[`q${i}year`]}>
                    {(p) => (
                      <input
                        {...p}
                        {...listItem<Qualification>(
                          "qualifications",
                          i,
                          "year",
                          "q",
                        )}
                        type="number"
                        inputMode="numeric"
                        min={1960}
                        max={new Date().getFullYear()}
                      />
                    )}
                  </Field>
                </div>
              </fieldset>
            ))}
            {data.qualifications.length < 3 && (
              <button
                type="button"
                className="add-entry"
                onClick={() =>
                  set("qualifications", [
                    ...data.qualifications,
                    { ...emptyQualification },
                  ])
                }
              >
                <Plus size={16} /> Add another qualification
              </button>
            )}
            <div className="field-grid">
              <Field
                wide
                label="Professional experience"
                hint={`Roles, supervised practice and specialist training. ${data.experience.trim().length} of 1,000 characters.`}
                error={errors.experience}
              >
                {(p) => (
                  <textarea
                    {...p}
                    {...input("experience")}
                    rows={4}
                    maxLength={1000}
                  />
                )}
              </Field>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <fieldset className="entry">
              <legend>Professional registration</legend>
              {!requirements.registrationRequired && (
                <div className="choices inline">
                  <div>
                    {[
                      ["yes", "I hold a professional registration"],
                      ["no", "My profession has no statutory registration"],
                    ].map(([value, label]) => (
                      <label key={value} className="choice">
                        <input
                          type="radio"
                          name="registrationHeld"
                          checked={data.registrationHeld === value}
                          onChange={() => set("registrationHeld", value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {registered ? (
                <div className="field-grid">
                  <Field label="Registering body" error={errors.body}>
                    {(p) => (
                      <select {...p} {...input("body")}>
                        <option value="">Select a body</option>
                        {registeringBodies.map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </select>
                    )}
                  </Field>
                  {data.body === "Other" && (
                    <Field label="Name of the body" error={errors.body}>
                      {(p) => (
                        <input {...p} {...input("bodyOther")} maxLength={120} />
                      )}
                    </Field>
                  )}
                  <Field
                    label="Registration number"
                    error={errors.registrationNumber}
                  >
                    {(p) => (
                      <input
                        {...p}
                        {...input("registrationNumber")}
                        maxLength={40}
                      />
                    )}
                  </Field>
                  <Field label="Date registered" optional>
                    {(p) => (
                      <input
                        {...p}
                        {...input("issuedOn")}
                        type="date"
                        max={today()}
                      />
                    )}
                  </Field>
                  <Field
                    label="Valid until"
                    optional
                    hint="Leave blank if it does not expire."
                    error={errors.validUntil}
                  >
                    {(p) => (
                      <input {...p} {...input("validUntil")} type="date" />
                    )}
                  </Field>
                </div>
              ) : (
                <div className="field-grid">
                  <Field
                    wide
                    label="Who can confirm your right to practise?"
                    hint="A professional association you belong to, your training institution, or your clinical supervisor."
                    error={errors.association}
                  >
                    {(p) => (
                      <input {...p} {...input("association")} maxLength={200} />
                    )}
                  </Field>
                </div>
              )}
            </fieldset>
            {data.references.map((_, i) => (
              <fieldset className="entry" key={i}>
                <legend>
                  {i === 0 ? "Professional referee" : "Second referee"}
                  {i > 0 && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        set(
                          "references",
                          data.references.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  )}
                </legend>
                <div className="field-grid">
                  <Field label="Full name" error={errors[`r${i}name`]}>
                    {(p) => (
                      <input
                        {...p}
                        {...listItem<Reference>("references", i, "name", "r")}
                        maxLength={120}
                      />
                    )}
                  </Field>
                  <Field
                    label="Role"
                    hint="For example supervisor, head of department."
                    error={errors[`r${i}role`]}
                  >
                    {(p) => (
                      <input
                        {...p}
                        {...listItem<Reference>("references", i, "role", "r")}
                        maxLength={120}
                      />
                    )}
                  </Field>
                  <Field
                    label="Organization"
                    error={errors[`r${i}organization`]}
                  >
                    {(p) => (
                      <input
                        {...p}
                        {...listItem<Reference>(
                          "references",
                          i,
                          "organization",
                          "r",
                        )}
                        maxLength={160}
                      />
                    )}
                  </Field>
                  <Field label="Email or phone" error={errors[`r${i}contact`]}>
                    {(p) => (
                      <input
                        {...p}
                        {...listItem<Reference>(
                          "references",
                          i,
                          "contact",
                          "r",
                        )}
                        maxLength={120}
                      />
                    )}
                  </Field>
                </div>
              </fieldset>
            ))}
            {data.references.length < 2 && (
              <button
                type="button"
                className="add-entry"
                onClick={() =>
                  set("references", [...data.references, { ...emptyReference }])
                }
              >
                <Plus size={16} /> Add a second referee
              </button>
            )}
          </>
        )}
        {step === 4 && (
          <ul className="uploads">
            {documentKinds.map((d) => {
              const required =
                d.kind === "identity" ||
                d.kind === "qualification" ||
                (d.kind === "registration" && registered);
              if (d.kind === "registration" && !registered) return null;
              const file = files[d.kind];
              return (
                <li key={d.kind} className={errors[d.kind] ? "invalid" : ""}>
                  <span className={`upload-mark${file ? " done" : ""}`}>
                    {file ? <FileCheck2 size={20} /> : <Upload size={20} />}
                  </span>
                  <div>
                    <strong>
                      {d.label}
                      {!required && <span className="optional">Optional</span>}
                    </strong>
                    <p>{file ? file.name : d.hint}</p>
                    {errors[d.kind] && (
                      <p className="field-error" role="alert">
                        {errors[d.kind]}
                      </p>
                    )}
                  </div>
                  <label className="button secondary upload-button">
                    {uploading === d.kind
                      ? "Uploading…"
                      : file
                        ? "Replace"
                        : "Choose file"}
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      disabled={!!uploading}
                      aria-label={`${file ? "Replace" : "Choose"} file for ${d.label}`}
                      onChange={(e) => {
                        upload(d.kind, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {step === 5 && (
          <>
            <dl className="review">
              {[
                [
                  "Your practice",
                  0,
                  `${professions[data.profession] || ""} · ${data.title} · ${data.yearsExperience} years · ${data.city}`,
                ],
                [
                  "Identity",
                  1,
                  `${data.legalName} · ${data.idType.replaceAll("_", " ")} ending ${data.idNumber.slice(-3)}`,
                ],
                [
                  "Qualifications",
                  2,
                  data.qualifications
                    .map(
                      (q) =>
                        `${q.level} ${q.field}, ${q.institution} (${q.year})`,
                    )
                    .join("; "),
                ],
                [
                  "Registration",
                  3,
                  registered
                    ? `${body} · ${data.registrationNumber}`
                    : `No statutory registration · ${data.association}`,
                ],
                [
                  "Referees",
                  3,
                  data.references
                    .map((r) => `${r.name}, ${r.organization}`)
                    .join("; "),
                ],
                ["Documents", 4, `${Object.keys(files).length} uploaded`],
              ].map(([label, index, value]) => (
                <div key={label as string}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => go(index as number)}
                  >
                    Edit<span className="sr-only"> {label}</span>
                  </button>
                </div>
              ))}
            </dl>
            <fieldset className="entry declarations">
              <legend>Declarations</legend>
              <label className={`declare${errors.accurate ? " invalid" : ""}`}>
                <input
                  type="checkbox"
                  checked={data.accurate}
                  aria-invalid={!!errors.accurate}
                  onChange={(e) => set("accurate", e.target.checked)}
                />
                <span>
                  The information and documents I have provided are true,
                  complete and my own.
                </span>
              </label>
              <label
                className={`declare${errors.consentToVerify ? " invalid" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={data.consentToVerify}
                  aria-invalid={!!errors.consentToVerify}
                  onChange={(e) => set("consentToVerify", e.target.checked)}
                />
                <span>
                  I consent to Chatbud verifying my identity, qualifications and
                  registration with the issuing bodies and contacting my
                  referees.
                </span>
              </label>
              <label
                className={`declare${errors.withinScope ? " invalid" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={data.withinScope}
                  aria-invalid={!!errors.withinScope}
                  onChange={(e) => set("withinScope", e.target.checked)}
                />
                <span>
                  I will practise only within the scope Chatbud approves, and I
                  understand Chatbud is not an emergency service.
                </span>
              </label>
              <div
                className={`choices inline${errors.goodStanding ? " invalid" : ""}`}
                role="radiogroup"
                aria-label="Professional standing"
              >
                <p>
                  Have you ever had a registration refused, suspended or
                  withdrawn, been subject to a disciplinary finding, or been
                  convicted of an offence relevant to your practice?
                </p>
                <div>
                  {[
                    ["yes", "No, none of these apply"],
                    ["no", "Yes, one or more apply"],
                  ].map(([value, label]) => (
                    <label key={value} className="choice">
                      <input
                        type="radio"
                        name="goodStanding"
                        checked={data.goodStanding === value}
                        onChange={() => set("goodStanding", value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                {errors.goodStanding && (
                  <p className="field-error">{errors.goodStanding}</p>
                )}
              </div>
              {data.goodStanding === "no" && (
                <Field
                  wide
                  label="Tell us what happened"
                  hint="This does not automatically prevent approval. A reviewer will consider it in context."
                  error={errors.standingDetails}
                >
                  {(p) => (
                    <textarea
                      {...p}
                      {...input("standingDetails")}
                      rows={3}
                      maxLength={1000}
                    />
                  )}
                </Field>
              )}
              {["accurate", "consentToVerify", "withinScope"]
                .filter((k) => errors[k])
                .map((k) => (
                  <p className="field-error" key={k}>
                    {errors[k]}
                  </p>
                ))}
            </fieldset>
            {mode === "demo" && (
              <p className="form-note">
                Use fictional information in this preview. Submit your real
                application in Live database mode.
              </p>
            )}
          </>
        )}
        <footer className="step-actions">
          {step > 0 && (
            <button
              type="button"
              className="button secondary"
              onClick={() => go(step - 1)}
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <button className="button" disabled={busy || !!uploading}>
            {step < steps.length - 1 ? (
              <>
                Continue <ArrowRight size={16} />
              </>
            ) : busy ? (
              "Submitting…"
            ) : (
              "Submit application"
            )}
          </button>
        </footer>
      </form>
    </div>
  );
}
