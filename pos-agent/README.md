# Fiskalo POS Agent — protocol core

This is the .NET 8 protocol core for the future local Fiskalo POS Agent. It is based directly on the ATK-linked public reference at https://github.com/fiskalizimi/pos-csharp.

## Implemented in this milestone

- Exact ATK `models.proto` schema and generated C# model classes from the reference repository.
- P-256 ECDSA key generation and CSR construction helpers.
- ATK's two monetary scales: unit prices in EUR × 10,000; coupon totals and payments in cents.
- ATK POS coupon builder with validation of identifiers, sale/cancel/return references, item/payment totals and tax-group reconciliation.
- Protobuf serialization, Base64 encoding, SHA-256 hashing and ECDSA signing.
- Citizen coupon QR payload construction (`Base64(Protobuf)|Base64(signature)`).
- Test-only HTTP calls for `/ca/verify/{nui}`, `/ca/signcsr` and `/pos/coupon`.

## Local host milestone\n\nA runnable loopback-only host now lives in `Fiskalo.PosAgent.Host`. It binds to `127.0.0.1:17843`, enforces exact browser-origin allowlisting, uses a one-time console pairing code and bearer session, and exposes authenticated status. The pairing/session are memory-only in this first iteration; unattended installation and OS-protected persistence are not yet implemented. Fiscalization remains disabled. See `Fiskalo.PosAgent.Host/README.md`.\n\n## Important security boundary

This library deliberately does **not** export, write or persist private keys. The installed POS Agent must provide an ECDsa key handle backed by OS-protected local storage. The next agent milestone will implement the installed local service and platform-specific key storage after the accepted ATK key-custody requirements are confirmed.

No test request is sent automatically. The test client is hard-coded to `https://fiskalizimi-test.atk-ks.org`; it contains no production endpoint or production switch. A real test run still requires ATK-authorized test data, including the taxpayer NUI, EDI fiscalization number and application ID.

## Build

```bash
dotnet build pos-agent/Fiskalo.PosAgent.Core/Fiskalo.PosAgent.Core.csproj
```

The ATK sample's monetary examples are not tax-calculation rules. Use the current ATK technical specification and category/unit catalogues for tax mapping.
