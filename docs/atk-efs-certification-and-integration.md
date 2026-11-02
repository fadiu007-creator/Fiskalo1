# Fiskalo — ATK SEF Certification & Integration Plan

**Status:** Preparation / not certified  
**Regulatory baseline reviewed:** 2 November 2026  
**Business model:** Commercial SEF provider applying for ATK authorization and certification.

This is an engineering plan, not legal advice or proof of ATK approval. The current ATK technical package published on 29 May 2026 and Administrative Instruction MF No. 01/2026 must be treated as controlling. Confirm every protocol detail against the latest ATK documents before production implementation.

## 1. Certification is a release gate

ATK's 2026 framework applies to taxpayers and developers/maintainers of electronic fiscal software. The developer and the SEF solution must be registered and authorized by the ATK commission before Fiskalo is offered, installed or used as a certified fiscal solution.

After registration, the developer receives a unique SEF code. That code and the developer's NUI/NF must be embedded in the software and included in each fiscalization submission. A taxpayer cannot issue fiscal coupons through an unregistered developer/solution.

The official process is staged:
1. Register for pre-certification testing in the ATK SEF portal and receive test access.
2. Complete the prescribed testing.
3. Prepare the requested application documents and submit the certification application.
4. Complete the commission's review and any requested remediation.
5. Only after certification may Fiskalo be sold/installed as a certified SEF.

The portal publishes the 2026 Administrative Instruction, current technical and functional requirements, certification/maintenance procedures and the test/application guide.

## 2. Keep provider and taxpayer credentials separate

### Fiskalo provider / software solution
- Registered legal entity and provider NUI/NF.
- ATK authorization/certification for the developer and Fiskalo solution.
- Unique SEF code / software solution code issued by ATK.
- Software name, version and release identity.
- Maintenance/support identity where applicable.

### Taxpayer / each installed POS
- Taxpayer NUI / fiscal number.
- Fiscalization number obtained by the taxpayer through ATK EDI. ATK's EDI service “Request for Fiscalization” issues the unique fiscalization code required before using EFS.
- Branch / business-unit identifier.
- POS identifier for each installed POS.
- ATK-issued digital certificate and a private key generated for each installed SEF instance.
- Fiskalo solution code and provider identity.

The 2026 instruction requires the installation registration data to include NUI/fiscal number, unit number, POS number, software solution code and fiscalization number. Model these per installed POS, not as one shared business credential.

## 3. Private-key custody — mandatory architecture decision

**Never store taxpayer POS private keys in Supabase, Cloudflare environment variables, application logs, analytics, support exports or a shared server.**

The 2026 instruction requires a private key for each installed SEF and secure custody. ATK's published implementation examples also warn that the private key must remain on the machine for which it was generated.

Recommended architecture:
- Keep Next.js / Cloudflare as the cloud business-management control plane.
- Add a separately installed **Fiskalo POS Agent** for each registered POS installation. The agent owns local key generation, CSR/certificate onboarding, signing, durable offline queue, direct ATK communication and local printer integration.
- The cloud application sends an authorized fiscalization job to the registered POS Agent; the agent constructs/signs/submits the fiscal payload using its locally held key.
- Store only non-secret metadata and public certificate material in the cloud database. Never upload or transmit the private key.
- Evaluate OS-protected key storage (Windows certificate store / DPAPI, macOS Keychain, Linux Secret Service or hardware-backed storage) and obtain ATK confirmation that the selected model is acceptable.
- Bind each agent installation to one organization, branch, POS ID and software version. Support revocation and re-onboarding without reusing keys.

This is a recommended security design. Confirm the accepted key-storage mechanism and certificate lifecycle with ATK before finalizing.

## 4. Separate B2B tax invoices from B2C fiscal coupons

The current Fiskalo MVP creates internal invoices. An internal invoice is not an ATK fiscal coupon.

The 2026 instruction distinguishes retail supplies to final consumers from B2B supplies:
- Supplies to final consumers generally require a fiscal coupon regardless of payment method.
- Where goods/services are supplied now but payment is deferred, the coupon is required at the time of supply.
- B2B supplies use the applicable tax invoice under tax legislation, subject to legal rules and exceptions.
- Remote / electronic supplies may deliver the fiscal coupon electronically rather than print it, subject to applicable consent and delivery rules.

