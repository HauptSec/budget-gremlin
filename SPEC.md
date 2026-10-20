# Budget Gremlin — Product and implementation specification

Version: 0.1.0 · Date: 2026-09-17 · Status: Fresh draft; core confirmed, open decisions below.

## 1. Authority and decision status

This is a fresh specification based only on the current user brief and answers. It replaces all prior planning. Earlier private planning is excluded from version control and is not implementation guidance. Do not inherit their hardware, user count, authentication, provider, theme or milestone decisions.

`CONFIRMED` means explicitly requested or answered by the owner. `PROPOSED` means a recommended default that can be implemented reversibly, not an owner decision. `OPEN` identifies information still needed. No silence is recorded as approval.

### Confirmed requirements

| ID | Requirement |
|---|---|
| C01 | Product name: Budget Gremlin; personal finance and budgeting inspired by Monarch Money and Quicken Simplifi |
| C02 | Monthly category budgets, optional rollover, and a left-to-spend summary |
| C03 | Self-hosted web app in Docker on a home server |
| C04 | U.S. Bank transaction import; low-cost automatic sync is acceptable if the bank is supported |
| C05 | User-adjustable transaction classification |
| C06 | Reporting is a major priority, including monthly, quarterly, YTD and other over-time analysis |
| C07 | Minimal, sleek, modern design using established styling frameworks/patterns |
| C08 | Mobile-friendly web app, home-screen installation/bookmark; possible native client later |
| C09 | AI can be stubbed; no paid LLM platform API dependency |
| C10 | Start fresh; previous recorded decisions must not be assumed |
| C11 | Household members with separate logins; home network or VPN access |
| C12 | x86 Linux Docker host; U.S. Bank checking, savings and credit cards; 12–24 months of history where available |
| C13 | Show posted spending and pending commitments separately; subtract both from left-to-spend; reports default to posted activity |

### Decision register and build behavior

| ID | Status | Decision/default | Dependency / fallback |
|---|---|---|---|
| Q01 | Confirmed in part | Household members with separate logins. Proposed: everyone shares the same ledger; owner manages members, all members edit finance data | Account privacy remains open; invite-only users, no public signup |
| Q02 | Confirmed | Home network or VPN | No public exposure; choose private HTTPS setup without mandating a particular VPN |
| Q03 | Confirmed in part | x86 Linux Docker host | Target linux/amd64; verify hardware before performance sign-off; RAM unspecified |
| Q04 | Confirmed | U.S. Bank checking, savings, credit cards; 12–24 months where available | Do not promise more history than bank/provider can return; accept older CSVs if supplied |
| Q05 | Confirmed | Pending commitments shown separately and deducted from left-to-spend; posted-only reports by default | Pending refunds/income do not increase remaining budget until posted |
| Q06 | Open | Proposed SimpleFIN first, conditional on actual account connectivity; CSV always available | Confirm provider before live setup/subscription; keep ledger provider-neutral |
| Q07 | Open | Proposed USD and America/Los_Angeles reporting timezone | Ask if non-USD accounts required; editable household timezone |

Household visibility, provider and currency/timezone defaults have been prompted together. Core work can proceed using reversible proposed defaults and synthetic data. No unanswered item is recorded as approved.

## 2. Product goals and boundaries

Budget Gremlin helps its owner understand spending, maintain a realistic monthly plan, and compare financial behavior over time. The core loop is import → review → classify → budget → explain changes through reports.

Success criteria:

- A repeated import or sync produces no duplicate activity or lost manual classifications.
- Every report total is reproducible and drillable to the exact contributing entries, to the cent.
- A user can correct a category and optionally create a reusable rule in one workflow.
- Monthly, quarterly and YTD comparisons work with explicit partial-period and missing-history labels.
- Core features work without paid AI, an active aggregator subscription, or public internet exposure.
- Backups can be restored into a clean installation using documented steps.

First release excludes money movement, bill payment, bank-login scraping, investment trades/holdings analysis, credit scores, tax filing, multiple currencies, native mobile apps and production LLM integration. This is a reporting/planning tool; left-to-spend is a budget estimate, not a bank available-balance guarantee.

## 3. Scope and release priorities

### P0: First useful release

