import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Repeat,
} from "lucide-react";
import { api, money, dollars } from "./api";
import { Alert, Button, Empty, Field, Loading, Modal } from "./ui";
import { frequencies } from "../../../packages/recurring/options.ts";
import type { Schedule } from "../../../packages/recurring/index.ts";

const labels: Record<string, string> = {
  once: "One time",
  weekly: "Weekly",
  biweekly: "Every two weeks",
  twice_monthly: "Twice monthly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};
const useData = (path: string) =>
  useQuery({ queryKey: [path], queryFn: () => api(path) });
const shiftMonth = (m: string, n: number) => {
  const d = new Date(m + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date + "T12:00:00Z"));
}
function scheduleLabel(r: Schedule) {
  return `${labels[r.frequency]}${r.days.length ? ` · day${r.days.length > 1 ? "s" : ""} ${r.days.join(" & ")}` : ""} · from ${dateLabel(r.start_date)}${r.end_date ? ` through ${dateLabel(r.end_date)}` : ""}`;
}

export function RecurringWorkspace({
  view = "schedules",
}: {
  view?: "schedules" | "calendar";
}) {
  const meta = useData("/meta"),
    recurring = useData("/recurring"),
    suggestions = useData("/recurring/suggestions");
  const [selectedMonth, setSelectedMonth] = useState("");
  const month =
    selectedMonth ||
    meta.data?.today?.slice(0, 7) ||
    new Date().toISOString().slice(0, 7);
  const cal = useData("/calendar/" + month),
    client = useQueryClient();
  const [editing, setEditing] = useState<Partial<Schedule> | null>(null),
    [occurrence, setOccurrence] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("all"),
    [account, setAccount] = useState(""),
    [filter, setFilter] = useState("");
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await api(path, body);
      await client.invalidateQueries();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  if (meta.error || recurring.error || cal.error)
    return (
      <Alert>
        {String((meta.error || recurring.error || cal.error)?.message)}
      </Alert>
    );
  if (!meta.data || !recurring.data || !cal.data) return <Loading />;
  const today = meta.data.today;
  const items = cal.data.items.filter(
    (o: any) =>
      (!account ||
        o.account_id === account ||
        o.transaction?.account_id === account) &&
      (status === "all" ||
        o.status === status ||
        (status === "paid" && o.status === "received")),
  );
  const first = new Date(month + "-01T12:00:00Z").getUTCDay(),
    count = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)),
      0,
    ).getDate();
  const categoryName = (id: string) =>
    meta.data.categories.find((c: any) => c.id === id)?.name ||
    "Unknown category";
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">YOUR PLAN, ON A SCHEDULE</p>
          <h1>
            {view === "calendar" ? "Your money calendar" : "Recurring plans"}
          </h1>
          <p className="muted">
            Expected income, bills and everyday allowances. Plans never create
            bank transactions.
          </p>
        </div>
        <div className="recurring-toolbar">
          <Button
            variant="secondary"
            onClick={() => {
              location.hash = view === "calendar" ? "recurring" : "calendar";
            }}
          >
            {view === "calendar" ? (
              <Repeat size={16} />
            ) : (
              <CalendarDays size={16} />
            )}{" "}
            {view === "calendar" ? "Manage recurring items" : "Open calendar"}
          </Button>
          <Button
            onClick={() => {
              setError("");
              setEditing({});
            }}
          >
            <Plus size={16} /> Add recurring item
          </Button>
        </div>
      </div>
      {error && !editing && !occurrence && <Alert>{error}</Alert>}
      {view === "calendar" ? (
        <>
          <section className="panel recurring-panel">
            <div className="recurring-toolbar">
              <button
                className="icon-btn"
                aria-label="Previous calendar month"
                onClick={() => setSelectedMonth(shiftMonth(month, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <Field label="Calendar month">
                <input
                  type="month"
                  value={month}
                  onChange={(e) => {
                    if (e.target.value) setSelectedMonth(e.target.value);
                  }}
                />
              </Field>
              <button
                className="icon-btn"
                aria-label="Next calendar month"
                onClick={() => setSelectedMonth(shiftMonth(month, 1))}
              >
                <ChevronRight size={18} />
              </button>
              <Button
                variant="ghost"
                onClick={() => setSelectedMonth(today.slice(0, 7))}
              >
                This month
              </Button>
              <Field label="Calendar status">
                <select
                  aria-label="Calendar status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  {[
                    "upcoming",
                    "due",
                    "overdue",
                    "pending",
                    "paid",
                    "planned",
                    "skipped",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v === "paid" ? "Paid / received" : v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Calendar account">
                <select
                  aria-label="Calendar account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  <option value="">All accounts</option>
                  {meta.data.accounts.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="recurring-summary">
              <div>
                <small>Scheduled income</small>
                <strong>{money(cal.data.totals.income)}</strong>
              </div>
              <div>
                <small>Expenses & allowances</small>
                <strong>{money(cal.data.totals.expenses)}</strong>
              </div>
              <div>
                <small>Transfers (outside budget)</small>
                <strong>{money(cal.data.totals.transfers)}</strong>
              </div>
              <div>
                <small>Unmatched outgoing payments</small>
                <strong>{money(cal.data.totals.outstanding)}</strong>
              </div>
            </div>
            <p className="muted">
              Totals cover the full month before filters. Estimates are planning
              amounts, not an account-balance forecast. Pending matches are
              shown separately from paid items.
            </p>
          </section>
          <section
            className="panel money-calendar"
            aria-label="Scheduled payments calendar"
          >
            <div className="calendar-weekdays" aria-hidden="true">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {Array.from({ length: first }, (_, i) => (
                <div
                  className="calendar-blank"
                  key={"blank" + i}
                  aria-hidden="true"
                />
              ))}
              {Array.from({ length: count }, (_, i) => {
                const date = `${month}-${String(i + 1).padStart(2, "0")}`,
                  daily = items.filter((o: any) => o.date === date);
                return (
                  <section
                    key={date}
                    className={`calendar-day ${daily.length ? "" : "empty-day"} ${date === today ? "is-today" : ""}`}
                    aria-label={dateLabel(date)}
                  >
                    <h2>
                      <time dateTime={date}>{i + 1}</time>
                      <span className="calendar-mobile-date">
                        {" "}
                        {dateLabel(date)}
                      </span>
                      {date === today && <small>Today</small>}
                    </h2>
                    {daily.map((o: any) => (
                      <button
                        key={o.id}
                        className={`calendar-item status-${o.status}`}
                        onClick={() => {
                          setError("");
                          setOccurrence(o);
                        }}
                      >
                        <strong>{o.name}</strong>
                        <span>
                          {o.estimated ? "≈ " : ""}
                          {o.kind === "income" ? "+" : ""}
                          {money(o.amount)}
                        </span>
                        <small>
                          {o.status}
                          {o.kind === "transfer" ? " · transfer" : ""}
                        </small>
                      </button>
                    ))}
                  </section>
                );
              })}
            </div>
            {!items.length && (
              <p className="muted">
                No scheduled items match this month and these filters.
              </p>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="info-note">
            Scheduled expenses count within your category budgets. We only raise
            an allocation when the scheduled total exceeds it; we never
            automatically lower an existing plan. Income works the same way.
            Transfers stay outside spending totals.
          </div>
          <section className="panel recurring-panel">
            <div className="panel-heading">
              <h2>Your scheduled items</h2>
              <Field label="Find recurring items">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search by name"
                />
              </Field>
            </div>
            {!recurring.data.length ? (
              <Empty title="Make room for what's coming">
                Add your first income, bill, subscription, transfer or spending
                allowance.
              </Empty>
            ) : (
              <div className="recurring-list">
                {recurring.data
                  .filter((r: Schedule) =>
                    r.name.toLowerCase().includes(filter.toLowerCase()),
                  )
                  .map((r: Schedule) => (
                    <article key={r.id} className="recurring-row">
                      <div>
                        <h3>
                          {r.name} {!r.active && <small>Paused</small>}
                        </h3>
                        <p>{scheduleLabel(r)}</p>
                        <small>
                          {categoryName(r.category_id)} · {r.kind}
                          {r.account_id
                            ? ` · ${meta.data.accounts.find((a: any) => a.id === r.account_id)?.name || "Archived account"}`
                            : " · any account"}
                        </small>
                      </div>
                      <strong>
                        {r.estimated ? "≈ " : ""}
                        {money(r.amount)}
                      </strong>
                      <div className="recurring-toolbar">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setError("");
                            setEditing(r);
                          }}
                        >
                          Edit <span className="sr-only">{r.name}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void action("/recurring", {
                              ...r,
                              active: !r.active,
                            })
                          }
                        >
                          {r.active ? "Pause" : "Resume"}
                          <span className="sr-only"> {r.name}</span>
                        </Button>
                      </div>
                    </article>
                  ))}
              </div>
            )}
          </section>
          <section className="panel recurring-panel">
            <div className="panel-heading">
              <div>
                <h2>Suggested from your transactions</h2>
                <p>
                  Local pattern analysis of posted history; refreshed as imports
                  change. Nothing is added without your review.
                </p>
              </div>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void action("/recurring/suggestions/reset", {})}
              >
                Restore dismissed
              </Button>
            </div>
            {suggestions.error && <Alert>{suggestions.error.message}</Alert>}
            {suggestions.data?.length ? (
              suggestions.data.map((r: any) => (
                <article className="recurring-suggestion" key={r.id}>
                  <div className="panel-heading">
                    <div>
                      <h3>{r.name}</h3>
                      <p>
                        {labels[r.frequency]} · {money(r.amount)}
                        {r.estimated ? " estimated" : ""}
                      </p>
                    </div>
                    <div className="recurring-toolbar">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setError("");
                          setEditing({ ...r, id: undefined, revision: 0 });
                        }}
                      >
                        Review suggestion
                        <span className="sr-only"> {r.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            `/recurring/suggestions/${r.id}/dismiss`,
                            {},
                          )
                        }
                      >
                        Dismiss<span className="sr-only"> {r.name}</span>
                      </Button>
                    </div>
                  </div>
                  <p>{r.explanation}</p>
                  <details>
                    <summary>
                      View supporting transactions ({r.evidence.length})
                    </summary>
                    <ul>
                      {r.evidence.map((t: any) => (
                        <li key={t.id}>
                          {dateLabel(t.date)} · {t.merchant} · {money(t.amount)}
                        </li>
                      ))}
                    </ul>
                  </details>
                </article>
              ))
            ) : (
              <p className="muted">
                No new recurring patterns found. Suggestions need at least three
                posted payments with consistent spacing. You can always add an
                item manually.
              </p>
            )}
          </section>
        </>
      )}
      {editing && (
        <ScheduleEditor
          item={editing}
          meta={meta.data}
          busy={busy}
          error={error}
          onClose={() => setEditing(null)}
          onSave={async (value) => {
            if (await action("/recurring", value)) setEditing(null);
          }}
        />
      )}
      {occurrence && (
        <OccurrenceEditor
          item={occurrence}
          busy={busy}
          error={error}
          onClose={() => setOccurrence(null)}
          onSave={async (value) => {
            if (await action("/recurring/occurrence", value))
              setOccurrence(null);
          }}
        />
      )}
    </>
  );
}

