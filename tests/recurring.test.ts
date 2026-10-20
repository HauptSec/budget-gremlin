import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../apps/api/db.ts";
import { createServer } from "../apps/api/server.ts";
import { hashPassword } from "../apps/api/security.ts";
import {
  addDays,
  endOfMonth,
  merchantKey,
  occurrences,
  planWithRecurring,
  scheduleSchema,
  scheduledDates,
  type Schedule,
} from "../packages/recurring/index.ts";
import {
  calendar,
  dismissSuggestion,
  householdToday,
  migrateSchedules,
  monthItems,
  recurringSuggestions,
  saveException,
  saveSchedule,
  syncRecurringPlan,
} from "../apps/api/recurring.ts";
import type { Transaction } from "../packages/shared/schema.ts";

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return scheduleSchema.parse({
    id: "bill",
    name: "Example Utility",
    kind: "bill",
    amount: 10000,
    category_id: "utilities",
    frequency: "monthly",
    start_date: "2026-01-01",
    days: [15],
    ...overrides,
  });
}
function fixture() {
  const s = new Store(":memory:");
  s.put("accounts", "checking", {
    id: "checking",
    name: "Checking",
    type: "checking",
    opening_balance: 0,
    opening_date: "2020-01-01",
    include_budgets: true,
    include_reports: true,
    archived: false,
  });
  return s;
}
function tx(
  s: Store,
  id: string,
  date: string,
  amount = -10000,
  merchant = "Example Utility",
  extra: Partial<Transaction> = {},
) {
  const t: Transaction = {
    id,
    date,
    amount,
    merchant,
    account_id: "checking",
    status: "posted",
    notes: "",
    reviewed: false,
    locked: false,
    raw_description: merchant,
    revision: 1,
    source: "manual",
    classification_source: "manual",
    allocations: [
      { category_id: amount > 0 ? "income" : "utilities", amount, tags: [] },
    ],
    created_at: date + "T12:00:00Z",
    ...extra,
  };
  s.saveTx(t);
  return t;
}
test("calendar recurrence respects short months, leap years, anchors, bounds and DST", () => {
  assert.deepEqual(
    scheduledDates(schedule({ days: [31] }), "2026-02-01", "2026-03-31"),
    ["2026-02-28", "2026-03-31"],
  );
  assert.deepEqual(
    scheduledDates(
      schedule({ frequency: "twice_monthly", days: [30, 31] }),
      "2026-02-01",
      "2026-02-28",
    ),
    ["2026-02-28"],
  );
  assert.deepEqual(
    scheduledDates(
      schedule({ frequency: "biweekly", days: [], start_date: "2026-03-01" }),
      "2026-03-01",
      "2026-04-01",
    ),
    ["2026-03-01", "2026-03-15", "2026-03-29"],
  );
  assert.deepEqual(
    scheduledDates(
      schedule({
        frequency: "weekly",
        days: [],
        start_date: "2026-03-01",
        end_date: "2026-03-14",
      }),
      "2026-03-01",
      "2026-04-01",
    ),
    ["2026-03-01", "2026-03-08"],
  );
  assert.deepEqual(
    scheduledDates(
      schedule({
        frequency: "quarterly",
        days: [31],
        start_date: "2026-01-31",
      }),
      "2026-01-01",
      "2026-07-31",
    ),
    ["2026-01-31", "2026-04-30", "2026-07-31"],
  );
  assert.deepEqual(
    scheduledDates(
      schedule({ frequency: "yearly", days: [], start_date: "2024-02-29" }),
      "2025-01-01",
      "2026-12-31",
    ),
    ["2025-02-28", "2026-02-28"],
  );
  assert.deepEqual(
    scheduledDates(
      schedule({ frequency: "once", days: [], start_date: "2026-06-20" }),
      "2026-01-01",
      "2026-12-31",
    ),
    ["2026-06-20"],
  );
  assert.deepEqual(
    scheduledDates(
      schedule({ start_date: "2026-06-20", days: [15] }),
      "2026-06-01",
      "2026-06-30",
    ),
    [],
  );
  assert.throws(() => schedule({ frequency: "twice_monthly", days: [15, 15] }));
});
test("budget floors are idempotent, honor start date, income and transfers, and preserve manual allocations", () => {
  const rows = occurrences(
    [
      schedule({ start_date: "2026-06-15", frequency: "weekly", days: [] }),
      schedule({
        id: "pay",
        kind: "income",
        category_id: "income",
        amount: 50000,
        start_date: "2026-06-15",
        frequency: "biweekly",
        days: [],
      }),
      schedule({
        id: "cc",
        kind: "transfer",
        amount: 99999,
        category_id: "transfer",
      }),
    ],
    [],
    "2026-06-01",
    "2026-06-30",
  );
  const base = {
    month: "2026-06",
    expected_income: 40000,
    lines: [
      { category_id: "utilities", amount: 40000, rollover: true, opening: 500 },
    ],
  };
  const plan = planWithRecurring(base, rows);
  assert.equal(plan.expected_income, 100000);
  assert.equal(plan.lines[0].amount, 40000);
  assert.equal(plan.lines[0].opening, 500);
  assert.equal(plan.lines.length, 1);
  assert.deepEqual(planWithRecurring(plan, rows), plan);
  assert.deepEqual(base.lines[0].amount, 40000);
});
test("saving a schedule updates current and opened future plans without creating transactions or reducing past budgets", () => {
  const s = fixture();
  try {
    const m = householdToday(s).slice(0, 7);
    const saved = saveSchedule(s, "owner", schedule({ start_date: m + "-01" }));
    assert.equal(s.get<any>("budgets", m)?.lines[0].amount, 10000);
    assert.equal(s.txs().length, 0);
    assert.throws(
      () => saveSchedule(s, "owner", { ...saved, revision: 0 }),
      /changed/,
    );
    assert.equal(syncRecurringPlan(s, "2029-06").lines[0].amount, 10000);
    assert.equal(syncRecurringPlan(s, "2020-01").lines.length, 0);
    saveSchedule(s, "owner", { ...saved, amount: 5000 });
    assert.equal(s.get<any>("budgets", m)?.lines[0].amount, 10000);
  } finally {
    s.close();
  }
});
test("automatic matches distinguish pending, paid and ambiguous cases without altering the ledger", () => {
  const s = fixture();
  try {
    s.put("recurring", "bill", schedule({ account_id: "checking" }));
    tx(s, "payment", "2026-02-16", -10000, "EXAMPLE UTILITY", {
      status: "pending",
    });
    let o = calendar(s, "2026-02").items[0];
    assert.equal(o.status, "pending");
    assert.equal(o.match_source, "automatic");
    s.saveTx({ ...s.tx("payment")!, status: "posted" });
    assert.equal(calendar(s, "2026-02").items[0].status, "paid");
    s.put(
      "recurring",
      "other",
      schedule({ id: "other", account_id: "checking" }),
    );
    assert.ok(calendar(s, "2026-02").items.every((o) => !o.transaction));
    s.delete("recurring", "other");
    tx(s, "duplicate", "2026-02-14");
    assert.equal(calendar(s, "2026-02").items[0].transaction, null);
    assert.equal(s.txs().length, 2);
    assert.equal(s.tx("payment")?.reviewed, false);
  } finally {
    s.close();
  }
});
test("one-occurrence rescheduling crosses month boundaries; manual matching, unlinking, skipping and stale edits are safe", () => {
  const s = fixture();
  try {
    s.put(
      "recurring",
      "bill",
      schedule({ days: [31], estimated: true, account_id: "checking" }),
    );
    tx(s, "variable", "2026-02-02", -12300);
    const e = saveException(s, "owner", {
      schedule_id: "bill",
      scheduled_date: "2026-01-31",
      date: "2026-02-02",
      match_mode: "manual",
      transaction_id: "variable",
    });
    assert.equal(calendar(s, "2026-01").items.length, 0);
    const moved = calendar(s, "2026-02").items.find(
      (o) => o.scheduled_date === "2026-01-31",
    )!;
    assert.equal(moved.status, "paid");
    assert.equal(moved.variance, 2300);
    assert.throws(
      () => saveException(s, "owner", { ...e, revision: 0 }),
      /changed/,
    );
    assert.throws(
      () =>
        saveException(s, "owner", {
          schedule_id: "bill",
          scheduled_date: "2026-02-28",
          match_mode: "manual",
          transaction_id: "variable",
        }),
      /already matched/,
    );
    const unlinked = saveException(s, "owner", {
      ...e,
      match_mode: "none",
      transaction_id: null,
    });
    assert.equal(
      calendar(s, "2026-02").items.find(
        (o) => o.scheduled_date === "2026-01-31",
      )!.transaction,
      null,
    );
    saveException(s, "owner", { ...unlinked, skipped: true });
    assert.equal(
      calendar(s, "2026-02").items.find(
        (o) => o.scheduled_date === "2026-01-31",
      )!.status,
      "skipped",
    );
    assert.equal(monthItems(s, "2026-02").filter((o) => !o.skipped).length, 1);
    assert.equal(s.txs().length, 1);
  } finally {
    s.close();
  }
});
test("recurring suggestions detect weekly and monthly history, support dismissal, and exclude transfers and existing schedules", () => {
  const s = fixture();
  try {
    const today = householdToday(s),
      m = today.slice(0, 7);
    for (let n = 0; n < 4; n++)
      tx(s, "weekly" + n, addDays(today, -n * 7), -4200, "Weekly fixture");
    tx(s, "transfer", today, -4200, "Weekly fixture", { transfer_id: "pair" });
    let rows = recurringSuggestions(s);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].frequency, "weekly");
    assert.equal(rows[0].evidence.length, 4);
    dismissSuggestion(s, "owner", rows[0].id);
    assert.equal(recurringSuggestions(s).length, 0);
    s.delete("recurring_dismissed", rows[0].id);
    saveSchedule(
      s,
      "owner",
      schedule({
        name: "Weekly fixture",
        frequency: "weekly",
        days: [],
        start_date: today,
        amount: 4200,
      }),
    );
    assert.equal(recurringSuggestions(s).length, 0);
    for (let n = 0; n < 3; n++) {
      const d = new Date(m + "-01T12:00:00Z");
      d.setUTCMonth(d.getUTCMonth() - n);
      tx(
        s,
        "monthly" + n,
        d.toISOString().slice(0, 10),
        -5000,
        "Monthly fixture",
      );
    }
    rows = recurringSuggestions(s);
    assert.equal(rows[0].frequency, "monthly");
  } finally {
    s.close();
  }
});
test("legacy recurring records migrate once and preserve a stable start date", () => {
  const s = fixture();
  try {
    s.put("recurring", "old", {
      id: "old",
      name: "Legacy",
      kind: "bill",
      category_id: "utilities",
      amount: 1000,
      due_day: 31,
      active: true,
    });
    migrateSchedules(s);
    const first = s.get("recurring", "old");
    migrateSchedules(s);
    assert.deepEqual(s.get("recurring", "old"), first);
    assert.equal(first?.frequency, "monthly");
    assert.deepEqual(first?.days, [31]);
  } finally {
    s.close();
  }
});
test("recurring API requires login/CSRF and rejects conflicting revisions and wrong category types", async () => {
  const s = fixture();
  s.db
    .prepare("INSERT INTO users VALUES(?,?,?,?,?,0)")
    .run(
      "owner",
      "fixture@example.com",
      "Fixture",
      "owner",
      await hashPassword("fixture-password"),
    );
  const app = await createServer(s, { serveStatic: false });
  try {
    assert.equal(
      (await app.inject({ method: "GET", url: "/api/v1/recurring" }))
        .statusCode,
      401,
    );
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "fixture@example.com", password: "fixture-password" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0],
      csrf = login.json().csrf;
    const call = (payload: any, token = csrf) =>
      app.inject({
        method: "POST",
        url: "/api/v1/recurring",
        headers: { cookie, "x-csrf-token": token },
        payload,
      });
    assert.equal((await call(schedule(), "bad")).statusCode, 403);
    assert.equal((await call(schedule({ kind: "income" }))).statusCode, 400);
    const response = await call(schedule());
    assert.equal(response.statusCode, 200, response.body);
    assert.equal((await call(schedule())).statusCode, 409);
    const m = householdToday(s).slice(0, 7),
      view = await app.inject({
        method: "GET",
        url: "/api/v1/calendar/" + m,
        headers: { cookie },
      });
    assert.equal(view.statusCode, 200);
    assert.equal(view.json().items.length, 1);
    assert.equal(endOfMonth(m).length, 10);
  } finally {
    await app.close();
    s.close();
  }
});

test("twice-monthly suggestions preserve month-end paydays across February", () => {
  const s = fixture();
  try {
    const now = householdToday(s),
      year = Number(now.slice(0, 4)) - (Number(now.slice(5, 7)) < 4 ? 1 : 0);
    const dates = [
      `${year}-02-15`,
      endOfMonth(`${year}-02`),
      `${year}-03-15`,
      endOfMonth(`${year}-03`),
    ];
    dates.forEach((date, i) =>
      tx(s, `pay${i}`, date, 100000, "Payday fixture"),
    );
    const row = recurringSuggestions(s)[0];
    assert.equal(row.frequency, "twice_monthly");
    assert.deepEqual(row.days, [15, 31]);
  } finally {
    s.close();
  }
});

test("merchant matching preserves international names and rejects empty keys", () => {
  assert.equal(merchantKey("Ｃafé Market!"), "cafémarket");
  assert.notEqual(merchantKey("東京"), merchantKey("大阪"));
  assert.equal(merchantKey("---"), "");
});