| Area | Included |
|---|---|
| Accounts | Manual accounts, account balances, checking/savings/credit-card ledger support; archival rather than destructive account deletion |
| Ingestion | CSV preview and mapping; manual entries; duplicate review; pluggable sync framework and one verified automatic connector |
| Transactions | Search, filters, pagination, bulk categorization, notes, tags, splits, transfers, refunds, review status |
| Classification | Editable groups/categories, merchant aliases, deterministic ordered rules, explicit manual overrides |
| Budgets | Monthly category amounts, copy-forward, optional rollover, income plan, left-to-spend |
| Reports | Income/spending/net cash flow, category and merchant breakdowns, budget versus actual, monthly trend, period comparisons, CSV export, drill-down |
| App | Dashboard, responsive navigation, accessible tables/charts, light/dark mode, PWA manifest and safe offline shell |
| Operations | Auth, Docker deployment, migrations, encrypted secrets and backups, restore procedure, sync health |
| AI | Disabled provider plus deterministic test mock and typed extension interface |

Automatic syncing is part of the intended first release, but a useful CSV-only release must be possible if provider setup is delayed. Never block reporting development on real credentials.

### P1: Useful additions after core reliability

- Recurring bills/subscriptions and price-change review; bills calendar.
- Cash-flow forecasts with clearly labeled assumptions and no double-counting of matched bills.
- Savings goals/sinking funds and spending watchlists.
- Refund/reimbursement tracking.
- Saved report views, net-worth history from observed balance snapshots, Sankey view.
- QFX/OFX import, migration from other budgeting apps, additional household roles (for example read-only access).

### P2: Separately specified

Local LLM integration, receipt extraction/attachments, native mobile client, investment analytics, debt payoff scenarios and external automation integrations. No implementation of these is implied by an interface stub.

## 4. User experience and visual direction

Navigation: Overview, Transactions, Budget, Reports, Accounts, Settings. Put transaction review and import/sync status within one click of the dashboard.

Use Tailwind CSS and accessible shadcn/ui components as proposed defaults, with restrained neutral surfaces, one accent color, consistent spacing, clear typography and tabular numerals. Light/dark themes suffice; no inherited requirement for multiple palettes. Use local assets/fonts, no third-party runtime analytics. Gremlin personality may appear subtly in empty states; financial errors remain clear and neutral.

Desktop: compact tables, persistent navigation and contextual edit panels. Mobile: bottom or collapsed navigation, readable transaction rows and full-screen editing. Filters remain visible as removable chips. Show skeleton, empty, loading, error and stale-data states separately. Do not display missing data as $0.

Charts must have a table equivalent, labeled units, accessible colors and keyboard-accessible drill-down. Target WCAG 2.2 AA, 360px minimum viewport, sufficient touch targets and reduced-motion preferences. No horizontal page overflow; a wide report table may scroll in its own labeled container.

## 5. Functional requirements and acceptance

### HOU — Household access

**HOU-01:** Separate logins, one household per deployment. Proposed permissions: all members view/edit the shared financial ledger; only the owner invites/removes members and changes security/provider configuration. No account-level privacy or read-only role in P0 unless requested before build. Every mutation records its acting user.

**HOU-02:** One-time owner bootstrap via a documented local setup command; subsequent users are invited by the owner using expiring single-use tokens. No email service required: an invitation link can be copied and shared by the owner. Disable bootstrap after initial owner creation. Removing a member immediately revokes their sessions; prevent removing the last owner. Server endpoints verify household membership and permissions independently of UI visibility.

Acceptance: two users have distinct sessions and audit attribution; a removed member cannot read reports or mutate data; a member cannot administer users or credentials. Financial records survive member removal.

### ACC — Accounts

**ACC-01:** Create/edit/archive accounts with name, type, currency, opening balance/date and budget/report inclusion flags. Archive preserves history. Account matching during provider setup must offer linking to an existing local account to prevent duplicate accounts.

**ACC-02:** Show source balance, source timestamp and last successful sync separately. A calculated ledger balance is explicitly labeled and may differ because of incomplete history. Credit-card debt is a negative net-worth balance; imports must normalize provider sign conventions.

Acceptance: importing a credit-card purchase increases debt and spending; a payment is a transfer rather than spending again. Missing historical balances are unavailable, not inferred from present balances.

### ING — Transaction ingestion

