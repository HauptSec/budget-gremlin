# Budget Gremlin

A private, self-hosted home for household budgeting. React/TypeScript frontend, Fastify API, SQLite ledger, and an optional SimpleFIN connector. Optional GPT-6 Luna assistance is available with owner-configured spending limits; core budgeting works without it.

## Quick start — Docker (default)

Production runs as Docker containers: the app plus a bundled Caddy HTTPS proxy. No host Node.js installation is needed. Requires Linux, Git, Docker Engine and the Compose plugin.

```sh
git clone https://github.com/HauptSec/budget-gremlin.git
cd budget-gremlin
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
```

Put the generated key in `.env` as `ENCRYPTION_KEY`. Set `LAN_IP` to your server's private IP and `APP_ORIGIN` to `https://` followed by that same IP. Keep the key private and backed up separately. On an existing installation, preserve its environment file and volumes.

```sh
docker compose up -d --build --wait
# Create an owner once, only on a new installation:
read -s ADMIN_PASSWORD
export ADMIN_PASSWORD
docker compose exec -e ADMIN_PASSWORD -e ADMIN_EMAIL=you@example.com -e ADMIN_NAME=Owner app npm run setup
unset ADMIN_PASSWORD
```

Open `https://<LAN_IP>`. Caddy uses a private certificate authority; follow [certificate trust and deployment instructions](deploy/README.md) to trust it on your devices. HTTP redirects to HTTPS. The app itself binds only to host loopback, runs non-root with a read-only filesystem, and stores financial records and encrypted backups in persistent Docker volumes. Both containers restart automatically. Never use `docker compose down -v` on an installation whose data you need.

