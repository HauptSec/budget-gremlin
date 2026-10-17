import { parse } from "csv-parse/sync";
import { cents, classify } from "../../packages/domain/index.ts";
import {
  day,
  type Mapping,
  type Transaction,
} from "../../packages/shared/schema.ts";
import { Store, uid } from "./db.ts";
import { hash } from "./security.ts";
export type ImportRow = {
  row: number;
  date: string;
  merchant: string;
  amount: number;
  reference: string;
  error?: string;
  candidates: string[];
};
export function previewImport(
  store: Store,
  account: string,
  csv: string,
  m: Mapping,
) {
  if (!store.get("accounts", account))
    throw new Error("Select an existing account");
  const data = parse(csv, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
    max_record_size: 100000,
  }) as Record<string, string>[];
  if (data.length > 50000) throw new Error("Maximum 50,000 rows");
  if (!m.amount && !m.debit && !m.credit)
    throw new Error("Map a signed amount column or debit/credit columns");
  const headers = Object.keys(data[0] || {});
  if (data.length)
    for (const key of [
      m.date,
      m.merchant,
      m.amount,
      m.debit,
      m.credit,
      m.reference,
    ].filter(Boolean)) {
      if (!headers.includes(key)) throw new Error(`Column not found: ${key}`);
    }

  const txs = store.txs().filter((t) => t.account_id === account);
  const rows: ImportRow[] = data.map((r, index) => {
    const result: ImportRow = {
      row: index + 2,
      date: "",
      merchant: "",
      amount: 0,
      reference: r[m.reference] || "",
      candidates: [],
    };
    try {
      let date = r[m.date]?.trim();
      if (m.date_format !== "YYYY-MM-DD") {
        const parts = date?.split("/");
        if (parts?.length !== 3)
          throw new Error("Date does not match selected format");
        const [a, b, y] = parts;
        date = `${y}-${(m.date_format === "MM/DD/YYYY" ? a : b).padStart(2, "0")}-${(m.date_format === "MM/DD/YYYY" ? b : a).padStart(2, "0")}`;
      }
      result.date = day.parse(date);
      result.merchant = r[m.merchant]?.trim();
      if (!result.merchant) throw new Error("Merchant is required");
      result.amount = m.amount
        ? cents(r[m.amount] || "")
        : cents(r[m.credit] || "0") - Math.abs(cents(r[m.debit] || "0"));
      if (m.invert) result.amount = -result.amount;
      result.candidates = txs
        .filter(
          (t) =>
            t.date === result.date &&
            t.amount === result.amount &&
            t.raw_description.trim().toLowerCase() ===
              result.merchant.toLowerCase(),
        )
        .map((t) => t.id);
    } catch (e) {
      result.error = e instanceof Error ? e.message : "Invalid row";
    }
    return result;
  });
  return {
    hash: hash(csv),
    headers: Object.keys(data[0] || {}),
    rows,
    valid: rows.filter((r) => !r.error).length,
    errors: rows.filter((r) => r.error).length,
    replay: !!store.get("imports", hash(account + ":" + hash(csv))),
    revision: store.revision(),
  };
}
export function commitImport(
  store: Store,
  actor: string,
  account: string,
  csv: string,
  m: Mapping,
  revision: number,
) {
  const p = previewImport(store, account, csv, m);
  if (p.replay)
    return { inserted: 0, flagged: 0, skipped: p.valid, errors: p.errors };
  if (store.revision() !== revision)
    throw new Error("Data changed. Preview again before importing.");
  return store.atomic(() => {
    const batch = hash(account + ":" + p.hash);
    let inserted = 0,
      flagged = 0;
    const ids: string[] = [];
    for (const r of p.rows.filter((r) => !r.error)) {
      const id = uid();
      const row: Transaction = {
        id,
        account_id: account,
        date: r.date,
        merchant: r.merchant,
        raw_description: r.merchant,
        amount: r.amount,
        status: "posted",
        notes: "",
        reviewed: false,
        allocations: [
          {
            category_id: r.amount > 0 ? "income" : "uncategorized",
            amount: r.amount,
            tags: [],
          },
        ],
        locked: false,
        revision: 1,
        source: "csv",
        classification_source: "uncategorized",
        created_at: new Date().toISOString(),
      };
      const classified = classify(
        row,
        store.rules(),
        store.get<{ category_id: string }>(
          "aliases",
          r.merchant.trim().toLowerCase(),
        )?.category_id,
      );
      if (r.candidates.length) {
        store.put("duplicates", id, {
          id,
          batch,
          row: classified,
          candidates: r.candidates,
        });
        flagged++;
      } else {
        store.saveTx(classified);
        store.db
          .prepare("INSERT INTO source_aliases VALUES(?,?,?)")
          .run("csv:" + batch + ":" + r.row, id, batch);
        ids.push(id);
        inserted++;
      }
    }
    store.put("imports", batch, {
      id: batch,
      account_id: account,
      hash: p.hash,
      created_at: new Date().toISOString(),
      inserted,
      flagged,
      ids,
      mapping: m,
    });
    store.put("mappings", account, { ...m, id: account });
    store.audit(actor, "import", batch, undefined, { inserted, flagged });
    return { inserted, flagged, skipped: 0, errors: p.errors, batch };
  });
}