**ING-01:** CSV wizard: choose account → map columns → set date and debit/credit conventions → preview → validate → commit. Save mapping profiles. Display per-row errors without discarding valid rows silently. Commit only valid, explicitly accepted rows atomically and report inserted/skipped/flagged/error counts.

Proposed limits: 10 MiB and 50,000 rows per file; configurable server limits. CSV headers and date formats must not be guessed without preview. Escape spreadsheet formula prefixes in exports.

**ING-02:** Retain import-batch provenance and a file content hash. Exact replay of an unchanged file to the same account is a no-op. Provider uniqueness is `(connection_id, provider_account_id, provider_transaction_id)`. Cross-source matching is a separate reconciliation operation.

**ING-03:** Without a stable source ID, use account/date/signed amount/raw payee/reference plus occurrence counts to suggest overlap matches. Two genuine identical purchases on the same day must survive. Ambiguous overlaps go to a review queue; do not silently collapse them. Record source aliases on confirmed matches so future imports stay idempotent. New rows with unresolved duplicate candidates are quarantined outside the canonical ledger until the user chooses keep-new or match-existing; show the excluded count so reports cannot silently double-count them.

**ING-04:** Undo a batch only deletes unchanged rows introduced solely by that batch. Preserve edited, split or transfer-linked rows with an explanation. Never delete a row still referenced by another import/source. Show the impact before undo.

**ING-05:** Manual entries use explicit account, date, amount, merchant and category. Provider sync never overwrites them; suggest matches for manual-to-import reconciliation.

Acceptance: fixtures cover exact replay, overlapping files, two identical purchases, changed descriptions, debit/credit columns, invalid dates and mixed valid/invalid rows.

### TXN — Ledger and classification

**TXN-01:** Search raw/normalized merchant and notes; filter by account, date, category, tag, amount, status and review state. Bulk actions apply only to the explicitly selected IDs and show affected count.

**CLS-01:** Categories belong to editable groups and have income/expense/transfer semantics. Archive categories with history; require a destination for merging. Keep an explicit Uncategorized bucket visible in reports.

**CLS-02:** Classification precedence: manual locked assignment → first matching enabled rule → explicit merchant default → source category suggestion → Uncategorized. Source suggestions do not create arbitrary taxonomy entries. AI does not participate in automatic classification in P0.

**CLS-03:** Ordered rules support all/any predicates on merchant text, raw description, account, amount range and transaction direction. Actions assign category, normalized merchant, tags and review flag. Use exact/contains/prefix matching first; arbitrary regular expressions are deferred. First matching rule supplies classification/actions, making precedence predictable.

**CLS-04:** Rule creation from a transaction offers “this transaction only” or “save a rule.” Retroactive application previews matching rows and proposed changes, then applies against a versioned dataset. If data changed since preview, require a new preview. Manual locks survive rule application and sync.

**CLS-05:** Show classification source and relevant rule ID. Keep edit history with actor/time/changed fields; support reverting a single edit if the current version still matches. No inferred merchant learning in P0; it may be added later with explicit consent and explainable thresholds.

**TXN-02:** Splits use child allocation rows; their signed amounts must sum exactly to the parent. Reports/budgets count allocations instead of the parent. Tags and categories can differ by split. One-cent remainder allocation is deterministic when a percentage UI is used.

**TXN-03:** Suggest transfer pairs using opposite signed amounts, different accounts and nearby dates (proposed 3-day window). Require confirmation for ambiguous pairs. Paired transfers are excluded from income/spending; deleting a link restores explicit review status. An unpaired known transfer can be excluded with a visible explanation. Fees remain expenses through splits.

**TXN-04:** Refunds are positive flows assigned to an expense category and reduce that category's spending in the posting period. Optional links to original purchases aid review; they do not rewrite prior periods. A refund greater than current spending can produce negative net spending.

Acceptance: a $100 card purchase and $100 payment count as $100 expense, not $200; a $20 refund yields $80 net spending. A $60/$40 split totals $100 without also counting the parent. Manual recategorization survives a later provider update.

### BUD — Monthly budgets

**BUD-01:** Set expected income and category allocations per calendar month. Copy previous month or apply changes to explicitly selected future months; do not mutate past plans implicitly. Show planned, posted spent, pending commitments (if enabled), rollover and remaining.

