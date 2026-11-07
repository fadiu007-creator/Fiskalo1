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

The public [ATK C# Protobuf example](https://github.com/fiskalizimi/pos-csharp) defines `CANCEL=2`, `RETURN=3`, and `ReferenceNo` as the original Sale `CouponId`. It documents the ATK response `transaction_id` as a server-returned uint64. The sample does not specify correction-payment/refund semantics or whether the `TransactionNo` request field must be populated for a correction; those details require ATK confirmation and TEST evidence before automatic submission is enabled.

### Device security and connectivity
- Generate a separate key for each registered POS and keep private keys on that device.
- Never store private keys in Supabase, Cloudflare secrets, GitHub, logs or cloud backups.
- Confirm with ATK that the selected local key store and device architecture are acceptable before production.
- Maintain an encrypted durable local fiscal journal/queue, idempotent submission and reconciliation after ambiguous timeouts.
- Implement certificate expiry, renewal, revocation and POS re-onboarding.
- Keep operator identity, software version and audit events with every fiscal transaction.

### Reporting and operational controls
- Provide internal daily sales, VAT, payment-method, shift, cash-movement and fiscal-transmission reports.
- Provide a live internal X-style cash-position snapshot for the current business date and immutable end-of-shift Z-style close snapshots for operational control. These are not official ATK reports and are never submitted to ATK.
- Do not assume that a PEF/SF X/Z submission endpoint applies to SEF. Send reports to ATK only when the current SEF technical specification explicitly requires it.
- Keep internal reports clearly labelled as internal; do not present them as official ATK tax reports.

## Current ATK amendment — 22 June 2026

The ATK portal publishes a signed amendment to the 29 May 2026 technical/functional requirements:
[Amendment PDF](https://apps.atk-ks.org/sefaplikimi/uploads/documents/4994a4cd-75c8-46fd-bb7c-d541e4aa0e40.pdf).

The amendment adds/clarifies these SEF obligations:

- Installation and use must be supported on at least one suitable device/work environment (PC, laptop, tablet, mobile phone or another suitable electronic device).
- Transaction data must be stored in a protected way that preserves integrity through faults or interruption.
- During an internet outage, the device must retain transactions and automatically transmit them when connectivity returns.
- Locally retained fiscal data must be encrypted using advanced encryption standards.
- Access to unsent data is restricted to a request by ATK or another competent state authority.
- Untransmitted data must be exportable in suitable CSV/PDF formats only upon such a request.

These are not optional UX enhancements. The browser now encrypts saved order drafts with AES-256-GCM using a non-extractable key stored in IndexedDB, and the Windows POS Agent has a DPAPI-protected local fiscal journal. These are implementation foundations, not proof that the complete signed fiscal transaction is locally journalled before checkout confirmation. The Windows Agent queue is not yet integrated as the Web POS checkout's offline fiscal path. The Windows POS Agent has an encrypted DPAPI journal and an automatic delivery worker for queued, never-submitted documents. It still needs checkout integration, a complete installer/service lifecycle, a controlled authority-request export workflow, and verification on the target device. Ambiguous in-flight requests remain locked for reconciliation to prevent duplicate coupons.

The 48-hour recovery timestamp in the queue is an operational target/alert deadline, not a reason to delete or permanently suppress an unsent fiscal record. The queue now retains overdue records and continues automatic delivery attempts when their state is safely Queued. If a request may already have reached ATK, it remains NeedsReconciliation and is never blindly retried.

## Current implementation status

| Capability | Status |
|---|---|
| Business workspace, membership roles and tenant-scoped data | Implemented in application; verify each deployment's live RLS/schema |
| Product ATK unit, VAT and item-category mapping fields | Implemented; all 31 official unit codes and all 35 published item-category codes are now present in the product dropdowns; VAT codes A/C/D/E are mapped |
| TEST POS onboarding UI, verification, CSR and certificate flow | Implemented in Web POS; requires per-device and ATK test evidence |
| Browser-local P-256 signing key | TEST prototype only; IndexedDB is not an approved production hardware keystore |
| Paid Web POS Sale coupon creation and TEST submission | Implemented; runbook records four accepted TEST Sale documents |
| ATK response/transaction ID storage and duplicate-sale guard | Implemented for Sale flow |
| Ambiguous ATK response state | Implemented as pending/reconciliation-required; do not blindly retry |
| Cancel and Return ATK submission | Signed TEST submission paths now exist for both types. They reference the original Sale CouponId, use the same original TEST POS/certificate, validate item-level quantities/net/VAT against the adjustment ledger, persist a linked fiscal document and prevent duplicate submission. ATK acceptance for both scenarios is still unverified; payment/refund semantics and optional Protobuf `TransactionNo` require ATK TEST confirmation before certification |
| Encrypted Windows local journal | DPAPI-protected journal implemented; Windows/Ubuntu CI build and queue tests pass; host checkout integration and physical-device verification remain |
| Automatic recovery after connectivity returns | Worker automatically submits safely queued/not-yet-submitted records; POS Agent CI passes on Windows and Ubuntu; real outage/reconnect and ATK reconciliation tests remain; ambiguous submissions require reconciliation |
| Authority-request export of untransmitted data (CSV/PDF) | Not implemented; must be access-controlled and available only on documented ATK/competent-authority request |
| Encrypted browser order drafts | AES-256-GCM encryption and legacy-draft migration implemented; this stores an order draft, not a complete offline fiscal coupon |
| Audit-log export for external review | Owner/administrator-only CSV export and print-to-PDF page implemented; retention period and authority-request handling still require policy validation |
| ATK receipt identifiers and tax breakdown | Thermal receipt now includes NUI/fiscal/VAT numbers, branch/POS/SEF identifier, coupon ID, verification number, operator identity and VAT-rate breakdown when ATK data is available; physical print and exact ATK sample comparison remain |
| Android key/coupon workflow | Standalone internal-test APK build succeeds; physical-device certificate, ATK submission and printer tests remain |
| Complete official X/Z report submission for SEF | Not established by the inspected public SEF sample; do not claim implemented or required without current ATK confirmation |
| Internal daily sales/payment/shift/fiscal status report | Implemented; internal management report only |
| 24/7 operation and 48-hour repair SLA | Infrastructure availability and a documented provider support/repair SLA are not yet evidenced |
| Offline fiscal coupon creation and sequential OFFLINE numbering | Not implemented end to end in Web POS; saved encrypted order drafts are not an offline fiscal coupon |
| Automatic retry for all untransmitted/rejected coupons | Partial: safely queued Agent records retry automatically; Web POS offline sales and rejected/ambiguous transaction retry policy remain incomplete |
| Official-language support (Albanian and Serbian) | Not complete; current cashier/admin UI is primarily Albanian |
| Provider SEF code and developer NUI/NF in certified payload/configuration | Awaiting ATK-issued provider identifiers and confirmation of exact integration fields; not configured |
| Full fiscal receipt preview / electronic delivery | QR preview exists and thermal receipt output was expanded; full sample-matched preview and consent-based electronic delivery still require validation |
| Internal live X cash snapshot and immutable Z shift-close snapshot | Implemented in Fiskalo; internal only, role-scoped, not submitted to ATK |
| POS Agent and production-grade key custody | Not complete |
| Provider/software ATK certification | Not complete |
| Production fiscalization | Disabled by design; not authorized |

## Required work before certification

1. Obtain ATK's latest complete test scenarios and written confirmation of protocol details that are unclear in public examples.
2. Complete Cancel and Return flows, including original-coupon references, item/amount reconciliation, unique IDs, signature, response persistence and audit trail.
3. Validate signed Cancel and partial/full Return against ATK's prescribed TEST cases, including the chosen refund payment method and the optional `TransactionNo` field. The current correction implementation leaves `TransactionNo` unset because the public sample does not define its correction semantics. Complete the durable offline journal, required recovery window, reconciliation and operator alerts.
4. Complete and physically test the approved POS Agent / Android device-key and printing architecture.
5. Validate all official ATK unit, item-category, tax and payment catalogues against the live product UI and coupon validator. The 31-unit and 35-category catalogues are now populated from the published technical tables.
6. Run every ATK-prescribed test for every required POS environment and retain evidence.
7. Submit the provider/software certification package and wait for ATK's formal decision.
8. Enable production only after every release gate above has been evidenced.

## Safety rule

Until ATK formally certifies Fiskalo and issues production credentials, every non-ATK document must remain clearly marked as an internal/non-fiscal document. Never fabricate an ATK QR code, verification number, transaction ID, fiscalization code, certificate or approval.
