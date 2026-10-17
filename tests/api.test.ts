import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../apps/api/db.ts";
import { createServer } from "../apps/api/server.ts";
import { hashPassword, seal, unseal } from "../apps/api/security.ts";
import { createBackup, restoreBackup } from "../apps/api/backup.ts";
import { seed } from "../scripts/seed.ts";
import {
  connectSimplefin,
  syncConnection,
  publicConnections,
} from "../apps/api/sync.ts";
import { none } from "../packages/ai/index.ts";
process.env.ENCRYPTION_KEY = "11".repeat(32);
async function fixture() {
  const store = new Store(":memory:");
  await seed(store, "test-password-123");
  const app = await createServer(store, { serveStatic: false });
  await app.ready();
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "demo@budgetgremlin.local",
      password: "test-password-123",
    },
  });
  assert.equal(login.statusCode, 200, login.body);
  const cookie = login.headers["set-cookie"]!.toString().split(";")[0],
    csrf = login.json().csrf;
  const call = (method: any, url: string, payload?: any) =>
    app.inject({
      method,
      url: "/api/v1" + url,
      headers: {
        cookie,
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      payload,
    });
  return {
    store,
    app,
    call,
    close: async () => {
      await app.close();
      store.close();
    },
  };
}
test("auth, CSRF, owner permissions and member removal", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.app.inject("/api/v1/meta")).statusCode, 401);
    const invalid = await f.app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: {
        cookie:
          ((await f.call("GET", "/auth/me")).headers.cookie as string) || "",
        "content-type": "application/json",
      },
      payload: {},
    });
    assert.notEqual(invalid.statusCode, 200);
    const invite = await f.call("POST", "/invitations", {
      email: "member@example.com",
    });
    const token = invite.json().url.split("#")[1];
    const accepted = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/accept-invite",
      payload: { token, name: "Member", password: "member-password-123" },
    });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/v1/auth/accept-invite",
          payload: { token, name: "Again", password: "member-password-123" },
        })
      ).statusCode,
      400,
    );
    const login = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "member@example.com", password: "member-password-123" },
    });
    const headers = {
      cookie: login.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": login.json().csrf,
    };
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/v1/invitations",
          headers,
          payload: { email: "x@example.com" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "GET",
          url: "/api/v1/reports?start=2026-01-01&end=2026-12-31",
          headers,
        })
      ).statusCode,
      200,
    );
    await f.call("DELETE", "/users/" + login.json().user.id, {});
    assert.equal(
      (await f.app.inject({ method: "GET", url: "/api/v1/meta", headers }))
        .statusCode,
      401,
    );
  } finally {
    await f.close();
  }
});
test("CSV replay, identical purchases, overlap quarantine and import undo", async () => {
  const f = await fixture();
  try {
    const mapping = {
      date: "Date",
      merchant: "Merchant",
      amount: "Amount",
      date_format: "YYYY-MM-DD",
    };
    const csv =
      "Date,Merchant,Amount\n2026-01-20,Same merchant,-10.00\n2026-01-20,Same merchant,-10.00\n2026-02-30,Invalid,-5.00";
    const preview = await f.call("POST", "/imports/preview", {
      account_id: "checking",
      csv,
      mapping,
    });
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(preview.json().errors, 1);
    const r = await f.call("POST", "/imports/commit", {
      account_id: "checking",
      csv,
      mapping,
      revision: preview.json().revision,
    });
    assert.equal(r.json().inserted, 2, r.body);
    assert.equal(
      (
        await f.call("POST", "/imports/commit", {
          account_id: "checking",
          csv,
          mapping,
          revision: 0,
        })
      ).json().inserted,
      0,
    );
    const overlap = csv.split("\n").slice(0, 2).join("\n");
    const p = await f.call("POST", "/imports/preview", {
      account_id: "checking",
      csv: overlap,
      mapping,
    });
    const imp = await f.call("POST", "/imports/commit", {
      account_id: "checking",
      csv: overlap,
      mapping,
      revision: p.json().revision,
    });
    assert.equal(imp.json().flagged, 1);
    const pending = (await f.call("GET", "/duplicates")).json()[0];
    assert.equal(pending.candidates.length, 2);
    const plan = (
      await f.call("GET", `/imports/${r.json().batch}/undo`)
    ).json();
    assert.equal(plan.rows.filter((x: any) => x.remove).length, 2);
    const undone = await f.call("POST", `/imports/${r.json().batch}/undo`, {
      revision: plan.revision,
    });
    assert.equal(undone.json().removed, 2);
  } finally {
    await f.close();
  }
});
test("edits preserve locks, reject invalid splits and optimistic conflicts; report/export parity", async () => {
  const f = await fixture();
  try {
    const body = {
      account_id: "checking",
      date: "2026-01-20",
      merchant: "Split store",
      amount: -10000,
      allocations: [
        { category_id: "groceries", amount: -6000 },
        { category_id: "dining", amount: -4000 },
      ],
    };
    const saved = await f.call("POST", "/transactions", body);
    assert.equal(saved.statusCode, 200, saved.body);
    const t = saved.json();
    assert.equal(
      (await f.call("POST", "/transactions", { ...body, amount: -9000 }))
        .statusCode,
      400,
    );
    const edited = await f.call("PATCH", "/transactions/" + t.id, {
      ...t,
      merchant: "Edited store",
      revision: 1,
    });
    assert.equal(edited.statusCode, 200, edited.body);
    assert.equal(
      (await f.call("PATCH", "/transactions/" + t.id, { ...t, revision: 1 }))
        .statusCode,
      409,
    );
    assert.equal(f.store.tx(t.id)?.locked, true);
    const qs = "?start=2026-01-01&end=2026-01-31&merchant=Edited";
    const report = (await f.call("GET", "/reports" + qs)).json();
    assert.equal(report.spending, 10000);
    assert.equal(report.rows.length, 2);
    assert.equal(
      -report.rows.reduce((n: number, r: any) => n + r.amount, 0),
      report.spending,
    );
    const csv = await f.call("GET", "/reports/export" + qs);
    assert.equal(csv.statusCode, 200);
    assert.ok(csv.body.includes("Edited store"));
    assert.equal(csv.headers["cache-control"], "private, no-store");
  } finally {
    await f.close();
  }
});
test("transfer confirmation removes both legs from reports and unlink restores review", async () => {
  const f = await fixture();
  try {
    const create = async (account: string, amount: number) =>
      (
        await f.call("POST", "/transactions", {
          account_id: account,
          date: "2026-01-20",
          merchant: "Transfer fixture",
          amount,
          allocations: [
            { category_id: amount > 0 ? "income" : "uncategorized", amount },
          ],
        })
      ).json();
    const a = await create("checking", -50000),
      b = await create("savings", 50000);
    const paired = await f.call("POST", "/transfers", { a: a.id, b: b.id });
    assert.equal(paired.statusCode, 200, paired.body);
    const r = (
      await f.call(
        "GET",
        "/reports?start=2026-01-01&end=2026-01-31&merchant=Transfer%20fixture",
      )
    ).json();
    assert.equal(r.spending, 0);
    assert.equal(r.income, 0);
    await f.call("DELETE", "/transfers/" + paired.json().id, {});
    assert.equal(f.store.tx(a.id)?.reviewed, false);
  } finally {
    await f.close();
  }
});
test("backup restore preserves ledger and encryption authenticates contents", async () => {
  const f = await fixture(),
    dir = await mkdtemp(join(tmpdir(), "gremlin-backup-"));
  try {
    const name = await createBackup(f.store, dir);
    const text = await readFile(join(dir, name), "utf8");
    assert.ok(!text.includes("Whole Foods"));
    const result = await restoreBackup(
      join(dir, name),
      join(dir, "restored.sqlite"),
    );
    assert.equal(result.transactions, f.store.txs().length);
    assert.equal(result.accounts, 3);
    assert.throws(() => unseal(seal("secret"), Buffer.alloc(32, 2)));
    await assert.rejects(() =>
      restoreBackup(join(dir, name), join(dir, "restored.sqlite")),
    );
  } finally {
    await f.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("SimpleFIN fixture sync is idempotent and never overwrites manual classification", async () => {
  const f = await fixture();
  try {
    let amount = "-10.00";
    const provider = {
      async claim() {
        return "https://secret:password@bridge.simplefin.org/simplefin";
      },
      async fetch() {
        return {
          accounts: [
            {
              id: "remote",
              name: "Checking",
              currency: "USD",
              balance: "100.00",
              "balance-date": 1750000000,
              transactions: [
                {
                  id: "txn",
                  posted: 1750000000,
                  amount,
                  description: "Fixture merchant",
                },
              ],
            },
          ],
        };
      },
    };
    const c = await connectSimplefin(
      f.store,
      "demo-owner",
      "fake-setup",
      "2025-01-01",
      provider,
    );
    f.store.put("accounts", "checking", {
      ...f.store.get<Record<string, unknown>>("accounts", "checking"),
      provider_id: c.id + ":remote",
    });
    const first = await syncConnection(f.store, c.id, "test", provider);
    assert.equal(first.inserted, 1);
    assert.equal(
      (await syncConnection(f.store, c.id, "test", provider)).inserted,
      0,
    );
    const tx = f.store.txs().find((t) => t.source === "simplefin")!;
    f.store.atomic(() =>
      f.store.saveTx({
        ...tx,
        locked: true,
        allocations: [{ category_id: "dining", amount: tx.amount, tags: [] }],
      }),
    );
    amount = "-12.00";
    await syncConnection(f.store, c.id, "test", provider);
    assert.equal(f.store.tx(tx.id)?.allocations[0].category_id, "dining");
    assert.equal(f.store.tx(tx.id)?.amount, -1200);
    assert.ok(!JSON.stringify(publicConnections(f.store)).includes("password"));
    assert.equal(
      await none.suggestCategory({ merchant: "A", categories: ["x"] }),
      null,
    );
  } finally {
    await f.close();
  }
});

test("mapped nonexistent columns and stale preview are rejected without inserting", async () => {
  const f = await fixture();
  try {
    const before = f.store.txs().length;
    const payload = {
      account_id: "checking",
      csv: "Date,Merchant,Amount\n2026-01-01,Test,-1.00",
      mapping: { date: "Date", merchant: "Merchant", amount: "Wrong" },
    };
    const invalid = await f.call("POST", "/imports/preview", payload);
    assert.equal(invalid.statusCode, 400);
    payload.mapping.amount = "Amount";
    const p = (await f.call("POST", "/imports/preview", payload)).json();
    f.store.audit("test", "change", "household");
    assert.equal(
      (
        await f.call("POST", "/imports/commit", {
          ...payload,
          revision: p.revision,
        })
      ).statusCode,
      409,
    );
    assert.equal(f.store.txs().length, before);
  } finally {
    await f.close();
  }
});
test("pending-to-posted ID change is reconciled once while preserving manual category", async () => {
  const f = await fixture();
  try {
    let posted = false;
    const provider = {
      async claim() {
        return "https://a:b@bridge.simplefin.org/simplefin";
      },
      async fetch() {
        return {
          accounts: [
            {
              id: "remote",
              name: "Checking",
              currency: "USD",
              balance: "100.00",
              "balance-date": 1750000000,
              transactions: [
                {
                  id: posted ? "posted-new" : "pending-old",
                  posted: 1750000000,
                  amount: "-10.00",
                  description: "Transition fixture",
                  pending: !posted,
                },
              ],
            },
          ],
        };
      },
    };
    const c = await connectSimplefin(
      f.store,
      "test",
      "fixture",
      "2025-01-01",
      provider,
    );
    f.store.put("accounts", "checking", {
      ...f.store.get<Record<string, unknown>>("accounts", "checking"),
      provider_id: c.id + ":remote",
    });
    await syncConnection(f.store, c.id, "test", provider);
    const old = f.store.txs().find((t) => t.merchant === "Transition fixture")!;
    f.store.saveTx({
      ...old,
      locked: true,
      allocations: [{ category_id: "dining", amount: -1000, tags: ["keep"] }],
    });
    posted = true;
    assert.equal(
      (await syncConnection(f.store, c.id, "test", provider)).flagged,
      1,
    );
    const d = (await f.call("GET", "/duplicates"))
      .json()
      .find((x: any) => x.row.merchant === "Transition fixture");
    assert.equal(
      (await f.call("POST", "/duplicates/" + d.id, { match: old.id }))
        .statusCode,
      200,
    );
    assert.equal(f.store.tx(old.id)?.status, "posted");
    assert.equal(f.store.tx(old.id)?.allocations[0].category_id, "dining");
    assert.equal(
      (await syncConnection(f.store, c.id, "test", provider)).inserted,
      0,
    );
    assert.equal(
      f.store.txs().filter((t) => t.merchant === "Transition fixture").length,
      1,
    );
  } finally {
    await f.close();
  }
});
test("bank-link requires discovery and restarts backfill; failures are safe and locks release", async () => {
  const f = await fixture();
  try {
    const provider = {
      async claim() {
        return "https://a:b@bridge.simplefin.org/simplefin";
      },
      async fetch() {
        return {
          accounts: [
            {
              id: "remote",
              name: "Checking",
              currency: "USD",
              balance: "100.00",
              "balance-date": 1750000000,
              transactions: [],
            },
          ],
        };
      },
    };
    const c = await connectSimplefin(
      f.store,
      "test",
      "fixture",
      "2025-01-01",
      provider,
    );
    assert.equal(
      (
        await f.call("POST", "/connections/" + c.id + "/link", {
          provider_id: "remote",
          account_id: "checking",
        })
      ).statusCode,
      400,
    );
    await syncConnection(f.store, c.id, "test", provider);
    assert.equal(
      (
        await f.call("POST", "/connections/" + c.id + "/link", {
          provider_id: "remote",
          account_id: "checking",
        })
      ).statusCode,
      200,
    );
    assert.equal(f.store.get("connections", c.id)?.cursor, "2025-01-01");
    await assert.rejects(
      () =>
        syncConnection(f.store, c.id, "test", {
          ...provider,
          async fetch() {
            throw new Error("authorization_expired");
          },
        }),
      /authorization_expired/,
    );
    assert.equal(publicConnections(f.store)[0].error, "authorization_expired");
    assert.equal(f.store.lock("sync:" + c.id), true);
    f.store.unlock("sync:" + c.id);
  } finally {
    await f.close();
  }
});
test("a valid session still rejects missing CSRF and foreign origin", async () => {
  const f = await fixture();
  try {
    const login = await f.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "demo@budgetgremlin.local",
        password: "test-password-123",
      },
    });
    const cookie = login.headers["set-cookie"]!.toString().split(";")[0];
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/v1/transactions",
          headers: { cookie },
          payload: {},
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/v1/transactions",
          headers: {
            cookie,
            "x-csrf-token": login.json().csrf,
            origin: "https://foreign.invalid",
          },
          payload: {},
        })
      ).statusCode,
      403,
    );
  } finally {
    await f.close();
  }
});

