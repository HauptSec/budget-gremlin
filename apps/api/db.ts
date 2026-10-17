import { DatabaseSync, type StatementSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Account,
  Budget,
  Category,
  Rule,
  Transaction,
} from "../../packages/shared/schema.ts";
export const uid = () => randomUUID();
export type User = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member";
  password: string;
  disabled: number;
};
export class Store {
  db: DatabaseSync;
  private statements = new Map<string, StatementSync>();
  prepare(sql: string) {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }
  constructor(public path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    const hasMigrations = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'",
      )
      .get();
    if (hasMigrations) {
      const version = Number(
        this.db.prepare("SELECT max(version) v FROM migrations").get()?.v || 0,
      );
      if (version > 1) {
        this.db.close();
        throw new Error(
          "Database schema is newer than this application; restore the matching version",
        );
      }
    }

    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','member')),password TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,csrf TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS invitations(hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(kind,id));
 CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,date TEXT NOT NULL,status TEXT NOT NULL,removed INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL CHECK(json_valid(data)));
 CREATE INDEX IF NOT EXISTS tx_date ON transactions(date); CREATE INDEX IF NOT EXISTS tx_account_date ON transactions(account_id,date);
 CREATE TABLE IF NOT EXISTS allocations(id TEXT PRIMARY KEY,transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,category_id TEXT NOT NULL,amount INTEGER NOT NULL,tags TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS allocation_transaction ON allocations(transaction_id);
 CREATE INDEX IF NOT EXISTS allocation_category ON allocations(category_id,transaction_id);
 CREATE TABLE IF NOT EXISTS source_aliases(source_key TEXT PRIMARY KEY,transaction_id TEXT NOT NULL REFERENCES transactions(id),batch_id TEXT);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,before_data TEXT,after_data TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS locks(name TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 INSERT OR IGNORE INTO migrations VALUES(1,datetime('now'));`);
    if (!this.get("settings", "household"))
      this.put("settings", "household", {
        name: "My household",
        currency: "USD",
        timezone: "America/Los_Angeles",
        include_pending: true,
        demo: false,
      });
    if (!this.all("categories").length) this.seedCategories();
  }
  atomic<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const v = fn();
      this.db.exec("COMMIT");
      return v;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  all<T = Record<string, unknown>>(kind: string): T[] {
    return this.prepare("SELECT data FROM entities WHERE kind=? ORDER BY id")
      .all(kind)
      .map((r) => JSON.parse(String(r.data)) as T);
  }
  get<T = Record<string, unknown>>(kind: string, id: string): T | undefined {
    const r = this.prepare(
      "SELECT data FROM entities WHERE kind=? AND id=?",
    ).get(kind, id);
    return r ? (JSON.parse(String(r.data)) as T) : undefined;
  }
  put(kind: string, id: string, value: unknown) {
    this.prepare(
      "INSERT INTO entities VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
    ).run(kind, id, JSON.stringify(value));
  }
  delete(kind: string, id: string) {
    this.prepare("DELETE FROM entities WHERE kind=? AND id=?").run(kind, id);
  }
  accounts() {
    return this.all<Account>("accounts");
  }
  categories() {
    return this.all<Category>("categories");
  }
  rules() {
    return this.all<Rule>("rules");
  }
  budgets() {
    return this.all<Budget>("budgets");
  }
  txs(start?: string, end?: string) {
    return this.prepare(
      "SELECT data FROM transactions WHERE removed=0 AND (? IS NULL OR date>=?) AND (? IS NULL OR date<=?) ORDER BY date DESC,id",
    )
      .all(start ?? null, start ?? null, end ?? null, end ?? null)
      .map((r) => JSON.parse(String(r.data)) as Transaction);
  }
  tx(id: string) {
    const row = this.prepare("SELECT data FROM transactions WHERE id=?").get(
      id,
    );
    return row ? (JSON.parse(String(row.data)) as Transaction) : undefined;
  }
  saveTx(tx: Transaction) {
    if (tx.allocations.reduce((n, a) => n + a.amount, 0) !== tx.amount)
      throw new Error("Split amounts must equal transaction amount");
    if (!this.get("accounts", tx.account_id))
      throw new Error("Account does not exist");
    for (const a of tx.allocations)
      if (!this.get("categories", a.category_id))
        throw new Error("Category does not exist");
    this.prepare(
      "INSERT INTO transactions VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET account_id=excluded.account_id,date=excluded.date,status=excluded.status,removed=excluded.removed,data=excluded.data",
    ).run(
      tx.id,
      tx.account_id,
      tx.date,
      tx.status,
      tx.removed ? 1 : 0,
      JSON.stringify(tx),
    );
    this.prepare("DELETE FROM allocations WHERE transaction_id=?").run(tx.id);
    for (const [i, a] of tx.allocations.entries())
      this.prepare("INSERT INTO allocations VALUES(?,?,?,?,?)").run(
        tx.id + ":" + i,
        tx.id,
        a.category_id,
        a.amount,
        JSON.stringify(a.tags),
      );
  }
  audit(
    actor: string,
    action: string,
    target: string,
    before?: unknown,
    after?: unknown,
  ) {
    this.prepare("INSERT INTO audit VALUES(?,?,?,?,?,?,?)").run(
      uid(),
      actor,
      action,
      target,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      new Date().toISOString(),
    );
  }
  revision() {
    return Number(this.prepare("SELECT COUNT(*) n FROM audit").get()!.n);
  }
  lock(name: string, ttl = 600000) {
    return this.atomic(() => {
      this.prepare("DELETE FROM locks WHERE expires<?").run(Date.now());
      return (
        this.prepare("INSERT OR IGNORE INTO locks VALUES(?,?)").run(
          name,
          Date.now() + ttl,
        ).changes > 0
      );
    });
  }
  unlock(name: string) {
    this.prepare("DELETE FROM locks WHERE name=?").run(name);
  }
  seedCategories() {
    const rows: [
      string,
      string,
      string,
      "income" | "expense" | "transfer",
      string,
    ][] = [
      ["income", "Paychecks", "Income", "income", "#608971"],
      ["housing", "Housing", "Essentials", "expense", "#7F8D79"],
      ["groceries", "Groceries", "Essentials", "expense", "#839D8E"],
      ["utilities", "Utilities", "Essentials", "expense", "#ADAA86"],
      ["transport", "Transportation", "Essentials", "expense", "#739297"],
      ["dining", "Dining & coffee", "Lifestyle", "expense", "#CD9B77"],
      ["shopping", "Shopping", "Lifestyle", "expense", "#AC9CBA"],
      ["health", "Health & wellness", "Essentials", "expense", "#85AEB0"],
      ["entertainment", "Entertainment", "Lifestyle", "expense", "#B79998"],
      ["travel", "Travel", "Lifestyle", "expense", "#93A1BD"],
      ["uncategorized", "Uncategorized", "Other", "expense", "#A2A6A2"],
      ["transfer", "Transfers", "Transfers", "transfer", "#8C959C"],
    ];
    for (const [id, name, group_name, kind, color] of rows)
      this.put("categories", id, {
        id,
        name,
        group_name,
        kind,
        color,
        archived: false,
      });
  }
  close() {
    this.db.close();
  }
}