The server can [automatically deploy verified GitHub changes every two minutes](deploy/README.md#automatic-updates-from-github), following the timer approach used by [kanban-calendar](https://github.com/HauptSec/kanban-calendar#auto-deploy-from-github-optional).

## Local development (optional)

Requires Node.js **24.14+** and npm. The lockfile pins the application dependencies. Node 24 is the Docker runtime; `node:sqlite` provides the database without a native addon installation.

```sh
npm ci
cp .env.example .env
```

Generate an encryption key and place it in `.env` as `ENCRYPTION_KEY`:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep that key outside source control and back it up separately. It is required for bank connections and encrypted backups, but CSV budgeting can run without a bank provider.

Create the initial owner (once, on an empty installation):

```sh
read -s ADMIN_PASSWORD
export ADMIN_PASSWORD
export ADMIN_EMAIL='you@example.com'
export ADMIN_NAME='Your name'
npm run setup
unset ADMIN_PASSWORD
npm run dev
```

Open [localhost:5173](http://localhost:5173). The API listens on `127.0.0.1:3001`. Default development origin is `http://localhost:5173`; use that hostname rather than `127.0.0.1` so origin checks agree. Development cookies are HTTP-only/SameSite Strict; production requires HTTPS/Secure cookies.

### Explore synthetic data instead

On an empty database, set `ADMIN_PASSWORD` as above and run `npm run seed` instead of `npm run setup`. Sign in as `demo@budgetgremlin.local`. The demo has 12 months of synthetic transactions and visibly identifies itself. Seeding refuses an installation that already has users or transactions. Use a different `DATABASE_PATH` for your real household; do not mix demo and real records.

### Main workflows

1. **Accounts:** create checking, savings and credit-card accounts. Credit-card debt and purchases use negative amounts. Opening balance is immediately before activity on the opening date.
2. **Transactions → Import CSV:** map exact column names and date/sign conventions, inspect the preview, then explicitly import valid rows. Mapping profiles are saved. Ambiguous overlap candidates remain outside the ledger until reconciled.
3. **Transactions:** review, categorize, tag, split and bulk-edit. Manual classifications are locked. Rules use ordered first-match evaluation with a versioned retroactive preview.
4. **Budget:** set income and category allocations, optionally enable signed rollover, and copy a plan into selected months. Unallocated income remains separate from left-to-spend.
5. **Reports:** compare month/quarter/year/custom ranges, inspect exact allocation totals, and export filtered CSV. Reports exclude pending entries and transfers by default. Confirm statement coverage under Accounts when you have reconciled the complete range.
6. **Settings:** invite household members, manage categories, connect banks, create backups and review audit history. All members share the ledger; only the owner manages credentials and membership.

## Optional U.S. Bank sync

The implemented provider is **SimpleFIN Bridge**, with a provider interface for future alternatives. Actual U.S. Bank account compatibility and available history must be checked with the provider; fixture tests do not prove connectivity. No bank subscription or live connection is created by installing the app.

1. Confirm your exact accounts are supported before purchasing provider access.
2. Generate a SimpleFIN setup token through its site.
3. Paste the single-use token into **Settings → Bank connections**, with the history start you want to request.
4. Sync once to discover accounts. Link each discovered account to its existing local account, or choose Create a new account and select its type. Linking restarts the history request.
5. Sync again to import transactions. Long histories are fetched in 45-day windows within a conservative daily request budget. Manual sync and the first scheduled sync each day refresh the latest 45-day window. Other hourly jobs advance the separate historical cursor until caught up; overlapping imports are deduplicated.

Credentials are AES-256-GCM encrypted using `ENCRYPTION_KEY`. Only the official SimpleFIN HTTPS hosts are accepted; redirects are rejected. Bank passwords are never requested. Expired authorization, payment-required, rate-limit and partial-result states appear in Settings. Disconnect removes the local credential; revoke the token separately at SimpleFIN.

When a provider changes a transaction ID, ambiguous duplicates and pending-to-posted matches require review. Missing records are not automatically deleted: disappearance alone is not proof of removal. Amount changes to split or paired-transfer transactions are flagged for reconciliation instead of silently corrupting allocations.

The target of 12–24 months is best effort. U.S. Bank's documented file export is up to 18 months; provider history can be shorter. Older compatible CSV files can extend your ledger.

## Backup and recovery

Configure `ENCRYPTION_KEY`. The scheduler makes an encrypted consistent SQLite backup once per UTC day while the server is running. It keeps 14 recent backups plus up to eight weekly representatives. `BACKUP_DIR` defaults to `backups/`; set optional `BACKUP_COPY_DIR` to a separately mounted off-host destination. Copying backups to another disk/server is an operator responsibility.

```sh
npm run backup
# Restore into a NEW path. Existing files are never overwritten.
npm run restore -- backups/gremlin-TIMESTAMP.encrypted data/restored.sqlite
```

Recovery steps:

1. Stop the application; preserve the current database and its WAL/SHM files.
2. Restore with the same encryption key into a new database path.
3. Point `DATABASE_PATH` to the restored file and restart.
4. Verify account counts, report totals and connection state. Regenerate/revoke provider credentials if the old server may have been compromised.

To restore a Docker backup, use a one-off `docker compose run --rm --no-deps app npm run restore -- /backups/FILE /data/restored.sqlite` after stopping the app, then update `DATABASE_PATH` in compose to the restored path. Backups include session data; changing a user's password invalidates their other sessions. A lost encryption key means encrypted backups and provider credentials cannot be decrypted.

For upgrades, create a backup first, then build and restart. The initial schema is versioned in SQLite. Roll back by restoring a pre-upgrade database into a new path with the matching application version; do not run old code against an unknown newer schema.

## Mobile and privacy

The app adapts to phone screens and has a web app manifest. From your private HTTPS origin, use your phone browser's Add to Home Screen flow. The service worker caches only static offline assets, never financial API responses. Offline mode explains how to reconnect; it does not show stale financial records or accept edits.

Household sessions have a seven-day idle and 30-day absolute lifetime. Owners issue expiring single-use invitations. Removing a member revokes their sessions. There is no public signup, analytics service, or third-party model request.

## Verification and developer commands

```sh
npm run verify       # lint, TypeScript, domain/API tests, production build
npx playwright install chromium
npm run test:e2e     # real desktop/mobile browser journeys and axe checks
npm run openapi      # regenerate docs/openapi.json
npm run bench        # 100k synthetic transaction report benchmark
npm run format
```

If Chromium is already installed in a custom location, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when running the browser tests. Tests use temporary databases and synthetic data; connector tests inject offline fixtures. No live bank credentials belong in CI.

Architecture: `apps/api` (auth, persistence, imports, sync, backup); `apps/web` (responsive UI); `packages/domain` (pure money/date/rules/budget/report logic); `packages/shared` (validated contracts); `packages/connectors`; `packages/ai` (bounded OpenAI adapter plus offline test mocks).

See [SPEC.md](SPEC.md) for requirements and [PROGRESS.md](PROGRESS.md) for evidence and remaining deployment checks. Monthly recurring planning is available in the AI workspace. Forecasts, goals, receipts, investment analytics and native clients remain deferred.


## AI assistant

Open **AI assistant** in the sidebar, or **Settings → AI integration**. Only the owner can configure the encrypted OpenAI key, enable the integration, and change spending limits. Never put an API key in source code or the frontend environment.

- Model: `gpt-6-luna`, Standard Responses API, reasoning disabled, at most 2,000 output tokens and 40 KB of serialized request content. These requests stay well below the 272K-token long-context threshold. Pricing reference: [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna).
- Household defaults: **$10/month**, 40 requests/day, one in-flight request, automatic categorization enabled when AI is enabled. Reservations are checked before the call; no automatic API retries. Estimates conservatively use $0.125/M input (including potential cache writes) and $0.50/M output. Failed requests with unknown usage retain the reservation. Pricing is versioned in code; provider billing remains authoritative.
- Automatic processing: after new/changed ledger data, an hourly-bounded job runs free review checks and one category batch. Up to 500 local rule/memory matches and 25 AI candidates per run. Manual categories and splits are preserved. Model confidence must reach 95%; all AI classifications remain unreviewed. Uncertain items get a Needs review reason and are not repeatedly sent unchanged.
- Memory: `/data/ai-memory.json` in Docker, mode 0600. Owner-editable preference notes and the latest 100 merchant corrections, also held in SQLite so encrypted backups include them. App edits are authoritative; manual file changes are overwritten from the database mirror. Only relevant examples and bounded notes enter requests. Chat may propose a memory note; confirmation is required. Category corrections teach merchant mappings locally without paid calls.
- Tasks: categorize, AI review, monthly briefing, free recurring detection and free deterministic anomaly checks. These flags are prompts for human review, not fraud findings. Marking a transaction reviewed acknowledges its current flags.
- Chat: per-user local history, with only four short recent messages sent. Select a month and optional merchant filter. Exact period totals and bounded category/merchant breakdowns are computed locally; at most 40 transaction rows enter a request. Chat does not automatically retrieve every historical transaction. Clear conversation deletes local chat history.
- Budget and memory edits are explicit proposals. Only the proposing user can confirm them; proposals expire after 24 hours and reject changed target data. Recurring items are monthly planning records, never bank payments. Applying a recurring-budget proposal raises category allocations/income to cover configured items, preserving larger existing plans; it does not silently reduce other allocations.
- Guardrails: authenticated/CSRF-protected endpoints, owner-only credentials, fixed OpenAI endpoint/model, strict output schema, whitelisted category/transaction IDs, revision checks, spending reservations, no web/shell/SQL tools, and no model access to configuration or bank secrets. Untrusted merchant/memory text is data. These controls constrain actions; they cannot guarantee every natural-language answer is correct or perfectly on-topic.
- Privacy: bounded financial context is sent to OpenAI only after enabling. `store:false` avoids Responses application-state storage but does not itself eliminate abuse-monitoring retention. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data). Browser assets never cache financial API responses.

Disable AI to stop new model calls; remove the key in owner settings if desired. Encrypted database backups include the encrypted API key, local memory, chat, proposal and usage records. Keep the server encryption key separately for recovery. After restore, the memory file is regenerated from the database.

## GitHub CI setup

The verification workflow lives in `.github/workflows/ci.yml` and runs on pushes and pull requests. It runs lint, type checks, unit/API tests, a production build, and browser tests using synthetic data. No production secrets are needed.

## Recurring plans and calendar

Use **Recurring plans** (also linked from Budget) to define income/paydays, bills, subscriptions, transfers and spending allowances. Supported schedules are one-time, weekly, every two weeks, twice monthly, monthly, quarterly and yearly. Pick a start date, category and expected amount; optional account/merchant matching and an estimate flag help with variable bills. Backdate the start date if earlier occurrences should count in this month's plan. No example bills are added automatically.

Saving raises the current month's category allocation or expected income only when scheduled totals exceed the existing plan. Future months are included when their Budget page is opened. Plans never generate actual transactions. Pausing, skipping or lowering an item does not automatically reduce a saved budget; adjust the plan yourself if you want to release money. Transfers appear on the calendar but stay outside expense allocations. An allowance reserves a category amount without expecting a single payment.

**Calendar** shows expected dates, monthly totals and payment status. Open an occurrence to reschedule it, change that occurrence's estimate, skip it, match a transaction or unlink one. Automatic matches require a unique merchant/amount/direction/account match within three days; variable or ambiguous matches need review. Pending matches remain pending until posted. Monthly totals are planning amounts, not a forecast of available bank cash. On phones, the calendar becomes a daily agenda.

Month-end dates use the month's last day; weekends do not move. Twice-monthly dates that both clamp to the same day produce one occurrence. Editing a series changes its calendar history; use occurrence edits for exceptions, or an end date to stop future events while preserving the earlier schedule.

**Suggested from your transactions** analyzes the latest posted history whenever you open Recurring plans, including newly imported data. It shows repeated weekly/monthly and other supported patterns, median amounts and evidence. Review and save to accept, or dismiss/restore suggestions. This runs locally and makes no AI API calls. Existing monthly AI planning records migrate into this feature; AI's quick monthly form remains available.
