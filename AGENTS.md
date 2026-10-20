# Chikken Mart conventions

## Stack and commands

Use Next.js App Router, TypeScript, PostgreSQL, Prisma, Tailwind, shadcn/ui, and Zod. It is single-admin, with no authentication or payment integrations. Start PostgreSQL with `docker compose up -d`; copy `.env.example` to `.env`; then use `npm run db:migrate`, `npm run db:seed`, `npm run typecheck`, `npm run test`, and `npm run build`. Integration tests use the isolated `accounting_test` schema, never `public`.

## Financial invariants

- Never use JavaScript floating point for weights, prices, totals, balances, or profit. Use Prisma `Decimal`/PostgreSQL `numeric` and validate string input with Zod.
- Weight is kg to 3 decimal places; money is INR to 2 decimal places; per-kg prices/costs use 4 decimals.
- `InventoryMovement` is the inventory source of truth. Each opening position, receipt item, sale item, and stock adjustment produces exactly one movement in the same transaction. Receipts/openings are positive, sales are negative, and adjustments are signed.
- `MoneyMovement` is the cash/bank source of truth. Amounts are positive; direction is determined by `fromAccountId` and `toAccountId`. Never persist a mutable account balance.
- Supplier payments cannot exceed a payable’s remaining amount; customer collections cannot exceed a credit’s remaining amount. Update status and write the movement atomically.
- Expenses, payments, collections, withdrawals, and opening balances each have one money movement. Keep their duplicated amounts equal in the transaction service.
- Stock counts record expected and actual quantities; adjustment records the difference rather than replacing history.
- Every posting endpoint and service requires an idempotency key. Reusing a key for the same operation returns the original record; reusing it for another operation fails.
- Inventory valuation and COGS are replayed in chronological order using weighted-average cost. Do not cache or overwrite historical COGS; a backdated receipt or correction must change later derived cost reports.
- Reconciliation stores an observed account balance and its calculated ledger balance. A reconciliation is evidence of a discrepancy, not an automatic money adjustment.

## Corrections and future work

Posted ledger history is append-only. Correct errors with an opposite inventory or money movement linked through `reversalOfId`, then create the replacement source document. Never edit/delete posted movements. Wrap each posting workflow in `prisma.$transaction` and validate all inputs/totals with Zod before and inside it.

The accounting engine lives in `lib/accounting/engine.ts`; its API boundary is `app/api/accounting/[operation]/route.ts`. Future phases: shadcn admin forms and dashboards; audit metadata, exports, backups, and richer invariant/concurrency tests.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
