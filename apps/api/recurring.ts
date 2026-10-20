import { createHash } from "node:crypto";
import { Store } from "./db.ts";
import {
  month,
  type Budget,
  type Transaction,
} from "../../packages/shared/schema.ts";
import {
  addDays,
  daysBetween,
  endOfMonth,
  exceptionSchema,
  merchantKey,
  occurrenceId,
  occurrences,
  planWithRecurring,
  scheduleSchema,
  scheduledDates,
  type Occurrence,
  type OccurrenceException,
  type Schedule,
} from "../../packages/recurring/index.ts";

export function householdToday(s: Store) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: String(
      s.get("settings", "household")?.timezone || "America/Los_Angeles",
    ),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function normalize(s: Store, value: any): Schedule {
  return scheduleSchema.parse(
    value.frequency
      ? value
      : {
          ...value,
          frequency: "monthly",
          start_date: householdToday(s).slice(0, 7) + "-01",
          days: [value.due_day],
          revision: 1,
        },
  );
}
export function migrateSchedules(s: Store) {
  s.atomic(() => {
    for (const r of s.all<any>("recurring"))
      if (!r.frequency) s.put("recurring", r.id, normalize(s, r));
  });
}
export const schedules = (s: Store) =>
  s.all<Schedule>("recurring").map((r) => normalize(s, r));
const exceptions = (s: Store) =>
  s.all<OccurrenceException>("recurring_exceptions");
