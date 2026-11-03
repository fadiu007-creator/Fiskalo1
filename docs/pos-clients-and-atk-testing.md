# Fiskalo POS clients and ATK test sequence

## Which POS exists today?

| Client | Current capability | ATK test capability |
|---|---|---|
| Web POS | Responsive browser checkout; internal Fiskalo invoices and payment ledger; experimental browser-local P-256 CSR | CSR generation prototype; ATK verify/certificate workflow is available through the paired Windows Agent. Browser-only certificate acceptance and coupon submission are not complete. |
| Android POS | Native Expo/React Native checkout; internal invoices and payment ledger; native Android Keystore P-256 key/CSR | Android CSR generation, authenticated server-proxied ATK test verification and test-certificate request, and local certificate/public-key match check are implemented in source. Not yet physically tested. No Android Protobuf coupon submission or durable fiscal queue yet. |
| Windows POS Agent | Local signing key, ATK test certificate onboarding, signed test-coupon submission and encrypted queue | Test-only end-to-end path in source; still requires authorized ATK identifiers and actual test runs. |

The browser and Android clients are sales-entry clients. They do not independently make Fiskalo an ATK-certified EFS. The current local signing implementation is Windows-specific because it uses Windows DPAPI for key and queue protection.

## ATK onboarding sequence after receiving application_id

1. Obtain ATK confirmation that the taxpayer is authorized for the test environment. Obtain the matching NUI, EDI fiscalization number, application ID, branch ID and POS ID.
2. Install and start the Windows POS Agent on the same computer as the browser. Pair it using the one-time code printed by the local agent.
3. In the Fiskalo ATK/POS dashboard, enter the application ID and run Verify ATK for the registered test POS. The agent calls only the fixed ATK test hostname.
4. If verification succeeds, the agent receives an ATK verification code and stores the test installation profile protected by Windows DPAPI.
5. Request the test certificate. The agent creates a CSR from its local P-256 private key, sends the CSR to ATK, verifies the returned certificate's public key matches its local private key, and stores the public certificate locally.
6. Confirm the agent status reports a test certificate and verified installation.
7. Build a test Sale coupon using the taxpayer's ATK-approved tax/unit/item codes and explicit payment allocations. Submit it once to the ATK test endpoint.
8. Save the ATK response and transaction ID. If the network result is ambiguous, the queue moves to NeedsReconciliation; do not resubmit until the ATK test records have been checked.
9. Test a Cancel and a Return as separate documents that reference the original accepted coupon ID. Record the separate ATK responses.
10. Collect the evidence required by the current ATK SEF application and certification process. Production remains disabled until written approval and certification.

## Invoice mapping contract

FiskaloInvoiceToAtkMapper accepts an already-issued invoice snapshot and explicit ATK catalogue/payment inputs. It:
- rejects draft invoices;
- reconciles stored line net/VAT/gross amounts against the invoice header in cents;
- groups tax bases by the supplied ATK tax code;
- requires payment allocations to reconcile to the coupon total;
- requires an original coupon ID for Cancel and Return;
- rejects inferred or missing ATK unit, tax and item-type codes.

The mapper deliberately does not convert a Fiskalo VAT percentage into an ATK tax category. A percentage is not a substitute for the current ATK catalogue mapping. A fiscal document must not be submitted until those mappings have been verified against the current official ATK specification.

## Android scope

The Android project in mobile-pos/ is a native client for ordinary Fiskalo sales/invoice management. It uses the existing Supabase Auth and RLS tenant boundaries and stores the login session in Android SecureStore. The Android workflow now attempts to assemble a debug APK and upload it as a 14-day GitHub Actions artifact; the first build is still running and is not yet verified. It has not been exercised on physical hardware.

Remaining Android ATK milestones: verify CSR/certificate onboarding on a physical Android device against an ATK-authorized test taxpayer; implement the ATK Protobuf coupon encoder and validate its ECDSA signature encoding against the official reference; add signed Sale/Cancel/Return submission, encrypted durable queue and manual reconciliation; then collect ATK test evidence. Do not copy a Windows DPAPI private key into Android.

## Explicit limitations

- Neither POS client is an ATK-certified EFS.
- Card acquiring is not integrated; card payments are only entered after an external terminal/provider confirms success.
- No production ATK endpoint or production submission switch is enabled.
- No test coupon has been sent as part of this implementation batch.
- The Android app has not yet been installed or tested on a physical device.

## Browser and Android key-storage prototype (2 November 2026)