**BUD-02:** Rollover is optional per expense category, proposed off by default. Closing carry is `opening carry + allocation - posted net spending`. Negative carry is preserved and labeled overspending carried forward. Pending does not close into rollover; when posted it belongs to its actual posting month. Historical edits recalculate subsequent carries and display affected months. Enabling rollover requires a start month and explicit opening carry, default zero; no retroactive inferred carry.

**BUD-03:** Left-to-spend is based on a simple category plan, not flex groups:

```
category_remaining = allocation + opening_carry - posted_net_spending - pending_commitments
budget_remaining = sum(category_remaining for budgeted expense categories)
unbudgeted_spending = net spending/commitments in unbudgeted expense categories
left_to_spend = budget_remaining - unbudgeted_spending
unallocated_income = expected_income - sum(current_month_allocations)
```

Do not add unallocated income to left-to-spend automatically. Show it separately as “Not assigned to categories.” Income is a planning input; warn if allocations exceed expected income, but allow saving. Do not clamp negative category balances before summing. No budgets means “Set up a budget,” not an arbitrary $0 estimate.

**BUD-04:** Confirmed default pending mode deducts pending expense outflows separately from posted spending. Pending refunds/income do not increase available budget. For the current month, include every unresolved pending expense authorized on or before today, including prior-month holds, exactly once. If the authorization date is absent, use first_seen_date with an estimated-date label. Do not treat a vanished pending row as posted without evidence; surface unresolved holds for reconciliation. Historical closed-month budgets exclude pending commitments. A pending item becoming posted removes the commitment before adding posted spending. A setting may optionally switch to posted-only budgeting, but the confirmed default includes pending commitments.

Golden example (dollars for readability): groceries allocation 400, opening carry 50, posted spend 200, pending 20 → remaining 230. Dining allocation 150, posted 170 → remaining -20. Unbudgeted posted spending 30 → total left-to-spend 180. Expected income 1,000 and allocations 550 → unallocated income 450. If the user explicitly selects posted-only budgeting, left-to-spend is 200. Groceries closing carry based on these posted values is 250; pending is not part of closing carry.

Acceptance: tests reproduce these figures, rollover chains and historical-edit recalculation; transfers never consume category budgets. Label left-to-spend as a plan estimate, not current cash availability.

### RPT — Reporting (highest product priority)

All UI date ranges are inclusive; normalize internally to half-open date intervals and return the displayed inclusive boundaries. Changing household timezone does not reinterpret stored date-only bank posting dates.

**RPT-01:** Report filters include account, category/group, merchant, tags, reviewed state and date range. Account totals aggregate the same selected ledger population as the chart. Transfers are excluded from income/spending even with an account filter; offer a separately labeled account-activity view later if needed.

**RPT-02:** Presets: current/previous month, quarter, year, MTD/QTD/YTD, trailing 3/6/12 completed months and custom range. Calendar quarters initially. Reports default to posted activity. Explicitly label any optional pending-inclusive view as provisional.

**RPT-03:** Compare complete periods to complete periods. To-date comparisons align calendar position: Sep 17 MTD against Aug 1–17; Sep 17 YTD against Jan 1–Sep 17 previous year. Clamp unavailable dates to month end (Feb 29 → Feb 28); QTD aligns month-within-quarter and day. Custom comparison defaults to an equal-length preceding range. Display both exact ranges and offer an explicitly selected custom comparison.

**RPT-04:** Absolute delta = current - prior. Percentage delta = `(current - prior) / abs(prior) * 100`. If both zero, display 0%; if prior zero and current nonzero, display “New” with dollar delta; if signs cross, display percentage as “N/A” with dollar delta to avoid misleading interpretation. Expense increases use distinct context from income increases; not every positive change is favorable.

**RPT-05:** Default reports: income vs expenses/net cash flow; spending by category/group and merchant; monthly trend; budget versus actual; top category/merchant changes. Quarter/year budget totals sum monthly allocations; show opening rollover separately so carry is not counted repeatedly as a new budget.

**RPT-06:** Current-month budget-vs-actual compares actual-to-date with the full month's plan and labels this clearly. Do not silently prorate monthly rent/payments. Earlier closed months compare full actuals with their stored plans. Pending commitments appear separately if requested.

**RPT-07:** Drill-down from any chart/table total opens its contributing allocations/transactions and reproduces the total exactly. Report totals use integer arithmetic before display rounding; exports carry the same filters and periods.