export function monthItems(s: Store, m: string) {
  month.parse(m);
  return occurrences(schedules(s), exceptions(s), m + "-01", endOfMonth(m));
}
export function recurringPlan(s: Store, m: string, base?: Budget): Budget {
  month.parse(m);
  const before = base ||
    s.get<Budget>("budgets", m) || { month: m, expected_income: 0, lines: [] };
  if (m < householdToday(s).slice(0, 7)) return before;
  return planWithRecurring(before, monthItems(s, m));
}
export function syncRecurringPlan(s: Store, m: string, actor = "system") {
  const before = s.get<Budget>("budgets", m),
    plan = recurringPlan(s, m);
  if (
    (!before && (plan.lines.length || plan.expected_income)) ||
    (before && JSON.stringify(before) !== JSON.stringify(plan))
  ) {
    s.put("budgets", m, plan);
    s.audit(actor, "recurring-budget-floor", m, before, plan);
  }
  return plan;
}
function validate(s: Store, r: Schedule) {
  const category = s.get("categories", r.category_id);
  const kind =
    r.kind === "income"
      ? "income"
      : r.kind === "transfer"
        ? "transfer"
        : "expense";
  if (!category || category.archived || category.kind !== kind)
    throw new Error("Choose an active category matching this item type");
  if (
    r.account_id &&
    !s.accounts().some((a) => a.id === r.account_id && !a.archived)
  )
    throw new Error("Choose an active account");
  if (r.kind === "transfer" && !r.account_id)
    throw new Error(
      "Transfers require the paying account to avoid matching both sides",
    );
}
export function saveSchedule(
  s: Store,
  actor: string,
  input: unknown,
  inTransaction = false,
) {
  const body = scheduleSchema.parse(input);
  const perform = () => {
    const old = s.get<Schedule>("recurring", body.id);
    if (old && normalize(s, old).revision !== body.revision)
      throw new Error("Schedule changed; reload before saving");
    if (!old && body.revision !== 0)
      throw new Error("Schedule changed; reload before saving");
    validate(s, body);
    const value = {
      ...body,
      days: [...body.days].sort((a, b) => a - b),
      revision: (old ? normalize(s, old).revision : 0) + 1,
    };
    s.put("recurring", body.id, value);
    s.audit(actor, "recurring-schedule", body.id, old, value);
    syncRecurringPlan(s, householdToday(s).slice(0, 7), actor);
    return value;
  };
  return inTransaction ? perform() : s.atomic(perform);
}
/** Compatibility for existing AI proposals; retain richer scheduling fields. */
export function saveLegacySchedule(
  s: Store,
  actor: string,
  input: any,
  inTransaction = false,
) {
  const old = s.get<Schedule>("recurring", input.id);
  const normalized = old ? normalize(s, old) : undefined;
  return saveSchedule(
    s,
    actor,
    {
      ...normalized,
      ...input,
      revision: normalized?.revision || 0,
      frequency: normalized?.frequency || "monthly",
      start_date:
        normalized?.start_date || householdToday(s).slice(0, 7) + "-01",
      days:
        !normalized || normalized.frequency === "monthly"
          ? [input.due_day]
          : normalized.days,
    },
    inTransaction,
  );
}
function eligible(
  t: Transaction,
  o: Occurrence,
  transferCategories: Set<string>,
) {
  return (
    !t.removed &&
    (o.account_id === null || t.account_id === o.account_id) &&
    (o.kind === "income" ? t.amount > 0 : t.amount < 0) &&
    (o.kind === "transfer" ||
      (!t.transfer_id &&
        !t.allocations.some((a) => transferCategories.has(a.category_id))))
  );
}
function shortTx(t: Transaction) {
  return {
    id: t.id,
    date: t.date,
    merchant: t.merchant,
    amount: t.amount,
    status: t.status,
    account_id: t.account_id,
  };
}
export function calendar(s: Store, m: string) {
  month.parse(m);
  const transferCategories = new Set(
    s
      .categories()
      .filter((c) => c.kind === "transfer")
      .map((c) => c.id),
  );
  const start = m + "-01",
    end = endOfMonth(m),
    today = householdToday(s),
    rows = schedules(s),
    overrides = exceptions(s);
  // A wider matching window makes neighboring-month matches mutually exclusive.
  const expanded = occurrences(
    rows,
    overrides,
    addDays(start, -40),
    addDays(end, 40),
  );
  const transactions = s.txs(addDays(start, -45), addDays(end, 45));
  const overrideMap = new Map(
    overrides.map((e) => [occurrenceId(e.schedule_id, e.scheduled_date), e]),
  );
  const reserved = new Set(
    overrides
      .filter((e) => e.match_mode === "manual" && e.transaction_id)
      .map((e) => e.transaction_id),
  );
  const candidates = new Map<string, Transaction[]>(),
    txUse = new Map<string, number>();
  for (const o of expanded) {
    const r = rows.find((r) => r.id === o.schedule_id)!,
      e = overrideMap.get(o.id);
    if (
      o.skipped ||
      o.kind === "allowance" ||
      !r.auto_match ||
      !merchantKey(r.merchant || r.name) ||
      (e && e.match_mode !== "auto")
    )
      continue;
    const hits = transactions.filter(
      (t) =>
        !reserved.has(t.id) &&
        eligible(t, o, transferCategories) &&
        merchantKey(t.merchant) === merchantKey(r.merchant || r.name) &&
        Math.abs(daysBetween(o.date, t.date)) <= 3 &&
        Math.abs(t.amount) === o.amount,
    );
    candidates.set(o.id, hits);
    for (const t of hits) txUse.set(t.id, (txUse.get(t.id) || 0) + 1);
  }
  const autoUsed = new Set<string>();
  const items = expanded
    .map((o) => {
      const e = overrideMap.get(o.id),
        hits = candidates.get(o.id) || [];
      const manual =
        e?.match_mode === "manual" && e.transaction_id
          ? s.tx(e.transaction_id)
          : undefined;
      const automatic =
        hits.length === 1 && txUse.get(hits[0].id) === 1 ? hits[0] : undefined;
      const tx =
        !o.skipped &&
        o.kind !== "allowance" &&
        manual &&
        eligible(manual, o, transferCategories)
          ? manual
          : !o.skipped && (!e || e.match_mode === "auto")
            ? automatic
            : undefined;
      if (tx && tx === automatic) autoUsed.add(tx.id);
      const status = o.skipped
        ? "skipped"
        : tx
          ? tx.status === "pending"
            ? "pending"
            : o.kind === "income"
              ? "received"
              : "paid"
          : o.kind === "allowance"
            ? "planned"
            : o.date < today
              ? "overdue"
              : o.date === today
                ? "due"
                : "upcoming";
      return {
        ...o,
        status,
        transaction: tx ? shortTx(tx) : null,
        match_source: tx ? (tx === manual ? "manual" : "automatic") : null,
        match_missing: !!e?.transaction_id && !tx,
        variance: tx ? Math.abs(tx.amount) - o.amount : null,
        exception: e || null,
      };
    })
    .filter((o) => o.date >= start && o.date <= end);
  return {
    month: m,
    today,
    items: items.map((o) => ({
      ...o,
      candidates:
        o.kind === "allowance"
          ? []
          : transactions
              .filter(
                (t) =>
                  eligible(t, o, transferCategories) &&
                  ((!reserved.has(t.id) && !autoUsed.has(t.id)) ||
                    t.id === o.transaction?.id),
              )
              .sort(
                (a, b) =>
                  Math.abs(daysBetween(o.date, a.date)) -
                  Math.abs(daysBetween(o.date, b.date)),
              )
              .slice(0, 40)
              .map(shortTx),
    })),
    totals: {
      income: items
        .filter((o) => !o.skipped && o.kind === "income")
        .reduce((n, o) => n + o.amount, 0),
      expenses: items
        .filter((o) => !o.skipped && !["income", "transfer"].includes(o.kind))
        .reduce((n, o) => n + o.amount, 0),
      transfers: items
        .filter((o) => !o.skipped && o.kind === "transfer")
        .reduce((n, o) => n + o.amount, 0),
      outstanding: items
        .filter(
          (o) =>
            !o.skipped &&
            !o.transaction &&
            !["income", "allowance"].includes(o.kind),
        )
        .reduce((n, o) => n + o.amount, 0),
    },
  };
}
export function saveException(s: Store, actor: string, input: unknown) {
  const b = exceptionSchema.parse(input);
  return s.atomic(() => {
    const r = schedules(s).find((r) => r.id === b.schedule_id);
    if (!r || !scheduledDates(r, b.scheduled_date, b.scheduled_date).length)
      throw new Error("Scheduled occurrence not found");
    const key = occurrenceId(r.id, b.scheduled_date),
      old = s.get<OccurrenceException>("recurring_exceptions", key);
    if ((old?.revision || 0) !== b.revision)
      throw new Error("Occurrence changed; reload before saving");
    if (b.match_mode === "manual") {
      const tx = b.transaction_id ? s.tx(b.transaction_id) : undefined;
      const o = occurrences([r], [], b.scheduled_date, b.scheduled_date)[0];
      const transferCategories = new Set(
        s
          .categories()
          .filter((c) => c.kind === "transfer")
          .map((c) => c.id),
      );
      if (
        r.kind === "allowance" ||
        b.skipped ||
        !tx ||
        !eligible(tx, o, transferCategories)
      )
        throw new Error("Choose an eligible transaction for this occurrence");
      if (
        exceptions(s).some(
          (e) =>
            occurrenceId(e.schedule_id, e.scheduled_date) !== key &&
            e.match_mode === "manual" &&
            e.transaction_id === tx.id,
        )
      )
        throw new Error("Transaction is already matched; unlink it first");
      // A manual selection may replace an automatic match only after explicitly unlinking it.
      const used = calendar(s, tx.date.slice(0, 7)).items.find(
        (o) => o.id !== key && o.transaction?.id === tx.id,
      );
      if (used)
        throw new Error("Transaction is already matched; unlink it first");
    }
    const value = {
      ...b,
      transaction_id: b.match_mode === "manual" ? b.transaction_id : null,
      revision: b.revision + 1,
    };
    s.put("recurring_exceptions", key, value);
    s.audit(actor, "recurring-occurrence", key, old, value);
    syncRecurringPlan(s, householdToday(s).slice(0, 7), actor);
    return value;
  });
}

