"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Check,
  Globe,
  Heart,
  HeartPulse,
  House,
  LayoutDashboard,
  LogOut,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Stethoscope,
  Umbrella,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { features } from "../_lib/features";
import { Dialog, money } from "./ui";
const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      )
    : null;
const tabs = [
  { href: "/", label: "Home", icon: House },
  { href: "/professionals", label: "Professionals", icon: Users },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/store", label: "Store", icon: ShoppingBag },
  { href: "/my-health", label: "My Health", icon: HeartPulse },
];
const headings: Record<string, [string, string, string]> = {
  "/": [
    "YOUR DIGITAL HEALTH & WELLBEING COMPANION",
    "Everything you need to live healthier.",
    "Discover. Consult. Improve. Shop. Protect.",
  ],
  "/professionals": [
    "CHATBUD CARE",
    "The right support, at your pace.",
    "Explore mental-health, nutrition and fitness professionals.",
  ],
  "/appointments": [
    "CHATBUD CARE",
    "Your bookings, all in one place.",
    "Keep track of upcoming and past appointments.",
  ],
  "/store": [
    "CHATBUD STORE",
    "Small steps. Everyday wellbeing.",
    "Explore wellness products and nutrition essentials.",
  ],
  "/my-health": [
    "MY HEALTH",
    "Your health, in your hands.",
    "Plans, goals, purchases and protection, kept private to you.",
  ],
  "/practitioner": [
    "FOR PROFESSIONALS",
    "Make room for better care.",
    "Apply to join Chatbud and manage your professional profile.",
  ],
  "/review": [
    "REVIEW WORKSPACE",
    "Care starts with trust.",
    "Review provider applications and keep operations moving.",
  ],
  "/protect": [
    "CHATBUD PROTECT",
    "Protect what matters most.",
    "Health insurance from licensed partners.",
  ],
};
type App = {
  mode: string;
  token: string;
  userName: string;
  catalog: any;
  setCatalog: (catalog: any) => void;
  loading: boolean;
  catalogFailed: boolean;
  dashboard: any;
  setDashboard: (dashboard: any) => void;
  allowAdmin: boolean;
  cart: Record<string, number>;
  setCart: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  busy: boolean;
  api: (path: string, method?: string, body?: unknown) => Promise<any>;
  run: (action: () => Promise<void>) => Promise<void>;
  setNotice: (notice: string) => void;
  setError: (error: string) => void;
  openAuth: () => void;
  openBooking: (provider: any) => void;
};
const AppContext = createContext<App | null>(null);
export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error("useApp must be used inside AppShell");
  return app;
}
export function AppShell({ children }: { children: React.ReactNode }) {
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
    <Workspace
      key={`${mode}:${token}`}
      mode={mode}
      setMode={setMode}
      demoAvailable={demoAvailable}
      token={token}
      userName={userName}
    >
      {children}
    </Workspace>
  );
}
function Workspace({
  mode,
  setMode,
  demoAvailable,
  token,
  userName,
  children,
}: {
  mode: string;
  setMode: (mode: string) => void;
  demoAvailable: boolean;
  token: string;
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    router = useRouter();
  const [catalog, setCatalog] = useState<any>({ providers: [], products: [] }),
    [loading, setLoading] = useState(true),
    [catalogFailed, setCatalogFailed] = useState(false),
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
    });
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
    // Load roles immediately after authentication, on whichever tab is open.
    api("me")
      .then((data) => {
        if (active) setDashboard(data);
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [mode, token]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    setError("");
  }, [pathname]);
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
  const openAuth = () => {
    setModal("auth");
    setError("");
  };
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
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const heading = headings[pathname] || headings["/"];
  const crumb =
    tabs.find((t) => t.href !== "/" && isCurrent(t.href))?.label ||
    (pathname === "/practitioner"
      ? "Practitioner workspace"
      : pathname === "/review"
        ? "Review workspace"
        : pathname === "/protect"
          ? "Protect"
          : "Home");
  const app: App = {
    mode,
    token,
    userName,
    catalog,
    setCatalog,
    loading,
    catalogFailed,
    dashboard,
    setDashboard,
    allowAdmin,
    cart,
    setCart,
    busy,
    api,
    run,
    setNotice,
    setError,
    openAuth,
    openBooking: (provider) => {
      setChosen(provider);
      setModal("booking");
      setError("");
    },
  };
  return (
    <AppContext.Provider value={app}>
      <div className="app">
        <header className="topbar">
          <Link className="brand" href="/">
            <span className="brand-icon">
              <Heart size={22} />
            </span>
            chatbud<span className="brand-dot">.</span>
          </Link>
          <nav aria-label="Main navigation">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={isCurrent(t.href) ? "page" : undefined}
                className={isCurrent(t.href) ? "active" : ""}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="top-actions">
            <span className="location">
              <Globe size={15} /> Nepal · NPR
            </span>
            {features.store === "live" && (
              <button
                className="icon-button cart-button"
                aria-label={`Shopping bag, ${cartCount} items`}
                onClick={() => setCartOpen(true)}
              >
                <ShoppingBag size={20} />
                {cartCount > 0 && <b>{cartCount}</b>}
              </button>
            )}
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
              <button className="button small" onClick={openAuth}>
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
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={isCurrent(t.href) ? "page" : undefined}
                className={isCurrent(t.href) ? "selected" : ""}
              >
                <t.icon size={19} />
                {t.label}
              </Link>
            ))}
            {features.protect !== "off" && (
              <Link
                href="/protect"
                aria-current={isCurrent("/protect") ? "page" : undefined}
                className={isCurrent("/protect") ? "selected" : ""}
              >
                <Umbrella size={19} />
                Protect
                {features.protect === "soon" && (
                  <span className="soon-badge">Soon</span>
                )}
              </Link>
            )}
            <div className="sidebar-label sidebar-section">
              FOR PROFESSIONALS
            </div>
            <Link
              href="/practitioner"
              aria-current={isCurrent("/practitioner") ? "page" : undefined}
              className={isCurrent("/practitioner") ? "selected" : ""}
            >
              <Stethoscope size={19} />
              Practitioner workspace
            </Link>
            {allowAdmin && (
              <Link
                href="/review"
                aria-current={isCurrent("/review") ? "page" : undefined}
                className={isCurrent("/review") ? "selected" : ""}
              >
                <LayoutDashboard size={19} />
                Review workspace
              </Link>
            )}
            <div className="sidebar-support">
              <span className="support-icon">
                <Heart size={22} />
              </span>
              <h3>You don’t need to have it all figured out.</h3>
              <p>
                Start with a professional who can help you find your next step.
              </p>
              <Link href="/professionals">
                Explore professionals <ArrowUpRight size={16} />
              </Link>
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
              Chatbud <span>/</span> {crumb}
            </div>
            <div className="page-heading">
              <div>
                <span className="eyebrow">{heading[0]}</span>
                <h1>{heading[1]}</h1>
                <p>{heading[2]}</p>
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
            {children}
            <footer className="page-footer">
              <span>© {new Date().getFullYear()} Chatbud · Nepal</span>
              <span>Care · Store · Protect</span>
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
                      options: {
                        data: { display_name: String(f.get("name")) },
                      },
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
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
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
                    setDashboard(await api("me"));
                    router.push("/appointments");
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
                  This creates a preview hold. Payment and video consultations
                  are not active.
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
                Your bag is empty. Explore the store to add items.
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
                        setDashboard(await api("me"));
                        setCatalog(await api("catalog"));
                        setNotice(
                          "Preview order created. Awaiting payment; no charge made.",
                        );
                        router.push("/my-health");
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
    </AppContext.Provider>
  );
}
