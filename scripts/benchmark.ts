import { performance } from "node:perf_hooks";
import os from "node:os";
import { Store } from "../apps/api/db.ts";
import { report } from "../packages/domain/index.ts";
const store = new Store(":memory:");
store.put("accounts", "bench", {
  id: "bench",
  name: "Synthetic",
  type: "checking",
  opening_balance: 0,
  opening_date: "2025-01-01",
  include_budgets: true,
  include_reports: true,
  archived: false,
});
store.atomic(() => {
  for (let i = 0; i < 100000; i++) {
    const date = `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
    store.saveTx({
      id: "bench-" + i,
      account_id: "bench",
      date,
      merchant: "Merchant " + (i % 20),
      raw_description: "Synthetic",
      amount: -1001,
      status: "posted",
      notes: "",
      reviewed: true,
      allocations: [{ category_id: "groceries", amount: -1001, tags: [] }],
      locked: false,
      revision: 1,
      source: "fixture",
      classification_source: "rule",
      created_at: date + "T12:00:00Z",
    });
  }
});
const times: number[] = [];
for (let i = 0; i < 5; i++) {
  const start = performance.now();
  const result = report(
    store.txs("2025-01-01", "2025-12-31"),
    store.categories(),
    { start: "2025-01-01", end: "2025-12-31" },
  );
  if (result.spending !== 100100000)
    throw new Error("Benchmark totals mismatch");
  JSON.stringify(result);
  times.push(performance.now() - start);
}
console.log(
  JSON.stringify(
    {
      hardware: os.cpus()[0]?.model,
      platform: os.platform(),
      arch: os.arch(),
      transactions: 100000,
      queryAggregateAndSerializeMs: times.map((n) => Math.round(n)),
      maxMs: Math.round(Math.max(...times)),
      target: "under 1000ms on target host; this run is local evidence only",
    },
    null,
    2,
  ),
);
store.close();
