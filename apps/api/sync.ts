import { Store, uid } from "./db.ts";
import {
  simplefin,
  type ConnectorProvider,
} from "../../packages/connectors/simplefin.ts";
import { seal, unseal } from "./security.ts";
import { cents, classify, plusDays } from "../../packages/domain/index.ts";
import type { Transaction } from "../../packages/shared/schema.ts";
type Connection = {
  id: string;
  provider: string;
  secret?: string;
  start: string;
  cursor: string;
  last_attempt?: string;
  last_success?: string;
  error?: string;
  next_run: number;
  requests: number;
  quota_day: string;
  failures?: number;
  recent_day?: string;
  last_range?: { start: string; end: string; mode: string };
};
export function publicConnections(s: Store) {
  return s.all<Connection>("connections").map(({ secret, ...c }) => c);
}
export async function connectSimplefin(
  s: Store,
  actor: string,
  setup: string,
  start: string,
  provider: ConnectorProvider = simplefin,
) {
  seal("configuration-check");
  const access = await provider.claim(setup);
  const id = uid();
  s.put("connections", id, {
    id,
    provider: "simplefin",
    secret: seal(access),
    start,
    cursor: start,
    next_run: Date.now(),
    requests: 0,
    quota_day: "",
  });
  s.audit(actor, "connect", id);
  return { id };
}
export function disconnectConnection(s: Store, id: string, actor: string) {
  const c = s.get<Connection>("connections", id);
  if (!c) throw new Error("Connection not found");
  if (!s.lock("sync:" + id))
    throw new Error("Sync in progress; retry disconnect afterward");
  try {
    s.put("connections", id, {
      ...c,
      secret: undefined,
      error: "disconnected",
      next_run: 0,
    });
    s.audit(actor, "disconnect", id);
    return {
      ok: true,
      message:
        "Local credential removed. Revoke the token separately in SimpleFIN Bridge.",
    };
  } finally {
    s.unlock("sync:" + id);
  }
}
export async function syncConnection(
  s: Store,
  id: string,
  actor = "scheduler",
  provider: ConnectorProvider = simplefin,
) {
  const c = s.get<Connection>("connections", id);
  if (!c?.secret) throw new Error("Connection not found or disconnected");
  if (!s.lock("sync:" + id)) throw new Error("Sync already running");
  const now = new Date(),
    today = now.toISOString().slice(0, 10),
    tomorrow = plusDays(today, 1);
  let inserted = 0,
    updated = 0,
    flagged = 0;
  try {
    if (c.quota_day !== today) {
      c.requests = 0;
      c.quota_day = today;
    }
    if (c.requests >= 20) throw new Error("rate_limited");
    // Manual refreshes and the first daily job prioritize available recent data.
    // Other scheduled jobs advance the independent historical cursor.
    const recent =
      actor !== "scheduler" || c.recent_day !== today || c.cursor > today;
    const recentStart = plusDays(today, -44);
    const start = recent
      ? c.start > recentStart
        ? c.start
        : recentStart
      : c.cursor;
    const windowEnd =
      plusDays(start, 45) < tomorrow ? plusDays(start, 45) : tomorrow;
    c.error = undefined;
    c.last_attempt = now.toISOString();
    c.last_range = {
      start,
      end: windowEnd,
      mode: recent ? "recent" : "history",
    };
    c.requests++;
    s.put("connections", id, c);
    const result = await provider.fetch(unseal(c.secret), start, windowEnd);
    s.atomic(() => {
      for (const remote of result.accounts) {
        if (remote.currency !== "USD") {
          c.error = "unsupported_currency";
          continue;
        }
        s.put("discovered", id + ":" + remote.id, {
          id: remote.id,
          connection_id: id,
          name: remote.name,
          currency: remote.currency,
        });
        const account = s
          .accounts()
          .find((a) => a.provider_id === id + ":" + remote.id);
        if (!account) continue;
        s.put("accounts", account.id, {
          ...account,
          balance: cents(remote.balance),
          balance_at: new Date(remote["balance-date"] * 1000).toISOString(),
        });
        for (const r of remote.transactions || []) {
          const key = `simplefin:${id}:${remote.id}:${r.id}`,
            alias = s.db
              .prepare(
                "SELECT transaction_id FROM source_aliases WHERE source_key=?",
              )
              .get(key),
            old = alias ? s.tx(String(alias.transaction_id)) : undefined;
          const stamp = r.pending ? r.transacted_at || r.posted : r.posted;
          const date = stamp
            ? new Date(stamp * 1000).toISOString().slice(0, 10)
            : today;
          const amount = cents(r.amount);
          if (old) {
            if (
              old.amount === amount &&
              old.date === date &&
              old.status === (r.pending ? "pending" : "posted") &&
              old.raw_description === r.description
            )
              continue;
            if (
              (old.allocations.length > 1 || old.transfer_id) &&
              old.amount !== amount
            ) {
              c.error = "allocation_amount_changed";
              continue;
            }
            const next = {
              ...old,
              date,
              amount,
              status: r.pending ? ("pending" as const) : ("posted" as const),
              raw_description: r.description,
              revision: old.revision + 1,
              allocations:
                old.allocations.length === 1
                  ? [{ ...old.allocations[0], amount }]
                  : old.allocations,
            };
            s.saveTx(next);
            updated++;
            continue;
          }
          const tx: Transaction = {
            id: uid(),
            account_id: account.id,
            date,
            merchant: r.description,
            raw_description: r.description,
            amount,
            status: r.pending ? "pending" : "posted",
            notes: "",
            reviewed: false,
            allocations: [
              {
                category_id: amount > 0 ? "income" : "uncategorized",
                amount,
                tags: [],
              },
            ],
            locked: false,
            revision: 1,
            source: "simplefin",
            classification_source: "uncategorized",
            created_at: now.toISOString(),
          };
          const candidates = s
            .txs()
            .filter(
              (t) =>
                t.account_id === account.id &&
                t.amount === amount &&
                t.merchant.toLowerCase() === r.description.toLowerCase() &&
                Math.abs(+new Date(t.date) - +new Date(date)) <= 3 * 86400000,
            );
          const next = classify(
            tx,
            s.rules(),
            s.get<{ category_id: string }>(
              "aliases",
              r.description.trim().toLowerCase(),
            )?.category_id,
          );
          if (candidates.length) {
            if (!s.get("sync_quarantine", key)) {
              s.put("duplicates", tx.id, {
                id: tx.id,
                batch: null,
                source_key: key,
                row: next,
                candidates: candidates.map((t) => t.id),
              });
              s.put("sync_quarantine", key, { id: key });
              flagged++;
            }
          } else {
            s.saveTx(next);
            s.db
              .prepare("INSERT INTO source_aliases VALUES(?,?,NULL)")
              .run(key, tx.id);
            inserted++;
          }
        }
      }
      const partial = !!result.errlist?.length || !!result.errors?.length;
      c.error = partial
        ? "partial_provider_error"
        : c.error === "allocation_amount_changed" ||
            c.error === "unsupported_currency"
          ? c.error
          : undefined;
      if (!c.error) {
        if (!recent || c.cursor >= start) c.cursor = windowEnd;
        if (recent) c.recent_day = today;
        c.last_success = now.toISOString();
        c.failures = 0;
      }
      c.next_run =
        Date.now() +
        (c.error ? 3600000 : c.cursor < tomorrow ? 3600000 : 86400000) +
        Math.floor(Math.random() * 300000);
      s.put("connections", id, c);
      s.put("sync_runs", uid(), {
        connection_id: id,
        at: now.toISOString(),
        inserted,
        updated,
        flagged,
        error: c.error || null,
      });
      s.audit(actor, "sync", id, undefined, {
        inserted,
        updated,
        flagged,
        error: c.error || null,
      });
    });
    return { inserted, updated, flagged, error: c.error || null };
  } catch (e) {
    c.error =
      e instanceof Error &&
      ["payment_required", "authorization_expired", "rate_limited"].includes(
        e.message,
      )
        ? e.message
        : "provider_unavailable";
    c.failures = (c.failures || 0) + 1;
    c.next_run =
      Date.now() +
      (c.error === "rate_limited"
        ? 86400000
        : Math.min(86400000, 60000 * 2 ** Math.min(c.failures, 10))) +
      Math.floor(Math.random() * 30000);
    s.put("connections", id, c);
    throw new Error(c.error);
  } finally {
    s.unlock("sync:" + id);
  }
}
