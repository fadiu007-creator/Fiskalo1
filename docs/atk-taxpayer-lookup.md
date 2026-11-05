# Fiskalo — ATK taxpayer verification (provider workspace)

## Official ATK public search

The Fiskalo provider workspace opens ATK's public **Kërko tatimpaguesin** page:

https://apps.atk-ks.org/BizPasiveApp/VatRegist/Index

ATK documents search by:
- Numri fiskal
- NRB
- Nr. TVSh

The published result fields include fiscal number, NRB, registration status, taxpayer name, address, city, municipality, tax centre, VAT number and VAT registration status.

## Who can use this in Fiskalo

The feature is available only inside `/provider` to accounts present in `fiskalo_provider_users` with one of these roles:
- `provider_admin`
- `provider_support`
- `provider_compliance`

It is deliberately not part of customer onboarding or the business dashboard. Provider staff can associate a lookup with a customer organization, enter the values shown by ATK, and save an auditable lookup record. Row Level Security limits reads and inserts to provider users; update and delete are restricted to provider administrators.

The saved record includes the lookup type/value, ATK result fields, source URL, timestamp and provider user who recorded it. The UI labels it as a manually recorded result, not an API response or an ATK-issued certificate.

## API availability and limitations

ATK's public website documents a human-facing search service. The public documentation reviewed for this implementation does not publish a supported third-party API contract, authentication method, request schema or service-level terms for automated lookups.

The SEF integration is a separate interface for fiscal coupons, digital signatures and transmission to ATK. It must not be treated as a taxpayer-profile API. Tax debts, declarations and tax-clearance certificates remain in the taxpayer's authorized EDI access and are not returned by this public lookup.

Fiskalo does not scrape the ATK form, reverse-engineer private endpoints, or claim automatic official verification. Direct integration requires written ATK authorization and an official API specification.

## Atlas removal

The ARBK Atlas endpoint, environment-key requirement and onboarding lookup path are removed. The obsolete Atlas metadata columns are dropped by the new provider lookup migration, and the organization-creation RPC no longer accepts Atlas fields. The earlier migration file is retained as migration history; it is not an active integration or deployment.
