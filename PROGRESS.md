# Budget Gremlin — Build progress

Implemented from the fresh SPEC.md v0.1.0 baseline. Updated September 17, 2026.

## Delivered

- React/TypeScript responsive app: overview, transactions, monthly budgets, reports, accounts and settings; light/dark themes and installable PWA assets.
- Fastify API and SQLite migrations, exact integer-cent ledger, household owner/member authentication, invitations, CSRF checks and audit trail.
- Manual accounts/transactions, CSV mapping/preview/import, duplicate quarantine, replay protection, import undo, splits, refunds and confirmed transfers.
- Editable categories, category merging, ordered classification rules with preview, merchant defaults, manual locks and bulk review.
- Monthly plans, signed rollover, copy-forward, posted spending and separate pending commitments deducted from left-to-spend.
- Calendar comparisons, filters, category changes, budget versus actual, exact drill-down/export totals and incomplete-history warnings.
- Optional SimpleFIN adapter: encrypted credentials, discovery/linking, daily sync, bounded history backfill, retry states and reconciliation. No live credentials or bank enrollment used.
- Encrypted consistent backups, retention, restore command, disabled/mock AI seam, generated API reference, Docker Compose and deployment documentation.

## Milestone status

| Milestone | Implementation and local evidence | Remaining environment checks |
|---|---|---|
| M0 Foundation | Implemented; migration/auth/type/build checks pass; Compose configuration validates | Container build/start on x86 Linux |
| M1 Ledger | Implemented; CSV replay/overlap/undo, splits, transfers, revision and UI journey checks pass | Real statement reconciliation |
| M2 Classification | Implemented; rule precedence, protected manual edits and category merge regression pass | Household workflow feedback |
| M3 Budget | Implemented; exact golden calculations, signed rollover and pending behavior tests pass | Household workflow feedback |
| M4 Reports | Implemented; exact drill-down/export parity, calendar/coverage tests and 100k benchmark pass | Performance on target server |
| M5 Sync | Implemented; offline replay, pending transition, linking/backfill and failure-lock fixtures pass | Actual US Bank support, authorization and available history |
| M6 Release | Responsive, accessibility, keyboard, restore and PWA assets checked locally | Private HTTPS deployment and physical-phone installation |

These are implementation statuses, not a claim that target deployment or live-bank acceptance criteria have passed.

## Implementation assumptions

- Shared household ledger, USD and America/Los_Angeles are reversible defaults; not additional confirmed user decisions.
- SimpleFIN is the first optional connector. Low-cost sync was authorized in principle; provider purchase and actual US Bank connectivity remain unconfirmed.
- npm lockfile and Node 24 Docker runtime; Node's SQLite module avoids a separate native database addon. Local verification used Node 26 on macOS arm64.
- Indexed relational transactions/allocations/source aliases with JSON records for configuration entities; server-side sessions and scrypt passwords.
- Production expects an operator-managed private HTTPS reverse proxy. Compose binds only host loopback; VPN/LAN access goes through that proxy.
- Category merging requires first removing the source from budget plans, preserving explicit budget-history decisions.
- Missing provider records are not automatically deleted; absence alone does not establish removal.

## Verification evidence

- `npm run verify`: lint, TypeScript, **20 API/domain tests**, production build passed.
- `npm run test:e2e`: **7 browser tests** covering authenticated workflows, CSV import, logout protection, dialogs, responsive layouts (360/390 px), and axe checks across all six screens in both themes. Local run used an existing Chromium installation via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- `npm run bench`: 100,000 synthetic transactions; query + aggregation + serialization runs **408, 420, 365, 368, 402 ms** on Apple M1 Pro/macOS arm64. Not a measurement of the Linux target.
- `docker compose config --quiet`: passed. Docker daemon unavailable locally; image build/start not verified.
- Backup restore integration checks ledger preservation and authenticated encryption.
- SimpleFIN tests use fixtures only. No real transactions, subscriptions or paid AI services accessed.

## Local demo

The development server uses `data/demo.sqlite` containing synthetic data and a visible demo banner. Local configuration is ignored by version control. See README.md for creating a separate real household database, deployment, bank setup and recovery instructions.

## Subsequent implementation updates

- Added private LAN HTTPS deployment with Caddy and persistent Docker volumes. See `deploy/README.md` for generic operator instructions.
- Fixed first-time SimpleFIN account linking with atomic account creation and explicit account types. Sync windows are bounded to 45 days.
- Manual sync and the first daily scheduled job request recent activity first; subsequent jobs advance an independent historical cursor.
- Added optional OpenAI tasks and chat, encrypted credentials, estimated spending limits, local classification memory, review flags, and confirmed budget/recurring proposals. See README for safeguards and limits.
- Added category group selection and alphabetized, nested category groups in Settings.

Private deployment details and live financial diagnostics are deliberately excluded from the public repository. Earlier verification entries describe their original development checkpoints, not the latest production state.

## Docker deployment default and GitHub updates

Docker Compose now includes private HTTPS by default. The optional two-minute user-systemd deployer follows the kanban-calendar polling pattern, waits for successful CI for the exact commit, builds before restarting, backs up the ledger, and records success after health checks. Six offline deployment checks cover success, unchanged commits, CI deferral, failed build retry, startup failure, and forced rebuilds.

## Recurring plans and calendar

- Added recurring income, bills, subscriptions, transfers, and spending allowances with one-time, weekly, biweekly, twice-monthly, monthly, quarterly, and yearly schedules. Start dates, end dates, and short-month handling are explicit.
- Current and future monthly plans use scheduled amounts as minimums within existing category and income plans; scheduled transfers never inflate spending. Past plans and actual transactions remain separate.
- Added desktop calendar and mobile agenda, clear automatic payment matches, manual matching/unlinking, rescheduling, skipped occurrences, and estimated amounts.
- Local transaction-history analysis suggests recurring items for user acceptance without paid AI calls. No personal example schedules were seeded.
- Verification: 40 API/domain tests, lint, type checks, and production build; 10 browser tests including schedule-to-budget-to-calendar flows, both-theme accessibility, and mobile layouts. Synthetic fixtures only.
