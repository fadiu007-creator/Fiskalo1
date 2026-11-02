# Fiskalo

Fiskalo is a Kosovo-focused business operations MVP for sales, invoices, products, customers, expenses, inventory, and team access.

## Current MVP status

Implemented:
- Supabase email registration, login, email callback, password reset, and logout
- Business onboarding with NUI and municipality
- Multiple business workspaces and isolated organization data
- Role-based team membership: owner, administrator, accountant, manager, cashier
- Products and services with four-decimal unit-price precision and simplified VAT entry; the correct ATK tax category must be confirmed for each supply
- Customer register
- Expense register
- Invoice drafts, atomic sequential numbering, manual/partial payments and payment history
- Issued invoice immutability
- Inventory deduction, audited manual stock adjustments, and stock movement records
- Supplier register, purchase drafts, atomic stock receiving, supplier payment ledger and outstanding balances
- Date-filtered management reports and CSV exports
- ATK preparation foundation: taxpayer fiscalization-number profile, test POS registry, fiscal document/event schema and provider production lock
- Responsive browser POS for product search, cart, invoice issue and confirmed/manual payment ledger posting
- Android-native POS client scaffold (Expo/React Native) with Supabase sign-in, business selection, cart, invoice issue and payment recording
- Fiskalo invoice-to-ATK coupon mapping core with explicit ATK catalogue/payment inputs and Sale/Cancel/Return reference validation
- .NET 8 POS protocol core based on ATK's official C# sample: Protobuf models, P-256 CSR helpers, ECDSA coupon signing, money conversion and test-only HTTP client
- Row Level Security on all Fiskalo tables
- Cloudflare Workers deployment configuration (OpenNext)

Not yet part of this MVP:
- Certified ATK EFS fiscalization and electronic submission
- Android-native ATK signing/certificate support (current local signing agent is Windows-only)
- Certified fiscal receipt/QR workflow and hardware integrations
- Accountant multi-client workspace
- Employee email invitations (team members must already have a Fiskalo account)
- Executed ATK test onboarding and coupon submissions, installed Windows service/auto-start, Android Keystore fiscal signing, full offline reconciliation UI, printer/POS hardware and cash drawer
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
9. `supabase/migrations/0009_invoice_draft_and_line_integrity.sql`
10. `supabase/migrations/0010_invoice_payment_ledger.sql`
11. `supabase/migrations/0011_unit_price_precision.sql`
12. `supabase/migrations/0012_fix_product_org_link_trigger.sql`
13. `supabase/migrations/0013_edit_invoice_drafts.sql`
14. `supabase/migrations/0014_team_invitations_and_payment_clarity.sql`
15. `supabase/migrations/0015_explicit_invoice_payment_status.sql`
16. `supabase/migrations/0016_atomic_target_stock_adjustment.sql`
17. `supabase/migrations/0017_restrict_stock_rpc_to_authenticated.sql`
18. `supabase/migrations/0018_restrict_fiskalo_definer_functions.sql`
19. `supabase/migrations/0019_suppliers_and_purchase_receiving.sql`
20. `supabase/migrations/0020_atomic_purchase_creation.sql`
21. `supabase/migrations/0021_supplier_payment_ledger.sql`
22. `supabase/migrations/0022_atk_fiscalization_foundation.sql`

Required public environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

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

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as Cloudflare Worker environment variables before deployment. Cloudflare deployment also requires GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, plus build secrets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. For a first-time Worker creation, the token needs Workers Admin access; if the Worker already exists, Workers Editor is sufficient. Add Workers Routes Write only if deployment also changes a custom domain/route. Set the two Supabase values as Worker runtime variables in the Cloudflare dashboard as well. Then run the manual `Deploy Fiskalo to Cloudflare Workers` workflow from GitHub Actions.

## ATK SEF certification roadmap

The current 2026 ATK requirements and certification gates are tracked in [`docs/atk-efs-compliance.md`](docs/atk-efs-compliance.md). This MVP is not certified and does not issue official fiscal coupons.

## Security and compliance boundaries

- Every business record is scoped to an organization and protected by Row Level Security.
- Issued/cancelled invoices cannot be edited or deleted through the ordinary client workflow.
- Invoice numbering is allocated transactionally by a database function.
- Stock is checked and decremented atomically when an invoice is issued.
- Audit events are recorded for business creation, invoice issuance, and team membership changes.
- Fiscal signing keys and ATK credentials must never be stored in ordinary database tables.
- The dashboard stores taxpayer/POS metadata; the paired Windows agent performs explicit test-only ATK verification, CSR/certificate requests and test coupon submission. Private signing keys remain local and DPAPI-protected.
- The ATK test protocol is based on the official `fiskalizimi/pos-csharp` and `pos-golang` examples; the current implementation state and test sequence are in `docs/atk-efs-certification-and-integration.md`.
- Official fiscalization must remain disabled until current ATK specifications, authorized test access, onboarding, Sale/Cancel/Return tests, and provider/solution certification have been completed.


### POS clients and ATK agent status

- **Web POS:** available in source at `/app/[organizationId]/pos`, linked from the business dashboard. It creates internal invoices and records payments only after cashier confirmation. Card acquiring/terminal processing is not integrated.
- **Android POS:** source scaffold in `mobile-pos/`. It uses the same Supabase tenant/RLS model, stores the Supabase session using Android SecureStore, and supports standard internal invoice checkout. It has not yet been built into an APK or tested on a physical device.
- **Windows POS Agent:** .NET 8 local agent, loopback-only host, one-time pairing, DPAPI-protected P-256 key, test certificate onboarding, encrypted fiscal queue and explicit ATK test coupon submission/reconciliation lockout. The Windows installer/launcher scripts are packaged by its CI workflow.
- **Invoice-to-ATK mapping:** core mapper added. It requires explicit current ATK unit, tax-category and item-type codes and balanced payment allocations; it deliberately does not infer tax categories from VAT percentages.
- **Cancel/Return:** mapper supports both document types only when the original ATK coupon ID is supplied. Full operator workflow and ATK end-to-end tests remain outstanding.

The web and Android clients currently issue **internal Fiskalo invoices**, not official fiscal coupons. Android does not yet sign ATK coupons; the existing fiscal signing agent is Windows-only. ATK testing has not been executed with an authorized taxpayer/application registration, and Fiskalo is not certified. Keep production fiscalization disabled.


## POS applications

See [POS clients and ATK testing](docs/pos-clients-and-atk-testing.md) for the platform scope and ATK onboarding sequence.

### Web POS
Open the business dashboard and select **Hap POS**. The responsive browser checkout uses the existing invoice issue and payment ledger RPCs. A payment is posted only after the cashier confirms receipt; card processing is not performed by Fiskalo.

### Android POS
The Expo project is in `mobile-pos/`. Configure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `mobile-pos/.env`, then run:

```bash
cd mobile-pos
npm install
npx expo start
```

The Android app currently handles ordinary Fiskalo invoices. It is not a fiscal signing client. Android ATK support requires a separate Android Keystore implementation and ATK test validation.