Fiskalo therefore needs separate workflows:
1. **B2B tax invoice** — customer/business details, invoice numbering, payment ledger and applicable invoice rules.
2. **B2C fiscal POS coupon** — sale transaction, payment split, coupon number, digital signature, QR, real-time submission and ATK transaction identifier.
3. **Cancellation / return** — linked to the original fiscal coupon and submitted as the appropriate fiscal document type. Never delete or overwrite the original fiscal transaction.

Do not automatically treat every current invoice as a fiscal coupon. Introduce an explicit transaction/document classification and prevent duplicate fiscalization.

## 5. ATK protocol reference

ATK's SEF portal links to the official fiskalizimi GitHub organization. Its published POS examples document:
- Protobuf coupon models: CitizenCoupon, PosCoupon, CouponItem, Payment and TaxGroup.
- ECDSA digital signing of the Base64-encoded Protobuf payload.
- QR content built from the CitizenCoupon payload and its Base64 signature, joined with a pipe separator in the published sample.
- POS coupon submission with details and signature.
- Test and production base URLs and sample certificate-onboarding endpoints.

Published example endpoints (reference only; re-confirm against the current 29 May 2026 technical package and ATK test environment):
- Test: https://fiskalizimi-test.atk-ks.org
- Production: https://fiskalizimi.atk-ks.org
- Verification-code sample: POST /ca/verify/{nui}
- CSR signing sample: POST /ca/signcsr
- POS coupon sample: POST /pos/coupon
- Citizen coupon verification sample: POST /citizen/coupon

The sample repository's monetary representation:
- Unit prices: integer ten-thousandths of a euro (EUR × 10,000; €1.00 = 10000).
- Coupon totals: integer cents (EUR × 100; €1.00 = 100).

The sample code is a protocol reference, not a substitute for the current ATK 2026 technical package. Verify field definitions, required identifiers, tax mapping, signature format, endpoints, request/response schemas, retries and certificate handling against the latest official specification.

## 6. Required capabilities before certification testing

### Fiscal transaction engine
- Generate the exact ATK-defined fiscal document structure.
- Map each product/service to ATK's current unit-measurement and goods/service categories.
- Map VAT treatment to ATK tax groups and official category letters/rates.
- Support permitted payment types and split tender.
- Support discounts, returns, cancellations and original-document references.
- Use an immutable, business-wide unique fiscal coupon sequence; never reuse coupon IDs across branches/POS units.
- Persist the exact original payload, signature, submission attempt, response, transaction identifier and QR data.
- Never fabricate an ATK NUIKF, transaction ID, verification number, response or QR.

### Online/offline operation
- Attempt real-time ATK submission at the required point in the transaction.
- If the connection or ATK service is unavailable, securely persist the fiscal record locally, mark the document as offline where required, and automatically retry after recovery.
- Meet the applicable 48-hour recovery/submission requirement in the 2026 instruction.
- Implement idempotency and duplicate prevention so retries cannot create duplicate fiscal transactions.
- Show operator states: queued/offline, submitted, accepted, rejected, retry required.
- Preserve immutable audit history and alert the operator when the recovery deadline is at risk.

### Receipt and verification
- Generate the mandatory QR for each fiscal coupon, including offline-issued coupons as specified.
- Include the official fiscal logo and all mandatory receipt fields from the current ATK template.
- Support printing and electronic delivery.
- Store the official ATK response and expose a verifiable receipt view.
- Never label a receipt “fiscalized” until ATK confirms the applicable successful state.

### POS security and audit
- Unique installation / device identity.
- Unique operator accounts and role-based access control.
- Strong authentication and audit trail for logins, failed access, password changes and user changes.
- Protected local fiscal journal / durable transaction queue.
- Encrypted local data and secure HTTPS/TLS communications.
- Certificate expiry, renewal, revocation and POS re-onboarding workflows.
- Software version and provider/solution code attached to every fiscalization record.

## 7. Current Fiskalo gap assessment

