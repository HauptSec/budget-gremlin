import {
  migrateSchedules,
  schedules,
  calendar,
  saveSchedule,
  saveException,
  recurringSuggestions,
  dismissSuggestion,
  syncRecurringPlan,
  recurringPlan,
  monthItems,
} from "./recurring.ts";
import {
  scheduleSchema,
  exceptionSchema,
  planWithRecurring,
} from "../../packages/recurring/index.ts";
import {
  aiStatus,
  saveAiConfig,
  aiMemory,
  saveMemory,
  learnCorrection,
  runAi,
  listProposals,
  decideProposal,
  scanReview,
  saveRecurring,
  proposeRecurringBudget,
} from "./ai.ts";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import staticPlugin from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { Store, uid, type User } from "./db.ts";
import { checkPassword, hashPassword, hash, token } from "./security.ts";
import {
  accountSchema,
  budgetSchema,
  categorySchema,
  day,
  importSchema,
  month,
  reportQuery,
  ruleSchema,
  transactionSchema,
  type Transaction,
  type Budget,
  type Rule,
} from "../../packages/shared/schema.ts";
import {
  budgetView,
  coversRange,
  classify,
  csvReport,
  delta,
  report,
  monthEnd,
} from "../../packages/domain/index.ts";
import { previewImport, commitImport } from "./imports.ts";
import {
  connectSimplefin,
  syncConnection,
  disconnectConnection,
  publicConnections,
} from "./sync.ts";
import { createBackup } from "./backup.ts";
declare module "fastify" {
  interface FastifyRequest {
    user: User;
    sessionHash: string;
    csrf: string;
  }
}
const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});
const safeUser = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});
export async function createServer(
  store: Store,
  {
    origin = process.env.APP_ORIGIN || "http://localhost:5173",
    secure = process.env.SECURE_COOKIES === "true",
    serveStatic = true,
    rateLimitMax = 300,
  } = {},
) {
  migrateSchedules(store);
  const app = Fastify({
    logger: false,
    bodyLimit: 12 * 1024 * 1024,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: secure ? [] : null,
      },
    },
  });
  await app.register(rateLimit, { max: rateLimitMax, timeWindow: "1 minute" });
  await app.register(swagger, {
    openapi: { info: { title: "Budget Gremlin API", version: "0.1.0" } },
  });
  app.decorateRequest("user", null as unknown as User);
  app.decorateRequest("sessionHash", "");
  app.decorateRequest("csrf", "");
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "private, no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== origin)
        throw Object.assign(new Error("Origin not allowed"), {
          statusCode: 403,
        });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        throw Object.assign(new Error("JSON required"), { statusCode: 415 });
    }
    if (
      [
        "/api/v1/auth/login",
        "/api/v1/auth/accept-invite",
        "/api/v1/health",
      ].includes(req.url.split("?")[0])
    )
      return;
    const sessionHash = hash(req.cookies.session || "");
    const session = store.db
      .prepare("SELECT * FROM sessions WHERE hash=?")
      .get(sessionHash);
    if (
      !session ||
      Number(session.created_at) < Date.now() - 30 * 86400000 ||
      Number(session.last_seen) < Date.now() - 7 * 86400000
    )
      throw Object.assign(new Error("Please sign in"), { statusCode: 401 });
    const user = store.db
      .prepare("SELECT * FROM users WHERE id=? AND disabled=0")
      .get(session.user_id as string) as User | undefined;
    if (!user)
      throw Object.assign(new Error("Please sign in"), { statusCode: 401 });
    req.user = user;
    req.sessionHash = sessionHash;
    req.csrf = String(session.csrf);
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== session.csrf
    )
      throw Object.assign(new Error("Invalid request token"), {
        statusCode: 403,
      });
    store.db
      .prepare("UPDATE sessions SET last_seen=? WHERE hash=?")
      .run(Date.now(), sessionHash);
  });
  app.setErrorHandler((e, req, reply) => {
    const err = e as Error & { statusCode?: number };
    const status =
      e instanceof z.ZodError
        ? 400
        : err.statusCode ||
          (/^(Account|Transaction|Category|Transfer|Candidate|Import|Budget|Member|Connection) not found/i.test(
            err.message,
          )
            ? 404
            : /changed|revision/i.test(err.message)
              ? 409
              : 400);
    reply.code(status).send({
      error:
        e instanceof z.ZodError
          ? e.issues.map((i) => i.message).join("; ")
          : status >= 500
            ? "An internal error occurred"
            : err.message,
    });
  });
  const owner = (req: { user: User }) => {
    if (req.user.role !== "owner")
      throw Object.assign(new Error("Owner access required"), {
        statusCode: 403,
      });
  };
  const requestBodies: Record<string, z.ZodType> = {
    "POST /api/v1/recurring": scheduleSchema,
    "POST /api/v1/recurring/occurrence": exceptionSchema,
    "POST /api/v1/accounts": accountSchema,
    "PATCH /api/v1/accounts/:id": accountSchema,
    "POST /api/v1/categories": categorySchema,
    "PATCH /api/v1/categories/:id": categorySchema,
    "POST /api/v1/transactions": transactionSchema,
    "PATCH /api/v1/transactions/:id": transactionSchema.safeExtend({
      revision: z.number().int(),
    }),
    "POST /api/v1/budgets": budgetSchema,
    "POST /api/v1/rules": ruleSchema.extend({ id: z.string().optional() }),
    "POST /api/v1/imports/preview": importSchema,
    "POST /api/v1/imports/commit": importSchema.extend({
      revision: z.number().int(),
    }),
    "POST /api/v1/invitations": z.object({ email: z.email() }),
    "POST /api/v1/connections": z.object({
      setup_token: z.string().min(1),
      start: day,
    }),
    "POST /api/v1/coverage": z.object({
      account_id: z.string(),
      start: day,
      end: day,
    }),
  };
  const route = (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    summary: string,
    handler: Parameters<typeof app.route>[0]["handler"],
  ) =>
    app.route({
      method,
      url,
      schema: {
        summary,
        tags: [url.split("/")[3] || "app"],
        ...(requestBodies[method + " " + url]
          ? {
              body: z.toJSONSchema(requestBodies[method + " " + url], {
                target: "draft-7",
              }),
            }
          : {}),
        ...(method === "GET" &&
        ["/api/v1/reports", "/api/v1/reports/export"].includes(url)
          ? {
              querystring: z.toJSONSchema(
                reportQuery.safeExtend({
                  priorStart: day.optional(),
                  priorEnd: day.optional(),
                }),
                { target: "draft-7" },
              ),
            }
          : {}),
      },
      handler,
    });
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: String(
        store.get("settings", "household")?.timezone || "America/Los_Angeles",
      ),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const checkCategory = (id: string) => {
    if (!store.get("categories", id)) throw new Error("Category not found");
  };
  route("GET", "/api/v1/health", "Process health", async () => ({ ok: true }));
  app.post(
    "/api/v1/auth/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        summary: "Sign in",
        body: z.toJSONSchema(loginSchema, { target: "draft-7" }),
      },
    },
    async (req, reply) => {
      const body = loginSchema.parse(req.body);
      const u = store.db
        .prepare("SELECT * FROM users WHERE email=? AND disabled=0")
        .get(body.email.toLowerCase()) as User | undefined;
      const valid = await checkPassword(
        body.password,
        u?.password || (await hashPassword("not-a-real-password")),
      );
      if (!u || !valid)
        throw Object.assign(new Error("Email or password is incorrect"), {
          statusCode: 401,
        });
      const secret = token(),
        csrf = token();
      store.db
        .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
        .run(hash(secret), u.id, Date.now(), Date.now(), csrf);
      store.audit(u.id, "login", u.id);
      reply.setCookie("session", secret, {
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/",
        maxAge: 30 * 86400,
      });
      return { user: safeUser(u), csrf };
    },
  );
  route("GET", "/api/v1/auth/me", "Current session", async (req) => ({
    user: safeUser(req.user),
    csrf: req.csrf,
    today: today(),
  }));
  route("POST", "/api/v1/auth/logout", "End session", async (req, reply) => {
    store.db.prepare("DELETE FROM sessions WHERE hash=?").run(req.sessionHash);
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  route("GET", "/api/v1/auth/sessions", "List your sessions", async (req) =>
    store.db
      .prepare("SELECT hash,created_at,last_seen FROM sessions WHERE user_id=?")
      .all(req.user.id)
      .map((s) => ({ ...s, current: s.hash === req.sessionHash })),
  );
  route(
    "DELETE",
    "/api/v1/auth/sessions/:id",
    "Revoke a session",
    async (req) => {
      store.db
        .prepare("DELETE FROM sessions WHERE hash=? AND user_id=?")
        .run((req.params as { id: string }).id, req.user.id);
      return { ok: true };
    },
  );
  route(
    "POST",
    "/api/v1/auth/password",
    "Change your password",
    async (req) => {
      const b = z
        .object({ current: z.string(), password: z.string().min(12).max(200) })
        .parse(req.body);
      if (!(await checkPassword(b.current, req.user.password)))
        throw new Error("Current password incorrect");
      const password = await hashPassword(b.password);
      store.atomic(() => {
        store.db
          .prepare("UPDATE users SET password=? WHERE id=?")
          .run(password, req.user.id);
        store.db
          .prepare("DELETE FROM sessions WHERE user_id=? AND hash<>?")
          .run(req.user.id, req.sessionHash);
        store.audit(req.user.id, "password", req.user.id);
      });
      return { ok: true };
    },
  );
  route("GET", "/api/v1/users", "List household members", async () =>
    store.db
      .prepare("SELECT id,name,email,role,disabled FROM users WHERE disabled=0")
      .all(),
  );
  route(
    "POST",
    "/api/v1/invitations",
    "Invite household member",
    async (req) => {
      owner(req);
      const { email } = z.object({ email: z.email() }).parse(req.body);
      const secret = token();
      store.db
        .prepare("INSERT INTO invitations VALUES(?,?,?)")
        .run(hash(secret), email.toLowerCase(), Date.now() + 48 * 3600000);
      store.audit(req.user.id, "invite", "household");
      return { url: origin + "/invite#" + secret, expiresInHours: 48 };
    },
  );
  app.post(
    "/api/v1/auth/accept-invite",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const b = z
        .object({
          token: z.string(),
          name: z.string().min(1).max(80),
          password: z.string().min(12).max(200),
        })
        .parse(req.body);
      const password = await hashPassword(b.password);
      return store.atomic(() => {
        const invite = store.db
          .prepare("SELECT * FROM invitations WHERE hash=? AND expires>?")
          .get(hash(b.token), Date.now());
        if (!invite) throw new Error("Invitation invalid or expired");
        const id = uid();
        store.db
          .prepare("INSERT INTO users VALUES(?,?,?,?,?,0)")
          .run(id, invite.email as string, b.name, "member", password);
        store.db
          .prepare("DELETE FROM invitations WHERE hash=?")
          .run(hash(b.token));
        store.audit(id, "join", id);
        return { ok: true };
      });
    },
  );
  route(
    "DELETE",
    "/api/v1/users/:id",
    "Remove household member",
    async (req) => {
      owner(req);
      const id = (req.params as { id: string }).id;
      const u = store.db.prepare("SELECT * FROM users WHERE id=?").get(id);
      if (!u) throw new Error("Member not found");
      if (u.role === "owner") throw new Error("Cannot remove the owner");
      store.atomic(() => {
        store.db.prepare("UPDATE users SET disabled=1 WHERE id=?").run(id);
        store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
        store.audit(req.user.id, "remove-member", id);
      });
      return { ok: true };
    },
  );
  route("GET", "/api/v1/meta", "Taxonomy, accounts and settings", async () => ({
    accounts: store.accounts(),
    categories: store.categories(),
    settings: store.get("settings", "household"),
    today: today(),
    revision: store.revision(),
    duplicateCount: store.all("duplicates").length,
  }));
  route(
    "GET",
    "/api/v1/accounts",
    "List accounts and calculated balances",
    async () =>
      store.accounts().map((a) => ({
        ...a,
        ledger_balance:
          a.opening_balance +
          store
            .txs()
            .filter(
              (t) =>
                t.account_id === a.id &&
                t.status === "posted" &&
                t.date >= a.opening_date,
            )
            .reduce((n, t) => n + t.amount, 0),
      })),
  );
  route("POST", "/api/v1/accounts", "Create account", async (req) => {
    const a = { ...accountSchema.parse(req.body), id: uid() };
    store.atomic(() => {
      store.put("accounts", a.id, a);
      store.audit(req.user.id, "create-account", a.id, undefined, a);
    });
    return a;
  });
  route(
    "PATCH",
    "/api/v1/accounts/:id",
    "Edit or archive account",
    async (req) => {
      const id = (req.params as { id: string }).id,
        old = store.get("accounts", id);
      if (!old) throw new Error("Account not found");
      const a = { ...old, ...accountSchema.parse(req.body), id };
      store.atomic(() => {
        store.put("accounts", id, a);
        store.audit(req.user.id, "edit-account", id, old, a);
      });
      return a;
    },
  );
  route("POST", "/api/v1/categories", "Create category", async (req) => {
    const c = { ...categorySchema.parse(req.body), id: uid() };
    store.atomic(() => {
      store.put("categories", c.id, c);
      store.audit(req.user.id, "create-category", c.id, undefined, c);
    });
    return c;
  });
  route("PATCH", "/api/v1/categories/:id", "Edit category", async (req) => {
    const id = (req.params as { id: string }).id,
      old = store.get("categories", id);
    if (!old) throw new Error("Category not found");
    const c = { ...categorySchema.parse(req.body), id };
    if (
      ["uncategorized", "income", "transfer"].includes(id) &&
      (c.kind !== old.kind || c.archived)
    )
      throw new Error(
        "System categories must retain their type and remain active",
      );
    if (
      c.kind !== old.kind &&
      store.txs().some((t) => t.allocations.some((a) => a.category_id === id))
    )
      throw new Error("Cannot change the kind of a category with history");
    store.atomic(() => {
      store.put("categories", id, c);
      store.audit(req.user.id, "edit-category", id, old, c);
    });
    return c;
  });
  route(
    "POST",
    "/api/v1/categories/:id/merge",
    "Merge categories",
    async (req) => {
      const id = (req.params as { id: string }).id,
        { destination } = z.object({ destination: z.string() }).parse(req.body);
      const from = store.get("categories", id),
        to = store.get("categories", destination);
      if (["uncategorized", "income", "transfer"].includes(id))
        throw new Error("System categories cannot be merged");
      if (
        !from ||
        !to ||
        to.archived ||
        id === destination ||
        from.kind !== to.kind
      )
        throw new Error("Choose a different category of the same kind");
      if (
        store.budgets().some((b) => b.lines.some((l) => l.category_id === id))
      )
        throw new Error("Remove source category from budgets before merging");
      store.atomic(() => {
        for (const t of store.txs())
          if (t.allocations.some((a) => a.category_id === id))
            store.saveTx({
              ...t,
              revision: t.revision + 1,
              allocations: t.allocations.map((a) =>
                a.category_id === id ? { ...a, category_id: destination } : a,
              ),
            });
        for (const r of store.rules())
          if (r.category_id === id)
            store.put("rules", r.id, { ...r, category_id: destination });
        for (const alias of store.all("aliases"))
          if (alias.category_id === id && typeof alias.id === "string")
            store.put("aliases", alias.id, {
              ...alias,
              category_id: destination,
            });
        store.put("categories", id, { ...from, archived: true });
        store.audit(req.user.id, "merge-category", id, from, { destination });
      });
      return { ok: true };
    },
  );
  route(
    "GET",
    "/api/v1/transactions",
    "Search and page transactions",
    async (req) => {
      const q = z
        .object({
          search: z.string().optional(),
          account: z.string().optional(),
          category: z.string().optional(),
          tag: z.string().optional(),
          status: z.enum(["posted", "pending"]).optional(),
          reviewed: z.enum(["true", "false"]).optional(),
          start: day.optional(),
          end: day.optional(),
          min: z.coerce.number().optional(),
          max: z.coerce.number().optional(),
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(req.query);
      const rows = store
        .txs(q.start, q.end)
        .filter(
          (t) =>
            (!q.search ||
              [t.merchant, t.raw_description, t.notes]
                .join(" ")
                .toLowerCase()
                .includes(q.search.toLowerCase())) &&
            (!q.account || t.account_id === q.account) &&
            (!q.category ||
              t.allocations.some((a) => a.category_id === q.category)) &&
            (!q.tag || t.allocations.some((a) => a.tags.includes(q.tag!))) &&
            (!q.status || t.status === q.status) &&
            (q.reviewed === undefined ||
              t.reviewed === (q.reviewed === "true")) &&
            (q.min === undefined || t.amount >= q.min) &&
            (q.max === undefined || t.amount <= q.max),
        );
      return {
        rows: rows.slice((q.page - 1) * q.limit, q.page * q.limit),
        total: rows.length,
        page: q.page,
        pages: Math.ceil(rows.length / q.limit),
      };
    },
  );
  route(
    "POST",
    "/api/v1/transactions",
    "Create manual transaction",
    async (req) => {
      const b = transactionSchema.parse(req.body);
      const tx: Transaction = {
        ...b,
        id: uid(),
        raw_description: b.merchant,
        revision: 1,
        source: "manual",
        classification_source: "manual",
        created_at: new Date().toISOString(),
      };
      store.atomic(() => {
        store.saveTx(tx);
        store.audit(req.user.id, "create-transaction", tx.id, undefined, tx);
      });
      return tx;
    },
  );
  route(
    "PATCH",
    "/api/v1/transactions/:id",
    "Edit and split transaction",
    async (req) => {
      const id = (req.params as { id: string }).id,
        old = store.tx(id);
      if (!old) throw new Error("Transaction not found");
      const rev = z.object({ revision: z.number().int() }).parse(req.body);
      if (rev.revision !== old.revision)
        throw new Error("Transaction changed; reload");
      const b = transactionSchema.parse(req.body);
      if (
        old.transfer_id &&
        (b.amount !== old.amount ||
          b.account_id !== old.account_id ||
          b.allocations.some((a) => a.category_id !== "transfer"))
      )
        throw new Error(
          "Unlink the transfer before changing its amount, account or category",
        );
      const tx = {
        ...old,
        ...b,
        revision: old.revision + 1,
        classification_source: "manual",
        locked: true,
      };
      store.atomic(() => {
        store.saveTx(tx);
        store.audit(req.user.id, "edit-transaction", id, old, tx);
      });
      learnCorrection(store, req.user.id, old, tx);
      return tx;
    },
  );
  route(
    "POST",
    "/api/v1/transactions/bulk",
    "Bulk review or categorize selected transactions",
    async (req) => {
      const b = z
        .object({
          ids: z.array(z.string()).min(1).max(1000),
          category_id: z.string().optional(),
          reviewed: z.boolean().optional(),
        })
        .parse(req.body);
      if (b.category_id) checkCategory(b.category_id);
      const corrections: { old: Transaction; next: Transaction }[] = [];
      store.atomic(() => {
        for (const id of new Set(b.ids)) {
          const old = store.tx(id);
          if (!old) throw new Error("Transaction not found");
          if (b.category_id && old.transfer_id)
            throw new Error("Unlink transfers before recategorizing");
          if (b.category_id && old.allocations.length > 1)
            throw new Error("Edit split categories individually");
          const tx = {
            ...old,
            reviewed: b.reviewed ?? old.reviewed,
            locked: b.category_id ? true : old.locked,
            classification_source: b.category_id
              ? "manual"
              : old.classification_source,
            revision: old.revision + 1,
            allocations: b.category_id
              ? [
                  {
                    category_id: b.category_id,
                    amount: old.amount,
                    tags: old.allocations[0]?.tags || [],
                  },
                ]
              : old.allocations,
          };
          store.saveTx(tx);
          store.audit(req.user.id, "edit-transaction", id, old, tx);
          if (b.category_id) corrections.push({ old, next: tx });
        }
      });
      for (const correction of corrections)
        learnCorrection(store, req.user.id, correction.old, correction.next);
      return { updated: new Set(b.ids).size };
    },
  );
  route(
    "GET",
    "/api/v1/transfers/suggestions",
    "Suggested transfer pairs",
    async () => {
      const txs = store
        .txs()
        .filter((t) => !t.transfer_id && t.status === "posted");
      return txs
        .filter((t) => t.amount < 0)
        .flatMap((a) =>
          txs
            .filter(
              (b) =>
                b.account_id !== a.account_id &&
                b.amount === -a.amount &&
                Math.abs(+new Date(a.date) - +new Date(b.date)) <= 3 * 86400000,
            )
            .map((b) => ({ a, b })),
        )
        .slice(0, 100);
    },
  );
  route("POST", "/api/v1/transfers", "Confirm transfer pair", async (req) => {
    const { a, b } = z.object({ a: z.string(), b: z.string() }).parse(req.body);
    const left = store.tx(a),
      right = store.tx(b);
    if (
      !left ||
      !right ||
      left.account_id === right.account_id ||
      left.amount !== -right.amount ||
      left.transfer_id ||
      right.transfer_id
    )
      throw new Error("Invalid transfer pair");
    const id = uid();
    store.atomic(() => {
      store.put("transfers", id, { id, before: [left, right] });
      for (const t of [left, right]) {
        const next = {
          ...t,
          transfer_id: id,
          revision: t.revision + 1,
          locked: true,
          classification_source: "manual",
          allocations: [
            { category_id: "transfer", amount: t.amount, tags: [] },
          ],
        };
        store.saveTx(next);
        store.audit(req.user.id, "transfer", t.id, t, next);
      }
    });
    return { id };
  });
  route("DELETE", "/api/v1/transfers/:id", "Unlink transfer", async (req) => {
    const id = (req.params as { id: string }).id,
      link = store.get<{ before: Transaction[] }>("transfers", id);
    if (!link) throw new Error("Transfer not found");
    store.atomic(() => {
      for (const prior of link.before) {
        const current = store.tx(prior.id)!;
        store.saveTx({
          ...current,
          allocations: prior.allocations,
          transfer_id: null,
          reviewed: false,
          revision: current.revision + 1,
        });
        store.audit(req.user.id, "unlink-transfer", prior.id);
      }
      store.delete("transfers", id);
    });
    return { ok: true };
  });
  route("GET", "/api/v1/rules", "List classification rules", async () =>
    store.rules().sort((a, b) => a.priority - b.priority),
  );
  route("POST", "/api/v1/rules", "Save classification rule", async (req) => {
    const r = {
      ...ruleSchema.parse(req.body),
      id: (req.body as { id?: string }).id || uid(),
    };
    checkCategory(r.category_id);
    store.atomic(() => {
      store.put("rules", r.id, r);
      store.audit(req.user.id, "rule", r.id);
    });
    return r;
  });
  route("DELETE", "/api/v1/rules/:id", "Delete rule", async (req) => {
    store.delete("rules", (req.params as { id: string }).id);
    store.audit(req.user.id, "delete-rule", (req.params as { id: string }).id);
    return { ok: true };
  });
  route(
    "POST",
    "/api/v1/rules/preview",
    "Preview retroactive classification",
    async () => {
      const changes = store
        .txs()
        .filter((t) => !t.locked && t.allocations.length === 1)
        .map((t) => ({ before: t, after: classify(t, store.rules()) }))
        .filter((x) => JSON.stringify(x.before) !== JSON.stringify(x.after));
      return { revision: store.revision(), changes };
    },
  );
  route(
    "POST",
    "/api/v1/rules/apply",
    "Apply versioned rule preview",
    async (req) => {
      const { revision } = z.object({ revision: z.number() }).parse(req.body);
      if (revision !== store.revision())
        throw new Error("Data changed. Preview rules again.");
      let count = 0;
      store.atomic(() => {
        for (const t of store
          .txs()
          .filter((t) => !t.locked && t.allocations.length === 1)) {
          const next = classify(t, store.rules());
          if (JSON.stringify(t) !== JSON.stringify(next)) {
            store.saveTx({ ...next, revision: t.revision + 1 });
            store.audit(req.user.id, "edit-transaction", t.id, t, {
              ...next,
              revision: t.revision + 1,
            });
            count++;
          }
        }
      });
      return { count };
    },
  );
  route("GET", "/api/v1/aliases", "Merchant defaults", async () =>
    store.all("aliases"),
  );
  route("POST", "/api/v1/aliases", "Set merchant default", async (req) => {
    const b = z
      .object({ merchant: z.string().min(1).max(200), category_id: z.string() })
      .parse(req.body);
    checkCategory(b.category_id);
    const id = b.merchant.trim().toLowerCase();
    store.put("aliases", id, { ...b, id });
    store.audit(req.user.id, "merchant-default", id);
    return { ok: true };
  });
  route(
    "POST",
    "/api/v1/imports/preview",
    "Preview CSV mapping",
    async (req) => {
      const b = importSchema.parse(req.body);
      return previewImport(store, b.account_id, b.csv, b.mapping);
    },
  );
  route(
    "POST",
    "/api/v1/imports/commit",
    "Commit accepted CSV rows",
    async (req) => {
      const b = importSchema.parse(req.body),
        { revision } = z.object({ revision: z.number() }).parse(req.body);
      return commitImport(
        store,
        req.user.id,
        b.account_id,
        b.csv,
        b.mapping,
        revision,
      );
    },
  );
  route("GET", "/api/v1/imports", "Import history", async () =>
    store.all("imports"),
  );
  route("GET", "/api/v1/imports/mappings", "Saved CSV mappings", async () =>
    store.all("mappings"),
  );
  route("GET", "/api/v1/duplicates", "Quarantined duplicates", async () =>
    store.all("duplicates"),
  );
  route(
    "POST",
    "/api/v1/duplicates/:id",
    "Resolve duplicate candidate",
    async (req) => {
      const id = (req.params as { id: string }).id,
        d = store.get<{
          row: Transaction;
          batch: string | null;
          source_key?: string;
          candidates: string[];
        }>("duplicates", id);
      if (!d) throw new Error("Candidate not found");
      const { match } = z
        .object({ match: z.string().nullable() })
        .parse(req.body);
      if (match && !d.candidates.includes(match))
        throw new Error("Invalid match");
      store.atomic(() => {
        if (!match) store.saveTx(d.row);
        else {
          const existing = store.tx(match);
          if (!existing || existing.removed)
            throw new Error(
              "The candidate no longer exists; keep this as new instead",
            );
          if (
            d.source_key &&
            existing.status === "pending" &&
            d.row.status === "posted"
          ) {
            if (
              existing.amount !== d.row.amount &&
              existing.allocations.length > 1
            )
              throw new Error(
                "Update the split amounts before matching this transaction",
              );
            const next = {
              ...existing,
              date: d.row.date,
              status: "posted" as const,
              amount: d.row.amount,
              raw_description: d.row.raw_description,
              revision: existing.revision + 1,
              allocations:
                existing.allocations.length === 1
                  ? [{ ...existing.allocations[0], amount: d.row.amount }]
                  : existing.allocations,
            };
            store.saveTx(next);
            store.audit(req.user.id, "edit-transaction", match, existing, next);
          }
        }
        store.db
          .prepare("INSERT INTO source_aliases VALUES(?,?,?)")
          .run(d.source_key || "resolved:" + id, match || id, d.batch);
        if (d.source_key) store.delete("sync_quarantine", d.source_key);
        store.delete("duplicates", id);
        store.audit(req.user.id, "resolve-duplicate", id, undefined, { match });
      });
      return { ok: true };
    },
  );
  const undoImpact = (id: string) => {
    const batch = store.get<{ ids: string[] }>("imports", id);
    if (!batch) throw new Error("Import not found");
    const refs = store.db
      .prepare("SELECT transaction_id FROM source_aliases WHERE batch_id=?")
      .all(id)
      .map((r) => String(r.transaction_id));
    return [...new Set([...batch.ids, ...refs])].map((tid) => {
      const tx = store.tx(tid),
        other = Number(
          store.db
            .prepare(
              "SELECT COUNT(*) n FROM source_aliases WHERE transaction_id=? AND (batch_id IS NULL OR batch_id<>?)",
            )
            .get(tid, id)!.n,
        );
      return {
        id: tid,
        remove:
          !!tx &&
          tx.revision === 1 &&
          !tx.locked &&
          !tx.transfer_id &&
          tx.allocations.length === 1 &&
          !other,
      };
    });
  };
  route(
    "GET",
    "/api/v1/imports/:id/undo",
    "Preview import undo",
    async (req) => ({
      revision: store.revision(),
      rows: undoImpact((req.params as { id: string }).id),
    }),
  );
  route(
    "POST",
    "/api/v1/imports/:id/undo",
    "Undo unchanged imported rows",
    async (req) => {
      const id = (req.params as { id: string }).id,
        { revision } = z.object({ revision: z.number() }).parse(req.body);
      if (revision !== store.revision())
        throw new Error("Data changed. Preview again.");
      const impact = undoImpact(id);
      store.atomic(() => {
        for (const r of impact)
          if (r.remove) store.saveTx({ ...store.tx(r.id)!, removed: true });
        store.db.prepare("DELETE FROM source_aliases WHERE batch_id=?").run(id);
        for (const d of store.all<{ id: string; batch: string }>("duplicates"))
          if (d.batch === id) store.delete("duplicates", d.id);
        store.delete("imports", id);
        store.audit(req.user.id, "undo-import", id);
      });
      return {
        removed: impact.filter((r) => r.remove).length,
        preserved: impact.filter((r) => !r.remove).length,
      };
    },
  );
  route(
    "GET",
    "/api/v1/budgets/:month",
    "Monthly budget and rollover",
    async (req) => {
      const m = month.parse((req.params as { month: string }).month);
      const plan = store.atomic(() => syncRecurringPlan(store, m, req.user.id));
      const included = new Set(
        store
          .accounts()
          .filter((a) => a.include_budgets)
          .map((a) => a.id),
      );
      return {
        ...budgetView(
          plan,
          store.budgets(),
          store.txs().filter((t) => included.has(t.account_id)),
          store.categories(),
          today(),
          store.get("settings", "household")?.include_pending !== false,
        ),
        recurring_floor:
          m >= today().slice(0, 7)
            ? planWithRecurring(
                { month: m, expected_income: 0, lines: [] },
                monthItems(store, m),
              )
            : { month: m, expected_income: 0, lines: [] },
      };
    },
  );
  route("POST", "/api/v1/budgets", "Save monthly plan", async (req) => {
    const b = budgetSchema.parse(req.body);
    if (new Set(b.lines.map((l) => l.category_id)).size !== b.lines.length)
      throw new Error("Duplicate budget category");
    for (const l of b.lines)
      if (store.get("categories", l.category_id)?.kind !== "expense")
        throw new Error("Budgets require expense categories");
    store.atomic(() => {
      store.put("budgets", b.month, recurringPlan(store, b.month, b));
      store.audit(req.user.id, "budget", b.month);
    });
    return {
      ok: true,
      affectedMonths: store
        .budgets()
        .filter((p) => p.month >= b.month)
        .map((p) => p.month),
    };
  });
  route(
    "POST",
    "/api/v1/budgets/copy",
    "Copy budget to selected months",
    async (req) => {
      const b = z
          .object({ from: month, to: z.array(month).min(1).max(24) })
          .parse(req.body),
        plan = store.get<Budget>("budgets", b.from);
      if (!plan) throw new Error("Budget not found");
      store.atomic(() => {
        for (const m of b.to) {
          store.put("budgets", m, {
            ...plan,
            month: m,
            lines: plan.lines.map((l) => ({ ...l, opening: 0 })),
          });
          store.audit(req.user.id, "copy-budget", m);
        }
      });
      return { ok: true };
    },
  );
  const makeReport = (query: unknown) => {
    const f = reportQuery.parse(query),
      included = new Set(
        store
          .accounts()
          .filter((a) => a.include_reports)
          .map((a) => a.id),
      );
    const current = report(
      store.txs(f.start, f.end).filter((t) => included.has(t.account_id)),
      store.categories(),
      f,
    );
    const coverage = store.all<{
      account_id: string;
      start: string;
      end: string;
      confirmed: boolean;
    }>("coverage");
    const accounts = store
      .accounts()
      .filter((a) => a.include_reports && (!f.account || f.account === a.id));
    const warnings = accounts
      .filter(
        (a) =>
          !coversRange(
            coverage.filter((c) => c.account_id === a.id && c.confirmed),
            f.start,
            f.end,
          ),
      )
      .map((a) => `Complete coverage is not confirmed for ${a.name}.`);
    return {
      ...current,
      filters: f,
      currency: "USD",
      warnings,
      revision: store.revision(),
    };
  };
  route(
    "GET",
    "/api/v1/reports",
    "Posted report with exact drill-down",
    async (req) => {
      const q = req.query as Record<string, string>;
      const result = makeReport(q);
      let comparison = null;
      let priorReport: ReturnType<typeof makeReport> | null = null;
      if (q.priorStart && q.priorEnd) {
        const prior = makeReport({
          ...q,
          start: q.priorStart,
          end: q.priorEnd,
        });
        priorReport = prior;
        comparison = {
          start: q.priorStart,
          end: q.priorEnd,
          income: prior.income,
          spending: prior.spending,
          net: prior.net,
          warnings: prior.warnings,
          incomeDelta: delta(result.income, prior.income),
          spendingDelta: delta(result.spending, prior.spending),
          netDelta: delta(result.net, prior.net),
        };
      }
      const planned = store
        .budgets()
        .filter(
          (b) =>
            b.month >= result.filters.start.slice(0, 7) &&
            b.month <= result.filters.end.slice(0, 7),
        );
      const openingPlan = store.get<Budget>(
        "budgets",
        result.filters.start.slice(0, 7),
      );
      const budgetAccounts = new Set(
        store
          .accounts()
          .filter((a) => a.include_budgets)
          .map((a) => a.id),
      );
      const opening = openingPlan
        ? budgetView(
            openingPlan,
            store.budgets(),
            store.txs().filter((t) => budgetAccounts.has(t.account_id)),
            store.categories(),
            today(),
            false,
          ).lines
        : [];
      return {
        ...result,
        comparison,
        categoryChanges: store
          .categories()
          .filter((c) => c.kind === "expense")
          .map((c) => {
            const current =
              result.byCategory.find((x) => x.key === c.id)?.amount || 0;
            const previous =
              priorReport?.byCategory.find((x) => x.key === c.id)?.amount || 0;
            return {
              category_id: c.id,
              current,
              previous,
              ...delta(current, previous),
            };
          })
          .filter((c) => c.current || c.previous)
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
          .slice(0, 5),
        budgetVsActual: store
          .categories()
          .filter(
            (c) =>
              c.kind === "expense" &&
              (!q.category || q.category === c.id) &&
              (!q.group || q.group === c.group_name),
          )
          .map((c) => ({
            category_id: c.id,
            opening_rollover:
              opening.find((l) => l.category_id === c.id)?.opening || 0,
            planned: planned.reduce(
              (n, b) =>
                n + (b.lines.find((l) => l.category_id === c.id)?.amount || 0),
              0,
            ),
            actual: result.byCategory.find((x) => x.key === c.id)?.amount || 0,
          })),
        budgetNote:
          "Full monthly plans; actuals use the selected dates. Budget allocations are household-wide, not account-specific.",
      };
    },
  );
  route(
    "GET",
    "/api/v1/reports/export",
    "CSV export of filtered allocations",
    async (req, reply) => {
      const result = makeReport(req.query);
      reply
        .header(
          "Content-Disposition",
          'attachment; filename="budget-gremlin-report.csv"',
        )
        .type("text/csv; charset=utf-8");
      return csvReport(result.rows);
    },
  );
  route(
    "POST",
    "/api/v1/coverage",
    "Confirm imported coverage",
    async (req) => {
      const b = z
        .object({ account_id: z.string(), start: day, end: day })
        .refine((v) => v.start <= v.end)
        .parse(req.body);
      if (!store.get("accounts", b.account_id))
        throw new Error("Account not found");
      const id = uid();
      store.put("coverage", id, { ...b, id, confirmed: true, source: "user" });
      store.audit(req.user.id, "coverage", id);
      return { ok: true };
    },
  );
  route("GET", "/api/v1/audit", "Recent audit history", async () =>
    store.db
      .prepare(
        "SELECT a.*,u.name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.created_at DESC LIMIT 200",
      )
      .all(),
  );
  route(
    "POST",
    "/api/v1/audit/:id/revert",
    "Revert an unchanged transaction edit",
    async (req) => {
      const row = store.db
        .prepare("SELECT * FROM audit WHERE id=?")
        .get((req.params as { id: string }).id);
      if (
        !row ||
        row.action !== "edit-transaction" ||
        !row.before_data ||
        !row.after_data
      )
        throw new Error("This event cannot be reverted");
      const before = JSON.parse(String(row.before_data)) as Transaction,
        after = JSON.parse(String(row.after_data)) as Transaction,
        current = store.tx(before.id);
      if (
        !current ||
        current.revision !== after.revision ||
        current.transfer_id
      )
        throw new Error("Transaction changed since this edit");
      store.atomic(() => {
        const next = { ...before, revision: current.revision + 1 };
        store.saveTx(next);
        store.audit(req.user.id, "edit-transaction", next.id, current, next);
      });
      return { ok: true };
    },
  );
  route("GET", "/api/v1/settings", "Household preferences", async () =>
    store.get("settings", "household"),
  );
  route(
    "PATCH",
    "/api/v1/settings",
    "Update household preferences",
    async (req) => {
      owner(req);
      const b = z
        .object({
          name: z.string().min(1).max(100),
          timezone: z.string().refine((v) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: v });
              return true;
            } catch {
              return false;
            }
          }),
          include_pending: z.boolean(),
        })
        .parse(req.body);
      store.put("settings", "household", {
        ...store.get<Record<string, unknown>>("settings", "household"),
        ...b,
      });
      store.audit(req.user.id, "settings", "household");
      return { ok: true };
    },
  );
  route("GET", "/api/v1/connections", "Bank connection health", async () =>
    publicConnections(store),
  );
  route(
    "POST",
    "/api/v1/connections",
    "Connect SimpleFIN with setup token",
    async (req) => {
      owner(req);
      const b = z
        .object({ setup_token: z.string().min(1), start: day })
        .parse(req.body);
      return connectSimplefin(store, req.user.id, b.setup_token, b.start);
    },
  );
  route(
    "GET",
    "/api/v1/connections/:id/accounts",
    "Discovered provider accounts",
    async (req) => {
      owner(req);
      return store
        .all<{ connection_id: string }>("discovered")
        .filter((a) => a.connection_id === (req.params as { id: string }).id);
    },
  );
  route(
    "POST",
    "/api/v1/connections/:id/link",
    "Link provider and local account",
    async (req) => {
      owner(req);
      const connection = (req.params as { id: string }).id,
        b = z
          .object({
            provider_id: z.string().min(1),
            account_id: z.string().min(1).nullish(),
            new_account: accountSchema.optional(),
          })
          .parse(req.body);
      if ((!b.account_id && !b.new_account) || (b.account_id && b.new_account))
        throw new Error(
          "Choose an existing account or create a new account to link",
        );
      const existing = store
        .accounts()
        .find((x) => x.provider_id === connection + ":" + b.provider_id);
      if (existing && existing.id !== b.account_id)
        throw new Error("Provider account already linked");
      const a = b.new_account
        ? { ...b.new_account, id: uid() }
        : store.get("accounts", b.account_id!);
      if (!a) throw new Error("Account not found");
      if (a.provider_id && a.provider_id !== connection + ":" + b.provider_id)
        throw new Error(
          "Local account is already linked to a different provider account",
        );
      const c = store.get<{ start: string; cursor: string; next_run: number }>(
        "connections",
        connection,
      );
      if (!c || !store.get("discovered", connection + ":" + b.provider_id))
        throw new Error(
          "Discover this provider account with a sync before linking",
        );
      store.atomic(() => {
        store.put("accounts", a.id as string, {
          ...a,
          provider_id: connection + ":" + b.provider_id,
        });
        store.put("connections", connection, {
          ...c,
          cursor: c.start,
          next_run: Date.now(),
        });
        store.audit(req.user.id, "link-account", a.id as string);
      });
      return { ok: true };
    },
  );
  route(
    "POST",
    "/api/v1/connections/:id/sync",
    "Sync bank data",
    async (req) => {
      owner(req);
      return syncConnection(
        store,
        (req.params as { id: string }).id,
        req.user.id,
      );
    },
  );
  route("DELETE", "/api/v1/connections/:id", "Disconnect bank", async (req) => {
    owner(req);
    return disconnectConnection(
      store,
      (req.params as { id: string }).id,
      req.user.id,
    );
  });
  route("POST", "/api/v1/backups", "Create encrypted backup", async (req) => {
    owner(req);
    const name = await createBackup(store);
    store.audit(req.user.id, "backup", "household");
    return { name };
  });
  route("GET", "/api/v1/ai", "AI status and estimated usage", async () =>
    aiStatus(store),
  );
  route("POST", "/api/v1/ai/settings", "Configure OpenAI", async (req) => {
    owner(req);
    return saveAiConfig(store, req.user.id, req.body);
  });
  route("GET", "/api/v1/ai/memory", "Local AI learning memory", async () =>
    aiMemory(store),
  );
  route("POST", "/api/v1/ai/memory", "Update local memory", async (req) => {
    owner(req);
    return saveMemory(store, req.user.id, req.body);
  });
  route(
    "GET",
    "/api/v1/ai/chat",
    "Your chat history",
    async (req) => store.get("ai_chat", req.user.id) || { messages: [] },
  );
  route("DELETE", "/api/v1/ai/chat", "Clear your chat", async (req) => {
    store.delete("ai_chat", req.user.id);
    return { ok: true };
  });
  route("POST", "/api/v1/ai/run", "Run bounded AI task", async (req) =>
    runAi(store, req.user, req.body),
  );
  route(
    "POST",
    "/api/v1/ai/review",
    "Run free deterministic review checks",
    async (req) => scanReview(store, req.user.id),
  );
  route(
    "GET",
    "/api/v1/ai/proposals",
    "Your pending AI proposals",
    async (req) => listProposals(store, req.user.id),
  );
  route(
    "POST",
    "/api/v1/ai/proposals/:id",
    "Confirm or dismiss an AI proposal",
    async (req) =>
      decideProposal(
        store,
        req.user.id,
        (req.params as { id: string }).id,
        z.object({ apply: z.boolean() }).parse(req.body).apply,
      ),
  );
  route("GET", "/api/v1/recurring", "Recurring schedules", async () =>
    schedules(store),
  );
  route(
    "POST",
    "/api/v1/recurring",
    "Save schedule and update current budget",
    async (req) => saveSchedule(store, req.user.id, req.body),
  );
  route(
    "GET",
    "/api/v1/calendar/:month",
    "Expected occurrences and transaction matches",
    async (req) =>
      calendar(store, month.parse((req.params as { month: string }).month)),
  );
  route(
    "POST",
    "/api/v1/recurring/occurrence",
    "Reschedule, skip, or match an occurrence",
    async (req) => saveException(store, req.user.id, req.body),
  );
  route(
    "GET",
    "/api/v1/recurring/suggestions",
    "Detect recurring patterns without AI",
    async () => recurringSuggestions(store),
  );
  route(
    "POST",
    "/api/v1/recurring/suggestions/:id/dismiss",
    "Dismiss a recurring suggestion",
    async (req) => {
      dismissSuggestion(
        store,
        req.user.id,
        z
          .string()
          .regex(/^[a-f0-9]{24}$/)
          .parse((req.params as { id: string }).id),
      );
      return { ok: true };
    },
  );
  route(
    "POST",
    "/api/v1/recurring/suggestions/reset",
    "Restore dismissed recurring suggestions",
    async (req) => {
      store.atomic(() => {
        for (const r of store.all<{ id: string }>("recurring_dismissed"))
          store.delete("recurring_dismissed", r.id);
        store.audit(req.user.id, "restore-recurring-suggestions", "household");
      });
      return { ok: true };
    },
  );
  route(
    "GET",
    "/api/v1/ai/recurring",
    "Monthly recurring planning items",
    async () =>
      schedules(store).map((r) => ({
        ...r,
        due_day: r.days[0] || Number(r.start_date.slice(8)),
      })),
  );
  route(
    "POST",
    "/api/v1/ai/recurring",
    "Save recurring planning item",
    async (req) => saveRecurring(store, req.user.id, req.body),
  );
  route(
    "POST",
    "/api/v1/ai/recurring-budget",
    "Propose budget from recurring items",
    async (req) =>
      proposeRecurringBudget(
        store,
        req.user.id,
        z.object({ month }).parse(req.body).month,
      ),
  );
  route("GET", "/api/v1/openapi.json", "API specification", async () =>
    app.swagger(),
  );
  if (serveStatic && existsSync(resolve("dist/web"))) {
    await app.register(staticPlugin, { root: resolve("dist/web") });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/"))
        return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }
  return app;
}
