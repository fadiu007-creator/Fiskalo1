# Fiskalo POS Agent

.NET 8 ATK protocol core and Windows local host for the Fiskalo business platform.

## Implemented

- ATK Protobuf schema and generated C# models based on the public fiskalizimi/pos-csharp reference.
- P-256 ECDSA key generation and CSR generation.
- Windows DPAPI CurrentUser protection for local signing-key material and encrypted fiscal queue snapshots.
- ATK monetary conversion helpers: unit prices use EUR × 10,000; coupon totals/payments use euro cents.
- ATK coupon builder with identity, item, payment, tax-group and Sale/Cancel/Return reference validation.
- Fiskalo issued-invoice mapping core. It reconciles stored invoice line/header totals and requires explicit ATK unit, tax-category, item-type and payment mappings. It never infers an ATK tax code from a VAT percentage.
- Protobuf serialization, Base64 payloads, SHA-256 and ECDSA signing.
- Fixed-host ATK test client for taxpayer/POS verification, CSR signing and test coupon submission.
- Local host with loopback-only binding, exact origin allowlist, one-time pairing code, bearer session, and authenticated operational routes.
- ESC/POS receipt builder for 58 mm and 80 mm paper, QR command support, Windows USB/Bluetooth queues, and private LAN printers on TCP 9100.
- Printer enumeration, default-printer identification and non-fiscal test-print endpoint.
- Test certificate is stored locally only after its public key is confirmed to match the protected private key.
- Signed coupon is persisted to the encrypted queue before submission. Accepted/rejected outcomes are recorded. Ambiguous outcomes are locked for operator reconciliation.
- Operator reconciliation endpoint supports accepted, rejected and operator-confirmed-not-found decisions. It never retries automatically.
- Automated tests cover coupon mapping and queue reconciliation; CI builds on Windows and Ubuntu and publishes a Windows x64 artifact.

## Security boundaries

- The private signing key is not sent to the browser or Supabase.
- Windows key and queue protection uses DPAPI CurrentUser and fails closed off Windows.
- The agent listens only on 127.0.0.1:17843, rejects unexpected Host values, checks exact browser origins and requires a paired bearer session for operational routes.
- The pairing code is printed to the local console and must be kept private. The current session is memory-only; restarting the agent invalidates it.
- The queue's not_found_confirmed resolution is an operator assertion after checking ATK records. It is not an ATK query. Never use it when ATK status is unavailable or uncertain.
- ATK calls are restricted to the official test hostname. No production endpoint or production enable switch exists.

## Windows build and install

The POS Agent CI workflow builds and tests Windows/Ubuntu targets and publishes the self-contained fiskalo-pos-agent-win-x64 artifact. The artifact contains install, start and uninstall PowerShell scripts. See the Host README.

## ATK testing

No test taxpayer or ATK test application is assumed. Before sending calls, obtain ATK-authorized test identity and matching NUI, EDI fiscalization number, application ID, branch ID and POS ID. The complete operator sequence is in docs/pos-clients-and-atk-testing.md.

## Limitations

- This is not an ATK-certified EFS. Production fiscalization is disabled.
- No ATK test calls have been performed as part of this implementation batch.
- Invoice mapping is a core contract; it is not yet automatically wired to the web checkout or Android app.
- Cancel/Return mapping supports original-coupon references, but the complete operator-facing cancellation/return workflow and ATK test evidence are outstanding.
- The Windows host is a foreground application, not an installed Windows service. No auto-start, secure persistent browser pairing, cash drawer or hardware terminal integration exists.
- Android ATK signing is not implemented. Android requires an independent Android Keystore-backed implementation and real-device tests.

## Build and test

~~~
dotnet build Fiskalo.PosAgent.Core/Fiskalo.PosAgent.Core.csproj --configuration Release
dotnet build Fiskalo.PosAgent.Host/Fiskalo.PosAgent.Host.csproj --configuration Release
dotnet test Fiskalo.PosAgent.Tests/Fiskalo.PosAgent.Tests.csproj --configuration Release
~~~