| Requirement | Current MVP | Work required |
|---|---|---|
| Business onboarding and NUI | Partial | Add fiscalization number and ATK installation details |
| Branch model | Basic branch exists | Add ATK unit identifiers and branch/POS registration workflow |
| POS installations | Missing | Add POS registry and one secure key/certificate per installation |
| Developer SEF code | Missing | Obtain after provider/solution registration; configure release metadata |
| Fiscal coupon model | Missing | Implement ATK-specific Protobuf models and validation |
| Digital signing | Missing | Implement in local POS Agent; never in shared cloud storage |
| ATK real-time API | Missing | Integrate test endpoints and response handling |
| QR fiscal coupon | Missing | Generate only from valid ATK-defined payload/signature |
| Offline queue | Missing | Local encrypted queue, retry, idempotency and 48-hour controls |
| B2B tax invoices | Internal workflow exists | Validate legal fields, document semantics and reporting |
| B2C POS receipts | Missing | Build dedicated POS/coupon workflow |
| Returns/cancellations | Missing | Linked immutable fiscal correction flow |
| Certification tests | Not started | Register in ATK portal and obtain current test package |
| Provider certification | Not started | Apply as SEF developer and complete ATK process |

## 8. Implementation sequence

1. **Freeze the regulatory contract:** obtain the current 29 May 2026 technical requirements and test package; compare every field and endpoint with the official GitHub examples.
2. **Provider readiness:** confirm the Fiskalo legal entity/NUI, responsible contacts, required application documents and provider/maintenance obligations. Apply for ATK test access.
3. **Data model:** add provider/solution metadata, taxpayer fiscalization identity, branch/unit IDs, POS installations, certificate metadata, fiscal documents, fiscal events, offline queue and audit events. Never store private keys.
4. **POS Agent:** implement secure local key creation, CSR/certificate onboarding, local signing, printer integration and durable offline queue.
5. **Fiscal engine:** implement Protobuf mapping, exact money units, tax groups, payments, coupon identifiers, signatures and QR generation.
6. **ATK test integration:** connect only to the test environment, run ATK-provided scenarios and persist all responses.
7. **Operational controls:** implement reconciliation, retry/idempotency, audit exports, certificate renewal, monitoring and incident recovery.
8. **Certification submission:** prepare evidence, documents, release/version information and test results requested by the ATK portal; submit the formal application.
9. **Production gate:** enable production fiscalization only after provider and Fiskalo solution are formally certified and production credentials/identifiers are issued.

## 9. Questions for ATK before production implementation

- Confirm that the 29 May 2026 technical requirements supersede previous protocol packages and provide the complete current version.
- Confirm current Protobuf schema and whether the public pos-csharp / pos-golang repositories remain the exact current reference.
- Confirm accepted certificate/key generation and storage model for cloud-managed SEF with a local POS Agent.
- Confirm current test credentials, test scenarios, certification evidence, production activation process and application/solution identifier assignment.
- Confirm tax category mapping, unit/category catalogue, payment types, return/cancellation rules and required fiscal receipt fields.
- Confirm offline behavior, submission deadline, retry semantics and duplicate/idempotency contract.
- Confirm whether one certified Fiskalo solution can serve multiple taxpayers and POS installations under the provider's certification, and how software updates are approved.

## 10. Official references

- ATK SEF application and certification portal: https://apps.atk-ks.org/sefaplikimi/
- ATK Administrative Instruction MF No. 01/2026: https://apps.atk-ks.org/sefaplikimi/uploads/documents/87a43adf-6ee2-42e5-a5af-043c031f514f.pdf
- ATK test and certification application guide: https://apps.atk-ks.org/sefaplikimi/uploads/documents/1e869fe5-02a2-4471-95a8-0ec6844d6f12.pdf
- ATK legal / technical requirements listing: https://www.atk-ks.org/portfolio/legjislacioni-perkates/
- ATK SEF test integration examples: https://github.com/fiskalizimi
- Official C# POS example: https://github.com/fiskalizimi/pos-csharp
- Official Go POS example: https://github.com/fiskalizimi/pos-golang
- ATK public list of certified SEF solutions: https://apps.atk-ks.org/sefaplikimi/PublicSEF

---

**Release rule:** Until ATK formally certifies the provider and Fiskalo solution, keep fiscalization disabled and clearly distinguish Fiskalo's internal invoices from official fiscal coupons.


## 11. Direct review of the ATK-provided GitHub examples

