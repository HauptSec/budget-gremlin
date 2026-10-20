import { saveLegacySchedule, monthItems } from "./recurring.ts";
import {
  planWithRecurring,
  type Schedule,
} from "../../packages/recurring/index.ts";
import { z } from "zod";
import { createHash } from "node:crypto";
import { writeFileSync, renameSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Store, uid, type User } from "./db.ts";
import { seal, unseal } from "./security.ts";
import {
  budgetSchema,
  month,
  type Transaction,
} from "../../packages/shared/schema.ts";
import { classify, report } from "../../packages/domain/index.ts";
import {
  MODEL,
  answerSchema,
  openai,
  requestPayload,
  type Transport,
} from "../../packages/ai/openai.ts";
const digest = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const merchantKey = (s: string) => s.trim().toLowerCase();
const configSchema = z.object({
  enabled: z.boolean(),
  monthly_cap_cents: z.number().int().min(1).max(10000),
  daily_calls: z.number().int().min(1).max(100),
  automatic: z.boolean(),
  learn_corrections: z.boolean(),
});
type Config = z.infer<typeof configSchema> & { secret?: string };
const memorySchema = z.object({
  revision: z.number().int().min(0),
  notes: z.string().max(3000),
  examples: z
    .array(
      z.object({
        merchant: z.string().max(120),
        category_id: z.string(),
        updated_at: z.string(),
      }),
    )
    .max(100),
});
type Memory = z.infer<typeof memorySchema>;
const recurringSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["bill", "subscription", "income"]),
  amount: z.number().int().min(0).max(100000000),
  category_id: z.string(),
  due_day: z.number().int().min(1).max(31),
  active: z.boolean(),
});
type Recurring = z.infer<typeof recurringSchema>;
type Usage = {
  id: string;
  at: string;
  microusd: number;
  status: string;
  input?: number;
  output?: number;
  task: string;
};
type Proposal = {
  id: string;
  actor: string;
  kind: "budget" | "recurring" | "memory";
  before_hash: string;
  before: unknown;
  after: unknown;
  created_at: number;
  status: string;
};
type Chat = { messages: { role: string; text: string }[] };
const REFUSAL =
  "I can help only with Budget Gremlin, your household transactions, recurring items and budget.";
