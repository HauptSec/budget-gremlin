import { z } from "zod";
export const id = z.string().min(1).max(100);
export const money = z
  .number()
  .int()
  .min(-100_000_000_000)
  .max(100_000_000_000);
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "Invalid calendar date");
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  group_name: z.string().trim().min(1).max(80),
  kind: z.enum(["income", "expense", "transfer"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#769B7E"),
  archived: z.boolean().default(false),
});
export const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum([
    "checking",
    "savings",
    "credit_card",
    "cash",
    "loan",
    "investment",
    "property",
  ]),
  opening_balance: money.default(0),
  opening_date: day,
  include_budgets: z.boolean().default(true),
  include_reports: z.boolean().default(true),
  archived: z.boolean().default(false),
});
export const allocationSchema = z.object({
  category_id: id,
  amount: money,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export const transactionSchema = z
  .object({
    account_id: id,
    date: day,
    merchant: z.string().trim().min(1).max(200),
    amount: money,
    status: z.enum(["posted", "pending"]).default("posted"),
    notes: z.string().max(2000).default(""),
    reviewed: z.boolean().default(false),
    allocations: z.array(allocationSchema).min(1).max(50),
    locked: z.boolean().default(true),
  })
  .refine(
    (x) => x.allocations.reduce((n, a) => n + a.amount, 0) === x.amount,
    "Split amounts must equal transaction amount",
  );
export const predicateSchema = z.object({
  field: z.enum([
    "merchant",
    "raw_description",
    "account_id",
    "amount",
    "direction",
  ]),
  op: z.enum(["equals", "contains", "prefix", "between"]),
  value: z.string().max(200).default(""),
  min: money.optional(),
  max: money.optional(),
});
export const ruleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  priority: z.number().int().min(0).max(10000),
  enabled: z.boolean().default(true),
  mode: z.enum(["all", "any"]).default("all"),
  predicates: z.array(predicateSchema).min(1).max(20),
  category_id: id,
  merchant: z.string().max(200).optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  reviewed: z.boolean().default(false),
});
export type Rule = z.infer<typeof ruleSchema> & { id: string };
export type Allocation = z.infer<typeof allocationSchema>;
export type Transaction = z.infer<typeof transactionSchema> & {
  id: string;
  raw_description: string;
  review_reasons?: string[];
  revision: number;
  source: string;
  transfer_id?: string | null;
  removed?: boolean;
  classification_source: string;
  created_at: string;
  rule_id?: string | null;
};
export type Category = z.infer<typeof categorySchema> & { id: string };
export type Account = z.infer<typeof accountSchema> & {
  id: string;
  balance?: number | null;
  balance_at?: string | null;
  provider_id?: string | null;
};
export const budgetSchema = z.object({
  month,
  expected_income: money,
  lines: z
    .array(
      z.object({
        category_id: id,
        amount: money.refine((v) => v >= 0),
        rollover: z.boolean().default(false),
        opening: money.default(0),
      }),
    )
    .max(200),
});
export type Budget = z.infer<typeof budgetSchema>;
export const mappingSchema = z.object({
  date: z.string(),
  merchant: z.string(),
  amount: z.string().default(""),
  debit: z.string().default(""),
  credit: z.string().default(""),
  reference: z.string().default(""),
  date_format: z
    .enum(["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"])
    .default("YYYY-MM-DD"),
  invert: z.boolean().default(false),
});
export type Mapping = z.infer<typeof mappingSchema>;
export const importSchema = z.object({
  account_id: id,
  csv: z.string().max(10 * 1024 * 1024),
  mapping: mappingSchema,
});
export const reportQuery = z
  .object({
    start: day,
    end: day,
    account: id.optional(),
    category: id.optional(),
    group: z.string().optional(),
    merchant: z.string().optional(),
    tag: z.string().optional(),
    reviewed: z.enum(["true", "false"]).optional(),
  })
  .refine((x) => x.start <= x.end, "Start must precede end");
export type Filters = z.infer<typeof reportQuery>;
