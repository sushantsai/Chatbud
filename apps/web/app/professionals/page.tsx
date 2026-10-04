"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Clock,
  Dumbbell,
  Globe,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
} from "lucide-react";
import { useApp } from "../_components/app";
import {
  ComingSoon,
  fitnessProfessions,
  money,
  professions,
} from "../_components/ui";
import { features, type Feature } from "../_lib/features";
const groups: { id: Feature; label: string; professions: string[] }[] = [
  {
    id: "mental",
    label: "Mental health",
    professions: ["psychiatrist", "clinical_psychologist", "counselor"],
  },
  {
    id: "nutrition",
    label: "Nutrition",
    professions: ["dietitian", "nutritionist"],
  },
  {
    id: "fitness",
    label: "Fitness",
    professions: ["personal_trainer", "fitness_coach", "yoga_instructor"],
  },
];
export default function Professionals() {
  return (
    <Suspense
      fallback={
        <div className="loading" role="status">
          Loading your options…
        </div>
      }
    >
      <Directory />
    </Suspense>
  );
}
function Directory() {
  const { mode, catalog, loading, catalogFailed, openBooking } = useApp();
  const router = useRouter();
  const visible = groups.filter((g) => features[g.id] !== "off");
  const category = useSearchParams().get("category");
  const group = visible.find((g) => g.id === category);
  const [query, setQuery] = useState(""),
    [profession, setProfession] = useState("all"),
    [budget, setBudget] = useState(3000);
  const chooseGroup = (id: string) => {
    setProfession("all");
    router.replace(
      id === "all" ? "/professionals" : `/professionals?category=${id}`,
    );
  };
  const allowed = (group ? [group] : visible)
    .filter((g) => features[g.id] === "live")
    .flatMap((g) => g.professions);
  const providers = catalog.providers.filter(
    (p: any) =>
      allowed.includes(p.profession) &&
      (profession === "all" || p.profession === profession) &&
      p.price <= budget &&
      `${p.name} ${p.profession} ${p.bio} ${(p.focus || []).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const listed = catalog.providers.some((p: any) =>
    allowed.includes(p.profession),
  );
  return (
    <>
      <div className="segments" role="group" aria-label="Care category">
        {[{ id: "all", label: "All care" }, ...visible].map((g) => (
          <button
            key={g.id}
            aria-pressed={(group?.id || "all") === g.id}
            className={(group?.id || "all") === g.id ? "chosen" : ""}
            onClick={() => chooseGroup(g.id)}
          >
            {g.label}
            {g.id !== "all" && features[g.id as Feature] === "soon" && (
              <span className="soon-badge">Soon</span>
            )}
          </button>
        ))}
      </div>
      {group && features[group.id] === "soon" ? (
        <ComingSoon icon={Dumbbell} title={`${group.label} is on its way`}>
          Qualified {group.label.toLowerCase()} professionals will be listed
          here once their qualifications have been reviewed.
        </ComingSoon>
      ) : (
        <>
          <div className="searchbar">
            <Search size={20} />
            <input
              aria-label="Search professionals"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by professional, specialty, or concern…"
            />
            <span>
              <SlidersHorizontal size={17} /> Find your fit
            </span>
          </div>
          <div className="filter-row">
            <div className="chips">
              {["all", ...allowed].map((id) => (
                <button
                  key={id}
                  aria-pressed={profession === id}
                  onClick={() => setProfession(id)}
                  className={profession === id ? "chip chosen" : "chip"}
                >
                  {id === "all" ? "All professionals" : `${professions[id]}s`}
                </button>
              ))}
            </div>
            <select
              aria-label="Maximum consultation fee"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            >
              <option value={3000}>Up to NPR 3,000</option>
              <option value={1800}>Up to NPR 1,800</option>
              <option value={1500}>Up to NPR 1,500</option>
              <option value={1000}>Up to NPR 1,000</option>
            </select>
          </div>
          {loading ? (
            <div className="loading" role="status">
              Loading your options…
            </div>
          ) : null}
          {!loading && !catalogFailed && (
            <>
              <div className="results-label">
                <span>
                  {providers.length} professionals{" "}
                  {mode === "demo" ? "in this preview" : "available"}
                </span>
                <span>
                  <ShieldCheck size={15} />
                  {mode === "demo"
                    ? "Sample profiles"
                    : "Approved professional scopes"}
                </span>
              </div>
              {providers.length === 0 ? (
                <div className="empty">
                  <Stethoscope size={36} />
                  <h2>
                    {listed
                      ? "No matching professionals"
                      : "Professional onboarding is underway"}
                  </h2>
                  <p>
                    {listed
                      ? "Try a different category or fee range."
                      : "Approved profiles will appear here as professionals join Chatbud."}
                  </p>
                  {listed ? (
                    <button
                      className="button"
                      onClick={() => {
                        setProfession("all");
                        setBudget(3000);
                        setQuery("");
                      }}
                    >
                      Clear filters
                    </button>
                  ) : (
                    <Link className="button" href="/practitioner">
                      Apply as a professional
                    </Link>
                  )}
                </div>
              ) : (
                <div className="provider-grid">
                  {providers.map((p: any, i: number) => (
                    <article className="provider-card" key={p.serviceId}>
                      <div className="card-top">
                        <div
                          className={`avatar tone-${p.color || ["blue", "orange", "green", "purple"][i % 4]}`}
                        >
                          {p.name
                            .split(" ")
                            .map((n: string) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <span className="profile-label">
                          {mode === "demo"
                            ? "Sample profile"
                            : "Scope approved"}
                          <Check size={13} />
                        </span>
                      </div>
                      <h2>{p.name}</h2>
                      <p className="profession">
                        {professions[p.profession] || p.profession}
                        {fitnessProfessions.includes(p.profession) &&
                          " · Fitness, not medical care"}
                      </p>
                      <p className="bio">{p.bio}</p>
                      <div className="tags">
                        {(p.focus || [p.service]).map((f: string) => (
                          <span key={f}>{f}</span>
                        ))}
                      </div>
                      <div className="provider-meta">
                        <span>
                          <Globe size={14} />
                          {p.languages
                            .map((l: string) =>
                              l === "ne"
                                ? "Nepali"
                                : l === "en"
                                  ? "English"
                                  : l,
                            )
                            .join(", ")}
                        </span>
                        <span>
                          <Clock size={14} />
                          {p.duration} min
                        </span>
                      </div>
                      <footer>
                        <div>
                          <strong>{money(p.price)}</strong>
                          <span>per session</span>
                        </div>
                        <button
                          className="button"
                          onClick={() => openBooking(p)}
                        >
                          View availability
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
              )}
              <div className="care-note">
                <ShieldCheck size={21} />
                <div>
                  <strong>Human care. Clear choices.</strong>
                  <p>
                    Each professional’s service scope is reviewed before
                    publication. Chatbud does not provide emergency care.
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