**RPT-08:** Track import coverage and earliest/latest available activity per account. Activity dates alone do not prove complete coverage. Label user-confirmed/provider-declared coverage separately from observed data span; gaps and incomplete comparison periods display warnings rather than fabricated zeros. True zero activity inside confirmed coverage can be shown as zero.

Golden examples: expense 120 vs 100 → +20/+20%; 100 vs 0 → +100/New. Expense -20 vs 100 → -120/N/A. A $200 transfer between selected accounts contributes $0 to both income and expenses. A chart containing a $100 purchase and $20 refund drills down to $80 net expense.

Acceptance: domain fixtures cover month/year boundaries, leap days, partial periods, empty vs missing data, zero denominators, refunds, splits, transfers and budget carry. Same filters and unchanged data must return the same totals in UI, API and CSV.

### SYN — Bank synchronization

**SYN-01:** Provider interface exposes capabilities, credential/setup flow, account discovery, transaction fetch, balance fetch, repair/disconnect guidance and normalized errors. Accommodate date-window and cursor-based providers without pretending both share pagination semantics. No provider-specific field is used directly in reporting.

**SYN-02:** Scheduled and manual sync run server-side with per-connection locking. Respect provider rate limits, retry transient failures with bounded backoff/jitter, and distinguish expired authorization, payment required, rate limit, partial history and provider outage. Proposed daily schedule; higher frequency is optional and does not guarantee fresher bank data.

**SYN-03:** Persist checkpoints only after the corresponding batch commits. Record provider observations separately from user classification. Process corrections/removals without losing edit history. If provider IDs change during pending-to-posted transition, use documented linkage first; ambiguous amount/date/merchant candidates require reconciliation instead of silent deletion. Overlap lookback is provider-configurable.

**SYN-04:** Settings display last attempt, last successful fetch, source-balance timestamp, failures and reconnect action. Disconnect removes local credentials and stops jobs while preserving ledger history; explain any separate provider-side revocation step.

Acceptance: fixture tests cover replay, interrupted pagination, concurrent sync attempts, corrected/removed transactions, expired credentials and pending transitions. Automated tests never call live banks.

### AI — Original baseline (superseded by September 25 addendum)

**AI-01:** `AiProvider` defines category suggestions and period-summary proposals. `none` is the production default; `mock` produces labeled deterministic test data. No paid SDK/key is necessary to install or operate the app.

**AI-02:** Requests use minimal necessary fields; never tokens/account numbers. Outputs are validated suggestions with provenance. No automatic ledger mutation, arbitrary SQL/tool execution, or model-generated financial totals. Future summaries reference totals computed by the reporting engine. Remote/local provider configuration and egress policy require a later specification.

Acceptance: `none` makes zero outbound model requests and core workflows remain fully functional. Mock mode cannot be mistaken for real AI in production.

## 6. Data model and API contracts

Proposed relational entities:

| Entity | Key fields/invariants |
|---|---|
| households / memberships | single household per deployment initially; user membership and owner/member role; visibility policy pending final default confirmation |
| users / sessions | identity, password hash, expiry; per-user sessions; no public registration |
| accounts | household_id, type, currency, source links, inclusion flags, archived_at |
| transactions | account_id, integer amount_minor, date-only posted_date (required for posted, nullable for pending), optional authorized_date, pending/posted state, raw/normalized merchant, revision |
| allocations | transaction_id, category_id, amount_minor; sum equals parent; even unsplit entries have one allocation |
| categories / groups / tags | editable taxonomy, income/expense/transfer kind; archive preserves references |
| classification_rules / merchant_aliases | order, enabled flag, validated predicates/actions, version |
| classification_overrides | transaction/allocation target, locked fields, actor, timestamp |
| transfer_links | explicit pair or marked unmatched transfer, reconciliation state |
| monthly_budgets / category_budgets | month, expected income, category allocation, rollover policy/start/opening amount |
| connections / source_records | encrypted credential reference; source IDs, checkpoints, normalized observations; no raw secrets |
| import_batches / source_aliases | file hash, mapping, counts, source-to-ledger mapping for dedupe |
| sync_runs / balance_snapshots / coverage_intervals | operational health, observed balances, coverage origin/confidence |
| audit_events / settings | redacted changes, versions, pending-budget mode, timezone |