Reviewed the public organization at https://github.com/fiskalizimi/ and its repositories:
- `pos-csharp` — selected as the primary implementation reference because it contains the .NET 8 example, `models.proto`, generated C# models, PKI/CSR code, ECDSA signer, coupon builder, onboarding utility and test Swagger reference.
- `pos-golang` — cross-checked for the same Protobuf contract and signing/submission flow.
- `pos-php` — confirms the same Protobuf + ECDSA + HTTP integration pattern.
- `pos-ruby` — listed by the organization, but not selected as the implementation baseline.

The exact C# schema reviewed is `fiskalizimi/pos-csharp/models.proto`. It defines CouponType (Sale=1, Cancel=2, Return=3), PaymentType (Cash=1, CreditCard=2, Voucher=3, Cheque=4, CryptoCurrency=5, Other=6), CouponItem, Payment, TaxGroup, PosCoupon and CitizenCoupon.

### Documented test API sequence

The C# README documents these test-host endpoints:
1. `POST https://fiskalizimi-test.atk-ks.org/ca/verify/{nui}` with `fiscalization_no`, `pos_id`, `branch_id` and `application_id`; response includes `business_name` and `verification_code`.
2. Generate a P-256 ECDSA key pair locally and create a PEM CSR with country RKS, organization NUI, organizational unit POS ID, locality branch ID and business name.
3. `POST https://fiskalizimi-test.atk-ks.org/ca/signcsr` with `business_name`, `business_id`, `branch_id`, `verification_code`, `pos_id`, `application_id` and `csr`; response includes `signed_certificate`.
4. Serialize the POS coupon using the exact Protobuf schema; Base64-encode the serialized bytes; SHA-256 hash the UTF-8 bytes of that Base64 string; sign with ECDSA; Base64-encode the signature.
5. `POST https://fiskalizimi-test.atk-ks.org/pos/coupon` with `details` (Base64 Protobuf) and `signature`. The example documents a response containing `transaction_id`.
6. The citizen QR verification sample uses `POST /citizen/coupon` with `citizen_id` and `qr_code`. This is a citizen-verification/testing path, not a substitute for POS coupon submission.

These request shapes are transcribed from the public sample repository. They must still be checked against the live test Swagger and current ATK technical package before release.

### Monetary representation

The sample explicitly uses two integer scales:
- Unit item prices: EUR × 10,000. Example: €1.50 is `15000`.
- Coupon totals, line totals, tax amounts and payment amounts: cents. Example: €4.50 is `450`.

Do not apply one scale to all monetary fields. The sample builder's tax numbers are illustrative and explicitly not a tax-calculation guide. Use ATK's current tax and category documentation for production calculations.

### Test certification sequence

The ATK application page currently states that technical testing must be completed with the same NUI / personal number and must include onboarding plus POS coupon tests for **Sale, Cancel and Return** before the certification application can be submitted. Do not mark testing complete after only a successful Sale.

## 12. Fiskalo implementation state after repository review

The following is now implemented in Fiskalo's data model and business UI:
- Taxpayer fiscalization-number profile (entered by the business; not verified against ATK yet).
- Per-POS records with ATK branch ID, POS ID, environment, status and certificate metadata.
- Test-only POS creation from the customer UI. Customer-side insertion is restricted to the test environment and initial unregistered status.
- Fiscal document storage model for Sale / Cancel / Return, business-wide coupon uniqueness, source-invoice linkage, signed Protobuf payloads, QR payload, ATK transaction ID and response.
- Append-only fiscal event history.
- Tenant-safe composite foreign keys and RLS. Fiscal documents/events are read-only to ordinary authenticated users; a future trusted local-agent/backend channel must perform submissions and state transitions.
- Provider certification settings are private to the platform and not exposed to customer accounts. Production cannot be enabled unless the provider profile is marked certified.

The new `pos-agent/Fiskalo.PosAgent.Core` library now contains the ATK Protobuf schema/models, P-256 key and CSR generation helpers, exact money-unit conversion, Protobuf Base64 serialization, ECDSA signing, citizen QR payload construction, and test-only HTTP client methods for `/ca/verify`, `/ca/signcsr` and `/pos/coupon`.

**Still not implemented or exercised:** an installed local POS Agent service, OS-protected persistent key storage, certificate installation/renewal, complete sale-to-coupon/tax-group mapping from Fiskalo records, durable offline queue, printer integration, real ATK test calls, Sale/Cancel/Return test completion and ATK response verification. The new client methods have not yet been run against ATK; no ATK request has been sent from Fiskalo.
