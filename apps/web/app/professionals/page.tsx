"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, ShieldCheck, X } from "lucide-react";
import { useApp } from "../_components/app";
import { useLanguage } from "../_components/language";
import { Dialog, money, professions } from "../_components/ui";
const groups = [
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
export default function Care() {
  return (
    <Suspense fallback={<p role="status">Loading care…</p>}>
      <Directory />
    </Suspense>
  );
}
function Directory() {
  const { catalog, loading, catalogFailed, mode } = useApp();
  const { t } = useLanguage();
  const router = useRouter();
  const category = useSearchParams().get("category") || "all";
  const [query, setQuery] = useState(""),
    [language, setLanguage] = useState("all"),
    [budget, setBudget] = useState("all"),
    [availability, setAvailability] = useState("all"),
    [filters, setFilters] = useState(false);
  const group = groups.find((g) => g.id === category);
  const allowed = (group ? [group] : groups).flatMap((g) => g.professions);
  const matching = catalog.providers.filter(
    (p: any) =>
      allowed.includes(p.profession) &&
      (language === "all" || p.languages.includes(language)) &&
      (budget === "all" || p.price === null || p.price <= Number(budget)) &&
      (availability === "all" || p.serviceId) &&
      `${p.name} ${p.bio} ${p.profession} ${p.service || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const people = Array.from(
    new Map<string, any>(matching.map((p: any) => [p.id, p])).values(),
  );
  const clear = () => {
    setQuery("");
    setLanguage("all");
    setBudget("all");
    setAvailability("all");
  };
  const controls = (
    <div className="filter-row">
      <label>
        Language
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="all">All languages</option>
          <option value="en">English</option>
          <option value="ne">नेपाली</option>
          <option value="hi">हिन्दी</option>
        </select>
      </label>
      <label>
        Consultation fee
        <select value={budget} onChange={(e) => setBudget(e.target.value)}>
          <option value="all">{t("All prices")}</option>
          {[1000, 1500, 3000].map((n) => (
            <option value={n} key={n}>
              Up to NPR {n.toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      <label>
        Availability
        <select
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
        >
          <option value="all">All professionals</option>
          <option value="bookable">Services open for booking</option>
        </select>
      </label>
    </div>
  );
  return (
    <>
      <div className="segments" aria-label="Care category">
        {[{ id: "all", label: "All care" }, ...groups].map((g) => (
          <button
            key={g.id}
            aria-pressed={category === g.id}
            className={category === g.id ? "chosen" : ""}
            onClick={() =>
              router.replace(
                g.id === "all"
                  ? "/professionals"
                  : `/professionals?category=${g.id}`,
              )
            }
          >
            {t(g.label)}
          </button>
        ))}
      </div>
      <div className="searchbar">
        <Search size={18} />
        <input
          aria-label="Search professionals"
          placeholder="Search name, service or care need"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="text-button filter-toggle"
          onClick={() => setFilters(true)}
        >
          <SlidersHorizontal size={16} />
          {t("Filters")}
        </button>
      </div>
      <div className="filter-panel">{controls}</div>
      {filters && (
        <Dialog title={t("Filters")} close={() => setFilters(false)}>
          {controls}
          <div className="workflow-actions">
            <button className="button" onClick={() => setFilters(false)}>
              Show {people.length} results
            </button>
            <button className="text-button" onClick={clear}>
              {t("Clear filters")}
            </button>
          </div>
        </Dialog>
      )}
      <div className="filter-chip-row">
        {language !== "all" && (
          <button onClick={() => setLanguage("all")}>
            {language.toUpperCase()} ×
          </button>
        )}
        {budget !== "all" && (
          <button onClick={() => setBudget("all")}>Up to NPR {budget} ×</button>
        )}
        {availability !== "all" && (
          <button onClick={() => setAvailability("all")}>Bookable ×</button>
        )}
      </div>
      <div className="results-label">
        <span>{loading ? "Loading…" : `${people.length} professionals`}</span>
        <span>
          <ShieldCheck size={15} />
          {mode === "demo" ? "Sample profiles" : "Approved professional scopes"}
        </span>
      </div>
      {catalogFailed ? (
        <p role="alert">Care could not be loaded. Refresh to try again.</p>
      ) : !loading && people.length === 0 ? (
        <section className="panel empty">
          <h2>No matching professionals</h2>
          <p>Try another category or clear the filters.</p>
          <button className="button secondary" onClick={clear}>
            {t("Clear filters")}
          </button>
        </section>
      ) : (
        <div className="provider-grid">
          {people.map((p) => (
            <article className="provider-card" key={p.id}>
              <div className="avatar">
                {p.name
                  .split(" ")
                  .map((s: string) => s[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <h2>{p.name}</h2>
              <p className="profession">
                {professions[p.profession] || p.profession}
              </p>
              <p className="bio">{p.bio}</p>
              <div className="profile-facts">
                <span>
                  {p.languages
                    .map(
                      (l: string) =>
                        ({ en: "English", ne: "Nepali", hi: "Hindi" })[l] || l,
                    )
                    .join(" · ")}
                </span>
                <span>
                  {p.serviceId ? money(p.price) : "Services opening soon"}
                </span>
              </div>
              <footer>
                <Link
                  className="button secondary"
                  href={`/professionals/${p.id}`}
                >
                  {t("View profile")}
                </Link>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