function ScheduleEditor({
  item,
  meta,
  busy,
  error,
  onClose,
  onSave,
}: {
  item: Partial<Schedule>;
  meta: any;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (value: Schedule) => Promise<void>;
}) {
  const [kind, setKind] = useState(item.kind || "bill"),
    [frequency, setFrequency] = useState(item.frequency || "monthly"),
    [start, setStart] = useState(item.start_date || meta.today);
  const categoryKind =
    kind === "income" ? "income" : kind === "transfer" ? "transfer" : "expense";
  const categories = meta.categories.filter(
    (c: any) => !c.archived && c.kind === categoryKind,
  );
  const dayCount =
    frequency === "twice_monthly"
      ? 2
      : ["monthly", "quarterly"].includes(frequency)
        ? 1
        : 0;
  return (
    <Modal
      title={item.id ? "Edit recurring item" : "New recurring item"}
      description="Saving includes scheduled occurrences in this month's plan, starting on the date you choose. No payment is initiated."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await onSave({
            id: item.id || crypto.randomUUID(),
            revision: item.revision || 0,
            name: String(f.get("name")),
            kind,
            amount: Math.round(Number(f.get("amount")) * 100),
            estimated: f.get("estimated") === "on",
            category_id: String(f.get("category")),
            account_id: String(f.get("account")) || null,
            merchant: String(f.get("merchant") || ""),
            frequency,
            start_date: start,
            end_date: String(f.get("end")) || null,
            days: Array.from({ length: dayCount }, (_, i) =>
              Number(f.get("day" + i)),
            ),
            active: item.active ?? true,
            auto_match: f.get("auto_match") === "on",
          });
        }}
      >
        {error && <Alert>{error}</Alert>}
        <Field label="Recurring item name">
          <input
            name="name"
            defaultValue={item.name}
            required
            maxLength={100}
          />
        </Field>
        <div className="form-grid">
          <Field label="Recurring item type">
            <select
              aria-label="Recurring item type"
              value={kind}
              onChange={(e) => setKind(e.target.value as Schedule["kind"])}
            >
              {["bill", "subscription", "income", "transfer", "allowance"].map(
                (k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Field label="Amount per occurrence (USD)">
            <input
              name="amount"
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              defaultValue={
                item.amount === undefined ? "" : dollars(item.amount)
              }
              required
            />
          </Field>
          <Field label="Recurring category">
            <select
              key={kind}
              name="category"
              aria-label="Recurring category"
              defaultValue={
                categories.some((c: any) => c.id === item.category_id)
                  ? item.category_id
                  : ""
              }
              required
            >
              <option value="" disabled>
                Select a category
              </option>
              {Array.from(
                new Set<string>(categories.map((c: any) => c.group_name)),
              )
                .sort()
                .map((group) => (
                  <optgroup key={group} label={group}>
                    {categories
                      .filter((c: any) => c.group_name === group)
                      .map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          </Field>
          <Field
            label={kind === "transfer" ? "Paying account" : "Matching account"}
          >
            <select
              name="account"
              aria-label={
                kind === "transfer" ? "Paying account" : "Matching account"
              }
              defaultValue={item.account_id || ""}
              required={kind === "transfer"}
            >
              <option value="">
                {kind === "transfer" ? "Select paying account" : "Any account"}
              </option>
              {meta.accounts
                .filter((a: any) => !a.archived)
                .map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Frequency">
            <select
              aria-label="Frequency"
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as Schedule["frequency"])
              }
            >
              {frequencies.map((f) => (
                <option key={f} value={f}>
                  {labels[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Start date"
            hint="Backdate this to include earlier occurrences in the current month's plan."
          >
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </Field>
          {Array.from({ length: dayCount }, (_, i) => (
            <Field
              key={frequency + i}
              label={dayCount === 2 ? `Day of month ${i + 1}` : "Day of month"}
            >
              <input
                name={"day" + i}
                type="number"
                min="1"
                max="31"
                required
                defaultValue={
                  item.days?.[i] || (i === 0 ? Number(start.slice(8)) : 15)
                }
              />
            </Field>
          ))}
          {frequency !== "once" && (
            <Field label="End date (optional)">
              <input
                name="end"
                type="date"
                min={start}
                defaultValue={item.end_date || ""}
              />
            </Field>
          )}
        </div>
        <p className="muted">
          Weekly and two-week schedules start on the start date. Quarterly
          schedules use its starting month; yearly schedules use its month and
          day. Dates beyond month end use the last day. Weekends stay as
          scheduled.
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            name="estimated"
            defaultChecked={item.estimated}
          />{" "}
          This amount is an estimate
        </label>
        {kind !== "allowance" && (
          <>
            <Field
              label="Merchant to match (optional)"
              hint="Leave blank to match the item name. Automatic matches require an exact amount and a unique transaction within three days."
            >
              <input
                name="merchant"
                defaultValue={item.merchant}
                maxLength={150}
              />
            </Field>
            <label className="check-label">
              <input
                type="checkbox"
                name="auto_match"
                defaultChecked={item.auto_match ?? true}
              />{" "}
              Automatically match clear transactions
            </label>
          </>
        )}
        {kind === "transfer" && (
          <p className="info-note">
            Credit-card payments and account transfers appear on the calendar
            but do not increase expense budgets. Match the outgoing side only.
          </p>
        )}
        {kind === "allowance" && (
          <p className="info-note">
            Allowances reserve category spending without expecting a single
            matching payment. They do not become overdue.
          </p>
        )}
        {item.id && (
          <p className="muted">
            Editing changes this series, including its calendar history. Use a
            calendar occurrence to change just one date. Existing budget
            allocations will not be reduced automatically.
          </p>
        )}
        <Button disabled={busy}>Save recurring plan</Button>
      </form>
    </Modal>
  );
}

function OccurrenceEditor({
  item: o,
  busy,
  error,
  onClose,
  onSave,
}: {
  item: any;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (value: unknown) => Promise<void>;
}) {
  const [mode, setMode] = useState(o.exception?.match_mode || "auto"),
    [skipped, setSkipped] = useState(o.skipped);
  const base = {
    schedule_id: o.schedule_id,
    scheduled_date: o.scheduled_date,
    revision: o.exception?.revision || 0,
  };
  return (
    <Modal
      title={o.name}
      description={`${dateLabel(o.date)} · ${o.status}. Changes here affect this occurrence only.`}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await onSave({
            ...base,
            date: String(f.get("date")),
            amount: Math.round(Number(f.get("amount")) * 100),
            skipped,
            match_mode: skipped ? "none" : mode,
            transaction_id:
              mode === "manual"
                ? String(f.get("transaction") || "") || null
                : null,
          });
        }}
      >
        {error && <Alert>{error}</Alert>}
        {o.transaction && (
          <div className="info-note">
            <div>
              <strong>
                {o.match_source === "automatic"
                  ? "Automatically matched"
                  : "Manually matched"}
              </strong>
              <p>
                {o.transaction.merchant} · {dateLabel(o.transaction.date)} ·{" "}
                {money(o.transaction.amount)} · {o.transaction.status}
              </p>
              <p>
                Difference from estimate: {money(o.variance)}. Matching does not
                change the transaction.
              </p>
            </div>
          </div>
        )}
        {o.match_missing && (
          <Alert>
            The previously matched transaction is no longer eligible. Choose
            another transaction or restore automatic matching.
          </Alert>
        )}
        <Field label="Expected date">
          <input name="date" type="date" defaultValue={o.date} required />
        </Field>
        <Field label="Expected amount (USD)">
          <input
            name="amount"
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            defaultValue={dollars(o.amount)}
            required
          />
        </Field>
        <label className="check-label">
          <input
            type="checkbox"
            checked={skipped}
            onChange={(e) => setSkipped(e.target.checked)}
          />{" "}
          Skip this occurrence
        </label>
        {o.kind !== "allowance" && !skipped && (
          <>
            <Field label="Transaction matching">
              <select
                aria-label="Transaction matching"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="auto">Automatic matching</option>
                <option value="manual">Choose transaction</option>
                <option value="none">
                  Leave unmatched (disable automatic matching)
                </option>
              </select>
            </Field>
            {mode === "manual" && (
              <Field label="Matching transaction">
                <select
                  name="transaction"
                  aria-label="Matching transaction"
                  defaultValue={o.transaction?.id || ""}
                  required
                >
                  <option value="">Select a transaction</option>
                  {o.candidates.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.date} · {t.merchant} · {money(t.amount)} · {t.status}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {mode === "manual" && (
              <p className="muted">
                Shows up to 40 nearby eligible transactions. A transaction can
                only match one occurrence; unlink another match first if needed.
              </p>
            )}
          </>
        )}
        <div className="recurring-toolbar">
          <Button disabled={busy}>Save occurrence</Button>
          {o.transaction && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void onSave({
                  ...base,
                  date: o.date,
                  amount: o.amount,
                  skipped: false,
                  match_mode: "none",
                  transaction_id: null,
                })
              }
            >
              Unlink transaction
            </Button>
          )}
        </div>
        <p className="muted">
          Skipping or reducing an occurrence does not lower an existing category
          allocation. Adjust your monthly plan deliberately if you want to
          release that money.
        </p>
      </form>
    </Modal>
  );
}