test("category merge updates merchant defaults and protects system categories", async () => {
  const f = await fixture();
  try {
    const source = (
      await f.call("POST", "/categories", {
        name: "Merge source",
        group_name: "Other",
        kind: "expense",
        color: "#769B7E",
      })
    ).json();
    const destination = (
      await f.call("POST", "/categories", {
        name: "Merge destination",
        group_name: "Other",
        kind: "expense",
        color: "#769B7E",
      })
    ).json();
    assert.ok(source.id);
    assert.ok(destination.id);
    await f.call("POST", "/aliases", {
      merchant: "Corner store",
      category_id: source.id,
    });
    const result = await f.call("POST", `/categories/${source.id}/merge`, {
      destination: destination.id,
    });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(
      f.store.get("aliases", "corner store")?.category_id,
      destination.id,
    );
    assert.equal(f.store.get("categories", source.id)?.archived, true);
    assert.equal(
      (
        await f.call("POST", "/categories/uncategorized/merge", {
          destination: destination.id,
        })
      ).statusCode,
      400,
    );
    const system = f.store.get("categories", "uncategorized")!;
    assert.equal(
      (
        await f.call("PATCH", "/categories/uncategorized", {
          ...system,
          archived: true,
        })
      ).statusCode,
      400,
    );
  } finally {
    await f.close();
  }
});

