# Budget Gremlin — Product brief

Fresh draft, 2026-09-17. [SPEC.md](SPEC.md) is the implementation authority. Earlier planning has been archived and must not be treated as approved scope.

## Confirmed

- Personal finance and budgeting inspired by Monarch Money and Quicken Simplifi.
- Monthly category budgets, optional rollover and a left-to-spend summary.
- Docker on an x86 Linux home server, household members with separate logins, home network/VPN access; responsive web app with home-screen installation and possible future native client.
- U.S. Bank checking, savings and credit cards; 12–24 months of history where available; low-cost automatic sync is acceptable if supported.
- Pending commitments shown separately from posted spending and deducted from left-to-spend; reports use posted activity by default.
- Editable classification and strong over-time reporting.
- Minimal, modern design and no paid LLM dependency; stub AI for now.

## First release

Accounts, CSV/manual imports, one verified bank connector, transaction review and rules, splits/transfers/refunds, monthly budgets, month/quarter/YTD comparisons, drill-down and CSV export. Include authentication, backups/restore, Docker instructions, mobile-friendly navigation and a disabled AI interface.

Proposed implementation: TypeScript, React/Vite, Fastify, SQLite, Tailwind/shadcn, TanStack and Recharts. These are recommendations, not inherited decisions.

## Remaining defaults for confirmation

Proposed: USD, America/Los_Angeles reporting timezone, shared household access to all accounts, and SimpleFIN as first connector if actual U.S. Bank connectivity succeeds. These have been prompted together. Owner manages users/security; household members edit shared finance data. No fixed household size is assumed.

Server RAM is unspecified; measure performance on the actual x86 Linux host. Document the chosen private HTTPS/VPN setup without prescribing a vendor.

## Bank options

CSV is the permanent fallback. SimpleFIN publishes $15/year or $1.50/month plus tax. Plaid Trial offers free real data with a lifetime cap of 10 Items; actual bank access needs verification. Teller's free Development environment is another option to evaluate, not a guaranteed ongoing household service. Sources and limitations are in SPEC section 9.

## Later

Recurring bills/subscriptions, goals, forecasts, watchlists, saved reports, net-worth history and reimbursement tracking. Local AI, receipts, investment analysis and a native app need separate scope.

## Build handoff

Read SPEC.md, implement M0–M6, and record evidence in PROGRESS.md. Reporting correctness, duplicate prevention and recovery take precedence over feature breadth. Never infer approval from silence or import decisions from the archive.
