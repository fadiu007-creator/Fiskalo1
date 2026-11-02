# Fiskalo

Fiskalo is a Kosovo-focused fiscal operations platform for businesses, accountants, and platform administrators.

## Project status

Initial repository bootstrap. This software is **not ATK-certified or approved**. Fiscalization must remain disabled until the current ATK technical specifications, credentials, test process, and certification requirements have been verified and completed.

## Product scope

- Business workspace with branches and role-based access
- Products, services, VAT configuration, customers, and suppliers
- Sales, invoices, POS, expenses, and inventory
- Accountant workspace for multiple client organizations
- Platform administration and subscription management
- Auditable fiscal-document lifecycle and a separately gated ATK integration

## Technology direction

- TypeScript and Next.js
- Supabase Auth and PostgreSQL with strict Row Level Security
- Cloudflare deployment (no Vercel)
- GitHub as source control

## Local development

1. Install Node.js LTS.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and anon key.
4. Run `npm run dev`.

Never commit secrets, service-role keys, signing keys, or production credentials.

## Compliance boundary

Fiskalo may prepare ordinary business records and draft fiscal documents, but it must not claim that a document has been officially fiscalized unless an authorized ATK integration has returned a verifiable successful result. Issued records must be immutable; corrections must use legally permitted corrective workflows.