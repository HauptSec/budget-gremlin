import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cents,
  delta,
  period,
  classify,
  budgetView,
  report,
  csvCell,
  shiftMonth,
  safeSum,
} from "../packages/domain/index.ts";
import type {
  Transaction,
  Category,
  Budget,
  Rule,
} from "../packages/shared/schema.ts";
const categories: Category[] = [
  {
    id: "food",
    name: "Groceries",
    group_name: "Living",
    kind: "expense",
    color: "#000000",
    archived: false,
  },
  {
    id: "dining",
    name: "Dining",
    group_name: "Living",
    kind: "expense",
    color: "#000000",
    archived: false,
  },
  {
    id: "other",
    name: "Other",
    group_name: "Other",
    kind: "expense",
    color: "#000000",
    archived: false,
  },
  {
    id: "income",
    name: "Income",
    group_name: "Income",
    kind: "income",
    color: "#000000",
    archived: false,
  },
  {
    id: "transfer",
    name: "Transfer",
    group_name: "Transfers",
    kind: "transfer",
    color: "#000000",
    archived: false,
  },
];
const tx = (
  id: string,
  amount: number,
  category = "food",
  extra: Partial<Transaction> = {},
): Transaction => ({
  id,
  account_id: "checking",
  date: "2026-09-15",
  merchant: "Market",
  raw_description: "MARKET",
  amount,
  status: "posted",
  notes: "",
  reviewed: false,
  allocations: [{ category_id: category, amount, tags: [] }],
  locked: false,
  revision: 1,
  source: "csv",
  classification_source: "uncategorized",
  created_at: "2026-09-15T00:00Z",
  ...extra,
});
test("money parses exactly without floating-point rounding or invalid precision", () => {
  assert.equal(cents("1,234.56"), 123456);
  assert.equal(cents("(12.10)"), -1210);
  assert.equal(cents("-0.01"), -1);
  assert.throws(() => cents("12.345"));
  assert.throws(() => cents("Infinity"));
  assert.throws(() => cents("100000000000000"));
  assert.throws(() => safeSum([Number.MAX_SAFE_INTEGER, 1]));
});
test("comparison windows align calendar positions across month lengths and leap years", () => {
  assert.equal(shiftMonth("2024-03-31", -1), "2024-02-29");
  assert.deepEqual(period("ytd", "2024-02-29"), {
    start: "2024-01-01",
    end: "2024-02-29",
    priorStart: "2023-01-01",
    priorEnd: "2023-02-28",
  });
  assert.deepEqual(period("qtd", "2026-09-17"), {
    start: "2026-07-01",
    end: "2026-09-17",
    priorStart: "2026-04-01",
    priorEnd: "2026-06-17",
  });
  assert.deepEqual(
    period("custom", "2026-09-17", { start: "2026-03-01", end: "2026-03-31" }),
    {
      start: "2026-03-01",
      end: "2026-03-31",
      priorStart: "2026-01-29",
      priorEnd: "2026-02-28",
    },
  );
});
test("percentage changes treat zero and crossing signs explicitly", () => {
  assert.deepEqual(delta(12000, 10000), {
    amount: 2000,
    percent: 20,
    label: null,
  });
  assert.equal(delta(100, 0).label, "New");
  assert.equal(delta(0, 0).percent, 0);
  assert.equal(delta(-20, 100).label, "N/A");
});
test("refunds, transfers, pending and split drill-down sum exactly", () => {
  const purchase = tx("a", -10000, "food", {
    allocations: [
      { category_id: "food", amount: -6000, tags: [] },
      { category_id: "dining", amount: -4000, tags: [] },
    ],
  });
  const rows = [
    purchase,
    tx("refund", 2000),
    tx("cardpayment", -10000, "transfer"),
    tx("received", 10000, "transfer"),
    tx("pending", -5500, "food", { status: "pending" }),
  ];
  const r = report(rows, categories, {
    start: "2026-09-01",
    end: "2026-09-30",
  });
  assert.equal(r.spending, 8000);
  assert.equal(r.income, 0);
  assert.equal(r.rows.length, 3);
  assert.equal(-r.rows.reduce((n, a) => n + a.amount, 0), r.spending);
  assert.equal(
    report(rows, categories, {
      start: "2026-09-01",
      end: "2026-09-30",
      category: "food",
    }).spending,
    4000,
  );
});
test("budget golden example and signed rollover", () => {
  const plan: Budget = {
    month: "2026-09",
    expected_income: 100000,
    lines: [
      { category_id: "food", amount: 40000, opening: 5000, rollover: true },
      { category_id: "dining", amount: 15000, opening: 0, rollover: false },
    ],
  };
  const rows = [
    tx("food", -20000),
    tx("pending", -2000, "food", { status: "pending" }),
    tx("dining", -17000, "dining"),
    tx("other", -3000, "other"),
  ];
  const view = budgetView(plan, [], rows, categories, "2026-09-17");
  assert.equal(view.left, 18000);
  assert.equal(view.unallocated, 45000);
  assert.equal(view.lines[0].remaining, 23000);
  assert.equal(view.lines[1].remaining, -2000);
  assert.equal(
    budgetView(plan, [], rows, categories, "2026-09-17", false).left,
    20000,
  );
  const next = { ...plan, month: "2026-10" };
  assert.equal(
    budgetView(next, [plan], rows, categories, "2026-10-10").lines[0].opening,
    25000,
  );
  assert.equal(budgetView(plan, [], rows, categories, "2026-10-10").pending, 0);
});
test("old pending holds stay in current commitments but pending refunds do not increase budget", () => {
  const plan: Budget = {
    month: "2026-09",
    expected_income: 0,
    lines: [
      { category_id: "food", amount: 10000, opening: 0, rollover: false },
    ],
  };
  const rows = [
    tx("hold", -3000, "food", { status: "pending", date: "2026-08-31" }),
    tx("refund", 5000, "food", { status: "pending" }),
  ];
  assert.equal(budgetView(plan, [], rows, categories, "2026-09-17").left, 7000);
});
test("manual override wins, ordered rules first-match deterministically", () => {
  const rule: Rule = {
    id: "a",
    name: "market",
    priority: 1,
    enabled: true,
    mode: "all",
    predicates: [{ field: "merchant", op: "contains", value: "market" }],
    category_id: "dining",
    tags: ["test"],
    reviewed: true,
  };
  const original = tx("a", -500);
  assert.equal(
    classify({ ...original, locked: true }, [rule]).allocations[0].category_id,
    "food",
  );
  assert.equal(
    classify(original, [
      { ...rule, id: "b", priority: 2, category_id: "other" },
      rule,
    ]).allocations[0].category_id,
    "dining",
  );
  assert.equal(
    classify(original, [], "other").classification_source,
    "merchant",
  );
});
test("CSV escapes formulas, quotes and line breaks", () => {
  assert.equal(csvCell("=SUM(A1:A2)"), `"'=SUM(A1:A2)"`);
  assert.equal(csvCell('hello "world"'), `"hello ""world"""`);
  assert.equal(csvCell(" \t+malicious"), `"' \t+malicious"`);
});

test("confirmed adjacent coverage intervals combine, gaps remain unknown", async () => {
  const { coversRange } = await import("../packages/domain/index.ts");
  assert.equal(
    coversRange(
      [
        { start: "2026-01-01", end: "2026-01-31" },
        { start: "2026-02-01", end: "2026-02-28" },
      ],
      "2026-01-01",
      "2026-02-28",
    ),
    true,
  );
  assert.equal(
    coversRange(
      [
        { start: "2026-01-01", end: "2026-01-30" },
        { start: "2026-02-01", end: "2026-02-28" },
      ],
      "2026-01-01",
      "2026-02-28",
    ),
    false,
  );
});