test("first bank link creates an account atomically and sync windows stay within 45 days", async () => {
  const f = await fixture();
  try {
    const provider = {
      async claim() {
        return "https://a:b@bridge.simplefin.org/simplefin";
      },
      async fetch(_access: string, start: string, end: string) {
        assert.ok((+new Date(end) - +new Date(start)) / 86400000 <= 45);
        return {
          accounts: [
            {
              id: "fresh",
              name: "New bank account",
              currency: "USD",
              balance: "10.00",
              "balance-date": 1750000000,
              transactions: [],
            },
          ],
        };
      },
    };
    const c = await connectSimplefin(
      f.store,
      "test",
      "fixture",
      "2025-01-01",
      provider,
    );
    await syncConnection(f.store, c.id, "test", provider);
    const missing = await f.call("POST", `/connections/${c.id}/link`, {
      provider_id: "fresh",
      account_id: null,
    });
    assert.equal(missing.statusCode, 400);
    assert.match(missing.body, /Choose an existing account/);
    const payload = {
      provider_id: "fresh",
      new_account: {
        name: "New savings",
        type: "savings",
        opening_date: "2025-01-01",
      },
    };
    const count = f.store.accounts().length;
    const result = await f.call("POST", `/connections/${c.id}/link`, payload);
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(f.store.accounts().length, count + 1);
    assert.equal(
      f.store.accounts().find((a) => a.name === "New savings")?.provider_id,
      c.id + ":fresh",
    );
    assert.equal(
      (await f.call("POST", `/connections/${c.id}/link`, payload)).statusCode,
      400,
    );
    assert.equal(f.store.accounts().length, count + 1);
    assert.equal(f.store.get("connections", c.id)?.cursor, "2025-01-01");
    assert.equal(publicConnections(f.store)[0].error, undefined);
  } finally {
    await f.close();
  }
});

