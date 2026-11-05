# Fiskalo ATK SEF compliance and release status

**Status: ATK TEST integration is partial; Fiskalo provider/software is not certified; production fiscalization remains disabled.** This document separates software features from ATK authorization. A successful software build or TEST coupon response is not an ATK certification.

## Controlling references

1. [Administrative Instruction (MFPT) No. 01/2026](https://apps.atk-ks.org/sefaplikimi/uploads/documents/87a43adf-6ee2-42e5-a5af-043c031f514f.pdf), dated 27 April 2026.
2. [Specific Technical and Functional Requirements for PEF/SF/SEF](https://apps.atk-ks.org/sefaplikimi/uploads/documents/150ab6cc-084f-490d-b5fc-d8639d0287dc.pdf), published 29 May 2026.
3. [ATK SEF application and certification portal](https://apps.atk-ks.org/sefaplikimi/).
4. [ATK EDI notice: Unique Fiscalization Code](https://www.atk-ks.org/njoftim-per-tatimpagues-publikohet-versioni-i-ri-i-sistemit-elektronik-edi/).
5. [ATK implementation examples](https://github.com/fiskalizimi/pos-golang).

Re-check the ATK portal and technical package before each release. The public Go repository is an implementation example, not a substitute for the current official specification or ATK written confirmation.

## Release gates

### TEST
TEST mode may be used only with an ATK-authorized test taxpayer, the test Application ID/fiscalization number supplied by ATK, a verified TEST POS and a certificate issued by ATK for that POS. Test data and certificates must never be reused for production.

### PRODUCTION
Production fiscalization MUST remain disabled until all of the following are true:

- Fiskalo's legal provider has completed ATK developer/maintainer registration and authorization.
- The Fiskalo software solution has passed ATK testing and received formal certification and its assigned SEF/software-solution code.
- Production provider metadata (NUI/NF, SEF code, solution name and version) is configured from ATK-issued values.
- The taxpayer has obtained its production Unique Fiscalization Code through ATK EDI.
- Each production POS has its own ATK-approved key/certificate and matching taxpayer, unit, POS and software-solution identifiers.
- Production Sale, Cancel and Return scenarios and any other ATK-prescribed tests have passed.
- ATK's formal approval and production endpoint/credential activation have been received.

No internal toggle, test certificate, fabricated code, or successful TEST coupon may bypass these gates.

## Functional requirements

### Fiscal documents
- Separate internal invoices/B2B tax documents from B2C fiscal POS coupons.
- Implement ATK-defined Sale, Cancel and Return coupon types.
- Cancel and Return coupons must reference the original Sale coupon ID; retain the original fiscal document and append an immutable correction record.
- Preserve the exact signed Protobuf details, signature, QR payload, request/response, ATK transaction ID, timestamps and submission attempts.
- Coupon IDs must be unique across the taxpayer/business, not merely unique within one POS.
- Use ATK monetary precision: unit price in EUR × 10,000; totals, tax and payments in cents.
- Validate product unit, item category, VAT/tax code and payment type against the current official ATK catalogues.
- Do not label any receipt fiscalized until ATK has returned and Fiskalo has durably saved a valid accepted response/transaction ID.

### Device security and connectivity
- Generate a separate key for each registered POS and keep private keys on that device.
- Never store private keys in Supabase, Cloudflare secrets, GitHub, logs or cloud backups.
- Confirm with ATK that the selected local key store and device architecture are acceptable before production.
- Maintain an encrypted durable local fiscal journal/queue, idempotent submission and reconciliation after ambiguous timeouts.
- Implement certificate expiry, renewal, revocation and POS re-onboarding.
- Keep operator identity, software version and audit events with every fiscal transaction.

### Reporting and operational controls
- Provide internal daily sales, VAT, payment-method, shift, cash-movement and fiscal-transmission reports.
- Provide X-style cash snapshots and end-of-day Z-style closing records for operational control, with immutable close snapshots.
- Do not assume that a PEF/SF X/Z submission endpoint applies to SEF. Send reports to ATK only when the current SEF technical specification explicitly requires it.
- Keep internal reports clearly labelled as internal; do not present them as official ATK tax reports.

## Current implementation status

| Capability | Status |
|---|---|
| Business workspace, membership roles and tenant-scoped data | Implemented in application; verify each deployment's live RLS/schema |
| Product ATK unit, VAT and item-category mapping fields | Implemented; current full official catalogue completeness still requires validation |
| TEST POS onboarding UI, verification, CSR and certificate flow | Implemented in Web POS; requires per-device and ATK test evidence |
| Browser-local P-256 signing key | TEST prototype only; IndexedDB is not an approved production hardware keystore |
| Paid Web POS Sale coupon creation and TEST submission | Implemented; runbook records four accepted TEST Sale documents |
| ATK response/transaction ID storage and duplicate-sale guard | Implemented for Sale flow |
| Ambiguous ATK response state | Implemented as pending/reconciliation-required; do not blindly retry |
| Cancel and Return ATK submission | Not yet implemented end-to-end; item-level return/cancellation quantities, proportional net/VAT amounts, residual rounding and audit ledger are now recorded internally, but no signed correction coupon is submitted to ATK |
| Complete encrypted offline journal and automatic recovery | Partial foundation; not certified or verified against ATK recovery requirements |
| Android key/coupon workflow | Standalone internal-test APK build succeeds; physical-device certificate, ATK submission and printer tests remain |
| Complete official X/Z report submission for SEF | Not established by the inspected public SEF sample; do not claim implemented or required without current ATK confirmation |
| Internal daily sales/payment/shift/fiscal status report | Implemented; internal management report only |
| POS Agent and production-grade key custody | Not complete |
| Provider/software ATK certification | Not complete |
| Production fiscalization | Disabled by design; not authorized |

## Required work before certification

1. Obtain ATK's latest complete test scenarios and written confirmation of protocol details that are unclear in public examples.
2. Complete Cancel and Return flows, including original-coupon references, item/amount reconciliation, unique IDs, signature, response persistence and audit trail.
3. Complete the durable offline journal, required recovery window, reconciliation and operator alerts.
4. Complete and physically test the approved POS Agent / Android device-key and printing architecture.
5. Validate all official ATK unit, item-category, tax and payment catalogues against the live product UI and coupon validator.
6. Run every ATK-prescribed test for every required POS environment and retain evidence.
7. Submit the provider/software certification package and wait for ATK's formal decision.
8. Enable production only after every release gate above has been evidenced.

## Safety rule

Until ATK formally certifies Fiskalo and issues production credentials, every non-ATK document must remain clearly marked as an internal/non-fiscal document. Never fabricate an ATK QR code, verification number, transaction ID, fiscalization code, certificate or approval.
