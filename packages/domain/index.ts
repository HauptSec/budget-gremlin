import type {
  Allocation,
  Budget,
  Category,
  Filters,
  Rule,
  Transaction,
} from "../shared/schema.ts";
export function cents(value: string): number {
  let s = value.trim().replace(/[$,\s]/g, "");
  if (/^\(.*\)$/.test(s)) s = "-" + s.slice(1, -1);
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s))
    throw new Error("Use a valid amount with at most two decimal places");
  const neg = s.startsWith("-");
  s = s.replace(/^[+-]/, "");
  const [a, b = ""] = s.split(".");
  const n = BigInt(a) * 100n + BigInt(b.padEnd(2, "0"));
  if (n > 100_000_000_000n) throw new Error("Amount exceeds limit");
  return Number(neg ? -n : n);
}
export function safeSum(values: number[]) {
  const v = values.reduce((a, b) => a + BigInt(b), 0n);
  if (
    v > BigInt(Number.MAX_SAFE_INTEGER) ||
    v < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("Total exceeds safe bounds");
  return Number(v);
}
export function delta(current: number, prior: number) {
  const amount = current - prior;
  return {
    amount,
    percent:
      prior === 0
        ? current === 0
          ? 0
          : null
        : current * prior < 0
          ? null
          : (amount / Math.abs(prior)) * 100,
    label:
      prior === 0 && current !== 0 ? "New" : current * prior < 0 ? "N/A" : null,
  };
}
export function plusDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function shiftMonth(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
export function monthEnd(m: string) {
  return plusDays(shiftMonth(m + "-01", 1), -1);
}
export function period(
  preset: string,
  today: string,
  custom?: { start: string; end: string },
) {
  const m = today.slice(0, 7),
    y = today.slice(0, 4);
  let start = m + "-01",
    end = today,
    priorStart = shiftMonth(start, -1),
    priorEnd = shiftMonth(end, -1);
  if (preset === "month") {
    end = monthEnd(m);
    priorEnd = monthEnd(priorStart.slice(0, 7));
  }
  if (preset === "previous-month") {
    start = shiftMonth(start, -1);
    end = monthEnd(start.slice(0, 7));
    priorStart = shiftMonth(start, -1);
    priorEnd = monthEnd(priorStart.slice(0, 7));
  }
  if (["qtd", "quarter"].includes(preset)) {
    start = `${y}-${String(Math.floor((+today.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
    end = preset === "quarter" ? plusDays(shiftMonth(start, 3), -1) : today;
    priorStart = shiftMonth(start, -3);
    priorEnd =
      preset === "quarter" ? plusDays(start, -1) : shiftMonth(today, -3);
  }
  if (preset === "previous-quarter") {
    const q = `${y}-${String(Math.floor((+today.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
    start = shiftMonth(q, -3);
    end = plusDays(q, -1);
    priorStart = shiftMonth(start, -3);
    priorEnd = plusDays(start, -1);
  }
  if (["ytd", "year", "previous-year"].includes(preset)) {
    start = y + "-01-01";
    end = preset === "year" ? y + "-12-31" : today;
    if (preset === "previous-year") {
      start = String(+y - 1) + "-01-01";
      end = String(+y - 1) + "-12-31";
    }
    priorStart = shiftMonth(start, -12);
    priorEnd = shiftMonth(end, -12);
  }
  if (/^trailing-(3|6|12)$/.test(preset)) {
    const n = +preset.split("-")[1];
    end = plusDays(m + "-01", -1);
    start = shiftMonth(m + "-01", -n);
    priorStart = shiftMonth(start, -n);
    priorEnd = plusDays(start, -1);
  }
  if (preset === "custom" && custom) {
    ({ start, end } = custom);
    const days =
      Math.round(
        (+new Date(end + "T12:00Z") - +new Date(start + "T12:00Z")) / 86400000,
      ) + 1;
    priorEnd = plusDays(start, -1);
    priorStart = plusDays(start, -days);
  }
  return { start, end, priorStart, priorEnd };
}
export function matches(rule: Rule, tx: Transaction) {
  const values = rule.predicates.map((p) => {
    const v =
      p.field === "direction"
        ? tx.amount < 0
          ? "outflow"
          : "inflow"
        : tx[p.field];
    if (p.op === "between")
      return (
        typeof v === "number" &&
        v >= (p.min ?? -Infinity) &&
        v <= (p.max ?? Infinity)
      );
    const a = String(v).toLowerCase(),
      b = p.value.toLowerCase();
    return p.op === "contains"
      ? a.includes(b)
      : p.op === "prefix"
        ? a.startsWith(b)
        : a === b;
  });
  return rule.mode === "all" ? values.every(Boolean) : values.some(Boolean);
}
export function classify(
  tx: Transaction,
  rules: Rule[],
  merchantDefault?: string,
  sourceSuggestion?: string,
) {
  if (tx.locked) return tx;
  const rule = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .find((r) => matches(r, tx));
  if (rule)
    return {
      ...tx,
      merchant: rule.merchant || tx.merchant,
      reviewed: rule.reviewed,
      allocations: [
        { category_id: rule.category_id, amount: tx.amount, tags: rule.tags },
      ],
      classification_source: "rule",
      rule_id: rule.id,
    };
  const category = merchantDefault || sourceSuggestion;
  return category
    ? {
        ...tx,
        allocations: [{ category_id: category, amount: tx.amount, tags: [] }],
        classification_source: merchantDefault ? "merchant" : "source",
      }
    : tx;
}
export function allocationRows(
  txs: Transaction[],
  categories: Category[],
  f: Filters,
) {
  const cats = new Map(categories.map((c) => [c.id, c]));
  return txs
    .filter(
      (t) =>
        !t.removed &&
        t.status === "posted" &&
        t.date >= f.start &&
        t.date <= f.end &&
        (!f.account || t.account_id === f.account) &&
        (!f.merchant ||
          t.merchant.toLowerCase().includes(f.merchant.toLowerCase())) &&
        (f.reviewed === undefined || t.reviewed === (f.reviewed === "true")),
    )
    .flatMap((t) =>
      t.allocations
        .filter((a) => !f.category || a.category_id === f.category)
        .filter((a) => !f.tag || a.tags.includes(f.tag))
        .map((a) => ({
          transaction_id: t.id,
          date: t.date,
          merchant: t.merchant,
          account_id: t.account_id,
          category_id: a.category_id,
          category: cats.get(a.category_id)?.name || "Uncategorized",
          group: cats.get(a.category_id)?.group_name || "Other",
          kind: cats.get(a.category_id)?.kind || "expense",
          amount: a.amount,
          tags: a.tags,
        })),
    )
    .filter((r) => r.kind !== "transfer" && (!f.group || r.group === f.group));
}
export function report(txs: Transaction[], categories: Category[], f: Filters) {
  const rows = allocationRows(txs, categories, f);
  const income = safeSum(
      rows.filter((r) => r.kind === "income").map((r) => r.amount),
    ),
    spending = -safeSum(
      rows.filter((r) => r.kind === "expense").map((r) => r.amount),
    );
  const by = (field: "category_id" | "merchant" | "date") => {
    const map = new Map<string, number>();
    for (const r of rows.filter((r) => r.kind === "expense")) {
      const key = field === "date" ? r.date.slice(0, 7) : r[field];
      map.set(key, safeSum([map.get(key) || 0, -r.amount]));
    }
    return [...map]
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => b.amount - a.amount);
  };
  return {
    income,
    spending,
    net: income - spending,
    rows,
    byCategory: by("category_id"),
    byMerchant: by("merchant"),
    monthly: by("date").sort((a, b) => a.key.localeCompare(b.key)),
  };
}
export function budgetView(
  plan: Budget,
  history: Budget[],
  txs: Transaction[],
  categories: Category[],
  today: string,
  includePending = true,
) {
  const expense = new Set(
    categories.filter((c) => c.kind === "expense").map((c) => c.id),
  );
  const month = plan.month;
  const spent = (cat: string, m: string) =>
    -safeSum(
      txs
        .filter(
          (t) => !t.removed && t.status === "posted" && t.date.startsWith(m),
        )
        .flatMap((t) =>
          t.allocations
            .filter((a) => a.category_id === cat)
            .map((a) => a.amount),
        ),
    );
  const pending = (cat: string) =>
    includePending && month === today.slice(0, 7)
      ? -safeSum(
          txs
            .filter(
              (t) => !t.removed && t.status === "pending" && t.date <= today,
            )
            .flatMap((t) =>
              t.allocations
                .filter((a) => a.category_id === cat && a.amount < 0)
                .map((a) => a.amount),
            ),
        )
      : 0;
  const carry = (cat: string) => {
    const prior = [...history]
      .filter((b) => b.month < month)
      .sort((a, b) => a.month.localeCompare(b.month));
    let value = 0,
      prev = "";
    for (const p of prior) {
      const line = p.lines.find((l) => l.category_id === cat);
      if (!line?.rollover) {
        value = 0;
        prev = "";
        continue;
      }
      const continuous =
        prev && shiftMonth(prev + "-01", 1).slice(0, 7) === p.month;
      value =
        (continuous ? value : line.opening) + line.amount - spent(cat, p.month);
      prev = p.month;
    }
    const line = plan.lines.find((l) => l.category_id === cat)!;
    return line.rollover
      ? prev && shiftMonth(prev + "-01", 1).slice(0, 7) === month
        ? value
        : line.opening
      : 0;
  };
  const lines = plan.lines
    .filter((l) => expense.has(l.category_id))
    .map((l) => {
      const opening = carry(l.category_id),
        posted = spent(l.category_id, month),
        commitments = pending(l.category_id);
      return {
        ...l,
        opening,
        posted,
        pending: commitments,
        remaining: l.amount + opening - posted - commitments,
      };
    });
  const budgeted = new Set(lines.map((l) => l.category_id));
  const unbudgeted = safeSum(
    [...expense]
      .filter((c) => !budgeted.has(c))
      .map((c) => spent(c, month) + pending(c)),
  );
  return {
    month,
    expected_income: plan.expected_income,
    lines,
    unbudgeted,
    left: safeSum(lines.map((l) => l.remaining)) - unbudgeted,
    unallocated: plan.expected_income - safeSum(lines.map((l) => l.amount)),
    pending: safeSum([...expense].map(pending)),
  };
}
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function csvReport(rows: ReturnType<typeof allocationRows>) {
  return [
    ["Date", "Merchant", "Category", "Amount", "Account", "Tags"]
      .map(csvCell)
      .join(","),
    ...rows.map((r) =>
      [
        r.date,
        r.merchant,
        r.category,
        (r.amount / 100).toFixed(2),
        r.account_id,
        r.tags.join(";"),
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\r\n");
}

/** Adjacent confirmed intervals form continuous coverage; observed activity alone never does. */
export function coversRange(
  intervals: { start: string; end: string }[],
  start: string,
  end: string,
) {
  let cursor = start;
  for (const i of [...intervals].sort((a, b) =>
    a.start.localeCompare(b.start),
  )) {
    if (i.end < cursor) continue;
    if (i.start > cursor) return false;
    cursor = plusDays(i.end, 1);
    if (cursor > end) return true;
  }
  return false;
}
