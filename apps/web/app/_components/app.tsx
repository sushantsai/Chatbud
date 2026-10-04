"use client";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  LifeBuoy,
  Package,
} from "lucide-react";
import { features } from "../_lib/features";
import { canOpen, type TeamArea } from "../_lib/roles";
import { unitPrice } from "../_lib/store";
import { supabase } from "../_lib/supabase";
import { AuthForm } from "./auth-form";
import { BookingForm } from "./booking";
import { Dialog, money } from "./ui";
type Tab = { href: string; label: string; icon: any; area?: TeamArea };
const tabs: Tab[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/professionals", label: "Professionals", icon: Users },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/store", label: "Store", icon: ShoppingBag },
  { href: "/my-health", label: "My Health", icon: HeartPulse },
  { href: "/help", label: "Help", icon: LifeBuoy },
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
  "/pro": [
    "FOR PROFESSIONALS",
    "Your practice at a glance.",
    "Requests, upcoming appointments and what to do next.",
  ],
  "/pro/appointments": [
    "FOR PROFESSIONALS",
    "Appointments",
    "Confirm requests and join your upcoming sessions.",
  ],
  "/pro/clients": [
    "FOR PROFESSIONALS",
    "Clients",
    "Plans you have written and what each client shares with you.",
  ],
  "/pro/services": [
    "FOR PROFESSIONALS",
    "Services and hours",
    "What clients can book with you, and when.",
  ],
  "/pro/profile": [
    "FOR PROFESSIONALS",
    "Profile and verification",
    "How you appear to clients and where your verification stands.",
  ],
  "/admin": [
    "CHATBUD TEAM",
    "Operations at a glance.",
    "What needs attention across applications, support, bookings and the store.",
  ],
  "/admin/applications": [
    "CHATBUD TEAM",
    "Care starts with trust.",
    "Review professionals’ applications to be listed on Chatbud.",
  ],
  "/admin/support": [
    "CHATBUD TEAM",
    "Customer support",
    "Handle, escalate and resolve concerns from clients and professionals.",
  ],
  "/admin/bookings": [
    "CHATBUD TEAM",
    "Booking oversight",
    "Follow requests through to confirmation, and step in when needed.",
  ],
  "/admin/catalogue": [
    "CHATBUD TEAM",
    "Catalogue",
    "Products, stock, offers and promo codes for the Chatbud Store.",
  ],
  "/admin/team": [
    "CHATBUD TEAM",
    "Team and roles",
    "Decide who on the team can do what.",
  ],
  "/help": [
    "HELP",
    "We are here to put things right.",
    "Raise a concern and follow it until it is resolved.",
  ],
  "/pro/help": [
    "FOR PROFESSIONALS",
    "Help",
    "Raise a concern with the Chatbud team and follow its progress.",
  ],
  "/protect": [
    "CHATBUD PROTECT",
    "Protect what matters most.",
    "Health insurance from licensed partners.",
  ],
};
const portals: Record<"pro" | "admin", { label: string; tabs: Tab[] }> = {
  pro: {
    label: "For professionals",
    tabs: [
      { href: "/pro", label: "Dashboard", icon: LayoutDashboard },
      { href: "/pro/appointments", label: "Appointments", icon: CalendarDays },
      { href: "/pro/clients", label: "Clients", icon: Users },
      { href: "/pro/services", label: "Services & hours", icon: Stethoscope },
      { href: "/pro/profile", label: "Profile", icon: UserRound },
      { href: "/pro/help", label: "Help", icon: LifeBuoy },
    ],
  },
  admin: {
    label: "Chatbud team",
    tabs: [
      {
        href: "/admin",
        label: "Dashboard",
        icon: LayoutDashboard,
        area: "dashboard",
      },
      {
        href: "/admin/applications",
        label: "Applications",
        icon: ShieldCheck,
        area: "applications",
      },
      {
        href: "/admin/support",
        label: "Grievances",
        icon: LifeBuoy,
        area: "support",
      },
      {
        href: "/admin/bookings",
        label: "Bookings",
        icon: CalendarDays,
        area: "support",
      },
      {
        href: "/admin/catalogue",
        label: "Catalogue",
        icon: Package,
        area: "catalogue",
      },
      { href: "/admin/team", label: "Team", icon: Users, area: "team" },
    ],
  },
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
  // False until the signed-in person's roles and records have loaded.
  dashboardLoaded: boolean;
  signOut: () => Promise<void>;
  cart: Record<string, number>;
  setCart: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  busy: boolean;
  api: (path: string, method?: string, body?: unknown) => Promise<any>;
  run: (action: () => Promise<void>) => Promise<void>;
  error: string;
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
    [dashboardLoaded, setDashboardLoaded] = useState(false),
    [dashboard, setDashboard] = useState<any>({
      appointments: [],
      orders: [],
      roles: [],
    });
  const mounted = useRef(false),
    requests = useRef(new Set<AbortController>());
  // A layout effect, so the flag is set before any page's own effect calls api().
  useLayoutEffect(() => {
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
    Promise.all([
      api("catalog"),
      // Offers and categories are decoration: the store still works without them.
      mode === "live"
        ? api("store/offers").catch(() => ({ products: [] }))
        : { products: [] },
    ])
      .then(([data, store]) => {
        if (!active) return;
        const extra = new Map<string, any>(
          store.products.map((p: any) => [p.id, p]),
        );
        setCatalog({
          ...data,
          products: data.products.map((p: any) => ({
            ...p,
            ...extra.get(p.id),
          })),
        });
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
        if (active) {
          setDashboard(data);
          setDashboardLoaded(true);
        }
      })
      .catch((e) => {
        if (active && e.name !== "AbortError") {
          setError(e.message);
          setDashboardLoaded(true);
        }
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
    (s: number, p: any) => s + unitPrice(p) * cart[p.id],
    0,
  );
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const allowAdmin = mode === "demo" || canOpen(dashboard.roles, "dashboard");
  // The professional and team portals have their own navigation and sign-in.
  // "/pro" must not match "/professionals" or "/protect".
  const under = (base: string) =>
    pathname === base || pathname.startsWith(`${base}/`);
  const portal = under("/pro")
    ? portals.pro
    : under("/admin")
      ? portals.admin
      : null;
  // Team members see only the areas their roles open.
  const nav = (portal ? portal.tabs : tabs).filter(
    (t) => !t.area || mode === "demo" || canOpen(dashboard.roles, t.area),
  );
  const home = portal ? portal.tabs[0].href : "/";
  const first = nav[0] || portal?.tabs[0] || tabs[0];
  const isCurrent = (href: string) =>
    href === home ? pathname === home : under(href);
  const heading = headings[pathname] || headings[home];
  const crumb =
    nav.find((t) => t.href !== home && isCurrent(t.href))?.label ||
    (pathname === "/protect" ? "Protect" : first.label);
  const signOut = () =>
    run(async () => {
      await supabase?.auth.signOut();
      setNotice("Signed out.");
    });
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
    dashboardLoaded,
    signOut,
    cart,
    setCart,
    busy,
    api,
    run,
    error,
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
          <Link className="brand" href={home}>
            <span className="brand-icon">
              <Heart size={22} />
            </span>
            chatbud<span className="brand-dot">.</span>
          </Link>
          {portal && <span className="portal-label">{portal.label}</span>}
          <nav aria-label="Main navigation">
            {nav.map((t) => (
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
            {portal ? (
              <Link className="location" href="/">
                <ArrowUpRight size={15} /> Chatbud for clients
              </Link>
            ) : (
              <span className="location">
                <Globe size={15} /> Nepal · NPR
              </span>
            )}
            {!portal && features.store === "live" && (
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
                onClick={signOut}
              >
                <UserRound size={16} />
                <span>{userName}</span>
                <LogOut size={14} />
              </button>
            ) : (
              !portal && (
                <button className="button small" onClick={openAuth}>
                  Sign in
                </button>
              )
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
            <div className="sidebar-label">
              {portal ? portal.label.toUpperCase() : "YOUR WELLBEING"}
            </div>
            {nav.map((t) => (
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
            {!portal && features.protect !== "off" && (
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
            {!portal && (
              <div className="sidebar-support">
                <span className="support-icon">
                  <Heart size={22} />
                </span>
                <h3>You don’t need to have it all figured out.</h3>
                <p>
                  Start with a professional who can help you find your next
                  step.
                </p>
                <Link href="/professionals">
                  Explore professionals <ArrowUpRight size={16} />
                </Link>
              </div>
            )}
            <div className="privacy">
              <ShieldCheck size={17} />
              <span>
                {portal === portals.admin
                  ? "Every review decision and document view is recorded."
                  : portal
                    ? "Client records are visible only as each client allows."
                    : "Your privacy matters. Your care information stays private."}
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
              <span className="footer-links">
                {portal ? (
                  <Link href="/">Chatbud for clients</Link>
                ) : (
                  <>
                    <Link href="/pro">For professionals</Link>
                    <Link href="/admin">Team sign in</Link>
                  </>
                )}
              </span>
            </footer>
          </main>
        </div>
        {modal === "auth" && (
          <Dialog title="Your Chatbud account" close={() => setModal("")}>
            <p className="section-copy">
              Sign in or create an account to book appointments and manage your
              care.
            </p>
            <AuthForm done={() => setModal("")} />
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
              <BookingForm provider={chosen} close={() => setModal("")} />
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
                        <p>{money(unitPrice(p))}</p>
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
                {mode === "live" && <PromoCode total={total} key={total} />}
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

// Checks a promo code against the current bag total. Remounted whenever the total changes.
function PromoCode({ total }: { total: number }) {
  const { api } = useApp();
  const [code, setCode] = useState(""),
    [result, setResult] = useState<any>(null),
    [checking, setChecking] = useState(false);
  return (
    <div className="promo">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setChecking(true);
          api("store/promo", "POST", { code: code.trim(), subtotal: total })
            .then(setResult)
            .catch(() =>
              setResult({
                valid: false,
                message: "This code could not be checked.",
              }),
            )
            .finally(() => setChecking(false));
        }}
      >
        <div className="field">
          <label htmlFor="promo-entry">Promo code</label>
          <input
            id="promo-entry"
            value={code}
            maxLength={20}
            autoComplete="off"
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setResult(null);
            }}
          />
        </div>
        <button
          className="button secondary small"
          disabled={checking || code.trim().length < 4}
        >
          {checking ? "Checking…" : "Apply"}
        </button>
      </form>
      {result && !result.valid && (
        <p className="field-error" role="alert">
          {result.message}
        </p>
      )}
      {result?.valid && (
        <>
          <div className="cart-total discount">
            <span>{result.code}</span>
            <strong>− {money(result.discount)}</strong>
          </div>
          <div className="cart-total">
            <span>Total</span>
            <strong>{money(total - result.discount)}</strong>
          </div>
        </>
      )}
    </div>
  );
}