test("manual sync prioritizes recent activity without skipping the historical cursor", async () => {
  const f = await fixture();
  try {
    const windows: { start: string; end: string }[] = [];
    const provider = {
      async claim() {
        return "https://a:b@bridge.simplefin.org/simplefin";
      },
      async fetch(_access: string, start: string, end: string) {
        windows.push({ start, end });
        return { accounts: [] };
      },
    };
    const c = await connectSimplefin(
      f.store,
      "test",
      "fixture",
      "2025-01-01",
      provider,
    );
    await syncConnection(f.store, c.id, "owner", provider);
    assert.equal(
      windows[0].end,
      new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    );
    assert.equal(
      (+new Date(windows[0].end) - +new Date(windows[0].start)) / 86400000,
      45,
    );
    assert.equal(f.store.get("connections", c.id)?.cursor, "2025-01-01");
    await syncConnection(f.store, c.id, "scheduler", provider);
    assert.equal(windows[1].start, "2025-01-01");
    assert.equal(f.store.get("connections", c.id)?.cursor, windows[1].end);
    await syncConnection(f.store, c.id, "owner", provider);
    assert.deepEqual(windows[2], windows[0]);
    assert.equal(f.store.get("connections", c.id)?.cursor, windows[1].end);
  } finally {
    await f.close();
  }
});
