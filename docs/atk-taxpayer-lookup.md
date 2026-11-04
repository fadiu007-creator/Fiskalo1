# Fiskalo — official ATK taxpayer lookup

## Official service

Fiskalo onboarding links to ATK's public **Kërko tatimpaguesin** service:

https://apps.atk-ks.org/BizPasiveApp/VatRegist/Index

ATK states that this service searches by:
- Numri fiskal
- NRB
- Nr. TVSh

The published result fields include fiscal number, NRB, registration status, taxpayer name, address, city, municipality, tax centre, VAT number and VAT registration status.

## API availability

ATK's public website documents a human-facing taxpayer search service. The publicly available documentation reviewed for this implementation does not publish a supported third-party API contract, authentication method, request schema or service-level terms for automated lookups.

The SEF integration documentation is a separate interface for fiscal coupons, digital signatures and transmission to ATK. It must not be treated as a taxpayer-profile API.

Therefore Fiskalo does not scrape the ATK search form, reverse-engineer private endpoints, or claim automatic official verification. Onboarding opens the official ATK search in a new tab and allows the business owner to enter the returned details. NUI, fiscal number and NRB are kept distinct.

## Future direct integration

An automatic lookup can be added when ATK provides written authorization and an API specification for third-party SEF providers. The adapter should then:
1. Authenticate server-side using ATK-issued credentials.
2. Query only the approved identifiers and fields.
3. Validate that the returned identifier matches the submitted business.
4. Store source, retrieval timestamp and response status.
5. Clearly distinguish taxpayer registration status from tax-clearance certificates or tax debt status.

Contact ATK through its official channels to request a supported taxpayer lookup API and commercial integration authorization:
- https://www.atk-ks.org/
- info@atk-ks.org
- edi@atk-ks.org

## Current behavior

- The onboarding form retains manual entry.
- The official ATK lookup is opened directly from the onboarding screen.
- Fiskalo does not mark the business as ATK-verified merely because the user opened the ATK page.
- The old ARBK Atlas integration is removed from the onboarding path and no Atlas API key is required.
