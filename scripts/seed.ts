import { Store, uid } from "../apps/api/db.ts";
import { hashPassword } from "../apps/api/security.ts";
import type { Transaction } from "../packages/shared/schema.ts";
import { shiftMonth, monthEnd } from "../packages/domain/index.ts";
export async function seed(s: Store, password: string) {
  if (s.txs().length || s.db.prepare("SELECT id FROM users LIMIT 1").get())
    throw new Error("Seed requires an empty installation");
  const pass = await hashPassword(password);
  s.atomic(() => {
    s.db
      .prepare("INSERT INTO users VALUES(?,?,?,?,?,0)")
      .run("demo-owner", "demo@budgetgremlin.local", "Demo", "owner", pass);
    const today = new Date().toISOString().slice(0, 10),
      current = today.slice(0, 7);
    s.put("settings", "household", {
      name: "The Gremlin household",
      currency: "USD",
      timezone: "America/Los_Angeles",
      include_pending: true,
      demo: true,
    });
    for (const [id, name, type, balance] of [
      ["checking", "Everyday Checking", "checking", 425080],
      ["savings", "Rainy Day Fund", "savings", 1820000],
      ["credit", "Cash+ Visa", "credit_card", -72460],
    ] as const)
      s.put("accounts", id, {
        id,
        name,
        type,
        opening_balance: balance,
        opening_date: shiftMonth(current + "-01", -12),
        include_budgets: true,
        include_reports: true,
        archived: false,
        balance,
        balance_at: new Date().toISOString(),
      });
    const merchants: [string, string, number][] = [
      ["Whole Foods Market", "groceries", -8437],
      ["Trader Joe’s", "groceries", -6284],
      ["Blue Bottle Coffee", "dining", -675],
      ["Sweetgreen", "dining", -1845],
      ["Shell", "transport", -4863],
      ["Target", "shopping", -7398],
      ["Netflix", "entertainment", -1599],
      ["City Utilities", "utilities", -14800],
      ["Spotify", "entertainment", -1199],
      ["Walgreens", "health", -2438],
      ["Local Market", "groceries", -3827],
      ["Chipotle", "dining", -1495],
    ];
    for (let back = 11; back >= 0; back--) {
      const m = shiftMonth(current + "-01", -back).slice(0, 7);
      let seq = 0;
      const add = (
        date: string,
        merchant: string,
        amount: number,
        category: string,
        account = "checking",
        status: "posted" | "pending" = "posted",
      ) => {
        if (date > today) return;
        const id = `seed-${m}-${seq++}`;
        const tx: Transaction = {
          id,
          account_id: account,
          date,
          merchant,
          raw_description: merchant.toUpperCase(),
          amount,
          status,
          notes: "",
          reviewed: back > 0 || seq % 4 !== 0,
          allocations: [
            {
              category_id: category,
              amount,
              tags: category === "dining" ? ["Everyday"] : [],
            },
          ],
          locked: false,
          revision: 1,
          source: "demo",
          classification_source: "rule",
          created_at: date + "T12:00:00Z",
        };
        s.saveTx(tx);
      };
      add(m + "-01", "Acme Studio · Payroll", 325000, "income");
      add(m + "-15", "Acme Studio · Payroll", 325000, "income");
      add(m + "-01", "Oak Street Apartments", 185000 * -1, "housing");
      for (let d = 2; d <= 28; d++) {
        const item = merchants[(d + back) % merchants.length];
        add(
          m + "-" + String(d).padStart(2, "0"),
          item[0],
          item[2] - (back % 3) * 130,
          item[1],
          d % 3 ? "credit" : "checking",
        );
      }
      add(m + "-10", "Credit card payment", -90000, "transfer");
      add(m + "-10", "Payment received", 90000, "transfer", "credit");
      if (back === 0) {
        add(today, "Trader Joe’s", -5634, "groceries", "credit", "pending");
        add(today, "Pending coffee", -725, "dining", "credit", "pending");
      }
      s.put("budgets", m, {
        month: m,
        expected_income: 650000,
        lines: [
          ["housing", 185000],
          ["groceries", 65000],
          ["dining", 35000],
          ["transport", 22000],
          ["utilities", 24000],
          ["shopping", 30000],
          ["health", 15000],
          ["entertainment", 10000],
          ["travel", 25000],
        ].map(([category_id, amount]) => ({
          category_id,
          amount,
          rollover: false,
          opening: 0,
        })),
      });
      for (const account_id of ["checking", "savings", "credit"])
        s.put("coverage", account_id + ":" + m, {
          account_id,
          start: m + "-01",
          end: back ? monthEnd(m) : today,
          confirmed: true,
          source: "synthetic",
        });
    }
    s.put("rules", "coffee-rule", {
      id: "coffee-rule",
      name: "Coffee & cafés",
      priority: 10,
      enabled: true,
      mode: "any",
      predicates: [{ field: "merchant", op: "contains", value: "coffee" }],
      category_id: "dining",
      tags: ["Everyday"],
      reviewed: false,
    });
    s.audit("demo-owner", "seed", "demo");
  });
}
