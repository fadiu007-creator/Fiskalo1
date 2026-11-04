# Fiskalo platform administrator

The platform admin area is available at `/platform-admin`.

## Required Cloudflare Worker secrets

Configure these as Worker secrets (never as `NEXT_PUBLIC_*` values):

- `FISKALO_PLATFORM_ADMIN_EMAILS`: comma-separated email addresses allowed to administer all Fiskalo businesses. Example: `admin@example.com`.
- `SUPABASE_SERVICE_ROLE_KEY`: the service-role secret for the existing Fiskalo Supabase project. Obtain it from Supabase Project Settings → API Keys. Never commit it or expose it to the browser.

Set them for the deployed Worker with:

```sh
npx wrangler secret put FISKALO_PLATFORM_ADMIN_EMAILS
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

The first command's value must be the exact email used to sign in. The service-role key is used only inside the server-side admin API after the signed-in email has passed the allowlist check.

## What the dashboard can do

- List Fiskalo businesses and current owner accounts.
- Assign an existing Fiskalo account as an additional business owner.
- Create an ATK TEST POS installation for a selected business.

Creating a POS installation does not register it with ATK or install its certificate. The business owner must complete the ATK TEST verification and certificate steps from the POS setup page on the device/browser that will use that POS. Production POS creation and production fiscalization remain disabled.