The Web dashboard now contains an experimental CSR action per test POS. It creates a P-256 key in the browser, imports the private key as a non-extractable Web Crypto key, persists that key in IndexedDB and downloads the CSR. The browser key is scoped to the organization and POS installation. This is not equivalent to a hardware-backed keystore and is not yet approved by ATK; browser-profile compromise, same-origin XSS or browser data loss remain relevant risks.

The Android POS now contains a local Expo native module that generates P-256 keys in Android Keystore, builds a PKCS#10 CSR and can sign the ATK Base64 payload with ECDSA/SHA-256. The app exposes a test-only CSR onboarding panel and keeps the CSR as public data in SecureStore for repeat export. The private key is not exported. Hardware-backed status is reported by the device's Android Keystore and may be false on some devices.

These are key-generation/CSR foundations only. They do not yet verify the CSR against ATK, install an ATK-issued certificate, submit fiscal coupons from Web/Android, or provide a production-ready offline queue. They have not been built/tested on physical devices or approved by ATK. The Windows Agent remains the only currently implemented complete local ATK test verify/sign-CSR path.

For the exact applicant-vs-taxpayer identity distinction, test fiscalization number, Application ID, test request and portal verification steps, see [ATK test runbook](./atk-test-runbook.md).


## ATK unit and POS identifiers

Administrative Instruction (MF) 01/2026, Article 34(3), requires the taxpayer to submit its NUI/tax number, unit number, POS number, software-solution code and fiscalization number when requesting the certificate/key for each installed SEF. It does not prescribe a universal branch/unit number for all businesses.

- The unit number belongs to the taxpayer's registered business unit/location. Retrieve it from the taxpayer's unit registration records or EDI data; if it is not clear, ask ATK before registering the test POS.
- POS ID is a unique numeric identifier for each individual register. Keep it stable and do not reuse it for a different register. The official ATK integration reference explicitly says each POS must have a unique ID.
- The internal Fiskalo branch UUID is not the ATK unit number.
- Every installed SEF has its own private key. Do not share one key between browser profiles, Android devices or POS installations.

References: [ATK Administrative Instruction 01/2026, Article 34](https://apps.atk-ks.org/sefaplikimi/) and [official ATK C# POS integration](https://github.com/fiskalizimi/pos-csharp).


## Web ATK onboarding update — 3 November 2026

- The business dashboard exposes a direct **ATK / POS** action in its top header, in addition to the module tab, so the onboarding screen is easier to find on narrow/mobile layouts.
- The Web flow can call the authenticated Fiskalo server routes for ATK TEST taxpayer/POS verification and CSR signing. The CSR private key remains in the browser's IndexedDB as a non-extractable Web Crypto key; the signed certificate is accepted only after the browser checks its public key against the locally stored key.
- This remains an experimental browser-key workflow. It is not ATK-approved hardware-backed storage and must not be used for production fiscalization.
- The latest code is on the feature branch and is not visible on the live deployment until the PR is reviewed, merged and deployed.
- ATK test endpoint calls still require an ATK-authorized test identity and successful network access. No successful live ATK response or test coupon is claimed by this update.

## Current implementation milestone — 2 November 2026

- Dashboard labels now explain that the ATK unit number comes from the taxpayer's registered unit/location records, and that the POS number is unique per register. Fiskalo's internal branch UUID is explicitly not the ATK unit number.
- Android native module exposes Android Keystore P-256 CSR generation, P1363 ECDSA signing and X.509 certificate public-key matching.
- Android app has ATK TEST fiscalization number/Application ID fields, server-proxied Verify and Sign CSR actions, and local certificate-match validation.
- Android CI now runs native compilation and attempts to assemble a debug APK, then upload the APK as an Actions artifact. Latest run must complete successfully before claiming an installable APK exists.


## Web POS ATK Protobuf milestone — 3 November 2026

- Added `src/lib/atk/protobuf.ts`, a browser-compatible encoder for the official ATK `PosCoupon` Protobuf field layout.
- The encoder validates required identifiers, coupon type/reference rules, explicit one-character ATK tax codes, payment type codes, and reconciliation of item, payment, tax-group and coupon totals.
- Monetary representation follows the official integration reference: item unit price is encoded in 1/10,000 EUR units; coupon, line, payment and tax totals are encoded in cents.
- This is a serialization foundation only. It does not infer ATK tax/unit/item codes, build a coupon from the live invoice database, verify a registered certificate, submit to `/pos/coupon`, persist ATK responses, or provide an offline queue.
- The next implementation step is a server-authorized, idempotent TEST submission flow that binds the signed payload to an issued invoice and a verified POS installation. Do not send arbitrary browser-supplied Protobuf payloads directly to ATK.
