import { AiWorkspace } from "./AiWorkspace";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  LayoutDashboard,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Wallet,
  CreditCard,
  Settings as SettingsIcon,
  ChevronRight,
  ChevronLeft,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Upload,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  Check,
  SlidersHorizontal,
  Download,
  RefreshCw,
  ShieldCheck,
  Link2,
  ArrowRight,
  Ellipsis,
  CheckCheck,
  Filter,
  CalendarDays,
  Tag,
  Sparkles,
  Leaf,
} from "lucide-react";

import { api, money, setCsrf, dollars } from "./api";
import { Button, Modal, Field, Empty, Loading, Alert } from "./ui";
import { cents, period, shiftMonth } from "../../../packages/domain/index";
import type {
  Account,
  Category,
  Transaction,
  Budget,
  Mapping,
} from "../../../packages/shared/schema";
import "./style.css";
const Charts = React.lazy(() => import("./charts"));
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="invite-wrap">
        <section className="panel invite-card">
          <h1>Let's take a fresh look.</h1>
          <p>
            The interface hit an unexpected error. Reload to reconnect to your
            saved data.
          </p>
          <Button onClick={() => location.reload()}>
            Reload Budget Gremlin
          </Button>
        </section>
      </div>
    ) : (
      this.props.children
    );
  }
}
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["transactions", "Transactions", ArrowLeftRight],
  ["budget", "Budget", Wallet],
  ["reports", "Reports", ChartNoAxesCombined],
  ["accounts", "Accounts", CreditCard],
  ["ai", "AI assistant", Sparkles],
  ["settings", "Settings", SettingsIcon],
] as const;
function useData<T = any>(path: string) {
  return useQuery<T>({ queryKey: [path], queryFn: () => api<T>(path) });
}
function App() {
  const session = useData("/auth/me");
  const [page, setPage] = useState(
    location.hash.replace("#", "") || "overview",
  );
  const [theme, setTheme] = useState(
    localStorage.getItem("gremlin-theme") || "light",
  );
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState("");
  const qc = useQueryClient();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("gremlin-theme", theme);
  }, [theme]);
  useEffect(() => {
    const f = () => setPage(location.hash.replace("#", "") || "overview");
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    if (session.data) setCsrf(session.data.csrf);
  }, [session.data]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const go = (p: string) => {
    location.hash = p;
    setPage(p);
    setMobile(false);
  };
  const refresh = () => qc.invalidateQueries();
  const notice = (s: string) => {
    setToast(s);
    void refresh();
  };
  if (location.pathname === "/invite") return <Invite />;
  if (session.isPending) return <Loading />;
  if (!session.data)
    return (
      <Login
        onLogin={async () => {
          await refresh();
        }}
      />
    );
  const user = session.data.user;
  const content = { user, notice, go };
  return (
    <div className="app">
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a className="brand" href="#overview">
          <img src="/gremlin.svg" alt="" />
          <span>
            budget<span className="brand-light">gremlin</span>
            <small>A LITTLE MORE IN CONTROL.</small>
          </span>
        </a>
        <button
          className="mobile-close icon-btn"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <div className="workspace">
          <span className="workspace-avatar">G</span>
          <div>
            My household<small>Personal workspace</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <div className="nav-label">YOUR FINANCES</div>
        <nav aria-label="Main navigation">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              {label}
              {page === id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Leaf size={19} />
          <strong>Small habits. Big difference.</strong>
          <p>A little attention today goes a long way.</p>
          <span>YOUR MONEY. YOUR SERVER.</span>
        </div>
        <div className="user">
          <span className="avatar">{user.name[0]}</span>
          <div>
            <strong>{user.name}</strong>
            <small>
              {user.role === "owner" ? "Household owner" : "Household member"}
            </small>
          </div>
          <button
            className="icon-btn"
            aria-label="Sign out"
            onClick={async () => {
              await api("/auth/logout", {});
              setCsrf("");
              qc.clear();
              location.reload();
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div>
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">
              My workspace <ChevronRight size={13} />{" "}
              <strong>
                {nav.find((n) => n[0] === page)?.[1] || "Overview"}
              </strong>
            </span>
          </div>
          <div className="top-actions">
            <span className="private-badge">
              <span />
              Private & self-hosted
            </span>
            <button
              className="icon-btn"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label="Toggle color theme"
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <span className="avatar small">{user.name[0]}</span>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {page === "overview" ? (
            <Overview {...content} />
          ) : page === "transactions" ? (
            <Transactions {...content} />
          ) : page === "budget" ? (
            <Budgets {...content} />
          ) : page === "reports" ? (
            <Reports {...content} />
          ) : page === "accounts" ? (
            <Accounts {...content} />
          ) : page === "ai" ? (
            <AiWorkspace user={user} />
          ) : (
            <SettingsPage {...content} />
          )}
        </main>
        <footer>
          Made for a little more peace of mind.
          <span>
            Budget Gremlin <Leaf size={13} />
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
type Props = {
  user: any;
  notice: (s: string) => void;
  go: (s: string) => void;
};
function Login({ onLogin }: { onLogin: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <div className="auth-illustration">
        <img src="/gremlin.svg" alt="Budget Gremlin" />
        <span>LESS GUESSWORK. MORE PEACE OF MIND.</span>
        <h1>
          Your money,
          <br />a little clearer.
        </h1>
        <p>
          A thoughtful home for your household finances.
          <br />
          Private, personal, and entirely yours.
        </p>
        <div className="auth-orbit" />
      </div>
      <form
        className="auth-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            const data = await api("/auth/login", {
              email: f.get("email"),
              password: f.get("password"),
            });
            setCsrf(data.csrf);
            onLogin();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="eyebrow">WELCOME HOME</div>
        <h2>Meet your money.</h2>
        <p>Sign in to your Budget Gremlin household.</p>
        {error && <Alert>{error}</Alert>}
        <Field label="Email address">
          <input
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field label="Password">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Button disabled={busy}>
          {busy ? "Signing in…" : "Sign in"} <ArrowRight size={17} />
        </Button>
        <small className="auth-help">
          First time here? Create the owner with <code>npm run setup</code>.
          Household members join by invitation.
        </small>
        <div className="auth-private">
          <ShieldCheck size={17} /> Your finances stay on your server.
        </div>
      </form>
    </div>
  );
}
function Invite() {
  const [done, setDone] = useState(false),
    [err, setErr] = useState("");
  return (
    <div className="invite-wrap">
      <form
        className="panel invite-card"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api("/auth/accept-invite", {
              token: location.hash.slice(1),
              name: f.get("name"),
              password: f.get("password"),
            });
            setDone(true);
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        <img width="52" src="/gremlin.svg" alt="" />
        <h1>Welcome to the household.</h1>
        {done ? (
          <a href="/">Your account is ready. Sign in →</a>
        ) : (
          <>
            {err && <Alert>{err}</Alert>}
            <Field label="Your name">
              <input name="name" required />
            </Field>
            <Field label="Choose a password (12+ characters)">
              <input type="password" name="password" minLength={12} required />
            </Field>
            <Button>Join household</Button>
          </>
        )}
      </form>
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}
function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="month-picker">
      <button
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(value + "-01", -1).slice(0, 7))}
      >
        <ChevronLeft size={16} />
      </button>
      <CalendarDays size={15} />
      <input
        aria-label="Budget month"
        type="month"
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
      />
      <button
        aria-label="Next month"
        onClick={() => onChange(shiftMonth(value + "-01", 1).slice(0, 7))}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  detail: React.ReactNode;
  icon: any;
  accent?: boolean;
}) {
  return (
    <div className={"stat " + (accent ? "accent" : "")}>
      <div className="stat-label">
        {label}
        <span>
          <Icon size={17} />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
function Overview({ user, notice, go }: Props) {
  const meta = useData("/meta");
  const today = meta.data?.today || new Date().toISOString().slice(0, 10),
    m = today.slice(0, 7);
  const rpt = useData(
    "/reports?" + new URLSearchParams({ ...periodQuery("mtd", today) }),
  );
  const budget = useData("/budgets/" + m);
  const tx = useData("/transactions?limit=5");
  const accounts = useData("/accounts");
  const [add, setAdd] = useState(false);
  if (!meta.data || !rpt.data || !budget.data) return <Loading />;
  const r = rpt.data,
    b = budget.data;
  const cat = (id: string) =>
    meta.data.categories.find((c: Category) => c.id === id);
  const monthly = useMonthlyChart(r.rows);
  return (
    <>
      <PageTitle
        eyebrow="YOUR FINANCIAL PICTURE"
        title={`A little clearer, ${user.name.split(" ")[0]}.`}
        subtitle="Here's where things stand. You've got this."
      >
        <Button variant="secondary" onClick={() => go("transactions")}>
          <Upload size={16} /> Import transactions
        </Button>
        <Button onClick={() => setAdd(true)}>
          <Plus size={17} /> Add transaction
        </Button>
      </PageTitle>
      {meta.data.settings.demo && (
        <div className="demo-banner">
          <Sparkles size={14} /> You're exploring a synthetic household. No bank
          accounts are connected.
        </div>
      )}
      <div className="overview-period">
        <h2>This month at a glance</h2>
        <span>
          <CalendarDays size={15} />
          {new Date(m + "-15").toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
      <div className="stats-grid">
        <Stat
          label="Left to spend"
          value={b.lines.length ? money(b.left) : "No plan yet"}
          detail={
            <>
              <span className="tiny-dot" />{" "}
              {b.lines.length
                ? "Within your monthly plan"
                : "Create your first budget"}
            </>
          }
          icon={Wallet}
          accent
        />
        <Stat
          label="Income"
          value={money(r.income)}
          detail="Posted income this month"
          icon={ArrowDownLeft}
        />
        <Stat
          label="Spent so far"
          value={money(r.spending)}
          detail={`${money(b.pending)} pending separately`}
          icon={ArrowUpRight}
        />
        <Stat
          label="Net cash flow"
          value={money(r.net)}
          detail="Income minus posted expenses"
          icon={ChartNoAxesCombined}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel cashflow">
          <div className="panel-heading">
            <div>
              <h2>The bigger picture</h2>
              <p>Income and spending, day by day</p>
            </div>
            <div className="chart-legend">
              <span>
                <i className="income-dot" />
                Income
              </span>
              <span>
                <i className="spending-dot" />
                Spending
              </span>
            </div>
          </div>
          <div className="chart">
            <React.Suspense fallback={<Loading />}>
              <Charts mode="overview" data={monthly} />
            </React.Suspense>
          </div>
          <div className="chart-caption">
            <span>Posted activity · transfers excluded</span>
            <button className="text-button" onClick={() => go("reports")}>
              Explore reports <ArrowRight size={14} />
            </button>
          </div>
          <details className="chart-data">
            <summary>View daily chart data</summary>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Cumulative income</th>
                  <th>Cumulative spending</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{money(d.Income)}</td>
                    <td>{money(d.Spending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
        <section className="panel budget-snapshot">
          <div className="panel-heading">
            <div>
              <h2>A little room to breathe</h2>
              <p>Your monthly budget</p>
            </div>
            <Wallet size={20} />
          </div>
          <div
            className="budget-ring"
            style={
              {
                "--progress": `${Math.min(100, Math.max(0, (1 - b.left / (b.lines.reduce((n: number, l: any) => n + l.amount, 0) || 1)) * 100))}%`,
              } as React.CSSProperties
            }
          >
            <div>
              <small>LEFT TO SPEND</small>
              <strong>{b.lines.length ? money(b.left) : "—"}</strong>
              <span>
                of{" "}
                {money(
                  b.lines.reduce(
                    (n: number, l: any) => n + l.amount + l.opening,
                    0,
                  ),
                )}{" "}
                planned
              </span>
            </div>
          </div>
          <div className="snapshot-legend">
            <span>
              <i className="income-dot" />
              Spent & committed
            </span>
            <span>
              <i className="remaining-dot" />
              Remaining
            </span>
          </div>
          <button className="snapshot-action" onClick={() => go("budget")}>
            View your budget <ArrowRight size={16} />
          </button>
        </section>
        <section className="panel recent">
          <div className="panel-heading">
            <div>
              <h2>The latest little things</h2>
              <p>Recent transactions across your accounts</p>
            </div>
            <button className="text-button" onClick={() => go("transactions")}>
              View all <ArrowRight size={14} />
            </button>
          </div>
          {tx.data?.rows.length ? (
            <div className="recent-list">
              {tx.data.rows.map((t: Transaction) => (
                <button
                  key={t.id}
                  className="recent-row"
                  onClick={() => go("transactions")}
                >
                  <MerchantIcon name={t.merchant} />
                  <div>
                    <strong>{t.merchant}</strong>
                    <small>
                      {cat(t.allocations[0]?.category_id)?.name} <span>·</span>{" "}
                      {t.date.slice(5)}
                    </small>
                  </div>
                  <span className={t.amount > 0 ? "positive" : ""}>
                    {t.amount > 0 ? "+" : ""}
                    {money(t.amount)}
                    {t.status === "pending" && <small>Pending</small>}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty title="Your story starts here">
              Import a statement or add your first transaction.
            </Empty>
          )}
        </section>
        <section className="panel account-snapshot">
          <div className="panel-heading">
            <div>
              <h2>All in one place</h2>
              <p>Your accounts</p>
            </div>
            <CreditCard size={20} />
          </div>
          {accounts.data
            ?.filter((a: Account) => !a.archived)
            .slice(0, 4)
            .map((a: any) => (
              <div className="mini-account" key={a.id}>
                <span className="account-icon">
                  <CreditCard size={17} />
                </span>
                <div>
                  <strong>{a.name}</strong>
                  <small>{a.type.replace("_", " ")}</small>
                </div>
                <strong>{money(a.balance ?? a.ledger_balance)}</strong>
              </div>
            ))}
          <button className="snapshot-action" onClick={() => go("accounts")}>
            Manage accounts <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <div className="overview-footnote">
        <ShieldCheck size={15} /> Plan estimates aren't available bank balances.{" "}
        {r.warnings.length
          ? "Some account history is not confirmed complete."
          : "History coverage confirmed for this period."}
      </div>
      {add && (
        <TransactionModal
          meta={meta.data}
          onClose={() => setAdd(false)}
          onSaved={() => {
            setAdd(false);
            notice("Transaction added");
          }}
        />
      )}
    </>
  );
}
function useMonthlyChart(rows: any[]) {
  let income = 0,
    spend = 0;
  const map = new Map<
    string,
    { date: string; Income: number; Spending: number }
  >();
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (row.kind === "income") income += row.amount;
    else spend -= row.amount;
    map.set(row.date, { date: row.date, Income: income, Spending: spend });
  }
  return [...map.values()];
}
function MerchantIcon({ name }: { name: string }) {
  return (
    <span
      className="merchant-icon"
      style={{
        background: ["#edf0e8", "#f3ece4", "#e9edf1", "#f0eaf0"][
          name.length % 4
        ],
      }}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}
function periodQuery(
  p: string,
  today: string,
  custom?: { start: string; end: string },
) {
  const d = period(p, today, custom);
  return {
    start: d.start,
    end: d.end,
    priorStart: d.priorStart,
    priorEnd: d.priorEnd,
  };
}
function Transactions({ notice }: Props) {
  const meta = useData("/meta");
  const [search, setSearch] = useState(""),
    [account, setAccount] = useState(""),
    [category, setCategory] = useState(""),
    [review, setReview] = useState(""),
    [status, setStatus] = useState(""),
    [advanced, setAdvanced] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [tagFilter, setTagFilter] = useState(""),
    [minimum, setMinimum] = useState(""),
    [maximum, setMaximum] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string[]>([]),
    [edit, setEdit] = useState<Transaction | null | undefined>(),
    [importing, setImporting] = useState(false),
    [rules, setRules] = useState(false),
    [reconcile, setReconcile] = useState(false),
    [err, setErr] = useState("");
  const qs = new URLSearchParams({
    search,
    page: String(page),
    limit: "30",
    ...(account ? { account } : {}),
    ...(category ? { category } : {}),
    ...(review ? { reviewed: review } : {}),
    ...(status ? { status } : {}),
    ...(from ? { start: from } : {}),
    ...(to ? { end: to } : {}),
    ...(tagFilter ? { tag: tagFilter } : {}),
    ...(minimum !== ""
      ? { min: String(Math.round(Number(minimum) * 100)) }
      : {}),
    ...(maximum !== ""
      ? { max: String(Math.round(Number(maximum) * 100)) }
      : {}),
  });
  const query = useData("/transactions?" + qs);
  const bulk = async (body: any) => {
    try {
      await api("/transactions/bulk", { ids: selected, ...body });
      setSelected([]);
      notice("Selected transactions updated");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  if (!meta.data) return <Loading />;
  const cat = (id: string) =>
    meta.data.categories.find((c: Category) => c.id === id);
  return (
    <>
      <PageTitle
        eyebrow="THE EVERYDAY DETAILS"
        title="Transactions"
        subtitle="Every little thing, accounted for."
      >
        <Button variant="secondary" onClick={() => setImporting(true)}>
          <Upload size={16} /> Import CSV
        </Button>
        <Button onClick={() => setEdit(null)}>
          <Plus size={17} /> Add transaction
        </Button>
      </PageTitle>
      {err && <Alert>{err}</Alert>}
      <div className="transactions-toolbar">
        <div className="segmented">
          <button
            className={!review ? "selected" : ""}
            onClick={() => {
              setReview("");
              setPage(1);
            }}
          >
            All transactions
          </button>
          <button
            className={review === "false" ? "selected" : ""}
            onClick={() => {
              setReview("false");
              setPage(1);
            }}
          >
            Needs review <span className="pill">Review</span>
          </button>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={() => setReconcile(true)}>
            <Link2 size={16} /> Reconcile{" "}
            {meta.data.duplicateCount > 0 && (
              <span className="pill">{meta.data.duplicateCount}</span>
            )}
          </Button>
          <Button variant="ghost" onClick={() => setRules(true)}>
            <SlidersHorizontal size={16} /> Rules
          </Button>
        </div>
      </div>
      <section className="panel">
        <div className="filters">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search transactions"
              placeholder="Search merchants, notes…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Filter account"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All accounts</option>
            {meta.data.accounts.map((a: Account) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {meta.data.categories.map((c: Category) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter transaction status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            <option value="posted">Posted</option>
            <option value="pending">Pending</option>
          </select>
          <Button variant="ghost" onClick={() => setAdvanced(!advanced)}>
            <Filter size={15} />
            More filters
          </Button>
        </div>
        {advanced && (
          <div className="filters">
            <Field label="From date">
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field label="To date">
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field label="Tag">
              <input
                value={tagFilter}
                onChange={(e) => {
                  setTagFilter(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field label="Minimum signed amount ($)">
              <input
                type="number"
                step="0.01"
                value={minimum}
                onChange={(e) => {
                  setMinimum(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field label="Maximum signed amount ($)">
              <input
                type="number"
                step="0.01"
                value={maximum}
                onChange={(e) => {
                  setMaximum(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Button
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
                setTagFilter("");
                setMinimum("");
                setMaximum("");
                setPage(1);
              }}
            >
              Clear date/tag/amount filters
            </Button>
          </div>
        )}
        {selected.length > 0 && (
          <div className="selection-bar">
            <strong>{selected.length} selected</strong>
            <Button
              variant="secondary"
              onClick={() => bulk({ reviewed: true })}
            >
              <CheckCheck size={16} /> Mark reviewed
            </Button>
            <select
              aria-label="Bulk category"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) void bulk({ category_id: e.target.value });
                e.target.value = "";
              }}
            >
              <option value="">Categorize selected…</option>
              {meta.data.categories
                .filter((c: Category) => !c.archived)
                .map((c: Category) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <button className="text-button" onClick={() => setSelected([])}>
              Clear
            </button>
          </div>
        )}
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <Alert>{query.error.message}</Alert>
        ) : query.data?.rows.length ? (
          <>
            <div className="table-scroll">
              <table className="transaction-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        aria-label="Select visible transactions"
                        type="checkbox"
                        checked={
                          query.data.rows.length > 0 &&
                          query.data.rows.every((t: Transaction) =>
                            selected.includes(t.id),
                          )
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? query.data.rows.map((t: Transaction) => t.id)
                              : [],
                          )
                        }
                      />
                    </th>
                    <th>Date</th>
                    <th>Merchant</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th className="right">Amount</th>
                    <th>
                      <span className="sr-only">Review status</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.rows.map((t: Transaction) => (
                    <tr key={t.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${t.merchant} ${t.date}`}
                          checked={selected.includes(t.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, t.id]
                                : selected.filter((id) => id !== t.id),
                            )
                          }
                        />
                      </td>
                      <td className="muted nowrap">
                        {new Date(t.date + "T12:00:00").toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )}
                      </td>
                      <td>
                        <button
                          className="merchant-button"
                          onClick={() => setEdit(t)}
                        >
                          <MerchantIcon name={t.merchant} />
                          <span>
                            <strong>{t.merchant}</strong>
                            {!t.reviewed &&
                              t.review_reasons?.map((reason) => (
                                <small key={reason} className="review-reason">
                                  ⚑ {reason}
                                </small>
                              ))}
                            {t.status === "pending" ? (
                              <small>Pending</small>
                            ) : t.allocations[0]?.tags.length ? (
                              <small>{t.allocations[0].tags.join(" · ")}</small>
                            ) : null}
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="category-pill">
                          <i
                            style={{
                              background: cat(t.allocations[0]?.category_id)
                                ?.color,
                            }}
                          />
                          {t.allocations.length > 1
                            ? `${t.allocations.length} splits`
                            : cat(t.allocations[0]?.category_id)?.name}
                        </span>
                      </td>
                      <td className="muted">
                        {
                          meta.data.accounts.find(
                            (a: Account) => a.id === t.account_id,
                          )?.name
                        }
                      </td>
                      <td
                        className={
                          "right amount " + (t.amount > 0 ? "positive" : "")
                        }
                      >
                        {t.amount > 0 ? "+" : ""}
                        {money(t.amount)}
                      </td>
                      <td>
                        <button
                          className={
                            "review-btn " + (t.reviewed ? "reviewed" : "")
                          }
                          aria-label={t.reviewed ? "Reviewed" : "Mark reviewed"}
                          onClick={async () => {
                            try {
                              await api("/transactions/bulk", {
                                ids: [t.id],
                                reviewed: !t.reviewed,
                              });
                              notice(
                                t.reviewed
                                  ? "Marked for review"
                                  : "Transaction reviewed",
                              );
                            } catch (e) {
                              setErr((e as Error).message);
                            }
                          }}
                        >
                          {t.reviewed ? <Check size={15} /> : <span />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {query.data.total} transactions · {selected.length} selected
              </span>
              <div className="row">
                <button
                  className="icon-btn"
                  disabled={page === 1}
                  aria-label="Previous page"
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  Page {page} of {query.data.pages || 1}
                </span>
                <button
                  className="icon-btn"
                  disabled={page >= query.data.pages}
                  aria-label="Next page"
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty title="Nothing here just yet">
            Try another filter, import a CSV, or add a transaction.
          </Empty>
        )}
      </section>
      <p className="fine-print">
        Your edits stay yours. Imported data never overwrites locked
        classifications.
      </p>
      {edit !== undefined && (
        <TransactionModal
          meta={meta.data}
          tx={edit}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            notice("Transaction saved");
          }}
        />
      )}
      {importing && (
        <ImportModal
          meta={meta.data}
          onClose={() => setImporting(false)}
          notice={notice}
        />
      )}{" "}
      {rules && (
        <RulesModal
          meta={meta.data}
          onClose={() => setRules(false)}
          notice={notice}
        />
      )}{" "}
      {reconcile && (
        <ReconcileModal onClose={() => setReconcile(false)} notice={notice} />
      )}
    </>
  );
}
function TransactionModal({
  meta,
  tx,
  onClose,
  onSaved,
}: {
  meta: any;
  tx?: Transaction | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(tx ? dollars(tx.amount) : ""),
    [parts, setParts] = useState(
      (
        tx?.allocations || [
          { category_id: "uncategorized", amount: 0, tags: [] },
        ]
      ).map((a) => ({ ...a, value: dollars(a.amount) })),
    ),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    [rule, setRule] = useState(false);
  const [merchant, setMerchant] = useState(tx?.merchant || "");
  return (
    <Modal
      title={tx ? "Transaction details" : "Add a transaction"}
      description={
        tx
          ? `${tx.source} · Classification: ${tx.classification_source}${tx.locked ? " · Locked" : ""}`
          : "Outflows use negative amounts. Refunds use positive amounts."
      }
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            const total = cents(amount),
              body = {
                account_id: f.get("account_id"),
                date: f.get("date"),
                merchant,
                amount: total,
                status: f.get("status"),
                notes: f.get("notes"),
                reviewed: f.get("reviewed") === "on",
                locked: true,
                allocations: parts.map((p) => ({
                  category_id: p.category_id,
                  amount: parts.length === 1 ? total : cents(p.value),
                  tags: p.tags,
                })),
                ...(tx ? { revision: tx.revision } : {}),
              };
            await api(
              tx ? "/transactions/" + tx.id : "/transactions",
              body,
              tx ? "PATCH" : "POST",
            );
            if (rule)
              await api("/rules", {
                name: merchant + " category",
                priority: 100,
                mode: "all",
                enabled: true,
                predicates: [
                  { field: "merchant", op: "equals", value: merchant },
                ],
                category_id: parts[0].category_id,
                tags: parts[0].tags,
                reviewed: false,
              });
            onSaved();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {err && <Alert>{err}</Alert>}
        <Field label="Merchant">
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            required
            maxLength={200}
          />
        </Field>
        <div className="form-grid">
          <Field label="Amount">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="-42.50"
              required
              inputMode="decimal"
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              name="date"
              defaultValue={tx?.date || meta.today}
              required
            />
          </Field>
          <Field label="Account">
            <select
              name="account_id"
              defaultValue={tx?.account_id || meta.accounts[0]?.id}
              required
            >
              {meta.accounts
                .filter((a: Account) => !a.archived || a.id === tx?.account_id)
                .map((a: Account) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={tx?.status || "posted"}>
              <option value="posted">Posted</option>
              <option value="pending">Pending</option>
            </select>
          </Field>
        </div>
        <div className="section-label">
          {parts.length > 1 ? "SPLIT CATEGORIES" : "CATEGORY"}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setParts([
                ...parts,
                {
                  category_id: "uncategorized",
                  amount: 0,
                  tags: [],
                  value: "0",
                },
              ])
            }
          >
            <Plus size={14} /> Split transaction
          </button>
        </div>
        {parts.map((p, i) => (
          <div className="split-row" key={i}>
            <select
              aria-label={`Category ${i + 1}`}
              value={p.category_id}
              onChange={(e) =>
                setParts(
                  parts.map((x, j) =>
                    j === i ? { ...x, category_id: e.target.value } : x,
                  ),
                )
              }
            >
              {meta.categories
                .filter((c: Category) => !c.archived || c.id === p.category_id)
                .map((c: Category) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            {parts.length > 1 && (
              <>
                <input
                  aria-label={`Split amount ${i + 1}`}
                  value={p.value}
                  onChange={(e) =>
                    setParts(
                      parts.map((x, j) =>
                        j === i ? { ...x, value: e.target.value } : x,
                      ),
                    )
                  }
                  inputMode="decimal"
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Remove split"
                  onClick={() => setParts(parts.filter((_, j) => j !== i))}
                >
                  <X size={15} />
                </button>
              </>
            )}
            <input
              aria-label={`Tags ${i + 1}`}
              placeholder="Tags, comma separated"
              value={p.tags.join(", ")}
              onChange={(e) =>
                setParts(
                  parts.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          tags: e.target.value
                            .split(",")
                            .map((v) => v.trim())
                            .filter(Boolean),
                        }
                      : x,
                  ),
                )
              }
            />
          </div>
        ))}
        <Field label="Notes">
          <textarea
            name="notes"
            defaultValue={tx?.notes}
            placeholder="Anything worth remembering?"
            rows={2}
          />
        </Field>
        <label className="check-label">
          <input
            type="checkbox"
            name="reviewed"
            defaultChecked={tx?.reviewed}
          />{" "}
          Mark as reviewed
        </label>
        {parts.length === 1 && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={rule}
              onChange={(e) => setRule(e.target.checked)}
            />{" "}
            Create a category rule for this merchant
          </label>
        )}
        {tx?.transfer_id && (
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              try {
                await api("/transfers/" + tx.transfer_id, {}, "DELETE");
                onSaved();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Unlink transfer pair
          </Button>
        )}
        <div className="modal-footer">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !meta.accounts.length}>
            {busy ? "Saving…" : "Save transaction"}
          </Button>
        </div>
        {!meta.accounts.length && (
          <Alert>Add an account before entering transactions.</Alert>
        )}
      </form>
    </Modal>
  );
}
function ImportModal({
  meta,
  onClose,
  notice,
}: {
  meta: any;
  onClose: () => void;
  notice: (s: string) => void;
}) {
  const profiles = useData("/imports/mappings");
  const [csv, setCsv] = useState(""),
    [account, setAccount] = useState(meta.accounts[0]?.id || ""),
    [mapping, setMapping] = useState<Mapping>({
      date: "Date",
      merchant: "Name",
      amount: "Amount",
      debit: "",
      credit: "",
      reference: "",
      date_format: "YYYY-MM-DD",
      invert: false,
    }),
    [preview, setPreview] = useState<any>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const change = (k: string, v: any) => {
    setMapping({ ...mapping, [k]: v });
    setPreview(null);
  };
  return (
    <Modal
      wide
      title="Bring your transactions home"
      description="Upload a bank CSV, confirm the mapping, then review before importing."
      onClose={onClose}
    >
      {err && <Alert>{err}</Alert>}
      <div className="form-grid">
        <Field label="Destination account">
          <select
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setPreview(null);
            }}
          >
            {meta.accounts
              .filter((a: Account) => !a.archived)
              .map((a: Account) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="CSV statement">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 10 * 1024 * 1024) {
                setErr("File must be under 10 MiB");
                return;
              }
              setCsv(await f.text());
              setPreview(null);
              setErr("");
            }}
          />
        </Field>
      </div>
      {profiles.data?.some((p: any) => p.id === account) && (
        <Button
          variant="secondary"
          onClick={() => {
            const saved = profiles.data.find((p: any) => p.id === account);
            setMapping(saved);
            setPreview(null);
          }}
        >
          Use saved mapping for this account
        </Button>
      )}
      <p className="fine-print">
        Column names must match your file. U.S. Bank layouts can vary. No format
        is trusted without preview.
      </p>
      <div className="form-grid">
        {(
          [
            "date",
            "merchant",
            "amount",
            "debit",
            "credit",
            "reference",
          ] as const
        ).map((k) => (
          <Field
            key={k}
            label={
              k === "amount"
                ? "Signed amount column (or leave blank)"
                : k[0].toUpperCase() + k.slice(1) + " column"
            }
          >
            <input
              value={mapping[k]}
              onChange={(e) => change(k, e.target.value)}
            />
          </Field>
        ))}
        <Field label="Date format">
          <select
            value={mapping.date_format}
            onChange={(e) => change("date_format", e.target.value)}
          >
            <option>YYYY-MM-DD</option>
            <option>MM/DD/YYYY</option>
            <option>DD/MM/YYYY</option>
          </select>
        </Field>
        <label className="check-label">
          <input
            type="checkbox"
            checked={mapping.invert}
            onChange={(e) => change("invert", e.target.checked)}
          />{" "}
          Invert amount signs
        </label>
      </div>
      {csv && (
        <details>
          <summary>File preview</summary>
          <pre className="file-preview">{csv.slice(0, 1200)}</pre>
        </details>
      )}
      {preview && (
        <div className="import-preview">
          <div className="selection-bar">
            <strong>{preview.valid} valid rows</strong>
            <span>{preview.errors} errors</span>
            {preview.replay && <span>Already imported — will skip</span>}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((r: any) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>{r.date}</td>
                    <td>{r.merchant}</td>
                    <td>{money(r.amount)}</td>
                    <td>
                      {r.error ||
                        (r.candidates.length
                          ? "Needs duplicate review"
                          : "Ready")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine-print">
            Showing the first 50 rows. Invalid rows will be excluded. Possible
            duplicates will be held outside your ledger for review.
          </p>
        </div>
      )}
      <div className="modal-footer">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!csv || !account || busy}
          onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              if (!preview)
                setPreview(
                  await api("/imports/preview", {
                    account_id: account,
                    csv,
                    mapping,
                  }),
                );
              else {
                const result = await api("/imports/commit", {
                  account_id: account,
                  csv,
                  mapping,
                  revision: preview.revision,
                });
                notice(
                  `${result.inserted} imported · ${result.flagged} held for review · ${result.skipped} skipped`,
                );
                onClose();
              }
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Working…"
            : preview
              ? "Import valid rows"
              : "Preview mapping"}
        </Button>
      </div>
    </Modal>
  );
}
function RulesModal({
  meta,
  onClose,
  notice,
}: {
  meta: any;
  onClose: () => void;
  notice: (s: string) => void;
}) {
  const rules = useData("/rules"),
    aliases = useData("/aliases");
  const empty = {
    id: undefined as string | undefined,
    name: "",
    priority: 100,
    enabled: true,
    mode: "all",
    category_id: "uncategorized",
    merchant: "",
    tags: [] as string[],
    reviewed: false,
    predicates: [
      {
        field: "merchant",
        op: "contains",
        value: "",
        min: undefined as number | undefined,
        max: undefined as number | undefined,
      },
    ],
  };
  const [draft, setDraft] = useState(empty),
    [preview, setPreview] = useState<any>(null),
    [err, setErr] = useState("");
  const patch = (i: number, changes: any) =>
    setDraft({
      ...draft,
      predicates: draft.predicates.map((p, j) =>
        i === j ? { ...p, ...changes } : p,
      ),
    });
  const perform = async (fn: () => Promise<void>) => {
    try {
      setErr("");
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Modal
      wide
      title="Make the little things automatic"
      description="Lower priorities run first. The first matching rule wins; manual locks always remain intact."
      onClose={onClose}
    >
      {err && <Alert>{err}</Alert>}
      <div className="rule-list">
        {rules.data?.map((r: any) => (
          <div className="rule-row" key={r.id}>
            <span className="rule-priority">{r.priority}</span>
            <div>
              <strong>{r.name}</strong>
              <small>
                {r.predicates
                  .map(
                    (p: any) =>
                      `${p.field} ${p.op} ${p.op === "between" ? money(p.min || 0) + " to " + money(p.max || 0) : p.value}`,
                  )
                  .join(r.mode === "all" ? " AND " : " OR ")}{" "}
                →{" "}
                {
                  meta.categories.find((c: Category) => c.id === r.category_id)
                    ?.name
                }
              </small>
            </div>
            <Button
              variant="ghost"
              onClick={() => setDraft({ ...empty, ...r })}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                perform(async () => {
                  await api("/rules", { ...r, enabled: !r.enabled });
                  setPreview(null);
                  notice("Rule updated");
                })
              }
            >
              {r.enabled ? "Enabled" : "Disabled"}
            </Button>
            <button
              className="icon-btn"
              aria-label={`Delete ${r.name}`}
              onClick={() =>
                perform(async () => {
                  await api("/rules/" + r.id, {}, "DELETE");
                  setPreview(null);
                  notice("Rule deleted");
                })
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      <form
        className="inset-form"
        onSubmit={(e) => {
          e.preventDefault();
          void perform(async () => {
            await api("/rules", draft);
            setDraft(empty);
            setPreview(null);
            notice("Rule saved");
          });
        }}
      >
        <h3>{draft.id ? "Edit rule" : "Add a classification rule"}</h3>
        <div className="form-grid">
          <Field label="Rule name">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Priority (lower runs first)">
            <input
              type="number"
              min="0"
              max="10000"
              value={draft.priority}
              onChange={(e) =>
                setDraft({ ...draft, priority: +e.target.value })
              }
            />
          </Field>
          <Field label="Combine conditions">
            <select
              value={draft.mode}
              onChange={(e) => setDraft({ ...draft, mode: e.target.value })}
            >
              <option value="all">Match all conditions</option>
              <option value="any">Match any condition</option>
            </select>
          </Field>
          <Field label="Assign category">
            <select
              value={draft.category_id}
              onChange={(e) =>
                setDraft({ ...draft, category_id: e.target.value })
              }
            >
              {meta.categories
                .filter((c: Category) => !c.archived)
                .map((c: Category) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        {draft.predicates.map((p, i) => (
          <div className="rule-condition" key={i}>
            <select
              aria-label={`Condition ${i + 1} field`}
              value={p.field}
              onChange={(e) =>
                patch(i, {
                  field: e.target.value,
                  op: e.target.value === "amount" ? "between" : "equals",
                  value: "",
                })
              }
            >
              {[
                ["merchant", "Merchant"],
                ["raw_description", "Raw description"],
                ["account_id", "Account"],
                ["amount", "Signed amount (cents)"],
                ["direction", "Direction"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            {p.field === "amount" ? (
              <>
                <input
                  aria-label={`Condition ${i + 1} minimum cents`}
                  type="number"
                  placeholder="Min cents"
                  value={p.min ?? ""}
                  onChange={(e) =>
                    patch(i, {
                      min: e.target.value === "" ? undefined : +e.target.value,
                    })
                  }
                />
                <input
                  aria-label={`Condition ${i + 1} maximum cents`}
                  type="number"
                  placeholder="Max cents"
                  value={p.max ?? ""}
                  onChange={(e) =>
                    patch(i, {
                      max: e.target.value === "" ? undefined : +e.target.value,
                    })
                  }
                />
              </>
            ) : p.field === "account_id" ? (
              <select
                aria-label={`Condition ${i + 1} account`}
                value={p.value}
                onChange={(e) => patch(i, { value: e.target.value })}
                required
              >
                <option value="">Choose account</option>
                {meta.accounts.map((a: Account) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : p.field === "direction" ? (
              <select
                aria-label={`Condition ${i + 1} direction`}
                value={p.value}
                onChange={(e) => patch(i, { value: e.target.value })}
                required
              >
                <option value="">Choose direction</option>
                <option value="outflow">Outflow</option>
                <option value="inflow">Inflow</option>
              </select>
            ) : (
              <>
                <select
                  aria-label={`Condition ${i + 1} operator`}
                  value={p.op}
                  onChange={(e) => patch(i, { op: e.target.value })}
                >
                  <option value="contains">Contains</option>
                  <option value="equals">Exactly matches</option>
                  <option value="prefix">Starts with</option>
                </select>
                <input
                  aria-label={`Condition ${i + 1} value`}
                  value={p.value}
                  onChange={(e) => patch(i, { value: e.target.value })}
                  required
                  placeholder="Text to match"
                />
              </>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove condition ${i + 1}`}
              disabled={draft.predicates.length === 1}
              onClick={() =>
                setDraft({
                  ...draft,
                  predicates: draft.predicates.filter((_, j) => j !== i),
                })
              }
            >
              <X size={15} />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            setDraft({
              ...draft,
              predicates: [
                ...draft.predicates,
                {
                  field: "merchant",
                  op: "contains",
                  value: "",
                  min: undefined,
                  max: undefined,
                },
              ],
            })
          }
        >
          <Plus size={14} /> Add condition
        </Button>
        <div className="form-grid">
          <Field label="Rename merchant (optional)">
            <input
              value={draft.merchant}
              onChange={(e) => setDraft({ ...draft, merchant: e.target.value })}
            />
          </Field>
          <Field label="Tags (comma separated)">
            <input
              value={draft.tags.join(", ")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  tags: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={draft.reviewed}
            onChange={(e) => setDraft({ ...draft, reviewed: e.target.checked })}
          />{" "}
          Mark matching transactions reviewed
        </label>
        <div className="row">
          <Button type="submit">Save rule</Button>
          {draft.id && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDraft(empty)}
            >
              Cancel edit
            </Button>
          )}
        </div>
      </form>
      <div className="modal-footer">
        {preview && (
          <span>{preview.changes.length} transactions will change</span>
        )}
        <Button
          variant="secondary"
          onClick={() =>
            perform(async () => setPreview(await api("/rules/preview", {})))
          }
        >
          Preview existing matches
        </Button>
        {preview && (
          <Button
            onClick={() =>
              perform(async () => {
                const r = await api("/rules/apply", {
                  revision: preview.revision,
                });
                notice(`${r.count} transactions classified`);
                setPreview(null);
              })
            }
          >
            Apply preview
          </Button>
        )}
      </div>
      {preview?.changes.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {preview.changes.slice(0, 30).map((c: any) => (
                <tr key={c.before.id}>
                  <td>{c.before.merchant}</td>
                  <td>
                    {
                      meta.categories.find(
                        (x: Category) =>
                          x.id === c.before.allocations[0].category_id,
                      )?.name
                    }
                  </td>
                  <td>
                    {
                      meta.categories.find(
                        (x: Category) =>
                          x.id === c.after.allocations[0].category_id,
                      )?.name
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="inset-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          void perform(async () => {
            await api("/aliases", {
              merchant: f.get("merchant"),
              category_id: f.get("category"),
            });
            form.reset();
            notice("Merchant default saved");
          });
        }}
      >
        <h3>Merchant defaults</h3>
        <p className="fine-print">
          Exact merchant defaults apply to new imports after ordered rules.
        </p>
        {aliases.data?.map((a: any) => (
          <p key={a.id}>
            {a.merchant} →{" "}
            {
              meta.categories.find((c: Category) => c.id === a.category_id)
                ?.name
            }
          </p>
        ))}
        <div className="form-grid">
          <Field label="Default merchant">
            <input name="merchant" required />
          </Field>
          <Field label="Default category">
            <select name="category">
              {meta.categories.map((c: Category) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button>Save merchant default</Button>
      </form>
    </Modal>
  );
}

function ReconcileModal({
  onClose,
  notice,
}: {
  onClose: () => void;
  notice: (s: string) => void;
}) {
  const duplicates = useData("/duplicates"),
    transfers = useData("/transfers/suggestions");
  const [err, setErr] = useState("");
  const run = async (path: string, body: any) => {
    try {
      await api(path, body);
      notice("Reconciliation saved");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <Modal
      wide
      title="Keep your ledger tidy"
      description="Confirm ambiguous duplicates and transfer pairs. Nothing is merged automatically."
      onClose={onClose}
    >
      {err && <Alert>{err}</Alert>}
      <h3>Possible duplicates</h3>
      {!duplicates.data?.length ? (
        <p className="muted">No duplicate candidates waiting.</p>
      ) : (
        duplicates.data.map((d: any) => (
          <div className="reconcile-row" key={d.id}>
            <div>
              <strong>
                {d.row.merchant} · {money(d.row.amount)}
              </strong>
              <p>{d.row.date} · Excluded from reports until resolved</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => run("/duplicates/" + d.id, { match: null })}
            >
              Keep as new
            </Button>
            {d.candidates.map((id: string, i: number) => (
              <Button
                key={id}
                onClick={() => run("/duplicates/" + d.id, { match: id })}
              >
                Match existing {i + 1}
              </Button>
            ))}
          </div>
        ))
      )}
      <h3>Suggested transfers</h3>
      {!transfers.data?.length ? (
        <p className="muted">No unmatched transfer pairs found.</p>
      ) : (
        transfers.data.slice(0, 20).map((p: any) => (
          <div className="reconcile-row" key={p.a.id + p.b.id}>
            <div>
              <strong>
                {p.a.merchant} ↔ {p.b.merchant}
              </strong>
              <p>
                {p.a.date} · {money(Math.abs(p.a.amount))}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => run("/transfers", { a: p.a.id, b: p.b.id })}
            >
              Confirm transfer
            </Button>
          </div>
        ))
      )}
    </Modal>
  );
}
function Budgets({ notice }: Props) {
  const meta = useData("/meta");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [editing, setEditing] = useState(false),
    [copy, setCopy] = useState(false),
    [err, setErr] = useState("");
  const query = useData("/budgets/" + month);
  if (query.error) return <Alert>{query.error.message}</Alert>;
  if (!query.data || !meta.data) return <Loading />;
  const b = query.data;
  return (
    <>
      <PageTitle
        eyebrow="A PLAN WITH ROOM FOR LIFE"
        title="Give every little thing a place."
        subtitle="A monthly plan that bends with you, without losing the plot."
      >
        <MonthPicker value={month} onChange={setMonth} />
        <Button onClick={() => setEditing(true)}>
          <SlidersHorizontal size={16} /> Edit plan
        </Button>
      </PageTitle>
      {err && <Alert>{err}</Alert>}
      <div className="stats-grid">
        <Stat
          label="Left to spend"
          value={b.lines.length ? money(b.left) : "No plan yet"}
          detail="After posted & pending expenses"
          icon={Wallet}
          accent
        />
        <Stat
          label="Planned income"
          value={money(b.expected_income)}
          detail="Your expectation for this month"
          icon={ArrowDownLeft}
        />
        <Stat
          label="Not assigned"
          value={money(b.unallocated)}
          detail={
            b.unallocated < 0
              ? "Your allocations exceed expected income"
              : "Available to assign to categories"
          }
          icon={Plus}
        />
        <Stat
          label="Pending commitments"
          value={money(b.pending)}
          detail="Not included in posted spending"
          icon={RefreshCw}
        />
      </div>
      {b.lines.length ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Your category plan</h2>
              <p>Full monthly allocations · negative balances stay visible</p>
            </div>
            <Button variant="secondary" onClick={() => setCopy(true)}>
              Copy plan <ArrowRight size={15} />
            </Button>
          </div>
          <div className="table-scroll">
            <table className="budget-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Progress</th>
                  <th className="right">Planned</th>
                  <th className="right">Rollover</th>
                  <th className="right">Posted</th>
                  <th className="right">Pending</th>
                  <th className="right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map((l: any) => {
                  const c = meta.data.categories.find(
                    (c: Category) => c.id === l.category_id,
                  );
                  return (
                    <tr key={l.category_id}>
                      <td>
                        <strong className="category-name">
                          <i style={{ background: c?.color }} />
                          {c?.name}
                        </strong>
                        <small>
                          {c?.group_name}
                          {l.rollover ? " · Rollover on" : ""}
                        </small>
                      </td>
                      <td>
                        <div className="progress-track">
                          <span
                            style={{
                              width: `${Math.min(100, Math.max(0, ((l.posted + l.pending) / (l.amount + l.opening || 1)) * 100))}%`,
                              background:
                                l.remaining < 0 ? "var(--warn)" : c?.color,
                            }}
                          />
                        </div>
                      </td>
                      <td className="right">{money(l.amount)}</td>
                      <td className="right muted">{money(l.opening)}</td>
                      <td className="right">{money(l.posted)}</td>
                      <td className="right muted">{money(l.pending)}</td>
                      <td
                        className={
                          "right amount " +
                          (l.remaining < 0 ? "negative" : "positive")
                        }
                      >
                        {money(l.remaining)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>Unbudgeted category spending</td>
                  <td className="right">{money(b.unbudgeted)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel">
          <Empty title="A fresh month, a fresh plan.">
            Set category amounts to see what remains after your spending.
          </Empty>
          <div className="empty-action">
            <Button onClick={() => setEditing(true)}>
              Create monthly plan
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await api("/budgets/copy", {
                    from: shiftMonth(month + "-01", -1).slice(0, 7),
                    to: [month],
                  });
                  notice("Previous month copied");
                } catch (e) {
                  setErr((e as Error).message);
                }
              }}
            >
              Copy previous month
            </Button>
          </div>
        </section>
      )}
      <div className="info-note">
        <Leaf size={19} />
        <p>
          <strong>A plan, not a bank balance.</strong> Left-to-spend includes
          category allocations and rollover, less spending and pending
          commitments. Unassigned income is kept separate.
        </p>
      </div>
      {editing && (
        <BudgetModal
          plan={b}
          meta={meta.data}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            notice("Monthly plan saved. Later rollover balances recalculated.");
          }}
        />
      )}
      {copy && (
        <Modal
          title="Copy this plan"
          description="Choose the destination month. Its existing allocations will be replaced."
          onClose={() => setCopy(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api("/budgets/copy", {
                  from: month,
                  to: [f.get("month")],
                });
                setCopy(false);
                notice("Plan copied");
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            <Field label="Destination month">
              <input
                type="month"
                name="month"
                defaultValue={shiftMonth(month + "-01", 1).slice(0, 7)}
                required
              />
            </Field>
            <div className="modal-footer">
              <Button>Copy allocations</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function BudgetModal({
  plan,
  meta,
  onClose,
  onSaved,
}: {
  plan: any;
  meta: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [err, setErr] = useState("");
  return (
    <Modal
      wide
      title="Make a little plan"
      description="Rollover carries both positive and negative leftovers. Historical edits can affect later months."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const lines = meta.categories
              .filter((c: Category) => c.kind === "expense" && !c.archived)
              .filter((c: Category) => f.get("enabled:" + c.id) === "on")
              .map((c: Category) => ({
                category_id: c.id,
                amount: cents(String(f.get("amount:" + c.id) || "0")),
                rollover: f.get("rollover:" + c.id) === "on",
                opening: cents(String(f.get("opening:" + c.id) || "0")),
              }));
            await api("/budgets", {
              month: plan.month,
              expected_income: cents(String(f.get("income"))),
              lines,
            });
            onSaved();
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        {err && <Alert>{err}</Alert>}
        <Field label="Expected monthly income">
          <input
            name="income"
            defaultValue={dollars(plan.expected_income)}
            inputMode="decimal"
            required
          />
        </Field>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Include</th>
                <th>Category</th>
                <th>Allocation ($)</th>
                <th>Rollover</th>
                <th>Initial carry ($)</th>
              </tr>
            </thead>
            <tbody>
              {meta.categories
                .filter((c: Category) => c.kind === "expense" && !c.archived)
                .map((c: Category) => {
                  const line = plan.lines.find(
                    (l: any) => l.category_id === c.id,
                  );
                  return (
                    <tr key={c.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Budget ${c.name}`}
                          name={"enabled:" + c.id}
                          defaultChecked={!!line}
                        />
                      </td>
                      <td>{c.name}</td>
                      <td>
                        <input
                          className="money-input"
                          aria-label={`${c.name} allocation`}
                          name={"amount:" + c.id}
                          defaultValue={dollars(line?.amount || 0)}
                          inputMode="decimal"
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${c.name} rollover`}
                          name={"rollover:" + c.id}
                          defaultChecked={line?.rollover}
                        />
                      </td>
                      <td>
                        <input
                          className="money-input"
                          aria-label={`${c.name} opening carry`}
                          name={"opening:" + c.id}
                          defaultValue={dollars(line?.opening || 0)}
                          inputMode="decimal"
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p className="fine-print">
          Initial carry applies only at the start of a rollover chain;
          subsequent carry is calculated from history.
        </p>
        <div className="modal-footer">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button>Save monthly plan</Button>
        </div>
      </form>
    </Modal>
  );
}
function Reports({ notice }: Props) {
  const meta = useData("/meta");
  const [preset, setPreset] = useState("mtd"),
    [account, setAccount] = useState(""),
    [category, setCategory] = useState(""),
    [tag, setTag] = useState(""),
    [group, setGroup] = useState(""),
    [reviewed, setReviewed] = useState(""),
    [merchant, setMerchant] = useState(""),
    [drill, setDrill] = useState<any>(null),
    [view, setView] = useState("categories");
  const today = meta.data?.today || new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today.slice(0, 7) + "-01"),
    [end, setEnd] = useState(today);
  const ranges = periodQuery(preset, today, {
    start: start || today,
    end: end || today,
  });
  const params = new URLSearchParams({
    ...ranges,
    ...(account ? { account } : {}),
    ...(category ? { category } : {}),
    ...(tag ? { tag } : {}),
    ...(group ? { group } : {}),
    ...(reviewed ? { reviewed } : {}),
    ...(merchant ? { merchant } : {}),
  });
  const query = useData("/reports?" + params);
  if (!meta.data) return <Loading />;
  const r = query.data;
  const cat = (id: string) =>
    meta.data.categories.find((c: Category) => c.id === id);
  const show = (label: string, rows: any[], net = false) =>
    setDrill({
      label,
      rows,
      net,
      total: rows.reduce(
        (n: number, x: any) =>
          n + (!net && x.kind === "expense" ? -x.amount : x.amount),
        0,
      ),
    });
  return (
    <>
      <PageTitle
        eyebrow="FIND THE PATTERNS"
        title="A clearer perspective."
        subtitle="Zoom out. Look closer. Get to know where your money goes."
      >
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              const response = await fetch("/api/v1/reports/export?" + params);
              if (!response.ok) throw new Error("Could not export report");
              const blob = await response.blob(),
                url = URL.createObjectURL(blob),
                a = document.createElement("a");
              a.href = url;
              a.download = "budget-gremlin-report.csv";
              a.click();
              URL.revokeObjectURL(url);
              notice("Report exported");
            } catch (e) {
              notice((e as Error).message);
            }
          }}
        >
          <Download size={16} /> Export CSV
        </Button>
      </PageTitle>
      <div className="panel report-filters">
        <div className="filters">
          <CalendarDays size={18} />
          <select
            aria-label="Report period"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            {[
              ["mtd", "Month to date"],
              ["month", "Full month"],
              ["previous-month", "Previous month"],
              ["qtd", "Quarter to date"],
              ["quarter", "Full quarter"],
              ["previous-quarter", "Previous quarter"],
              ["ytd", "Year to date"],
              ["year", "Full year"],
              ["previous-year", "Previous year"],
              ["trailing-3", "Last 3 complete months"],
              ["trailing-6", "Last 6 complete months"],
              ["trailing-12", "Last 12 complete months"],
              ["custom", "Custom range"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Report account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">All accounts</option>
            {meta.data.accounts.map((a: Account) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Report category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {meta.data.categories.map((c: Category) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Report group"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">All groups</option>
            {[
              ...new Set<string>(
                meta.data.categories.map((c: Category) => c.group_name),
              ),
            ].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <select
            aria-label="Report review state"
            value={reviewed}
            onChange={(e) => setReviewed(e.target.value)}
          >
            <option value="">Any review state</option>
            <option value="true">Reviewed</option>
            <option value="false">Needs review</option>
          </select>
          <input
            aria-label="Report merchant"
            placeholder="Filter merchant…"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          />
          <input
            aria-label="Report tag"
            placeholder="Filter tag…"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
        </div>
        {preset === "custom" && (
          <div className="filters">
            <Field label="Start date">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </div>
        )}
        <div className="report-range">
          {ranges.start} — {ranges.end}
          <span>
            compared with {ranges.priorStart} — {ranges.priorEnd}
          </span>
          <span className="pill">Posted only</span>
        </div>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <Alert>{query.error.message}</Alert>
      ) : (
        r && (
          <>
            {(r.warnings.length > 0 || r.comparison?.warnings.length > 0) && (
              <div className="coverage-warning">
                <ShieldCheck size={16} />
                <div>
                  <strong>Some history may be incomplete.</strong> Comparisons
                  reflect imported records, not necessarily complete statements.
                  <details>
                    <summary>Coverage details</summary>
                    {[
                      ...new Set<string>([
                        ...r.warnings,
                        ...(r.comparison?.warnings || []),
                      ]),
                    ].map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </details>
                </div>
              </div>
            )}
            <div className="stats-grid three">
              <button
                className="stat-button"
                onClick={() =>
                  show(
                    "Income",
                    r.rows.filter((x: any) => x.kind === "income"),
                  )
                }
              >
                <Stat
                  label="Income"
                  value={money(r.income)}
                  detail={<Delta value={r.comparison?.incomeDelta} />}
                  icon={ArrowDownLeft}
                />
              </button>
              <button
                className="stat-button"
                onClick={() =>
                  show(
                    "Spending",
                    r.rows.filter((x: any) => x.kind === "expense"),
                  )
                }
              >
                <Stat
                  label="Spending"
                  value={money(r.spending)}
                  detail={<Delta value={r.comparison?.spendingDelta} />}
                  icon={ArrowUpRight}
                />
              </button>
              <button
                className="stat-button"
                onClick={() => show("Net cash flow", r.rows, true)}
              >
                <Stat
                  label="Net cash flow"
                  value={money(r.net)}
                  detail={<Delta value={r.comparison?.netDelta} />}
                  icon={ChartNoAxesCombined}
                  accent
                />
              </button>
            </div>
            <div className="report-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Where it all went</h2>
                    <p>Net spending, with refunds included</p>
                  </div>
                  <div className="segmented small">
                    <button
                      className={view === "categories" ? "selected" : ""}
                      onClick={() => setView("categories")}
                    >
                      Categories
                    </button>
                    <button
                      className={view === "merchants" ? "selected" : ""}
                      onClick={() => setView("merchants")}
                    >
                      Merchants
                    </button>
                  </div>
                </div>
                <div className="breakdown-list">
                  {(view === "categories" ? r.byCategory : r.byMerchant).map(
                    (x: any, i: number) => {
                      const c = cat(x.key),
                        label =
                          view === "categories" ? c?.name || x.key : x.key;
                      return (
                        <button
                          className="breakdown"
                          key={x.key}
                          onClick={() =>
                            show(
                              label,
                              r.rows.filter(
                                (row: any) =>
                                  row.kind === "expense" &&
                                  (view === "categories"
                                    ? row.category_id === x.key
                                    : row.merchant === x.key),
                              ),
                            )
                          }
                        >
                          <span className="breakdown-label">
                            <i
                              style={{
                                background:
                                  c?.color ||
                                  ["#769B7E", "#CD9B77", "#8DA5BA"][i % 3],
                              }}
                            />
                            {label}
                          </span>
                          <span className="progress-track">
                            <span
                              style={{
                                width: `${Math.max(0, Math.min(100, (x.amount / (r.spending || 1)) * 100))}%`,
                                background: c?.color || "#8DA58E",
                              }}
                            />
                          </span>
                          <strong>{money(x.amount)}</strong>
                          <ChevronRight size={15} />
                        </button>
                      );
                    },
                  )}
                  {!r.byCategory.length && (
                    <Empty title="No posted expenses in this period" />
                  )}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Spending over time</h2>
                    <p>Monthly totals in the selected range</p>
                  </div>
                </div>
                <React.Suspense fallback={<Loading />}>
                  <Charts mode="spending" data={r.monthly} />
                </React.Suspense>
                <details className="chart-data">
                  <summary>View chart data</summary>
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Spending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.monthly.map((x: any) => (
                        <tr key={x.key}>
                          <td>
                            <button
                              className="text-button"
                              onClick={() =>
                                show(
                                  x.key,
                                  r.rows.filter(
                                    (r: any) =>
                                      r.kind === "expense" &&
                                      r.date.startsWith(x.key),
                                  ),
                                )
                              }
                            >
                              {x.key}
                            </button>
                          </td>
                          <td>{money(x.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </section>
            </div>
            <section className="panel movers-panel">
              <div className="panel-heading">
                <div>
                  <h2>What's changed?</h2>
                  <p>
                    The five largest spending changes versus the comparison
                    period.
                  </p>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="right">Current</th>
                      <th className="right">Previous</th>
                      <th className="right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.categoryChanges?.map((c: any) => (
                      <tr key={c.category_id}>
                        <td>
                          <button
                            className="text-button"
                            onClick={() =>
                              show(
                                cat(c.category_id)?.name,
                                r.rows.filter(
                                  (x: any) => x.category_id === c.category_id,
                                ),
                              )
                            }
                          >
                            {cat(c.category_id)?.name}
                          </button>
                        </td>
                        <td className="right">{money(c.current)}</td>
                        <td className="right">{money(c.previous)}</td>
                        <td className="right">
                          {money(c.amount)} (
                          {c.label || c.percent?.toFixed(1) + "%"})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>The plan vs. real life</h2>
                  <p>{r.budgetNote}</p>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="right">Planned</th>
                      <th className="right">Actual</th>
                      <th className="right">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.budgetVsActual
                      .filter((l: any) => l.planned || l.actual)
                      .map((l: any) => (
                        <tr key={l.category_id}>
                          <td>
                            <button
                              className="text-button"
                              onClick={() =>
                                show(
                                  cat(l.category_id)?.name,
                                  r.rows.filter(
                                    (x: any) => x.category_id === l.category_id,
                                  ),
                                )
                              }
                            >
                              {cat(l.category_id)?.name}
                            </button>
                          </td>
                          <td className="right">{money(l.planned)}</td>
                          <td className="right">{money(l.actual)}</td>
                          <td
                            className={
                              "right " +
                              (l.planned +
                                (l.opening_rollover || 0) -
                                l.actual <
                              0
                                ? "negative"
                                : "positive")
                            }
                          >
                            {money(
                              l.planned + (l.opening_rollover || 0) - l.actual,
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      )}
      {drill && (
        <Modal
          wide
          title={drill.label}
          description={`${drill.rows.length} contributing allocations · ${money(drill.total)}`}
          onClose={() => setDrill(null)}
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th className="right">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {drill.rows.map((x: any, i: number) => (
                  <tr key={i}>
                    <td>{x.date}</td>
                    <td>{x.merchant}</td>
                    <td>{x.category}</td>
                    <td className="right">
                      {money(
                        !drill.net && x.kind === "expense"
                          ? -x.amount
                          : x.amount,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>Exact total</th>
                  <th className="right">{money(drill.total)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}
function Delta({ value }: { value: any }) {
  if (!value) return <>No comparison</>;
  return (
    <span>
      {value.amount >= 0 ? "+" : ""}
      {money(value.amount)}{" "}
      <span className="muted">
        ({value.label || `${value.percent?.toFixed(1)}%`}) vs. prior period
      </span>
    </span>
  );
}
function Accounts({ notice }: Props) {
  const query = useData("/accounts"),
    meta = useData("/meta");
  const [edit, setEdit] = useState<any>(),
    [coverage, setCoverage] = useState<any>();
  return (
    <>
      <PageTitle
        eyebrow="YOUR MONEY, TOGETHER"
        title="All your accounts. One home."
        subtitle="Keep balances and activity connected, without the clutter."
      >
        <Button onClick={() => setEdit(null)}>
          <Plus size={17} /> Add account
        </Button>
      </PageTitle>
      <div className="accounts-grid">
        {query.data?.map((a: any) => (
          <section
            className={"panel account-card " + (a.archived ? "archived" : "")}
            key={a.id}
          >
            <div className="account-top">
              <span className="account-icon">
                <CreditCard size={22} />
              </span>
              <span className="pill">
                {a.archived
                  ? "Archived"
                  : a.provider_id
                    ? "Bank linked"
                    : "Manual"}
              </span>
              <button
                className="icon-btn"
                aria-label={`Edit ${a.name}`}
                onClick={() => setEdit(a)}
              >
                <Ellipsis size={20} />
              </button>
            </div>
            <h2>{a.name}</h2>
            <p>{a.type.replace("_", " ")} · USD</p>
            <strong className="account-balance">
              {money(a.balance ?? a.ledger_balance)}
            </strong>
            <small>
              {a.balance != null
                ? "Source balance"
                : "Calculated ledger balance"}
            </small>
            <div className="account-details">
              <span>
                Ledger balance<strong>{money(a.ledger_balance)}</strong>
              </span>
              <span>
                Source updated
                <strong>
                  {a.balance_at
                    ? new Date(a.balance_at).toLocaleDateString()
                    : "Not synced"}
                </strong>
              </span>
              <span>
                In budgets
                <strong>{a.include_budgets ? "Included" : "Excluded"}</strong>
              </span>
            </div>
            <Button variant="ghost" onClick={() => setCoverage(a)}>
              <ShieldCheck size={15} /> Confirm statement coverage
            </Button>
          </section>
        ))}
      </div>
      {query.data?.length === 0 && (
        <div className="panel">
          <Empty title="A place for every account">
            Add checking, savings, or a credit card to get started.
          </Empty>
        </div>
      )}
      <div className="info-note">
        <ShieldCheck size={20} />
        <p>
          Ledger balances start at your opening balance and include posted
          activity from that date. They may differ from bank balances when
          history is incomplete.
        </p>
      </div>
      {edit !== undefined && (
        <AccountModal
          account={edit}
          today={meta.data?.today}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            notice("Account saved");
          }}
        />
      )}
      {coverage && (
        <CoverageModal
          account={coverage}
          onClose={() => setCoverage(undefined)}
          notice={notice}
        />
      )}
    </>
  );
}
function AccountModal({
  account: a,
  today,
  onClose,
  onSaved,
}: {
  account: any;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [err, setErr] = useState("");
  return (
    <Modal title={a ? "Edit account" : "Add an account"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api(
              a ? "/accounts/" + a.id : "/accounts",
              {
                name: f.get("name"),
                type: f.get("type"),
                opening_balance: cents(String(f.get("balance"))),
                opening_date: f.get("date"),
                include_budgets: f.get("budgets") === "on",
                include_reports: f.get("reports") === "on",
                archived: f.get("archived") === "on",
              },
              a ? "PATCH" : "POST",
            );
            onSaved();
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        {err && <Alert>{err}</Alert>}
        <Field label="Account name">
          <input
            name="name"
            defaultValue={a?.name}
            required
            placeholder="Everyday checking"
          />
        </Field>
        <Field label="Account type">
          <select name="type" defaultValue={a?.type || "checking"}>
            {[
              "checking",
              "savings",
              "credit_card",
              "cash",
              "loan",
              "investment",
              "property",
            ].map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field
            label="Opening balance ($)"
            hint="Credit-card debt is negative."
          >
            <input
              name="balance"
              defaultValue={dollars(a?.opening_balance || 0)}
              inputMode="decimal"
              required
            />
          </Field>
          <Field
            label="Opening date"
            hint="Balance just before activity on this date."
          >
            <input
              type="date"
              name="date"
              defaultValue={a?.opening_date || today}
              required
            />
          </Field>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            name="budgets"
            defaultChecked={a?.include_budgets ?? true}
          />{" "}
          Include in budgets
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            name="reports"
            defaultChecked={a?.include_reports ?? true}
          />{" "}
          Include in reports
        </label>
        {a && (
          <label className="check-label">
            <input
              type="checkbox"
              name="archived"
              defaultChecked={a.archived}
            />{" "}
            Archive account (keep history)
          </label>
        )}
        <div className="modal-footer">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button>Save account</Button>
        </div>
      </form>
    </Modal>
  );
}
function CoverageModal({
  account,
  onClose,
  notice,
}: {
  account: any;
  onClose: () => void;
  notice: (s: string) => void;
}) {
  const [err, setErr] = useState("");
  return (
    <Modal
      title="Confirm complete history"
      description={`Only confirm dates you have checked against ${account.name}'s statements.`}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api("/coverage", {
              account_id: account.id,
              start: f.get("start"),
              end: f.get("end"),
            });
            notice("Coverage confirmed");
            onClose();
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        {err && <Alert>{err}</Alert>}
        <div className="form-grid">
          <Field label="Start">
            <input type="date" name="start" required />
          </Field>
          <Field label="End">
            <input type="date" name="end" required />
          </Field>
        </div>
        <div className="modal-footer">
          <Button>Confirm coverage</Button>
        </div>
      </form>
    </Modal>
  );
}
function SettingsPage({ user, notice }: Props) {
  const meta = useData("/meta"),
    users = useData("/users"),
    connections = useData("/connections"),
    imports = useData("/imports"),
    audit = useData("/audit");
  const [tab, setTab] = useState("household"),
    [err, setErr] = useState(""),
    [invite, setInvite] = useState(""),
    [category, setCategory] = useState<any>(),
    [undo, setUndo] = useState<any>(),
    [link, setLink] = useState<any>();
  const run = async (path: string, body: any, method?: string) => {
    setErr("");
    try {
      const result = await api(path, body, method);
      notice("Changes saved");
      return result;
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  if (!meta.data) return <Loading />;
  const settings = meta.data.settings;
  return (
    <>
      <PageTitle
        eyebrow="MAKE YOURSELF AT HOME"
        title="The little details."
        subtitle="Your household, your preferences, your data."
      />
      <div className="settings-layout">
        <div className="settings-nav">
          {[
            ["household", "Household"],
            ["categories", "Categories"],
            ["connections", "Bank connections"],
            ["data", "Data & backups"],
            ["security", "Security & activity"],
            ["ai", "AI integration"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              onClick={() => setTab(id)}
            >
              {label}
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
        <section className="panel settings-content">
          {err && <Alert>{err}</Alert>}
          {tab === "household" && (
            <>
              <h2>A shared home for your finances</h2>
              <p className="muted">
                All household members can view and edit the ledger. Only the
                owner manages access and connections.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await run(
                    "/settings",
                    {
                      name: f.get("name"),
                      timezone: f.get("timezone"),
                      include_pending: f.get("pending") === "on",
                    },
                    "PATCH",
                  );
                }}
              >
                <div className="form-grid">
                  <Field label="Household name">
                    <input
                      name="name"
                      defaultValue={settings.name}
                      disabled={user.role !== "owner"}
                      required
                    />
                  </Field>
                  <Field label="Reporting timezone">
                    <input
                      name="timezone"
                      defaultValue={settings.timezone}
                      disabled={user.role !== "owner"}
                      required
                    />
                  </Field>
                </div>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="pending"
                    defaultChecked={settings.include_pending}
                    disabled={user.role !== "owner"}
                  />{" "}
                  Deduct pending outflows from left-to-spend
                </label>
                {user.role === "owner" && <Button>Save preferences</Button>}
              </form>
              <hr />
              <h3>Members</h3>
              {users.data?.map((u: any) => (
                <div className="member-row" key={u.id}>
                  <span className="avatar">{u.name[0]}</span>
                  <div>
                    <strong>{u.name}</strong>
                    <small>{u.email}</small>
                  </div>
                  <span className="pill">{u.role}</span>
                  {user.role === "owner" && u.role !== "owner" && (
                    <Button
                      variant="ghost"
                      onClick={() => run("/users/" + u.id, {}, "DELETE")}
                    >
                      Remove access
                    </Button>
                  )}
                </div>
              ))}
              {user.role === "owner" && (
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const r = await run("/invitations", {
                      email: f.get("email"),
                    });
                    if (r) setInvite(r.url);
                  }}
                >
                  <Field label="Invite a household member">
                    <input
                      name="email"
                      type="email"
                      placeholder="member@example.com"
                      required
                    />
                  </Field>
                  <Button>
                    <Plus size={16} /> Create invite
                  </Button>
                </form>
              )}
              {invite && (
                <div className="invite-result">
                  <p>
                    Share this single-use link privately. It expires in 48
                    hours.
                  </p>
                  <input
                    aria-label="Invitation link"
                    value={invite}
                    readOnly
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              )}
            </>
          )}
          {tab === "categories" && (
            <>
              <div className="panel-heading">
                <div>
                  <h2>A place for everything</h2>
                  <p>Categories make your budgets and reports meaningful.</p>
                </div>
                <Button onClick={() => setCategory(null)}>
                  <Plus size={15} /> Add
                </Button>
              </div>
              {Array.from(
                new Set<string>(
                  meta.data.categories.map((c: Category) => c.group_name),
                ),
              )
                .sort((a, b) => a.localeCompare(b))
                .map((group) => (
                  <section
                    className="category-group"
                    key={group}
                    aria-label={group}
                  >
                    <h3>{group}</h3>
                    <div className="category-group-items">
                      {meta.data.categories
                        .filter((c: Category) => c.group_name === group)
                        .sort((a: Category, b: Category) =>
                          a.name.localeCompare(b.name),
                        )
                        .map((c: Category) => (
                          <button
                            className="category-setting"
                            key={c.id}
                            onClick={() => setCategory(c)}
                          >
                            <span className="category-name">
                              <i style={{ background: c.color }} />
                              {c.name}
                            </span>
                            <span>
                              {c.kind}
                              {c.archived ? " · archived" : ""}
                            </span>
                            <ChevronRight size={15} />
                          </button>
                        ))}
                    </div>
                  </section>
                ))}
            </>
          )}
          {tab === "connections" && (
            <>
              <h2>Your bank, connected thoughtfully.</h2>
              <p className="muted">
                SimpleFIN is the optional first connector. Verify U.S. Bank
                account support before subscribing. CSV imports always remain
                available.
              </p>
              {connections.data?.map((c: any) => (
                <div className="connection-card" key={c.id}>
                  <div className="row">
                    <span className="account-icon">
                      <Link2 size={20} />
                    </span>
                    <div>
                      <strong>SimpleFIN Bridge</strong>
                      <small>
                        {c.error === "partial_provider_error"
                          ? "SimpleFIN returned an incomplete response. Available accounts are kept; you can still link them and retry sync."
                          : c.error || "Ready to sync"}
                      </small>
                    </div>
                  </div>
                  <dl>
                    <dt>Last attempt</dt>
                    <dd>
                      {c.last_attempt
                        ? new Date(c.last_attempt).toLocaleString()
                        : "Never"}
                    </dd>
                    {c.last_range && (
                      <>
                        <dt>Last requested dates</dt>
                        <dd>
                          {c.last_range.start} – {c.last_range.end} (end
                          exclusive; {c.last_range.mode})
                        </dd>
                      </>
                    )}
                    <dt>History progress</dt>
                    <dd>
                      {c.cursor
                        ? `Next historical date: ${c.cursor}`
                        : "Not started"}
                    </dd>
                    <dt>Last successful fetch</dt>
                    <dd>
                      {c.last_success
                        ? new Date(c.last_success).toLocaleString()
                        : "Not yet"}
                    </dd>
                  </dl>
                  {user.role === "owner" && (
                    <div className="row wrap">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          run("/connections/" + c.id + "/sync", {})
                        }
                      >
                        <RefreshCw size={15} /> Sync now
                      </Button>
                      <Button variant="secondary" onClick={() => setLink(c)}>
                        Link accounts
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          run("/connections/" + c.id, {}, "DELETE")
                        }
                      >
                        Disconnect
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {user.role === "owner" && (
                <form
                  className="inset-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      f = new FormData(form);
                    const result = await run("/connections", {
                      setup_token: f.get("token"),
                      start: f.get("start"),
                    });
                    if (result) {
                      form.reset();
                      notice(
                        "Connection saved. Sync once to discover accounts, then link them.",
                      );
                    }
                  }}
                >
                  <h3>Connect or reconnect SimpleFIN</h3>
                  <p className="fine-print">
                    Generate a new setup token at SimpleFIN Bridge. It is
                    claimed once and stored encrypted. Disconnect the old
                    connection before reconnecting.
                  </p>
                  <Field label="Single-use setup token">
                    <input
                      type="password"
                      name="token"
                      autoComplete="off"
                      required
                    />
                  </Field>
                  <Field label="Requested history start">
                    <input
                      type="date"
                      name="start"
                      defaultValue={shiftMonth(meta.data.today, -12)}
                      required
                    />
                  </Field>
                  <Button>
                    <Link2 size={16} /> Connect securely
                  </Button>
                </form>
              )}
              <div className="info-note">
                <ShieldCheck size={19} />
                <p>
                  Setup requires the server's encryption key. No bank username
                  or password is stored. Disconnecting removes the local token;
                  revoke it in SimpleFIN too.
                </p>
              </div>
            </>
          )}
          {tab === "data" && (
            <>
              <h2>Your data belongs to you.</h2>
              <p className="muted">
                Encrypted backups include your ledger and household settings.
                Keep your encryption key separately; restore into a new database
                with the documented command.
              </p>
              {user.role === "owner" && (
                <Button
                  onClick={async () => {
                    const r = await run("/backups", {});
                    if (r) notice("Encrypted backup created: " + r.name);
                  }}
                >
                  <Download size={16} /> Create server backup
                </Button>
              )}
              <hr />
              <h3>Import history</h3>
              {!imports.data?.length ? (
                <p className="muted">No CSV imports yet.</p>
              ) : (
                imports.data.map((b: any) => (
                  <div className="import-history-row" key={b.id}>
                    <div>
                      <strong>{new Date(b.created_at).toLocaleString()}</strong>
                      <small>
                        {b.inserted} imported · {b.flagged} flagged
                      </small>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          setUndo({
                            id: b.id,
                            ...(await api("/imports/" + b.id + "/undo")),
                          });
                        } catch (e) {
                          setErr((e as Error).message);
                        }
                      }}
                    >
                      Preview undo
                    </Button>
                  </div>
                ))
              )}
              <hr />
              <h3>Portable exports</h3>
              <p className="muted">
                Use Reports to export any filtered range as CSV. Exports are
                useful for analysis but are not a replacement for full backups.
              </p>
            </>
          )}
          {tab === "security" && (
            <>
              <h2>Private by design.</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    f = new FormData(form);
                  if (
                    await run("/auth/password", {
                      current: f.get("current"),
                      password: f.get("password"),
                    })
                  )
                    form.reset();
                }}
              >
                <div className="form-grid">
                  <Field label="Current password">
                    <input
                      type="password"
                      name="current"
                      autoComplete="current-password"
                      required
                    />
                  </Field>
                  <Field label="New password (12+ characters)">
                    <input
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      minLength={12}
                      required
                    />
                  </Field>
                </div>
                <Button>Change password</Button>
              </form>
              <SessionList notice={notice} />
              <hr />
              <h3>Recent activity</h3>
              <div className="audit-list">
                {audit.data?.slice(0, 40).map((a: any) => (
                  <div className="audit-row" key={a.id}>
                    <div>
                      <strong>{a.action.replaceAll("-", " ")}</strong>
                      <small>
                        {a.actor_name || a.actor} ·{" "}
                        {new Date(a.created_at).toLocaleString()}
                      </small>
                    </div>
                    {a.action === "edit-transaction" && a.before_data && (
                      <Button
                        variant="ghost"
                        onClick={() => run("/audit/" + a.id + "/revert", {})}
                      >
                        Revert
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "ai" && <AiWorkspace user={user} settingsOnly />}
        </section>
      </div>
      {category !== undefined && (
        <CategoryModal
          category={category}
          onClose={() => setCategory(undefined)}
          onSaved={() => {
            setCategory(undefined);
            notice("Category saved");
          }}
        />
      )}
      {undo && (
        <Modal
          title="Undo this import?"
          description="Only unchanged rows introduced solely by this batch will be removed."
          onClose={() => setUndo(undefined)}
        >
          <p>
            {undo.rows.filter((r: any) => r.remove).length} rows will be
            removed.
          </p>
          <p>
            {undo.rows.filter((r: any) => !r.remove).length} edited or
            referenced rows will be preserved.
          </p>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setUndo(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                const r = await run("/imports/" + undo.id + "/undo", {
                  revision: undo.revision,
                });
                if (r) {
                  setUndo(undefined);
                  notice(`${r.removed} removed; ${r.preserved} preserved`);
                }
              }}
            >
              Undo import
            </Button>
          </div>
        </Modal>
      )}
      {link && (
        <LinkAccounts
          connection={link}
          meta={meta.data}
          notice={notice}
          onClose={() => setLink(undefined)}
        />
      )}
    </>
  );
}
function SessionList({ notice }: { notice: (s: string) => void }) {
  const sessions = useData("/auth/sessions");
  return (
    <>
      <hr />
      <h3>Your sessions</h3>
      {sessions.data?.map((s: any) => (
        <div className="member-row" key={s.hash}>
          <div>
            <strong>{s.current ? "This device" : "Another session"}</strong>
            <small>Last active {new Date(s.last_seen).toLocaleString()}</small>
          </div>
          {!s.current && (
            <Button
              variant="ghost"
              onClick={async () => {
                await api("/auth/sessions/" + s.hash, {}, "DELETE");
                notice("Session revoked");
              }}
            >
              Revoke
            </Button>
          )}
        </div>
      ))}
    </>
  );
}
function CategoryModal({
  category: c,
  onClose,
  onSaved,
}: {
  category: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [err, setErr] = useState("");
  const meta = useData("/meta");
  const [destination, setDestination] = useState("");
  const groups = Array.from(
    new Set<string>([
      c?.group_name || "Lifestyle",
      ...(meta.data?.categories || []).map(
        (category: Category) => category.group_name,
      ),
    ]),
  ).sort((a, b) => a.localeCompare(b));
  return (
    <Modal title={c ? "Edit category" : "New category"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api(
              c ? "/categories/" + c.id : "/categories",
              {
                name: f.get("name"),
                group_name: f.get("group"),
                kind: f.get("kind"),
                color: f.get("color"),
                archived: f.get("archived") === "on",
              },
              c ? "PATCH" : "POST",
            );
            onSaved();
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        {err && <Alert>{err}</Alert>}
        <Field label="Name">
          <input name="name" defaultValue={c?.name} required />
        </Field>
        <Field label="Group">
          <select
            name="group"
            aria-label="Group"
            defaultValue={c?.group_name || "Lifestyle"}
            required
          >
            {groups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Type">
            <select name="kind" defaultValue={c?.kind || "expense"}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
          </Field>
          <Field label="Color">
            <input
              name="color"
              type="color"
              defaultValue={c?.color || "#769B7E"}
            />
          </Field>
        </div>
        {c && (
          <label className="check-label">
            <input
              type="checkbox"
              name="archived"
              defaultChecked={c.archived}
            />{" "}
            Archive (keep history)
          </label>
        )}
        <div className="modal-footer">
          <Button>Save category</Button>
        </div>
      </form>
      {c && !["uncategorized", "income", "transfer"].includes(c.id) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/categories/" + c.id + "/merge", { destination });
              onSaved();
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          <Field label="Merge into another category">
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              required
            >
              <option value="">Choose destination</option>
              {meta.data?.categories
                .filter(
                  (x: Category) =>
                    x.id !== c.id && x.kind === c.kind && !x.archived,
                )
                .map((x: Category) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </Field>
          <p className="muted">
            Moves transaction classifications, rules and merchant defaults, then
            archives this category. Remove this category from budget plans
            first.
          </p>
          <Button variant="secondary" disabled={!destination}>
            Merge category
          </Button>
        </form>
      )}
    </Modal>
  );
}
function LinkAccounts({
  connection,
  meta,
  notice,
  onClose,
}: {
  connection: any;
  meta: any;
  notice: (s: string) => void;
  onClose: () => void;
}) {
  const query = useData("/connections/" + connection.id + "/accounts");
  const [err, setErr] = useState("");
  return (
    <Modal
      title="Match your accounts"
      description="Link each discovered account to an existing account, or create a new local account here."
      onClose={onClose}
    >
      {err && <Alert>{err}</Alert>}
      {query.data?.length ? (
        query.data.map((r: any) => (
          <AccountLinkRow
            key={r.id}
            remote={r}
            connection={connection}
            accounts={meta.accounts}
            notice={notice}
            onError={setErr}
          />
        ))
      ) : (
        <Empty title="No discovered accounts yet">
          Run a sync, then return here.
        </Empty>
      )}
    </Modal>
  );
}
function AccountLinkRow({
  remote,
  connection,
  accounts,
  notice,
  onError,
}: any) {
  const client = useQueryClient();
  const linked = accounts.find(
    (a: Account) => a.provider_id === connection.id + ":" + remote.id,
  );
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="inset-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        onError("");
        try {
          await api("/connections/" + connection.id + "/link", {
            provider_id: remote.id,
            ...(selection === "new"
              ? {
                  new_account: {
                    name: f.get("name"),
                    type: f.get("type"),
                    opening_date: connection.start,
                    opening_balance: 0,
                  },
                }
              : { account_id: selection }),
          });
          await client.invalidateQueries();
          notice("Account linked. Sync again to import its transactions.");
        } catch (e) {
          onError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <strong>{remote.name}</strong>
      {linked ? (
        <p>Linked to {linked.name}</p>
      ) : (
        <>
          <Field label="Local account">
            <select
              aria-label="Local account"
              required
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
            >
              <option value="">Choose an account</option>
              <option value="new">Create a new account</option>
              {accounts
                .filter((a: Account) => !a.archived && !a.provider_id)
                .map((a: Account) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          {selection === "new" && (
            <>
              <Field label="Account name">
                <input
                  name="name"
                  defaultValue={remote.name}
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="Account type">
                <select
                  name="type"
                  aria-label="Account type"
                  required
                  defaultValue="checking"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit_card">Credit card</option>
                </select>
              </Field>
              <p className="fine-print">
                Opening balance starts at zero. After importing available
                history, reconcile it against your statement in Accounts.
              </p>
            </>
          )}
          <Button disabled={!selection || busy}>
            {busy
              ? "Linking…"
              : selection === "new"
                ? "Create and link"
                : "Link account"}
          </Button>
        </>
      )}
    </form>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
