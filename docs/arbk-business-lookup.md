# Fiskalo ARBK business lookup

Fiskalo onboarding supports a NUI lookup through the ARBK Atlas business-data API.

## Runtime configuration

Set `ARBK_ATLAS_API_KEY` as a server-side environment secret in the Cloudflare deployment environment. Do not prefix it with `NEXT_PUBLIC_` and do not expose it to browser code.

Provider documentation: https://arbk.atlas-studio.eu/en/docs

The provider currently documents exact NUI lookup at:

```
GET https://api.atlas-studio.eu/v1/businesses/{nui}
Authorization: Bearer <ARBK_ATLAS_API_KEY>
```

The provider documents API access as Enterprise-only. Fiskalo does not scrape the official ARBK website: the official portal warns against automated collection and reuse of its published data. If Fiskalo obtains an authorized direct ARBK API or data-sharing agreement later, replace the provider adapter in `src/app/api/arbk/business/route.ts`.

## User flow

1. An authenticated user opens `/onboarding`.
2. Enters a 9-digit NUI and selects **Kërko në ARBK**.
3. Fiskalo fetches the record server-side, checks that the returned NUI matches the requested NUI, and fills available registration fields.
4. The user reviews and confirms the data before creating the organization.
5. The organization stores the source label, retrieval timestamp, registry status and registration date when supplied.

A successful provider lookup is labelled as data from the ARBK Atlas registry dataset. It is not presented as a government-issued certificate or live official verification. Contact details and VAT registration are not guessed; the user can enter/confirm them separately.

## Database

Apply `supabase/migrations/20261104120000_fiskalo_arbk_registry_lookup.sql` to the Fiskalo Supabase database before deploying this onboarding change. The migration adds registry provenance fields and updates the organization-creation RPC. It is namespaced to Fiskalo tables.

## Failure behavior

- Missing API key: lookup returns a configuration message; manual form entry remains available.
- NUI not found, invalid NUI, provider authorization failure, throttling or timeout: the form remains editable and does not fabricate data.
- A changed NUI invalidates the previous lookup confirmation.