Money is signed integer minor units (USD cents in proposed release), never floating-point storage. Account outflows are negative, inflows positive; an expense refund is a positive transaction assigned to an expense category. Aggregate net spending is the negative sum of expense allocations. Transport amounts as validated safe integers with bounds; use wider integer arithmetic for aggregation and reject overflow. Internal transfer pairs share currency. Date-only bank posting dates must not shift under timezone conversion; timestamps remain UTC.

Logical deletion/tombstones retain provenance for source removals; reports exclude removed records. Updating a source observation does not overwrite user-controlled fields. Foreign keys and transactions enforce invariants.

API: versioned `/api/v1`; shared request/response validation, pagination, consistent errors and optimistic concurrency for edits. Endpoints cover accounts, transactions/allocations, categories, rules/preview/apply, imports/preview/commit, budgets, reports/drilldown/export, connections/sync/health and settings. Report responses include filters, periods, currency, totals, comparison/deltas, coverage warnings and a data revision. Define generated OpenAPI before UI integration. Browser sessions use cookies; future native authentication is deferred rather than exposing unused token endpoints now.

## 7. Proposed implementation architecture

These are new recommendations, not inherited decisions:

- TypeScript throughout; React + Vite frontend, Fastify backend serving API and built frontend.
- Tailwind + shadcn/ui, TanStack Query/Table and Recharts; choose compatible stable versions at scaffolding and pin the lockfile. Verify accessibility of actual components, not just the library label.
- SQLite with WAL and migrations for a small self-hosted deployment; use a local persistent Docker volume, not a live database file on an unreliable network share.
- Domain module with pure money/date/budget/report/classification functions independent of UI/provider code.
- Single application service with an internal scheduler and DB-backed job locks; no Redis/microservices required initially.
- Suggested layout: `apps/web`, `apps/api`, `packages/domain`, `packages/shared`, `packages/connectors`, `packages/ai`, `fixtures`, `scripts`.

Target Linux amd64 for the confirmed x86 host; verify architecture at setup and confirm native dependency/image compatibility on that host. If requirements expand to many users or concurrent writers, reconsider the database explicitly; do not introduce infrastructure preemptively.

## 8. Security, operations and mobile

- Read-only financial access. Never store bank usernames/passwords or automate bank-login scraping.
- Encrypt provider secrets at rest using a standard authenticated encryption library; key supplied outside the database/image. Redact tokens, setup URLs and financial payloads from logs. Do not retain raw provider payloads by default; store normalized records and provenance sufficient for reconciliation.
- Authenticated sessions, secure HttpOnly cookies over TLS, CSRF/origin checks, password hashing with a maintained memory-hard algorithm, login throttling, no public signup. Session expiration proposed: 7-day idle/30-day absolute. MFA is a decision for public exposure, not silently inherited mandatory scope.
- All financial API responses are private/no-store. PWA caches static shell assets only; offline screen explains financial data needs a connection. Clear in-memory sensitive state on logout. No promise of offline ledger editing.
- Docker runs non-root with persistent data and explicit secret configuration. Health checks distinguish process health from bank sync status. Migrations require a backup and documented rollback/restore instructions.
- Nightly encrypted consistent SQLite backups; proposed 14 daily/8 weekly copies. Off-host destination is operator-configured. Exporting CSV is not a database backup. Restore test includes encryption key availability and verifies record counts/domain totals.
- Home-screen install requires HTTPS except local development exceptions; document the selected reverse-proxy/VPN setup for the confirmed LAN/VPN access model. Avoid hard-coding Tailscale or a public domain.
- No telemetry or external scripts by default. A future provider widget requires a narrowly scoped, documented CSP exception.

Proposed performance target: common reports p95 under 1 second at 100,000 transactions on agreed target hardware; paginated transaction screen responds without loading the entire ledger into the browser. Record hardware and dataset with results. Do not require a specific Pi benchmark for the confirmed x86 Linux deployment.

## 9. Bank-data research and selection

Checked 2026-09-17; account-specific connectivity has not been tested. Published coverage and prices can change.

