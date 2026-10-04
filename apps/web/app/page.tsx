"use client";
import { useState, useEffect, useRef, useId } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Heart,
  Search,
  SlidersHorizontal,
  CalendarDays,
  Clock,
  Check,
  Globe,
  ShoppingBag,
  Plus,
  Minus,
  X,
  Leaf,
  ArrowUpRight,
  BookOpen,
  Dumbbell,
  Package,
  ShieldCheck,
  UserRound,
  LayoutDashboard,
  Stethoscope,
  LogOut,
  Mail,
  ChevronDown,
  Activity,
} from "lucide-react";
const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      )
    : null;
const money = (value: number) => `NPR ${Number(value).toLocaleString("en-NP")}`;
const professions: Record<string, string> = {
  clinical_psychologist: "Clinical psychologist",
  psychiatrist: "Psychiatrist",
  counselor: "Counselor",
  dietitian: "Dietitian",
  nutritionist: "Nutritionist",
};
const nav = [
  { id: "care", label: "Find care", icon: Heart },
  { id: "nutrition", label: "Nutrition", icon: Leaf },
  { id: "shop", label: "Wellness shop", icon: ShoppingBag },
  { id: "journey", label: "My care", icon: CalendarDays },
  { id: "provider", label: "Practitioner workspace", icon: Stethoscope },
];
function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export default function Home() {
  const [mode, setMode] = useState("live"),
    [demoAvailable, setDemoAvailable] = useState(false),
    [token, setToken] = useState(""),
    [userName, setUserName] = useState("");
  useEffect(() => {
    let active = true,
      authChanged = false;
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then((r) => r.json())
      .then((h) => {
        if (active) {
          setDemoAvailable(!!h.demoAvailable);
          if (h.demoAvailable) setMode("demo");
        }
      })
      .catch(() => {});
    supabase?.auth.getSession().then(({ data }) => {
      if (active && !authChanged) {
        setToken(data.session?.access_token || "");
        setUserName(
          data.session?.user.user_metadata?.display_name ||
            data.session?.user.email?.split("@")[0] ||
            "",
        );
      }
    });
    const listener = supabase?.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      if (active) {
        setToken(session?.access_token || "");
        setUserName(
          session?.user.user_metadata?.display_name ||
            session?.user.email?.split("@")[0] ||
            "",
        );
      }
    });
    return () => {
      active = false;
      controller.abort();
      listener?.data.subscription.unsubscribe();
    };
  }, []);
  // A mode or session change discards every record, pending selection, and form.
  return (
    <CareWorkspace
      key={`${mode}:${token}`}
      mode={mode}
      setMode={setMode}
      demoAvailable={demoAvailable}
      token={token}
      userName={userName}
    />
  );
}
function CareWorkspace({
  mode,
  setMode,
  demoAvailable,
  token,
  userName,
}: {
  mode: string;
  setMode: (mode: string) => void;
  demoAvailable: boolean;
  token: string;
  userName: string;
}) {
  const [view, setView] = useState("care"),
    [catalog, setCatalog] = useState<any>({ providers: [], products: [] }),
    [loading, setLoading] = useState(true),
    [catalogFailed, setCatalogFailed] = useState(false),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [budget, setBudget] = useState(3000),
    [cart, setCart] = useState<Record<string, number>>({}),
    [cartOpen, setCartOpen] = useState(false),
    [modal, setModal] = useState(""),
    [chosen, setChosen] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dashboard, setDashboard] = useState<any>({
      appointments: [],
      orders: [],
      roles: [],
    }),
    [admin, setAdmin] = useState<any>({ applications: [], audit: [] });
  const [authMode, setAuthMode] = useState("signin");
  const mounted = useRef(false),
    requests = useRef(new Set<AbortController>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const request of requests.current) request.abort();
      requests.current.clear();
    };
  }, []);
  async function api(path: string, method = "GET", body?: unknown) {
    if (!mounted.current)
      throw new DOMException("The workspace changed.", "AbortError");
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const r = await fetch(
        `/api/${path}${path.includes("?") ? "&" : "?"}mode=${mode}`,
        {
          method,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      const data = await r.json();
      if (!mounted.current || controller.signal.aborted)
        throw new DOMException("The workspace changed.", "AbortError");
      if (!r.ok)
        throw new Error(
          data.message || "Something went wrong. Please try again.",
        );
      return data;
    } finally {
      requests.current.delete(controller);
    }
  }
  useEffect(() => {
    let active = true;
    api("catalog")
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setCatalogFailed(true);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, token]);
  useEffect(() => {
    if (mode === "live" && !token) return;
    let active = true;
    // Load roles immediately after authentication, including on the Find care page.
    api("me")
      .then((data) => {
        if (active) setDashboard(data);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      });
    if (view === "admin")
      api("admin/overview")
        .then((data) => {
          if (active) setAdmin(data);
        })
        .catch((e) => {
          if (active && e.name !== "AbortError") setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [view, mode, token]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timeout);
  }, [notice]);
  function changeView(v: string) {
    setView(v);
    setQuery("");
    setCategory("all");
    setError("");
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (
        mounted.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const providers = catalog.providers.filter(
    (p: any) =>
      (view !== "nutrition" ||
        ["nutritionist", "dietitian"].includes(p.profession)) &&
      (category === "all" || p.profession === category) &&
      p.price <= budget &&
      `${p.name} ${p.profession} ${p.bio} ${(p.focus || []).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const products = catalog.products.filter(
    (p: any) =>
      (category === "all" || p.kind === category) &&
      `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const cartItems = catalog.products.filter((p: any) => cart[p.id]);
  const total = cartItems.reduce(
    (s: number, p: any) => s + p.price * cart[p.id],
    0,
  );
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const allowAdmin =
    mode === "demo" ||
    dashboard.roles?.some((r: string) =>
      ["VERIFICATION", "CLINICAL_REVIEW"].includes(r),
    );
  const titles: Record<string, [string, string]> = {
    care: [
      "The right support, at your pace.",
      "Explore mental-health and nutrition professionals.",
    ],
    nutrition: [
      "Good nutrition starts with you.",
      "Find practical support for your food, lifestyle, and wellbeing.",
    ],
    shop: [
      "Small steps. Everyday wellbeing.",
      "Explore wellness products and nutrition essentials.",
    ],
    journey: [
      "Your care, all in one place.",
      "Keep track of appointments, orders, and your next steps.",
    ],
    provider: [
      "Make room for better care.",
      "Apply to join Chatbud and manage your professional profile.",
    ],
    admin: [
      "Care starts with trust.",
      "Review provider applications and keep operations moving.",
    ],
  };
  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => changeView("care")}>
          <span className="brand-icon">
            <Heart size={22} />
          </span>
          chatbud<span className="brand-dot">.</span>
        </button>
        <nav aria-label="Main navigation">
          {nav.slice(0, 4).map((n) => (
            <button
              key={n.id}
              aria-current={view === n.id ? "page" : undefined}
              className={view === n.id ? "active" : ""}
              onClick={() => changeView(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span className="location">
            <Globe size={15} /> Nepal · NPR
          </span>
          <button
            className="icon-button cart-button"
            aria-label={`Shopping bag, ${cartCount} items`}
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag size={20} />
            {cartCount > 0 && <b>{cartCount}</b>}
          </button>
          {token ? (
            <button
              className="account"
              aria-label={`Sign out ${userName}`}
              onClick={() =>
                run(async () => {
                  await supabase?.auth.signOut();
                  setNotice("Signed out.");
                })
              }
            >
              <UserRound size={16} />
              <span>{userName}</span>
              <LogOut size={14} />
            </button>
          ) : (
            <button
              className="button small"
              onClick={() => {
                setModal("auth");
                setError("");
              }}
            >
              Sign in
            </button>
          )}
        </div>
      </header>
      {demoAvailable && (
        <div className="preview-bar">
          <span>
            <span className="preview-label">Development preview</span>
            {mode === "demo"
              ? "Fictional profiles and products. No real payment or consultation."
              : "Connected to the live Chatbud database."}
          </span>
          <select
            aria-label="Data mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="demo">Explore preview</option>
            <option value="live">Live database</option>
          </select>
        </div>
      )}
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-label">YOUR WELLBEING</div>
          {nav.map((n) => (
            <button
              key={n.id}
              aria-current={view === n.id ? "page" : undefined}
              className={view === n.id ? "selected" : ""}
              onClick={() => changeView(n.id)}
            >
              <n.icon size={19} />
              {n.label}
            </button>
          ))}
          {allowAdmin && (
            <button
              className={view === "admin" ? "selected" : ""}
              onClick={() => changeView("admin")}
            >
              <LayoutDashboard size={19} />
              Review workspace
            </button>
          )}
          <div className="sidebar-support">
            <span className="support-icon">
              <Heart size={22} />
            </span>
            <h3>You don’t need to have it all figured out.</h3>
            <p>
              Start with a professional who can help you find your next step.
            </p>
            <button
              onClick={() => {
                changeView("care");
                setCategory("all");
              }}
            >
              Explore professionals <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="privacy">
            <ShieldCheck size={17} />
            <span>
              Your privacy matters.
              <br />
              Your care information stays private.
            </span>
          </div>
        </aside>
        <main>
          <div className="breadcrumb">
            Chatbud <span>/</span>{" "}
            {view === "care"
              ? "Find care"
              : nav.find((n) => n.id === view)?.label || "Review workspace"}
          </div>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {view === "shop"
                  ? "THE WELLNESS EDIT"
                  : view === "nutrition"
                    ? "NOURISH YOUR EVERYDAY"
                    : "CARE FOR EVERYDAY LIFE"}
              </span>
              <h1>{titles[view][0]}</h1>
              <p>{titles[view][1]}</p>
            </div>
            <div className="heading-mark">
              <Activity size={37} strokeWidth={1.4} />
            </div>
          </div>
          {notice && (
            <div className="notice" role="status">
              <Check size={18} />
              {notice}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {["care", "nutrition", "shop"].includes(view) && (
            <>
              <div className="searchbar">
                <Search size={20} />
                <input
                  aria-label={
                    view === "shop" ? "Search products" : "Search professionals"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    view === "shop"
                      ? "Search products and everyday essentials…"
                      : "Search by professional, specialty, or concern…"
                  }
                />
                <span>
                  <SlidersHorizontal size={17} /> Find your fit
                </span>
              </div>
              <div className="filter-row">
                <div className="chips">
                  {(view === "shop"
                    ? [
                        ["all", "All products"],
                        ["WELLNESS", "Wellness"],
                        ["SUPPLEMENT", "Supplements"],
                      ]
                    : view === "nutrition"
                      ? [
                          ["all", "All nutrition care"],
                          ["dietitian", "Dietitians"],
                          ["nutritionist", "Nutritionists"],
                        ]
                      : [
                          ["all", "All professionals"],
                          ["clinical_psychologist", "Psychologists"],
                          ["counselor", "Counselors"],
                          ["dietitian", "Dietitians"],
                          ["nutritionist", "Nutritionists"],
                        ]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={category === id}
                      onClick={() => setCategory(id)}
                      className={category === id ? "chip chosen" : "chip"}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {view !== "shop" && (
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
                )}
              </div>
            </>
          )}
          {loading && ["care", "nutrition", "shop"].includes(view) ? (
            <div className="loading" role="status">
              Loading your options…
            </div>
          ) : null}
          {!loading &&
            !catalogFailed &&
            ["care", "nutrition"].includes(view) && (
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
                      {catalog.providers.length
                        ? "No matching professionals"
                        : "Professional onboarding is underway"}
                    </h2>
                    <p>
                      {catalog.providers.length
                        ? "Try a different category or fee range."
                        : "Approved profiles will appear here as professionals join Chatbud."}
                    </p>
                    <button
                      className="button"
                      onClick={() =>
                        catalog.providers.length
                          ? (setCategory("all"), setBudget(3000), setQuery(""))
                          : changeView("provider")
                      }
                    >
                      {catalog.providers.length
                        ? "Clear filters"
                        : "Apply as a professional"}
                    </button>
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
                            onClick={() => {
                              setChosen(p);
                              setModal("booking");
                              setError("");
                            }}
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
          {!loading && !catalogFailed && view === "shop" && (
            <>
              <div className="results-label">
                <span>
                  {products.length} products{" "}
                  {mode === "demo" ? "in this preview" : "available"}
                </span>
                <span>Sold and fulfilled by Chatbud</span>
              </div>
              {products.length === 0 ? (
                <div className="empty">
                  <Package size={36} />
                  <h2>
                    {catalog.products.length
                      ? "No matching products"
                      : "Our first collection is coming together"}
                  </h2>
                  <p>
                    {catalog.products.length
                      ? "Try another search or category."
                      : "Products will appear after supplier, label, and stock approval."}
                  </p>
                </div>
              ) : (
                <div className="product-grid">
                  {products.map((p: any, i: number) => {
                    const Icon = [BookOpen, Dumbbell, Leaf, Package][i % 4];
                    return (
                      <article className="product-card" key={p.id}>
                        <div
                          className={`product-icon tone-${["blue", "green", "orange", "purple"][i % 4]}`}
                        >
                          <Icon size={47} strokeWidth={1.3} />
                          <span>
                            {p.kind === "SUPPLEMENT"
                              ? "SUPPLEMENT"
                              : "WELLNESS"}
                          </span>
                        </div>
                        <div className="product-body">
                          <small>{p.category || p.kind.toLowerCase()}</small>
                          <h2>{p.name}</h2>
                          <p>{p.description}</p>
                          <footer>
                            <strong>{money(p.price)}</strong>
                            <button
                              className="add-button"
                              disabled={
                                p.stock <= 0 ||
                                (cart[p.id] || 0) >= Math.min(p.stock, 10)
                              }
                              onClick={() => {
                                setCart((c) => ({
                                  ...c,
                                  [p.id]: (c[p.id] || 0) + 1,
                                }));
                                setNotice("Added to your bag.");
                              }}
                            >
                              <Plus size={16} />{" "}
                              {p.stock ? "Add to bag" : "Out of stock"}
                            </button>
                          </footer>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <div className="care-note">
                <Leaf size={22} />
                <div>
                  <strong>Your care comes first.</strong>
                  <p>
                    Product purchases are optional. Supplements require approved
                    labels, supplier evidence, and batch/expiry tracking before
                    sale.
                  </p>
                </div>
              </div>
            </>
          )}
          {view === "journey" && (
            <>
              {mode === "live" && !token ? (
                <SignInPrompt open={() => setModal("auth")} />
              ) : (
                <>
                  <div className="summary-grid">
                    <Summary
                      icon={CalendarDays}
                      label="Appointments"
                      value={
                        dashboard.appointments.filter(
                          (a: any) => a.status !== "EXPIRED",
                        ).length
                      }
                    />
                    <Summary
                      icon={ShoppingBag}
                      label="Orders"
                      value={dashboard.orders.length}
                    />
                    <Summary
                      icon={Heart}
                      label="Your next step"
                      value="At your pace"
                    />
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Appointments</h2>
                      <button onClick={() => changeView("care")}>
                        Find a professional
                      </button>
                    </div>
                    {dashboard.appointments.length === 0 ? (
                      <p className="empty-inline">
                        Your appointments will appear here when you book.
                      </p>
                    ) : (
                      dashboard.appointments.map((a: any) => (
                        <div className="record" key={a.id}>
                          <span className="record-icon">
                            <CalendarDays size={22} />
                          </span>
                          <div>
                            <strong>{a.provider}</strong>
                            <p>
                              {a.service} ·{" "}
                              {new Date(a.startsAt).toLocaleString("en-NP", {
                                timeZone: "Asia/Kathmandu",
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}{" "}
                              NPT
                            </p>
                          </div>
                          <span className="status">
                            {a.status.replaceAll("_", " ")}
                          </span>
                          <strong>{money(a.price)}</strong>
                        </div>
                      ))
                    )}
                  </section>
                  <section className="panel">
                    <h2>Shop orders</h2>
                    {dashboard.orders.length === 0 ? (
                      <p className="empty-inline">
                        Your product orders will appear here.
                      </p>
                    ) : (
                      dashboard.orders.map((o: any) => (
                        <div className="record" key={o.id}>
                          <span className="record-icon">
                            <Package size={22} />
                          </span>
                          <div>
                            <strong>Order #{o.id.slice(0, 8)}</strong>
                            <p>{new Date(o.createdAt).toLocaleDateString()}</p>
                          </div>
                          <span className="status">
                            {o.status.replaceAll("_", " ")}
                          </span>
                          <strong>{money(o.total)}</strong>
                        </div>
                      ))
                    )}
                  </section>
                  {mode === "demo" && (
                    <section className="nutrition-panel">
                      <span className="eyebrow">EXAMPLE CARE RESOURCE</span>
                      <h2>A practical approach to everyday meals</h2>
                      <p>
                        This sample resource shows where a provider-authored
                        nutrition plan will appear. Personalized plans require a
                        consultation and explicit consent.
                      </p>
                      <div className="nutrition-steps">
                        <span>
                          <b>01</b>Build regular meal routines
                        </span>
                        <span>
                          <b>02</b>Make room for varied foods
                        </span>
                        <span>
                          <b>03</b>Review your goals with a professional
                        </span>
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {view === "provider" && (
            <>
              {mode === "live" && !token ? (
                <SignInPrompt open={() => setModal("auth")} />
              ) : (
                <div className="application-layout">
                  <section className="panel">
                    <h2>Join the professional network</h2>
                    <p className="section-copy">
                      Tell us about your practice. This is the first step;
                      identity, qualifications, and relevant registration must
                      be reviewed before your profile can be published.
                    </p>
                    {dashboard.providerApplication && (
                      <div className="application-status">
                        <Clock size={19} />
                        <div>
                          <strong>
                            Application{" "}
                            {dashboard.providerApplication.status
                              .toLowerCase()
                              .replaceAll("_", " ")}
                          </strong>
                          <p>Your profile is not yet published.</p>
                        </div>
                      </div>
                    )}
                    {mode === "demo" && (
                      <p className="form-note">
                        Use fictional information in this preview. Submit your
                        real application in Live database mode.
                      </p>
                    )}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        run(async () => {
                          await api("providers/applications", "POST", {
                            profession: f.get("profession"),
                            bio: f.get("bio"),
                            experience: f.get("experience"),
                          });
                          setNotice(
                            mode === "demo"
                              ? "Preview application submitted."
                              : "Application submitted for review.",
                          );
                          setDashboard(await api("me"));
                        });
                      }}
                    >
                      <label>
                        Professional category
                        <select name="profession" required>
                          {Object.entries(professions).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        About your practice
                        <textarea
                          name="bio"
                          required
                          minLength={30}
                          maxLength={1500}
                          placeholder="Your approach, services, languages, and who you work with…"
                          rows={4}
                        />
                      </label>
                      <label>
                        Qualifications and experience
                        <textarea
                          name="experience"
                          required
                          minLength={10}
                          maxLength={1000}
                          placeholder="Relevant degrees, training, registration, and practice experience…"
                          rows={3}
                        />
                      </label>
                      <button className="button" disabled={busy}>
                        {busy ? "Submitting…" : "Submit application"}
                      </button>
                    </form>
                  </section>
                  <aside className="onboarding-note">
                    <ShieldCheck size={27} />
                    <h2>Built around trust.</h2>
                    <ol>
                      <li>
                        <b>Apply</b>
                        <span>Share your professional background.</span>
                      </li>
                      <li>
                        <b>Verify</b>
                        <span>
                          Identity, qualifications, and registration review.
                        </span>
                      </li>
                      <li>
                        <b>Set up</b>
                        <span>
                          Define services and availability after approval.
                        </span>
                      </li>
                      <li>
                        <b>Practice</b>
                        <span>
                          Connect with clients within your approved scope.
                        </span>
                      </li>
                    </ol>
                  </aside>
                </div>
              )}
            </>
          )}
          {view === "admin" && (
            <>
              {mode === "live" && !token ? (
                <SignInPrompt open={() => setModal("auth")} />
              ) : (
                <>
                  <div className="summary-grid">
                    <Summary
                      icon={Stethoscope}
                      label="Applications"
                      value={admin.applications.length}
                    />
                    <Summary
                      icon={ShieldCheck}
                      label="Approval policy"
                      value="Human review"
                    />
                    <Summary
                      icon={Activity}
                      label="Environment"
                      value={mode === "demo" ? "Preview" : "Live"}
                    />
                  </div>
                  <section className="panel">
                    <h2>Provider review queue</h2>
                    <p className="section-copy">
                      Credential approval is a separate clinical workflow.
                      Request more information or reject incomplete preview
                      applications.
                    </p>
                    {admin.applications.length === 0 ? (
                      <p className="empty-inline">
                        No applications awaiting review.
                      </p>
                    ) : (
                      admin.applications.map((a: any) => (
                        <div className="review-card" key={a.id}>
                          <div>
                            <h3>{a.name}</h3>
                            <span className="status">
                              {a.status.replaceAll("_", " ")}
                            </span>
                            <p>{a.bio}</p>
                          </div>
                          {mode === "demo" && (
                            <div className="review-actions">
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    await api("admin/review", "POST", {
                                      id: a.id,
                                      decision: "NEEDS_INFORMATION",
                                    });
                                    setAdmin(await api("admin/overview"));
                                    setNotice(
                                      "Requested additional information.",
                                    );
                                  })
                                }
                              >
                                Request information
                              </button>
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    await api("admin/review", "POST", {
                                      id: a.id,
                                      decision: "REJECTED",
                                    });
                                    setAdmin(await api("admin/overview"));
                                    setNotice("Preview application rejected.");
                                  })
                                }
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </section>
                  <section className="panel">
                    <h2>Recent activity</h2>
                    {admin.audit?.length ? (
                      admin.audit.slice(0, 8).map((a: any, i: number) => (
                        <div className="record" key={i}>
                          <Activity size={17} />
                          <strong>{a.action}</strong>
                          <span>{new Date(a.at).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <p className="empty-inline">
                        Review activity will appear here.
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>© {new Date().getFullYear()} Chatbud · Nepal</span>
            <span>Care · Nutrition · Everyday wellbeing</span>
          </footer>
        </main>
      </div>
      {modal === "auth" && (
        <Dialog
          title={
            authMode === "signup"
              ? "Create your Chatbud account"
              : "Welcome back"
          }
          close={() => setModal("")}
        >
          <p className="section-copy">
            Sign in to manage your care and practitioner application.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                if (!supabase)
                  throw new Error("Account service is not configured.");
                const email = String(f.get("email")),
                  password = String(f.get("password"));
                if (authMode === "signup") {
                  const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { display_name: String(f.get("name")) } },
                  });
                  if (error) throw error;
                  setNotice(
                    "Check your email to verify your account before signing in.",
                  );
                } else {
                  const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                  });
                  if (error) throw error;
                  setNotice("Welcome back.");
                }
                setModal("");
              });
            }}
          >
            {authMode === "signup" && (
              <label>
                Your name
                <input
                  name="name"
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={10}
                required
                autoComplete={
                  authMode === "signup" ? "new-password" : "current-password"
                }
              />
            </label>
            <button className="button full" disabled={busy}>
              {busy
                ? "Please wait…"
                : authMode === "signup"
                  ? "Create account"
                  : "Sign in"}
            </button>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </form>
          <button
            className="text-button auth-switch"
            onClick={() => {
              setAuthMode(authMode === "signup" ? "signin" : "signup");
              setError("");
            }}
          >
            {authMode === "signup"
              ? "Already have an account? Sign in"
              : "New to Chatbud? Create an account"}
          </button>
        </Dialog>
      )}
      {modal === "booking" && chosen && (
        <Dialog title={`Book with ${chosen.name}`} close={() => setModal("")}>
          <div className="booking-summary">
            <CalendarDays size={24} />
            <div>
              <strong>{chosen.service}</strong>
              <p>
                {chosen.duration} minutes · {money(chosen.price)} · Online
              </p>
            </div>
          </div>
          {mode === "demo" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const startsAt = new Date(
                  `${f.get("date")}T${f.get("time")}:00+05:45`,
                ).toISOString();
                run(async () => {
                  const held = await api("appointments/holds", "POST", {
                    serviceId: chosen.serviceId,
                    startsAt,
                    idempotencyKey: crypto.randomUUID(),
                  });
                  setNotice(
                    `Preview appointment held for 10 minutes. No payment taken. Reference ${held.id.slice(0, 8)}.`,
                  );
                  setModal("");
                  setView("journey");
                  setDashboard(await api("me"));
                });
              }}
            >
              <label>
                Date
                <input
                  name="date"
                  type="date"
                  min={new Date(Date.now() + 86400000)
                    .toISOString()
                    .slice(0, 10)}
                  defaultValue={new Date(Date.now() + 86400000)
                    .toISOString()
                    .slice(0, 10)}
                  required
                />
              </label>
              <label>
                Time · Nepal time
                <select name="time">
                  {[
                    "09:00",
                    "10:00",
                    "11:00",
                    "13:00",
                    "14:00",
                    "15:00",
                    "16:00",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <p className="form-note">
                This creates a preview hold. Payment and video consultations are
                not active.
              </p>
              <button className="button full" disabled={busy}>
                {busy ? "Checking time…" : "Reserve preview appointment"}
              </button>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <div className="empty-inline">
              Live appointment booking will open after provider scheduling and
              payment onboarding.
            </div>
          )}
        </Dialog>
      )}
      {cartOpen && (
        <Dialog
          title={`Your bag · ${cartCount} items`}
          close={() => setCartOpen(false)}
        >
          {cartItems.length === 0 ? (
            <div className="empty-inline">
              Your bag is empty. Explore the wellness shop to add items.
            </div>
          ) : (
            <>
              <div className="cart-items">
                {cartItems.map((p: any) => (
                  <div className="cart-row" key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <p>{money(p.price)}</p>
                    </div>
                    <div className="quantity">
                      <button
                        aria-label={`Remove one ${p.name}`}
                        onClick={() =>
                          setCart((c) => ({
                            ...c,
                            [p.id]: Math.max(0, c[p.id] - 1),
                          }))
                        }
                      >
                        <Minus size={15} />
                      </button>
                      <span>{cart[p.id]}</span>
                      <button
                        aria-label={`Add one ${p.name}`}
                        disabled={cart[p.id] >= Math.min(p.stock, 10)}
                        onClick={() =>
                          setCart((c) => ({ ...c, [p.id]: c[p.id] + 1 }))
                        }
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cart-total">
                <span>Subtotal</span>
                <strong>{money(total)}</strong>
              </div>
              <p className="form-note">
                {mode === "demo"
                  ? "Preview stock is reserved for 10 minutes. No payment is collected and no goods are dispatched."
                  : "Live checkout opens after product and payment onboarding."}
              </p>
              {mode === "demo" && (
                <button
                  className="button full"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("orders", "POST", {
                        items: cartItems.map((p: any) => ({
                          skuId: p.id,
                          quantity: cart[p.id],
                        })),
                        idempotencyKey: crypto.randomUUID(),
                      });
                      setCart({});
                      setCartOpen(false);
                      setView("journey");
                      setDashboard(await api("me"));
                      setCatalog(await api("catalog"));
                      setNotice(
                        "Preview order created. Awaiting payment; no charge made.",
                      );
                    })
                  }
                >
                  {busy ? "Reserving stock…" : "Create preview order"}
                </button>
              )}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | number;
}) {
  return (
    <div className="summary">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function SignInPrompt({ open }: { open: () => void }) {
  return (
    <section className="empty">
      <UserRound size={36} />
      <h2>Your own space for care</h2>
      <p>
        Sign in to see your appointments, orders, and professional application.
      </p>
      <button className="button" onClick={open}>
        Sign in
      </button>
    </section>
  );
}