export function aiConfig(s: Store): Config {
  return (
    s.get<Config>("ai_config", "household") || {
      enabled: false,
      monthly_cap_cents: 1000,
      daily_calls: 40,
      automatic: true,
      learn_corrections: true,
    }
  );
}
function memoryFile(s: Store) {
  return join(dirname(s.path), "ai-memory.json");
}
export function aiMemory(s: Store): Memory {
  const canonical = s.get<Memory>("ai_memory", "household") || {
    revision: 0,
    notes: "",
    examples: [],
  };
  // The database copy participates in encrypted backups; the private file is a
  // bounded, human-readable mirror. Only app-reviewed edits are authoritative.
  if (s.path !== ":memory:") {
    const path = memoryFile(s);
    if (
      !existsSync(path) ||
      readFileSync(path, "utf8") !== JSON.stringify(canonical, null, 2)
    ) {
      writeFileSync(path + ".tmp", JSON.stringify(canonical, null, 2), {
        mode: 0o600,
      });
      renameSync(path + ".tmp", path);
    }
    return memorySchema.parse(JSON.parse(readFileSync(path, "utf8")));
  }
  return canonical;
}
export function saveMemory(s: Store, actor: string, input: unknown) {
  const next = memorySchema.parse(input),
    old = aiMemory(s);
  if (next.revision !== old.revision)
    throw new Error("Memory changed; reload before saving");
  for (const e of next.examples)
    if (
      !s
        .categories()
        .some(
          (c) =>
            c.id === e.category_id &&
            !c.archived &&
            c.kind === "expense" &&
            c.id !== "uncategorized",
        )
    )
      throw new Error("Memory category is unavailable");
  const after = { ...next, revision: old.revision + 1 };
  s.atomic(() => {
    s.put("ai_memory", "household", after);
    s.audit(actor, "ai-memory", "household", old, after);
  });
  return aiMemory(s);
}
export function learnCorrection(
  s: Store,
  actor: string,
  old: Transaction,
  next: Transaction,
) {
  if (
    !aiConfig(s).learn_corrections ||
    !aiConfig(s).enabled ||
    next.allocations.length !== 1 ||
    old.allocations[0]?.category_id === next.allocations[0]?.category_id
  )
    return;
  const category = next.allocations[0].category_id;
  if (
    !s
      .categories()
      .some(
        (c) =>
          c.id === category &&
          c.kind === "expense" &&
          c.id !== "uncategorized" &&
          !c.archived,
      )
  )
    return;
  const memory = aiMemory(s),
    merchant = merchantKey(next.merchant).slice(0, 120);
  saveMemory(s, actor, {
    ...memory,
    examples: [
      { merchant, category_id: category, updated_at: new Date().toISOString() },
      ...memory.examples.filter((e) => e.merchant !== merchant),
    ].slice(0, 100),
  });
}
export function aiStatus(s: Store) {
  const { secret, ...config } = aiConfig(s),
    now = new Date().toISOString(),
    usage = s.all<Usage>("ai_usage");
  return {
    ...config,
    model: MODEL,
    key_configured: !!secret,
    memory_path: s.path === ":memory:" ? "in-memory" : memoryFile(s),
    monthly_estimated_usd:
      usage
        .filter((x) => x.at.startsWith(now.slice(0, 7)))
        .reduce((n, x) => n + x.microusd, 0) / 1e6,
    daily_calls_used: usage.filter((x) => x.at.startsWith(now.slice(0, 10)))
      .length,
    last_run: s.get("ai_jobs", "last"),
    rates: { input_per_million: 0.1, output_per_million: 0.5 },
    limitations:
      "Estimates reserve worst-case input/cache-write pricing. Unknown failed requests retain their reservation. OpenAI billing is authoritative. Price changes require an app update.",
  };
}
export function saveAiConfig(s: Store, actor: string, input: unknown) {
  const b = configSchema
      .extend({
        api_key: z.string().min(10).max(500).optional(),
        remove_key: z.boolean().optional(),
      })
      .parse(input),
    old = aiConfig(s);
  const next: Config = {
    ...configSchema.parse(b),
    secret: b.remove_key
      ? undefined
      : b.api_key
        ? seal(b.api_key.trim())
        : old.secret,
  };
  if (next.enabled && !next.secret)
    throw new Error("Add an OpenAI API key before enabling AI");
  s.put("ai_config", "household", next);
  s.audit(
    actor,
    "ai-settings",
    "household",
    { enabled: old.enabled },
    { enabled: next.enabled, monthly_cap_cents: next.monthly_cap_cents },
  );
  return aiStatus(s);
}
function eligible(t: Transaction) {
  return (
    !t.removed &&
    !t.locked &&
    !t.transfer_id &&
    t.amount < 0 &&
    t.allocations.length === 1 &&
    t.allocations[0].category_id === "uncategorized"
  );
}
function setFlag(s: Store, t: Transaction, reason: string, actor: string) {
  const reasons = t.review_reasons || [];
  if (reasons.includes(reason)) return false;
  const next = {
    ...t,
    reviewed: false,
    review_reasons: [...reasons, reason].slice(-8),
    revision: t.revision + 1,
  };
  s.saveTx(next);
  s.audit(actor, "ai-review-flag", t.id, t, next);
  return true;
}
export function scanReview(s: Store, actor: string) {
  const rows = s.txs(),
    groups = new Map<string, Transaction[]>();
  let flagged = 0;
  for (const t of rows)
    if (
      t.amount < 0 &&
      !t.transfer_id &&
      !t.allocations.some((a) => a.category_id === "transfer")
    ) {
      const k = merchantKey(t.merchant);
      groups.set(k, [...(groups.get(k) || []), t]);
    }
  s.atomic(() => {
    for (const list of groups.values())
      for (const t of list) {
        const earlier = list
          .filter(
            (x) => x.id !== t.id && x.date < t.date && x.status === "posted",
          )
          .map((x) => Math.abs(x.amount))
          .sort((a, b) => a - b);
        const median = earlier.length
          ? earlier[Math.floor(earlier.length / 2)]
          : 0;
        if (
          earlier.length >= 3 &&
          Math.abs(t.amount) >= 10000 &&
          Math.abs(t.amount) > median * 3
        )
          flagged += Number(
            setFlag(
              s,
              s.tx(t.id)!,
              "Amount is over 3× this merchant's historical median",
              actor,
            ),
          );
        else if (!earlier.length && Math.abs(t.amount) >= 50000)
          flagged += Number(
            setFlag(
              s,
              s.tx(t.id)!,
              "First observed payment to this merchant is $500 or more",
              actor,
            ),
          );
      }
  });
  return { flagged, checked: rows.length };
}
function recurringCandidates(s: Store) {
  const groups = new Map<string, Transaction[]>();
  for (const t of s.txs())
    if (
      t.status === "posted" &&
      !t.transfer_id &&
      !t.allocations.some((a) => a.category_id === "transfer")
    ) {
      const k = merchantKey(t.merchant);
      groups.set(k, [...(groups.get(k) || []), t]);
    }
  return [...groups.values()]
    .filter((g) => g.length >= 3)
    .flatMap((g) => {
      const rows = g.slice(0, 3),
        intervals = rows
          .slice(0, 2)
          .map(
            (t, i) =>
              (+new Date(t.date) - +new Date(rows[i + 1].date)) / 86400000,
          );
      if (
        !intervals.every((d) => d >= 25 && d <= 35) ||
        !rows.every((t) => Math.sign(t.amount) === Math.sign(rows[0].amount))
      )
        return [];
      return [
        {
          name: rows[0].merchant.slice(0, 100),
          kind: rows[0].amount > 0 ? "income" : "bill",
          amount: Math.abs(rows[0].amount),
          category_id: rows[0].allocations[0].category_id,
          due_day: Number(rows[0].date.slice(8, 10)),
          active: true,
        },
      ];
    })
    .slice(0, 10);
}
function makeProposal(
  s: Store,
  actor: string,
  kind: Proposal["kind"],
  before: unknown,
  after: unknown,
) {
  const p: Proposal = {
    id: uid(),
    actor,
    kind,
    before_hash: digest(before),
    before,
    after,
    created_at: Date.now(),
    status: "pending",
  };
  s.put("ai_proposals", p.id, p);
  return p;
}
export function listProposals(s: Store, actor: string) {
  return s
    .all<Proposal>("ai_proposals")
    .filter(
      (p) =>
        p.actor === actor &&
        p.status === "pending" &&
        Date.now() - p.created_at < 86400000,
    )
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 30);
}
export function decideProposal(
  s: Store,
  actor: string,
  id: string,
  apply: boolean,
) {
  const p = s.get<Proposal>("ai_proposals", id);
  if (
    !p ||
    p.actor !== actor ||
    p.status !== "pending" ||
    Date.now() - p.created_at > 86400000
  )
    throw new Error("Proposal unavailable; request a fresh proposal");
  if (!apply) {
    s.put("ai_proposals", id, { ...p, status: "dismissed" });
    return { ok: true };
  }
  if (p.kind === "memory") {
    const current = aiMemory(s);
    if (digest(current) !== p.before_hash)
      throw new Error("Memory changed; request a fresh proposal");
    saveMemory(s, actor, p.after);
  } else
    s.atomic(() => {
      const target =
        p.kind === "budget"
          ? budgetSchema.parse(p.after)
          : recurringSchema.parse(p.after);
      const kind = p.kind === "budget" ? "budgets" : "recurring",
        key = "month" in target ? target.month : target.id;
      const current = s.get(kind, key) || null;
      if (digest(current) !== p.before_hash)
        throw new Error("Data changed; request a fresh proposal");
      if ("lines" in target) {
        if (
          new Set(target.lines.map((l) => l.category_id)).size !==
          target.lines.length
        )
          throw new Error("Duplicate budget category");
        for (const line of target.lines)
          if (
            !s
              .categories()
              .some(
                (c) =>
                  c.id === line.category_id &&
                  !c.archived &&
                  c.kind === "expense",
              )
          )
            throw new Error(
              "Budget category changed; request a fresh proposal",
            );
      } else validateRecurringCategory(s, target);
      if (p.kind === "recurring") saveLegacySchedule(s, actor, target, true);
      else s.put(kind, key, target);
      s.audit(actor, "ai-apply-" + p.kind, key, current, target);
    });
  s.put("ai_proposals", id, { ...p, status: "applied" });
  return { ok: true };
}
function validateRecurringCategory(s: Store, r: Recurring) {
  if (
    !s
      .categories()
      .some(
        (c) =>
          c.id === r.category_id &&
          !c.archived &&
          c.kind === (r.kind === "income" ? "income" : "expense"),
      )
  )
    throw new Error(
      "Choose a category matching the recurring item's income or expense type",
    );
}
export function saveRecurring(s: Store, actor: string, input: unknown) {
  const b = recurringSchema.parse(input);
  validateRecurringCategory(s, b);
  return saveLegacySchedule(s, actor, b);
}
export function proposeRecurringBudget(s: Store, actor: string, m: string) {
  month.parse(m);
  const before = s.get("budgets", m) || null,
    base = budgetSchema.parse(
      before || { month: m, expected_income: 0, lines: [] },
    );
  return makeProposal(
    s,
    actor,
    "budget",
    before,
    budgetSchema.parse(planWithRecurring(base, monthItems(s, m))),
  );
}
const taskSchema = z.object({
  task: z.enum(["chat", "categorize", "review", "summary", "recurring"]),
  message: z.string().max(1500).default(""),
  month: month,
  merchant: z.string().max(120).default(""),
});
export async function runAi(
  s: Store,
  user: Pick<User, "id" | "role">,
  raw: unknown,
  transport: Transport = openai,
) {
  const b = taskSchema.parse(raw),
    cfg = aiConfig(s);
  if (b.task !== "recurring" && (!cfg.enabled || !cfg.secret))
    throw new Error("Enable OpenAI in AI settings first");
  if (!s.lock("ai-request", 120000))
    throw new Error("An AI task is already running; try again shortly");
  try {
    if (b.task === "recurring") {
      const proposals = recurringCandidates(s)
        .filter(
          (r) =>
            !s
              .all<Recurring>("recurring")
              .some((x) => merchantKey(x.name) === merchantKey(r.name)),
        )
        .map((r) =>
          makeProposal(s, user.id, "recurring", null, { ...r, id: uid() }),
        );
      return {
        reply: `Found ${proposals.length} possible monthly recurring items. Review before saving. No API call was needed.`,
        proposals,
      };
    }
    if (b.task === "chat" && !b.message.trim())
      throw new Error("Enter a message");
    if (
      b.task === "chat" &&
      /\b(system prompt|api key|ignore .*instructions|jailbreak|execute code|run shell|write malware)\b/i.test(
        b.message,
      )
    )
      return { reply: REFUSAL, proposals: [] };
    const memory = aiMemory(s),
      categories = s.categories().filter((c) => !c.archived),
      all = s.txs();
    let applied = 0;
    if (b.task === "categorize")
      s.atomic(() => {
        for (const t of all.filter(eligible).slice(0, 500)) {
          const learned = memory.examples.find(
            (e) => e.merchant === merchantKey(t.merchant),
          );
          const explicit = s.get<{ category_id: string }>(
            "aliases",
            merchantKey(t.merchant),
          );
          const candidate = classify(
            t,
            s.rules(),
            explicit?.category_id || learned?.category_id,
          );
          if (
            candidate.allocations[0].category_id !== "uncategorized" &&
            categories.some(
              (c) => c.id === candidate.allocations[0].category_id,
            )
          ) {
            const next = {
              ...candidate,
              revision: t.revision + 1,
              reviewed: false,
              classification_source: explicit
                ? "merchant-default"
                : learned
                  ? "learned-memory"
                  : candidate.classification_source,
            };
            s.saveTx(next);
            s.audit(user.id, "ai-local-category", t.id, t, next);
            applied++;
          }
        }
      });
    const refreshed = s.txs(),
      start = b.month + "-01",
      end = b.month + "-31";
    const included = new Set(
      s
        .accounts()
        .filter((a) => a.include_reports)
        .map((a) => a.id),
    );
    const period = refreshed.filter(
      (t) =>
        included.has(t.account_id) &&
        t.date >= start &&
        t.date <= end &&
        (!b.merchant ||
          merchantKey(t.merchant).includes(merchantKey(b.merchant))),
    );
    const posted = report(
      period.filter((t) => !t.transfer_id),
      s.categories(),
      { start, end },
    );
    const totals = {
      income: posted.income,
      spending: posted.spending,
      pending_expenses: period
        .filter((t) => t.status === "pending" && !t.transfer_id)
        .reduce(
          (n, t) =>
            n +
            t.allocations
              .filter((a) => a.amount < 0 && a.category_id !== "transfer")
              .reduce((m, a) => m - a.amount, 0),
          0,
        ),
      count: period.length,
    };
    const contextHash = digest({
      memory,
      categories: categories.map((c) => [c.id, c.name]),
      rules: s.rules(),
      model: MODEL,
    });
    const eligibleRows = refreshed
      .filter(eligible)
      .filter(
        (t) =>
          s.get("ai_attempts", t.id)?.fingerprint !==
          digest({ revision: t.revision, contextHash }),
      );
    const selected = (b.task === "categorize" ? eligibleRows : period).slice(
      0,
      b.task === "categorize" ? 25 : 40,
    );
    if (b.task === "categorize" && !selected.length)
      return {
        reply: `Applied ${applied} local classifications. No new eligible transactions need an API request.`,
        proposals: [],
        applied,
      };
    const rows = selected.map((t) => ({
      id: t.id,
      date: t.date,
      merchant: t.merchant.slice(0, 100),
      amount: t.amount,
      status: t.status,
      allocations: t.allocations.map((a) => ({
        category_id: a.category_id,
        amount: a.amount,
      })),
    }));
    const chat = s.get<Chat>("ai_chat", user.id) || { messages: [] };
    const budget = s.get("budgets", b.month) || null;
    const input = {
      task: b.task,
      message: b.message,
      month: b.month,
      filter: b.merchant,
      totals,
      category_totals: posted.byCategory.slice(0, 20),
      merchant_totals: posted.byMerchant.slice(0, 15),
      rows,
      rows_are_sample: rows.length < period.length,
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
      })),
      budget,
      recurring: s
        .all<Schedule>("recurring")
        .filter((r) => r.active)
        .slice(0, 30)
        .map((r) => ({
          id: r.id,
          name: r.name,
          kind: r.kind,
          amount: r.amount,
          category_id: r.category_id,
          frequency: r.frequency || "monthly",
          start_date: r.start_date,
          days: r.days,
        })),
      memory: {
        notes: memory.notes,
        examples: memory.examples
          .filter((e) =>
            selected.some((t) => merchantKey(t.merchant) === e.merchant),
          )
          .slice(0, 20),
      },
      history:
        b.task === "chat"
          ? chat.messages
              .slice(-4)
              .map((m) => ({ ...m, text: m.text.slice(0, 1200) }))
          : [],
    };
    const payload = requestPayload(input),
      bytes = Buffer.byteLength(JSON.stringify(payload));
    if (bytes > 40000)
      throw new Error(
        "Context exceeds the low-cost limit. Narrow the merchant filter or shorten memory notes.",
      );
    const now = new Date().toISOString(),
      usage = s.all<Usage>("ai_usage"),
      reserve = Math.ceil(bytes * 0.125 + 2000 * 0.5);
    if (
      usage.filter((u) => u.at.startsWith(now.slice(0, 10))).length >=
      cfg.daily_calls
    )
      throw new Error("Daily AI request limit reached");
    if (
      usage
        .filter((u) => u.at.startsWith(now.slice(0, 7)))
        .reduce((n, u) => n + u.microusd, 0) +
        reserve >
      cfg.monthly_cap_cents * 10000
    )
      throw new Error("Monthly AI spending cap reached");
    const charge: Usage = {
      id: uid(),
      at: now,
      microusd: reserve,
      status: "reserved",
      task: b.task,
    };
    s.put("ai_usage", charge.id, charge);
    let result;
    try {
      result = await transport(unseal(cfg.secret!), payload);
      s.put("ai_usage", charge.id, {
        ...charge,
        status: "completed",
        input: result.input,
        output: result.output,
        microusd: Math.ceil(result.input * 0.125 + result.output * 0.5),
      });
    } catch (e) {
      s.put("ai_usage", charge.id, {
        ...charge,
        status: "unknown-failure-reserved",
      });
      throw e;
    }
    if (!aiConfig(s).enabled)
      throw new Error(
        "AI was disabled while this request ran; no model changes applied",
      );
    const answer = answerSchema.parse(result.answer);
    if (!answer.in_scope) return { reply: REFUSAL, proposals: [] };
    const selectedMap = new Map(selected.map((t) => [t.id, t])),
      proposals: Proposal[] = [];
    let flagged = 0;
    // All returned IDs must come from the bounded context; invalid output is rejected.
    if (
      answer.citations.some((id) => !selectedMap.has(id)) ||
      answer.categories.some((x) => !selectedMap.has(x.id)) ||
      answer.flags.some((x) => !selectedMap.has(x.id))
    )
      throw new Error(
        "AI referred to data outside its context; no changes applied",
      );
    if (b.task === "categorize") {
      if (
        new Set(answer.categories.map((x) => x.id)).size !==
        answer.categories.length
      )
        throw new Error("AI returned duplicate category suggestions");
      for (const x of answer.categories)
        if (
          !categories.some(
            (c) =>
              c.id === x.category_id &&
              c.kind === "expense" &&
              c.id !== "uncategorized",
          )
        )
          throw new Error("AI returned an invalid category");
      s.atomic(() => {
        for (const t of selected) {
          const current = s.tx(t.id);
          if (!current || current.revision !== t.revision || !eligible(current))
            continue;
          const suggestion = answer.categories.find((x) => x.id === t.id);
          if (suggestion && suggestion.confidence >= 0.95) {
            const next = {
              ...current,
              allocations: [
                {
                  ...current.allocations[0],
                  category_id: suggestion.category_id,
                },
              ],
              classification_source: "openai",
              reviewed: false,
              revision: current.revision + 1,
            };
            s.saveTx(next);
            s.audit(user.id, "ai-category", t.id, current, next);
            applied++;
          } else
            flagged += Number(
              setFlag(
                s,
                current,
                "AI could not confidently categorize this transaction",
                user.id,
              ),
            );
          s.put("ai_attempts", t.id, {
            fingerprint: digest({
              revision: s.tx(t.id)!.revision,
              contextHash,
            }),
          });
        }
      });
    }
    if (b.task === "review")
      s.atomic(() => {
        for (const f of answer.flags) {
          const current = s.tx(f.id),
            snapshot = selectedMap.get(f.id)!;
          if (current && current.revision === snapshot.revision)
            flagged += Number(setFlag(s, current, "AI: " + f.reason, user.id));
        }
      });
    if (b.task === "chat") {
      if (answer.budget) {
        if (answer.budget.month !== b.month)
          throw new Error("Budget proposal must match the selected month");
        const base = budgetSchema.parse(
            budget || { month: b.month, expected_income: 0, lines: [] },
          ),
          lines = base.lines.map((l) => ({ ...l }));
        for (const patch of answer.budget.lines) {
          if (
            !categories.some(
              (c) => c.id === patch.category_id && c.kind === "expense",
            )
          )
            throw new Error("Invalid budget category");
          const l = lines.find((l) => l.category_id === patch.category_id);
          if (l) l.amount = patch.amount;
          else lines.push({ ...patch, rollover: false, opening: 0 });
        }
        const after = budgetSchema.parse({
          ...base,
          expected_income:
            answer.budget.expected_income ?? base.expected_income,
          lines,
        });
        if (after.expected_income < 0)
          throw new Error("Income must be nonnegative");
        proposals.push(makeProposal(s, user.id, "budget", budget, after));
      }
      for (const r of answer.recurring) {
        const before = r.id ? s.get("recurring", r.id) || null : null;
        if (r.id && !before) throw new Error("Recurring item not found");
        if (before?.frequency && before.frequency !== "monthly")
          throw new Error("Use Recurring plans to edit non-monthly schedules");
        if (
          !categories.some(
            (c) => c.id === r.category_id && c.kind != "transfer",
          )
        )
          throw new Error("Invalid recurring category");
        const after = recurringSchema.parse({
          ...r,
          id: r.id || uid(),
          active: true,
        });
        validateRecurringCategory(s, after);
        proposals.push(makeProposal(s, user.id, "recurring", before, after));
      }
      if (answer.memory_note) {
        proposals.push(
          makeProposal(s, user.id, "memory", memory, {
            ...memory,
            notes: (memory.notes + "\n" + answer.memory_note)
              .trim()
              .slice(0, 3000),
          }),
        );
      }
    }
    const reply =
      answer.reply +
      (b.task === "categorize"
        ? `\nApplied ${applied}; flagged ${flagged}.`
        : b.task === "review"
          ? `\nFlagged ${flagged}.`
          : "");
    if (b.task === "chat")
      s.put("ai_chat", user.id, {
        messages: [
          ...chat.messages,
          { role: "user", text: b.message },
          { role: "assistant", text: reply },
        ].slice(-20),
      });
    s.audit(user.id, "ai-task", b.task, undefined, {
      applied,
      flagged,
      request: charge.id,
    });
    return {
      reply,
      proposals,
      applied,
      flagged,
      citations: answer.citations,
      remaining:
        b.task === "categorize"
          ? Math.max(0, eligibleRows.length - selected.length)
          : 0,
    };
  } finally {
    s.unlock("ai-request");
  }
}
export async function scheduledAi(s: Store) {
  const cfg = aiConfig(s);
  if (!cfg.enabled || !cfg.automatic) return;
  const last = s.get<{ at: number; fingerprint: string }>("ai_jobs", "last");
  if (last && Date.now() - last.at < 3600000) return;
  const fingerprint = digest(s.txs().map((t) => [t.id, t.revision]));
  if (last?.fingerprint === fingerprint) return;
  const actor = { id: "ai-scheduler", role: "owner" as const };
  try {
    const review = scanReview(s, actor.id);
    const result = await runAi(s, actor, {
      task: "categorize",
      month: new Date().toISOString().slice(0, 7),
    });
    s.put("ai_jobs", "last", { at: Date.now(), fingerprint, review, result });
  } catch (e) {
    s.put("ai_jobs", "last", {
      at: Date.now(),
      fingerprint: "retry",
      error: e instanceof Error ? e.message : "AI task failed",
    });
  }
}