| Path | Evidence and cost | Decision |
|---|---|---|
| U.S. Bank files | Bank documents CSV/QFX/QBO exports and up to 18 months downloadable history via its website | CSV always supported; sample-specific mapping requires preview; do not promise 24 months from the bank |
| SimpleFIN Bridge | Published $1.50/month or $15/year plus tax | Proposed low-cost candidate; verify exact U.S. Bank connection/account types before selecting/subscribing |
| Plaid Trial | Free real Production data including Transactions; eligible US/Canada teams; 10 lifetime Items, deletion does not free slots; docs describe hobbyist use | Credible free alternative. Most OAuth institutions available without full Production registration; actual U.S. Bank eligibility remains a setup check |
| Teller Development | Free real data, 100 lifetime enrollments; Production is paid | Evaluate if desired; clarify ongoing household-use suitability and actual coverage before choosing |
| Direct U.S. Bank personal API | No free self-service personal transaction API verified in this review | Not a build dependency |

A provider check must verify: institution and account subtype, real transaction retrieval, available history, stable IDs and pending behavior, refresh frequency, repair flow, applicable access terms and actual price. Mock fixtures establish software behavior, not actual bank support. No purchases or bank enrollment are authorized by this specification.

### Proposed SimpleFIN adapter (applies only if selected)

Claim the single-use setup token server-side and encrypt the returned Access URL. Fetch account data with its credentials; never expose the Access URL in browser responses or logs. Validate provider URLs against an explicit HTTPS host allowlist; block private/link-local destinations and cross-host redirects to prevent token-driven SSRF. Parse decimal amount strings exactly into cents.

Use daily jittered sync with an overlapping lookback of at least five days. Break backfill into windows no longer than 90 days and schedule within the published request allowance of 24 or fewer daily requests. Available history varies by institution; a 90-day request limit is not a promise of 90-day total history. Surface structured partial errors as well as HTTP failures. Test token replay, partial account errors and rate limits using fixtures. Re-check protocol compatibility during implementation; do not infer support solely from the latest draft document.

