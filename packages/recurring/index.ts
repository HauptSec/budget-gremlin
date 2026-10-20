import { z } from "zod";
import { day, id, month, type Budget } from "../shared/schema.ts";

import { frequencies } from "./options.ts";
export const scheduleSchema = z
  .object({
    id,
    revision: z.number().int().nonnegative().default(0),
    name: z.string().trim().min(1).max(100),
    kind: z.enum(["bill", "subscription", "income", "transfer", "allowance"]),
    amount: z.number().int().min(0).max(100_000_000),
    estimated: z.boolean().default(false),
    category_id: id,
    account_id: id.nullable().default(null),
    merchant: z.string().trim().max(150).default(""),
    frequency: z.enum(frequencies),
    start_date: day,
    end_date: day.nullable().default(null),
    days: z.array(z.number().int().min(1).max(31)).max(2).default([]),
    active: z.boolean().default(true),
    auto_match: z.boolean().default(true),
  })
  .superRefine((s, ctx) => {
    if (s.end_date && s.end_date < s.start_date)
      ctx.addIssue({
        code: "custom",
        message: "End date must follow start date",
      });
    const count =
      s.frequency === "twice_monthly"
        ? 2
        : ["monthly", "quarterly"].includes(s.frequency)
          ? 1
          : 0;
    if (s.days.length !== count || new Set(s.days).size !== s.days.length)
      ctx.addIssue({
        code: "custom",
        message: `Choose ${count} distinct day(s) for this frequency`,
      });
  });
export type Schedule = z.infer<typeof scheduleSchema>;
export const exceptionSchema = z.object({
  schedule_id: id,
  scheduled_date: day,
  date: day.nullable().default(null),
  amount: z.number().int().min(0).max(100_000_000).nullable().default(null),
  skipped: z.boolean().default(false),
  match_mode: z.enum(["auto", "manual", "none"]).default("auto"),
  transaction_id: id.nullable().default(null),
  revision: z.number().int().nonnegative().default(0),
});
export type OccurrenceException = z.infer<typeof exceptionSchema>;
export type Occurrence = {
  id: string;
  schedule_id: string;
  scheduled_date: string;
  date: string;
  amount: number;
  name: string;
  kind: Schedule["kind"];
  category_id: string;
  account_id: string | null;
  estimated: boolean;
  skipped: boolean;
};
export const occurrenceId = (schedule: string, date: string) =>
  `${schedule}:${date}`;
export const addDays = (date: string, n: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000,
  );
export const endOfMonth = (m: string) => {
  month.parse(m);
  const [y, n] = m.split("-").map(Number);
  return new Date(Date.UTC(y, n, 0, 12)).toISOString().slice(0, 10);
};
const clampDay = (m: string, d: number) =>
  `${m}-${String(Math.min(d, Number(endOfMonth(m).slice(8)))).padStart(2, "0")}`;
export const merchantKey = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

/** Enumerate real calendar dates, without local-time/DST drift or month-end drift. */
export function scheduledDates(
  s: Schedule,
  from: string,
  to: string,
): string[] {
  day.parse(from);
  day.parse(to);
  if (from > to || !s.active) return [];
  const low = from > s.start_date ? from : s.start_date;
  const high = s.end_date && s.end_date < to ? s.end_date : to;
  if (low > high) return [];
  if (daysBetween(low, high) > 800)
    throw new Error("Schedule range exceeds two years");
  const result: string[] = [];
  for (let date = low; date <= high; date = addDays(date, 1)) {
    const delta = daysBetween(s.start_date, date);
    const m = date.slice(0, 7);
    const monthDelta =
      (Number(date.slice(0, 4)) - Number(s.start_date.slice(0, 4))) * 12 +
      Number(date.slice(5, 7)) -
      Number(s.start_date.slice(5, 7));
    const matches =
      s.frequency === "once"
        ? date === s.start_date
        : s.frequency === "weekly"
          ? delta % 7 === 0
          : s.frequency === "biweekly"
            ? delta % 14 === 0
            : s.frequency === "yearly"
              ? date.slice(5, 7) === s.start_date.slice(5, 7) &&
                date === clampDay(m, Number(s.start_date.slice(8)))
              : (s.frequency !== "quarterly" || monthDelta % 3 === 0) &&
                s.days.some((d) => date === clampDay(m, d));
    if (matches) result.push(date);
  }
  return result;
}

export function occurrences(
  schedules: Schedule[],
  exceptions: OccurrenceException[],
  from: string,
  to: string,
): Occurrence[] {
  const overrides = new Map(
    exceptions.map((e) => [occurrenceId(e.schedule_id, e.scheduled_date), e]),
  );
  const result: Occurrence[] = [];
  for (const s of schedules) {
    const dates = new Set(scheduledDates(s, from, to));
    // Rescheduled occurrences can cross months or originate outside the query window.
    for (const e of exceptions)
      if (
        e.schedule_id === s.id &&
        e.date &&
        e.date >= from &&
        e.date <= to &&
        scheduledDates(s, e.scheduled_date, e.scheduled_date).length
      )
        dates.add(e.scheduled_date);
    for (const scheduled_date of dates) {
      const key = occurrenceId(s.id, scheduled_date),
        e = overrides.get(key),
        date = e?.date || scheduled_date;
      if (date < from || date > to) continue;
      result.push({
        id: key,
        schedule_id: s.id,
        scheduled_date,
        date,
        amount: e?.amount ?? s.amount,
        name: s.name,
        kind: s.kind,
        category_id: s.category_id,
        account_id: s.account_id,
        estimated: s.estimated,
        skipped: e?.skipped || false,
      });
    }
  }
  return result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

/** Recurring commitments form a floor, never an additive charge or a ledger entry. */
export function planWithRecurring(base: Budget, items: Occurrence[]): Budget {
  const plan = structuredClone(base),
    totals = new Map<string, number>();
  let income = 0;
  for (const o of items) {
    if (o.skipped || !o.date.startsWith(base.month) || o.kind === "transfer")
      continue;
    if (o.kind === "income") income += o.amount;
    else totals.set(o.category_id, (totals.get(o.category_id) || 0) + o.amount);
  }
  plan.expected_income = Math.max(plan.expected_income, income);
  for (const [category_id, amount] of totals) {
    const line = plan.lines.find((l) => l.category_id === category_id);
    if (line) line.amount = Math.max(line.amount, amount);
    else plan.lines.push({ category_id, amount, rollover: false, opening: 0 });
  }
  return plan;
}
