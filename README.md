# Fiskalo

Fiskalo is a Kosovo-focused business operations MVP for sales, invoices, products, customers, expenses, inventory, and team access.

## Current MVP status

Implemented:
- Supabase email registration, login, email callback, password reset, and logout
- Business onboarding with NUI and municipality
- Multiple business workspaces and isolated organization data
- Role-based team membership: owner, administrator, accountant, manager, cashier
- Products and services with Kosovo VAT rate options (0%, 8%, 18%)
- Customer register
- Expense register
- Invoice drafts and atomic sequential invoice numbering on issue
- Issued invoice immutability
- Inventory deduction, audited manual stock adjustments, and stock movement records
- Management summaries and CSV exports
- Row Level Security on all Fiskalo tables
- Cloudflare Workers deployment configuration (OpenNext)

Not yet part of this MVP:
- Certified ATK EFS fiscalization and electronic submission
- Certified fiscal receipt/QR workflow and hardware integrations
- Accountant multi-client workspace
- Employee email invitations (team members must already have a Fiskalo account)
- Supplier purchasing, purchase books, detailed inventory receiving, POS hardware and cash drawer
- Subscription billing and Fiskalo platform administration
- Production deployment and live end-to-end testing with real business accounts

**Fiskalo is not ATK-certified or approved.** Invoices issued in this MVP are internal business records and are explicitly marked as not officially fiscalized. Do not use Fiskalo as a replacement for a legally required certified EFS until ATK approval and the relevant integration are complete.

## Technology

- Next.js 15 + TypeScript
- Supabase Auth + PostgreSQL
- Cloudflare Workers via the OpenNext adapter
- GitHub source control

No Vercel deployment is used.

## Supabase setup

The current temporary backend is the existing Supabase project `zikos`. Fiskalo objects are namespaced with the `fiskalo_` prefix. Migrations do not modify other application tables or shared Auth configuration.

Apply migrations in order:
1. `supabase/migrations/0001_business_foundation.sql`
2. `supabase/migrations/0002_onboarding_and_invoice_workflows.sql`
3. `supabase/migrations/0003_invoice_controls_and_stock.sql`
4. `supabase/migrations/0004_team_management.sql`
5. `supabase/migrations/0005_tenant_integrity_and_atomic_stock.sql`
6. `supabase/migrations/0006_invoice_financial_integrity_and_payments.sql`
7. `supabase/migrations/0007_stock_adjustment_workflow.sql`
8. `supabase/migrations/0008_opening_stock_audit.sql`

Required public environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

For local development, copy `.env.example` to `.env.local` and fill in those values. Never commit service-role keys, signing keys, or production credentials. The service-role key is not required by the current client MVP.

Configure the Supabase Auth site URL and redirect allow-list to include the deployed Fiskalo origin and `/auth/callback`, plus `/reset-password` as a recovery destination.

## Local development

1. Use Node.js 22.
2. Run `npm install`.
3. Configure `.env.local`.
4. Run `npm run dev`.
5. Run `npm run typecheck`, `npm run lint`, and `npm run build`.

## Cloudflare Workers

The repository contains `wrangler.jsonc` and `open-next.config.ts`.

- Local Worker preview: `npm run preview`
- Deploy: `npm run deploy`
- Generate Worker types: `npm run cf-typegen`

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as Cloudflare Worker environment variables before deployment. Cloudflare deployment also requires an authenticated Wrangler session or Cloudflare API credentials with Workers deployment permission.

## Security and compliance boundaries

- Every business record is scoped to an organization and protected by Row Level Security.
- Issued/cancelled invoices cannot be edited or deleted through the ordinary client workflow.
- Invoice numbering is allocated transactionally by a database function.
- Stock is checked and decremented atomically when an invoice is issued.
- Audit events are recorded for business creation, invoice issuance, and team membership changes.
- Fiscal signing keys and ATK credentials must never be stored in ordinary database tables.
- Official fiscalization must remain disabled until current ATK specifications, authorized access, tests, and certification have been verified and completed.