Sources: [SimpleFIN developer guide](https://beta-bridge.simplefin.org/info/developers), [SimpleFIN protocol](https://www.simplefin.org/protocol.html), checked 2026-09-17.

Other research sources:

- [U.S. Bank download instructions](https://www.usbank.com/customer-service/knowledge-base/KB0069323.html)
- [U.S. Bank aggregation](https://www.usbank.com/online-mobile-banking/account-aggregation-faq.html)
- [SimpleFIN pricing](https://beta-bridge.simplefin.org/)
- [Plaid billing and Trial limits](https://plaid.com/docs/account/billing/)
- [Plaid Trial and OAuth access](https://support.plaid.com/hc/en-us/articles/16110110883479-How-are-Sandbox-Production-Trial-plan-and-Limited-Production-different)
- [Teller environments](https://teller.io/docs/guides/environments)
- [Teller developer terms](https://teller.io/legal/developer/terms)

Reference product patterns: [Monarch budgeting setup](https://help.monarchmoney.com/hc/en-us/articles/360048393272-Getting-Started-Guide), [Simplifi spending plan](https://support.simplifi.quicken.com/en/articles/14893966-how-to-set-up-the-spending-plan), [Simplifi reports](https://support.simplifi.quicken.com/en/articles/4592676-using-reports-on-the-quicken-simplifi-web-app). These inform original product design rather than feature-parity claims.

## 10. Build sequence and verification

| Milestone | Deliverable | Exit evidence |
|---|---|---|
| M0 Foundation | Repo, pinned dependencies, schema/migrations, synthetic seed, household auth shell, Docker dev deployment | Empty DB migration; validation/type checks; authenticated route test; container starts on available hardware |
| M1 Ledger | Accounts, CSV/manual entry, dedupe/reconciliation, splits/transfers/refunds | ING/TXN fixtures, repeated imports, audit/provenance tests, import UI journey |
| M2 Classification | Taxonomy, rules, overrides, review queue | Rule precedence and dry-run tests; manual corrections survive source updates |
| M3 Budget | Monthly plan, rollover, left-to-spend, pending flag | Golden calculations and historical recalculation tests; budget UI journey |
| M4 Reports | Dashboard, comparisons, drilldown, exports | RPT fixtures; API/UI/export totals agree; coverage and performance evidence |
| M5 Sync | Selected connector, encrypted credentials, jobs, repair/health | Offline fixtures for sync failure/replay; operator connection check recorded separately |
| M6 Release | Responsive/PWA polish, AI seam, backup/restore, deployment documentation | Mobile/keyboard/accessibility checks; no sensitive offline cache; clean restore; production-disabled AI |

Security is incremental: implement relevant controls before each feature handles real data; never defer secret encryption until after live sync. Use synthetic fixtures throughout development. Avoid circular milestone gates requiring features not yet built.

Before release: resolve the remaining household-visibility/provider/currency defaults, verify target Docker host, select and validate bank provider (or explicitly ship CSV-only), complete backup/restore drill and document known limitations. Do not mark unrun checks as passed.

Builder instructions: implement P0 in dependency order, preserve requirement IDs, record reversible defaults and unanswered questions in PROGRESS.md, and run focused tests plus lint/type/build checks. Ask when a decision changes ownership/access, costs money, needs real credentials or materially changes accounting semantics. Do not ask again for already confirmed decisions. Do not silently build P1/P2 features or treat archived documents as authority.


## September 25, 2026 — Approved AI expansion

This addendum supersedes C09 and the original AI seam-only scope. The user requested OpenAI `gpt-6-luna` at short-context pricing, a **$10 monthly cap**, automatic categorization after imports, local teachable memory, review flags, app-focused chat and budget/bill/subscription updates.

Implement a bounded Responses adapter with minimal context, strict output validation, local rule/memory-first classification, hourly batches, confidence gating and protection of manual/split assignments. Keep all automatic classifications unreviewed. Run free local anomaly checks and expose reasons in Needs review. Provide owner-managed encrypted credentials and a private JSON memory file mirrored in backed-up SQLite. Manual corrections teach merchant defaults without model calls. Budget/recurring/memory model edits require user confirmation with stale-state and actor checks. Chat has no shell, SQL, browsing, arbitrary tools, secrets or payment capability. Track conservative usage reservations and reject requests beyond monthly/daily/context limits. Core features remain usable without AI. See README for current bounds and known limitations.

## Recurring plans and calendar — October 2026

Recurring planning is a core, local feature independent of AI. Existing monthly planning records are retained and normalized to monthly schedules, starting on the first day of the migration month. No sample household bills are seeded.

- Users define name, income/bill/subscription/transfer/allowance type, per-occurrence amount, estimate flag, category, optional matching account/merchant, start/end dates, and automatic matching preference.
- Frequencies: one time, weekly, every two weeks, twice monthly, monthly, quarterly and yearly. Weekly intervals use the start date; quarterly/yearly use its month. Month-end days clamp without drifting subsequent occurrences. Two days clamping to the same date produce one occurrence. Weekends remain unchanged.
- Saving a schedule includes its current-month occurrences from its start date, which can be backdated. Scheduled category totals and income are floors: preserve a larger existing allocation, raise a smaller one, never add the same commitment twice. Transfers do not affect expense plans. Existing allocations are never automatically reduced by pauses, skips or edits. Past plans are not rewritten. Opening a future budget applies its floor; the background job also ensures the current month is populated.
- Calendar provides a desktop month grid and mobile agenda, account/status filters, full-month income/expense/transfer/outstanding totals, and upcoming/due/overdue/pending/paid/received/planned/skipped states. These are expectations, not ledger transactions or a bank-balance forecast.
- Clear automatic matches require normalized merchant, exact amount, compatible direction/account and a date within three days, with uniqueness on both occurrence and transaction. Ambiguous or variable payments can be manually matched, unlinked or excluded from automatic matching. Pending matches become paid/received when posted; deleted/removed records no longer count. No matching operation alters the ledger or marks a transaction reviewed.
- Individual occurrences can be moved, skipped or given an amount override, including across month boundaries. Series edits affect calendar history; past budget allocations remain intact. Optimistic revisions reject stale schedule/exception saves. Pausing hides a series; use an end date to retain its earlier calendar occurrences.
- Local suggestion analysis considers up to two years of posted data, groups by account/merchant/direction, uses the latest twelve samples and requires at least three consistent intervals' source transactions. It detects weekly, biweekly, twice-monthly, monthly, quarterly and yearly patterns where history is sufficient. Suggestions show evidence and median amounts, require review before creation, and support dismissal/restoration. Splits, pending transactions and identified transfers are excluded. No model API is called.
- Production records, secrets and private examples remain outside Git. Validate scheduling boundaries, matching ambiguity, budget idempotence, stale edits, migration, authentication and responsive accessibility before release.
