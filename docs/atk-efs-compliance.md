# ATK SEF compliance and certification plan

**Status: not certified; official fiscalization is disabled.** Fiskalo's current business MVP creates internal invoices and operational records. It does not issue ATK fiscal coupons, sign coupons with an ATK-recognized certificate, transmit transactions to ATK, or provide a valid ATK QR/verification number. It must not be sold or installed as a certified SEF until the required approval is obtained.

## Controlling official sources

1. [Administrative Instruction (MFPT) No. 01/2026](https://apps.atk-ks.org/sefaplikimi/uploads/documents/87a43adf-6ee2-42e5-a5af-043c031f514f.pdf), dated 27 April 2026.
2. [Specific Technical and Functional Requirements for PEF/SF/SEF](https://apps.atk-ks.org/sefaplikimi/uploads/documents/150ab6cc-084f-490d-b5fc-d8639d0287dc.pdf), published 29 May 2026.
3. [ATK SEF application and certification portal](https://apps.atk-ks.org/sefaplikimi/).
4. [ATK EDI notice: Unique Fiscalization Code](https://www.atk-ks.org/njoftim-per-tatimpagues-publikohet-versioni-i-ri-i-sistemit-elektronik-edi/).
5. [ATK implementation examples and integration guide](https://github.com/fiskalizimi).

Re-check the portal before every implementation release. The ATK may publish updated specifications, test environments, tax mappings, and protocol versions.

## Regulatory gates before commercial SEF use

### 1. Fiskalo developer and software certification

Under Articles 35 of Administrative Instruction 01/2026:
- The SEF developer/maintainer applies to the ATK commission for registration and certification.
- The developer must be authorized before offering SEF or maintenance services in Kosovo.
- Selling or installing the SEF at taxpayers is allowed only after certification.
- After registration, the developer/software solution receives a unique SEF code. That code and the developer's NUI/NF must be integrated into the software before it is handed to taxpayers.
- The taxpayer must notify ATK which software solution and developer are being used.

The ATK portal provides the application, testing, certification and maintenance process. The required application evidence must be prepared from the current portal forms; do not assume that a code review alone constitutes certification.

### 2. Taxpayer and POS onboarding

ATK's EDI service “Kërkesë për Fiskalizim” provides the taxpayer's **Unique Fiscalization Code**, which ATK identifies as a prerequisite for using SEF.

For each installed SEF/POS, Article 34 requires a digital certificate and a separately generated private key. The registration data includes:
- Taxpayer NUI/NF
- Business unit number
- POS number
- Software solution code
- Fiscalization number obtained through ATK EDI

No application ID, taxpayer fiscalization code, POS identifier, certificate, QR code, or verification number may be fabricated or substituted with an internal Fiskalo identifier.

### 3. Security and device-key architecture

- Every fiscal coupon must be electronically signed and the SEF identified by its digital certificate.
- ATK communication must use HTTPS and the documented ATK protocol/data format.
- Private keys must be generated and protected for each installed SEF/POS. Do not put private keys in Supabase tables, Cloudflare variables, GitHub secrets, logs, or normal application backups.
- The production design must provide a local secure key store/signing component on each registered POS device, or another ATK-approved secure arrangement.
- Cloudflare/Supabase may coordinate business data and submission status, but they must not become a shared store for POS private keys.

### 4. Fiscal transaction requirements from the May 2026 technical specification

The implementation must cover, at minimum:
- Unique transaction IDs and immutable records (write-once/read-many).
- Audit history for sales, cancellations, corrections and configuration changes.
- Fiscal coupon generation, digital signature, QR code and real-time ATK reporting.
- Secure local retention and automatic retransmission after internet/ATK communication is restored.
- Cancellation and goods-return coupons linked to the original coupon; no silent deletion of fiscal transactions.
- Multilingual operation and required print/preview/electronic receipt formats.
- ATK-required reporting and verification.
- Four-decimal unit-price precision and two-decimal total amounts.
- ATK tax-category letters and product/service categories from the published specification.
- POS/operator identifiers, daily coupon sequence and ATK verification number on fiscal receipts.

The current app's simplified VAT selector is not an implementation of ATK's tax-category codes. Tax mappings must be taken from the current official technical documents and validated with ATK/accounting specialists.

## Implementation status

| Area | Current status |
|---|---|
| Business workspaces, roles and RLS | Implemented in the business MVP |
| Products, customers, expenses and inventory | Implemented in the business MVP |
| Internal invoices and payment ledger | Implemented; not fiscal coupons |
| Immutable issued invoices and audit events | Implemented for the internal invoice workflow |
| Four-decimal unit-price storage | Implemented |
| ATK fiscal receipt schema and submission outbox | Not implemented |
| ATK certificate / private-key provisioning | Not implemented |
| POS-local signing agent / secure key store | Not implemented |
| Offline fiscal coupon queue and retry | Not implemented |
| ATK tax-category mapping and fiscal QR | Not implemented |
| ATK test suite, commission review and certification | Not completed |

## Next SEF engineering milestones

1. Obtain the developer's legal/business details and complete the ATK SEF developer/software application.
2. Read and version the full implementation specification and official sample code; record the exact schema, protobuf definitions, certificate flow, endpoints, and response/error semantics.
3. Design the local POS signing component and its secure per-device key lifecycle.
4. Add fiscal device/configuration, fiscal receipt, immutable submission/outbox, retry, cancellation/return and ATK response records, all isolated under the `fiskalo_` namespace.
5. Implement the official tax-category and product-category mappings from ATK's published lists.
6. Run the official ATK test workflow, fix every failed case, submit the certification package and wait for formal approval.
7. Enable fiscalization in production only after the developer/software and taxpayer/POS prerequisites are satisfied.

## Safety rule

Until the certification gates are completed, all customer-facing documents must remain clearly marked as **not officially fiscalized**. Do not generate a fake ATK QR code, NUIKF/verification number, fiscalization code, or claim ATK approval.