export function recurringSuggestions(s: Store) {
  const transferCategories = new Set(
    s
      .categories()
      .filter((c) => c.kind === "transfer")
      .map((c) => c.id),
  );
  const today = householdToday(s),
    groups = new Map<string, Transaction[]>();
  for (const t of s.txs(addDays(today, -730), today)) {
    if (
      t.status !== "posted" ||
      !t.amount ||
      !merchantKey(t.merchant) ||
      t.transfer_id ||
      t.allocations.length !== 1 ||
      transferCategories.has(t.allocations[0].category_id)
    )
      continue;
    const key = `${t.account_id}|${merchantKey(t.merchant)}|${Math.sign(t.amount)}`;
    const group = groups.get(key) || [];
    if (group.length < 12) group.push(t);
    groups.set(key, group);
  }
  const existing = schedules(s),
    dismissed = new Set(
      s.all<{ id: string }>("recurring_dismissed").map((x) => x.id),
    );
  const results = [];
  for (const [key, all] of groups) {
    const rows = all.slice(0, 12).reverse();
    if (
      rows.length < 3 ||
      existing.some(
        (r) =>
          r.active &&
          (r.account_id === null || r.account_id === rows[0].account_id) &&
          merchantKey(r.merchant || r.name) === merchantKey(rows[0].merchant) &&
          (r.kind === "income") === rows[0].amount > 0,
      )
    )
      continue;
    const dates = rows.map((t) => t.date),
      gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
    let frequency: Schedule["frequency"] | undefined;
    let days: number[] = [];
    const months = new Map<string, number[]>();
    for (const date of dates)
      months.set(date.slice(0, 7), [
        ...(months.get(date.slice(0, 7)) || []),
        date === endOfMonth(date.slice(0, 7)) ? 31 : Number(date.slice(8)),
      ]);
    const completeMonths = [...months.values()].filter((ds) => ds.length === 2);
    if (
      completeMonths.length >= 2 &&
      [...months.values()].every((ds) => ds.length <= 2) &&
      gaps.every((g) => g >= 10 && g <= 20) &&
      Math.max(...completeMonths.map((ds) => ds[0])) -
        Math.min(...completeMonths.map((ds) => ds[0])) <=
        2 &&
      Math.max(...completeMonths.map((ds) => ds[1])) -
        Math.min(...completeMonths.map((ds) => ds[1])) <=
        2
    ) {
      frequency = "twice_monthly";
      days = completeMonths.at(-1)!;
    } else {
      const options = [
        ["weekly", 7, 2],
        ["biweekly", 14, 2],
        ["monthly", 30, 5],
        ["quarterly", 91, 8],
        ["yearly", 365, 8],
      ] as const;
      frequency = options.find(([, n, tolerance]) =>
        gaps.every((g) => Math.abs(g - n) <= tolerance),
      )?.[0];
      if (frequency === "monthly" || frequency === "quarterly")
        days = [
          dates.every((d) => d === endOfMonth(d.slice(0, 7)))
            ? 31
            : Number(dates.at(-1)!.slice(8)),
        ];
    }
    if (!frequency) continue;
    const amounts = rows.map((t) => Math.abs(t.amount)).sort((a, b) => a - b),
      amount = amounts[Math.floor(amounts.length / 2)];
    if (amounts.at(-1)! > Math.max(amount * 2, amount + 10000)) continue;
    const fingerprint = createHash("sha256")
      .update(key + "|" + frequency)
      .digest("hex")
      .slice(0, 24);
    if (dismissed.has(fingerprint)) continue;
    const last = rows.at(-1)!;
    results.push({
      id: fingerprint,
      name: last.merchant,
      kind: last.amount > 0 ? "income" : "bill",
      category_id: last.allocations[0].category_id,
      account_id: last.account_id,
      merchant: last.merchant,
      amount,
      estimated: amounts[0] !== amounts.at(-1),
      frequency,
      days,
      start_date: last.date,
      evidence: rows.map(shortTx),
      explanation: `${rows.length} posted transactions with ${frequency.replaceAll("_", " ")} spacing. Estimated amount uses the median; confirm the dates and category.`,
    });
  }
  return results.slice(0, 50);
}
export function dismissSuggestion(s: Store, actor: string, id: string) {
  s.put("recurring_dismissed", id, { id, at: new Date().toISOString() });
  s.audit(actor, "dismiss-recurring-suggestion", id);
}
