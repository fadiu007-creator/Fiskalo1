# Fiskalo POS clients and ATK test sequence

## Which POS exists today?

| Client | Current capability | ATK signing |
|---|---|---|
| Web POS | Responsive browser checkout; internal Fiskalo invoices and payment ledger | Not in browser; browser pairing to Windows agent is an integration target |
| Android POS | Native Expo/React Native checkout; internal invoices and payment ledger | Not implemented; requires Android Keystore-based agent |
| Windows POS Agent | Local signing key, ATK test certificate onboarding, signed test-coupon submission and encrypted queue | Test-only implementation |

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

The Android project in mobile-pos/ is a native client for ordinary Fiskalo sales/invoice management. It uses the existing Supabase Auth and RLS tenant boundaries and stores the login session in Android SecureStore. It has not yet been built as an APK or exercised on physical hardware.

Android ATK support is a separate milestone: Android Keystore-backed P-256 key management, CSR/certificate lifecycle, Protobuf signing, durable encrypted queue, network ambiguity reconciliation and ATK test evidence must be implemented and tested on real Android hardware. Do not copy a Windows DPAPI private key or certificate into Android.

## Explicit limitations

- Neither POS client is an ATK-certified EFS.
- Card acquiring is not integrated; card payments are only entered after an external terminal/provider confirms success.
- No production ATK endpoint or production submission switch is enabled.
- No test coupon has been sent as part of this implementation batch.
- The Android app has not yet passed a build on a physical device.

## Browser and Android key-storage prototype (2 November 2026)

The Web dashboard now contains an experimental CSR action per test POS. It creates a P-256 key in the browser, imports the private key as a non-extractable Web Crypto key, persists that key in IndexedDB and downloads the CSR. The browser key is scoped to the organization and POS installation. This is not equivalent to a hardware-backed keystore and is not yet approved by ATK; browser-profile compromise, same-origin XSS or browser data loss remain relevant risks.

The Android POS now contains a local Expo native module that generates P-256 keys in Android Keystore, builds a PKCS#10 CSR and can sign the ATK Base64 payload with ECDSA/SHA-256. The app exposes a test-only CSR onboarding panel and keeps the CSR as public data in SecureStore for repeat export. The private key is not exported. Hardware-backed status is reported by the device's Android Keystore and may be false on some devices.

These are key-generation/CSR foundations only. They do not yet verify the CSR against ATK, install an ATK-issued certificate, submit fiscal coupons from Web/Android, or provide a production-ready offline queue. They have not been built/tested on physical devices or approved by ATK. The Windows Agent remains the only currently implemented complete local ATK test verify/sign-CSR path.

For the exact applicant-vs-taxpayer identity distinction, test fiscalization number, Application ID, test request and portal verification steps, see [ATK test runbook](./atk-test-runbook.md).
