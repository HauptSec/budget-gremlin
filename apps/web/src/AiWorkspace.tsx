import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  ShieldCheck,
  MessageCircle,
  BookOpen,
  Check,
  RefreshCw,
} from "lucide-react";
import { api, money } from "./api";
import { Button, Field, Alert, Loading } from "./ui";
const useData = (path: string) =>
  useQuery({ queryKey: [path], queryFn: () => api(path) });
export function AiWorkspace({
  user,
  settingsOnly = false,
}: {
  user: { role: string };
  settingsOnly?: boolean;
}) {
  const status = useData("/ai"),
    memory = useData("/ai/memory"),
    history = useData("/ai/chat"),
    proposals = useData("/ai/proposals"),
    recurring = useData("/ai/recurring"),
    meta = useData("/meta");
  const client = useQueryClient();
  const [tab, setTab] = useState(settingsOnly ? "settings" : "chat"),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    [reply, setReply] = useState(""),
    [message, setMessage] = useState(""),
    [month, setMonth] = useState(
      new Date().toLocaleDateString("en-CA").slice(0, 7),
    ),
    [merchant, setMerchant] = useState("");
  async function action(path: string, body?: unknown, method?: string) {
    setBusy(true);
    setErr("");
    try {
      const result = await api(path, body, method);
      await client.invalidateQueries();
      return result;
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function task(task: string) {
    const result = await action("/ai/run", {
      task,
      message: task === "chat" ? message : "",
      month,
      merchant,
    });
    if (result) {
      setReply(result.reply);
      if (task === "chat") setMessage("");
    }
  }
  if (status.isPending || !meta.data) return <Loading />;
  if (status.error) return <Alert>{status.error.message}</Alert>;
  const cfg = status.data;
  return (
    <div className="gremlin-ai">
      <div className="ai-title">
        <Sparkles size={24} />
        <div>
          <h1>Meet your money gremlin.</h1>
          <p className="muted">
            A focused assistant for your household. Small requests, clear
            decisions.
          </p>
        </div>
      </div>
      <div className="ai-usage">
        <span className="pill">
          {cfg.enabled ? "GPT-6 LUNA" : "AI DISABLED"}
        </span>
        <span>
          ${cfg.monthly_estimated_usd.toFixed(4)} /{" "}
          {money(cfg.monthly_cap_cents)} estimated this month
        </span>
        <span>
          {cfg.daily_calls_used} / {cfg.daily_calls} requests today
        </span>
      </div>
      <div className="row wrap ai-tabs" role="group" aria-label="AI sections">
        {["chat", "tasks", "memory", "recurring", "settings"].map((t) => (
          <Button
            key={t}
            variant={tab === t ? "primary" : "secondary"}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>
      {err && <Alert>{err}</Alert>}
      {!cfg.enabled && tab !== "settings" && (
        <p className="info-note">
          Enable OpenAI in the Settings tab to use paid tasks. Local review
          checks and recurring planning remain available without API calls.
        </p>
      )}
      {tab !== "settings" && tab !== "memory" && (
        <div className="form-grid">
          <Field label="Context month">
            <input
              type="month"
              value={month}
              required
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
            />
          </Field>
          <Field label="Optional merchant filter">
            <input
              value={merchant}
              maxLength={120}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Narrow chat and review context"
            />
          </Field>
        </div>
      )}
      {tab === "chat" && (
        <>
          <div className="info-note">
            <ShieldCheck size={20} />
            <p>
              Uses local totals, up to 40 transactions from the selected month,
              and relevant memory. Budget, recurring-item and memory edits are
              proposals until you confirm. The assistant cannot make payments or
              access the web.
            </p>
          </div>
          <div className="ai-chat" aria-label="Conversation">
            {!history.data?.messages.length && (
              <div className="empty">
                <MessageCircle size={30} />
                <h3>Ask about the numbers behind your month.</h3>
                <p>
                  “Explain my spending this month.” “Set expected income to
                  $5,000.” “Add my $18 monthly streaming subscription.”
                </p>
              </div>
            )}
            {history.data?.messages.map((m: any, i: number) => (
              <article key={i} className={"ai-message " + m.role}>
                <strong>{m.role === "user" ? "You" : "Budget Gremlin"}</strong>
                <p>{m.text}</p>
              </article>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void task("chat");
            }}
          >
            <Field label="Message to Budget Gremlin">
              <textarea
                rows={3}
                maxLength={1500}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask about your transactions, or propose a budget change…"
              />
            </Field>
            <div className="row wrap">
              <Button disabled={busy || !cfg.enabled || !message.trim()}>
                {busy ? "Thinking…" : "Send message"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setReply("");
                  void action("/ai/chat", undefined, "DELETE");
                }}
              >
                Clear conversation
              </Button>
            </div>
          </form>
        </>
      )}
      {tab === "tasks" && (
        <div className="ai-task-grid">
          {[
            [
              "categorize",
              "Categorize uncategorized",
              "Local rules and your learned merchant mappings first. Up to 25 remaining transactions per API call. Only ≥95% confidence is applied; manual edits and splits are preserved.",
            ],
            [
              "review",
              "AI review scan",
              "Inspect up to 40 transactions in the selected month and add specific reasons to Needs review.",
            ],
            [
              "summary",
              "Monthly briefing",
              "Explain exact local totals and the sampled transactions, with no changes to your budget.",
            ],
            [
              "recurring",
              "Find recurring items",
              "Detect possible monthly bills and income locally, at no API cost. Review suggestions before saving.",
            ],
          ].map(([id, title, description]) => (
            <article className="panel" key={id}>
              <h3>{title}</h3>
              <p>{description}</p>
              <Button
                variant="secondary"
                disabled={busy || (!cfg.enabled && id !== "recurring")}
                onClick={() => void task(id)}
              >
                {busy ? "Working…" : "Run task"}
              </Button>
            </article>
          ))}
          <article className="panel">
            <h3>Local review checks</h3>
            <p>
              Flag unusual merchant amounts and large first-observed payments.
              No API call. These are review cues, not fraud determinations.
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                const r = await action("/ai/review", {});
                if (r)
                  setReply(
                    `Checked ${r.checked} transactions and added ${r.flagged} review flags.`,
                  );
              }}
            >
              Run free checks
            </Button>
          </article>
        </div>
      )}
      {reply && (
        <div className="ai-result" role="status">
          <p>{reply}</p>
        </div>
      )}
      {!!proposals.data?.length && (
        <section className="ai-proposals">
          <h2>Review proposed changes</h2>
          <p className="muted">
            Only changes listed here will be applied. Proposals expire after 24
            hours and reject changes if the underlying data has moved on.
          </p>
          {proposals.data.map((p: any) => (
            <article className="panel" key={p.id}>
              <h3>
                {p.kind === "budget"
                  ? `Budget · ${p.after.month}`
                  : p.kind === "recurring"
                    ? "Monthly recurring item"
                    : "Remember this preference"}
              </h3>
              <ProposalDetails p={p} categories={meta.data.categories} />
              <div className="row wrap">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action("/ai/proposals/" + p.id, { apply: true })
                  }
                >
                  <Check size={16} />
                  Confirm change
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void action("/ai/proposals/" + p.id, { apply: false })
                  }
                >
                  Dismiss
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
      {tab === "memory" && memory.data && (
        <MemoryEditor
          key={memory.data.revision}
          memory={memory.data}
          categories={meta.data.categories}
          owner={user.role === "owner"}
          busy={busy}
          save={(v: unknown) => action("/ai/memory", v)}
        />
      )}
      {tab === "recurring" && (
        <>
          <h2>Bills, subscriptions & income</h2>
          <p className="muted">
            Monthly planning records. Nothing here initiates or cancels a
            payment. Apply a budget proposal to include these in a selected
            month.
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void action("/ai/recurring-budget", { month })}
          >
            Propose budget from recurring items
          </Button>
          <div className="ai-recurring-list">
            {recurring.data?.map((r: any) => (
              <article className="panel row" key={r.id}>
                <div>
                  <strong>{r.name}</strong>
                  <p>
                    {r.kind} · {money(r.amount)} / month · day {r.due_day} ·{" "}
                    {r.active ? "Active" : "Inactive"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void action("/ai/recurring", { ...r, active: !r.active })
                  }
                >
                  {r.active ? "Deactivate" : "Activate"}
                </Button>
              </article>
            ))}
          </div>
          <RecurringEditor
            categories={meta.data.categories}
            busy={busy}
            save={(v: unknown) => action("/ai/recurring", v)}
          />
        </>
      )}
      {tab === "settings" && (
        <>
          <div className="info-note">
            <ShieldCheck size={20} />
            <p>
              Only bounded task context is sent to OpenAI. Bank credentials,
              account numbers, app passwords and the full database are never
              part of the AI context. Requests use store:false; that does not
              eliminate OpenAI's separate abuse-monitoring retention. Chat and
              memory are retained locally until cleared.
            </p>
          </div>
          {user.role === "owner" ? (
            <AiSettings
              key={JSON.stringify(cfg)}
              cfg={cfg}
              busy={busy}
              save={(v: unknown) => action("/ai/settings", v)}
            />
          ) : (
            <p>
              Only the household owner can change AI credentials and spending
              limits.
            </p>
          )}
          <p className="fine-print">
            {cfg.limitations} Limits apply across all household members and
            scheduled tasks. Failed requests with unknown usage retain their
            worst-case reservation. Model responses can be wrong; review
            categories and proposals.
          </p>
          <p className="fine-print">Memory file: {cfg.memory_path}</p>
          {cfg.last_run && (
            <p className="muted">
              Last automatic task: {new Date(cfg.last_run.at).toLocaleString()}
              {cfg.last_run.error ? ` · ${cfg.last_run.error}` : ""}
            </p>
          )}
        </>
      )}
    </div>
  );
}
function ProposalDetails({ p, categories }: any) {
  const category = (id: string) =>
    categories.find((c: any) => c.id === id)?.name || id;
  if (p.kind === "memory")
    return (
      <>
        <p>Existing notes remain. Proposed notes:</p>
        <p className="ai-result">{p.after.notes}</p>
      </>
    );
  if (p.kind === "recurring")
    return (
      <p>
        {p.after.name} · {p.after.kind} · {money(p.after.amount)} monthly · day{" "}
        {p.after.due_day} · {category(p.after.category_id)}
        {p.before ? ` (previously ${money(p.before.amount)})` : " (new item)"}
      </p>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Expected income</td>
            <td>{money(p.before?.expected_income || 0)}</td>
            <td>{money(p.after.expected_income)}</td>
          </tr>
          {p.after.lines
            .filter(
              (l: any) =>
                p.before?.lines.find(
                  (x: any) => x.category_id === l.category_id,
                )?.amount !== l.amount,
            )
            .map((l: any) => (
              <tr key={l.category_id}>
                <td>{category(l.category_id)}</td>
                <td>
                  {money(
                    p.before?.lines.find(
                      (x: any) => x.category_id === l.category_id,
                    )?.amount || 0,
                  )}
                </td>
                <td>{money(l.amount)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
function AiSettings({ cfg, busy, save }: any) {
  return (
    <form
      className="inset-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form),
          key = String(f.get("key") || "").trim();
        const result = await save({
          enabled: f.get("enabled") === "on",
          monthly_cap_cents: Math.round(Number(f.get("cap")) * 100),
          daily_calls: Number(f.get("calls")),
          automatic: f.get("automatic") === "on",
          learn_corrections: f.get("learn") === "on",
          ...(key ? { api_key: key } : {}),
          remove_key: f.get("remove") === "on",
        });
        if (result) form.reset();
      }}
    >
      <h2>OpenAI settings</h2>
      <label className="check-label">
        <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} />
        Enable OpenAI
      </label>
      <Field
        label={
          cfg.key_configured
            ? "Replace API key (leave blank to keep)"
            : "OpenAI API key"
        }
      >
        <input type="password" name="key" autoComplete="off" maxLength={500} />
      </Field>
      <p className="fine-print">
        Stored encrypted on the server. Never returned to this browser.
      </p>
      <div className="form-grid">
        <Field label="Monthly spending cap (USD)">
          <input
            type="number"
            name="cap"
            min="0.01"
            max="100"
            step="0.01"
            required
            defaultValue={cfg.monthly_cap_cents / 100}
          />
        </Field>
        <Field label="Daily request limit">
          <input
            type="number"
            name="calls"
            min="1"
            max="100"
            required
            defaultValue={cfg.daily_calls}
          />
        </Field>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          name="automatic"
          defaultChecked={cfg.automatic}
        />
        Automatically categorize and run local review checks after imports
        (bounded hourly batches)
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          name="learn"
          defaultChecked={cfg.learn_corrections}
        />
        Learn merchant preferences from my manual category corrections
      </label>
      <label className="check-label">
        <input type="checkbox" name="remove" />
        Remove stored key (also uncheck Enable OpenAI)
      </label>
      <Button disabled={busy}>Save AI settings</Button>
    </form>
  );
}
function MemoryEditor({ memory, categories, owner, busy, save }: any) {
  const [notes, setNotes] = useState(memory.notes),
    [examples, setExamples] = useState(memory.examples);
  return (
    <section>
      <h2>
        <BookOpen size={20} /> Local learning memory
      </h2>
      <p className="muted">
        Your confirmed preferences and recent manual merchant corrections.
        Memory is data, never executable instructions. The private JSON file is
        mirrored in encrypted database backups; use this editor to change it.
      </p>
      <Field label="Household budgeting preferences">
        <textarea
          rows={5}
          maxLength={3000}
          value={notes}
          disabled={!owner}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <h3>Learned merchant mappings</h3>
      {examples.map((e: any, i: number) => (
        <div className="row" key={e.merchant}>
          <span>
            {e.merchant} →{" "}
            {categories.find((c: any) => c.id === e.category_id)?.name ||
              e.category_id}
          </span>
          {owner && (
            <Button
              variant="ghost"
              onClick={() =>
                setExamples(examples.filter((_: any, j: number) => j !== i))
              }
            >
              Forget
            </Button>
          )}
        </div>
      ))}
      {!examples.length && (
        <p>
          No learned mappings yet. Correct a transaction category to teach a
          merchant preference.
        </p>
      )}
      {owner && (
        <Button
          disabled={busy}
          onClick={() => void save({ ...memory, notes, examples })}
        >
          Save memory
        </Button>
      )}
    </section>
  );
}
function RecurringEditor({ categories, busy, save }: any) {
  return (
    <form
      className="inset-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget,
          f = new FormData(form);
        const r = await save({
          id: crypto.randomUUID(),
          name: f.get("name"),
          kind: f.get("kind"),
          amount: Math.round(Number(f.get("amount")) * 100),
          category_id: f.get("category"),
          due_day: Number(f.get("day")),
          active: true,
        });
        if (r) form.reset();
      }}
    >
      <h3>Add a monthly planning item</h3>
      <Field label="Item name">
        <input name="name" required maxLength={100} />
      </Field>
      <div className="form-grid">
        <Field label="Item type">
          <select name="kind" aria-label="Item type">
            <option value="bill">Bill</option>
            <option value="subscription">Subscription</option>
            <option value="income">Income</option>
          </select>
        </Field>
        <Field label="Monthly amount (USD)">
          <input
            name="amount"
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            required
          />
        </Field>
        <Field label="Planning category">
          <select name="category" aria-label="Planning category" required>
            {categories
              .filter((c: any) => !c.archived && c.kind !== "transfer")
              .map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Day of month">
          <input
            type="number"
            name="day"
            min="1"
            max="31"
            defaultValue="1"
            required
          />
        </Field>
      </div>
      <Button disabled={busy}>Save recurring item</Button>
    </form>
  );
}
