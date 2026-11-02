# Fiskalo POS Agent Host — connectivity milestone

This project is the first runnable local-host layer for the POS Agent.

## Current scope

- Listens only on `127.0.0.1:17843`; it does not bind to LAN or public interfaces.
- Rejects requests with an unexpected Host header.
- Accepts browser requests only from the exact origins in `FISKALO_ALLOWED_ORIGINS`.
- Prints a cryptographically random one-time pairing code to the local console.
- Exchanges that code once for a random bearer session token.
- Compares pairing/session secrets in constant time.
- Limits repeated failed pairing attempts.
- Exposes an unauthenticated health endpoint and an authenticated status endpoint.
- Explicitly reports `fiscalizationEnabled: false`.

## Run

```bash
dotnet run --project pos-agent/Fiskalo.PosAgent.Host/Fiskalo.PosAgent.Host.csproj
```

Default allowed browser origin:
`https://fiskalo.shqiptare.workers.dev`

For local development, set an exact semicolon-separated origin list, for example:

```bash
FISKALO_ALLOWED_ORIGINS="https://fiskalo.shqiptare.workers.dev;http://localhost:3000" dotnet run --project pos-agent/Fiskalo.PosAgent.Host/Fiskalo.PosAgent.Host.csproj
```

Do not expose the pairing code or bearer token in screenshots, logs, support tickets, URLs or query strings. The code and session are in-memory in this initial host milestone: restarting the process invalidates the session and creates a new pairing code. Windows DPAPI primitives for the signing key and queue encryption now exist in the core library, but the host does not yet wire them into startup/pairing. Managed service installation and persistent session management remain pending.

## Security and limitations

This is a loopback pairing/connectivity scaffold, not a complete secure POS Agent. It does not yet generate/store certificates, sign fiscal documents, persist a fiscal queue, print receipts, or submit transactions to ATK. It is not a certified SEF and must not be used to issue fiscal coupons.

## ATK test onboarding endpoints

After pairing, the Windows host exposes authenticated test-only endpoints:

- `POST /api/v1/keys/csr` — creates or reuses a local P-256 key protected by Windows DPAPI and returns a CSR. The private key never leaves the machine.
- `POST /api/v1/atk/test/verify` — calls only the fixed ATK test host's `/ca/verify/{nui}` endpoint using the supplied test identifiers.
- `POST /api/v1/atk/test/sign-csr` — creates a CSR from the local key, calls only the ATK test host's `/ca/signcsr`, checks that the returned certificate public key matches the local private key, then stores the public certificate locally.
- `GET /api/v1/queue` — returns queue metadata only, never fiscal payloads or signatures.

The ATK test calls are explicit operator actions; no calls occur at startup. The endpoints require the paired bearer session. They are not production endpoints. The certificate is not treated as a production credential, and fiscalization remains disabled. The current host still does not submit POS coupons or run an automatic queue worker.

## Downloadable Windows build

After the POS Agent CI matrix passes, the `publish-windows` job publishes a self-contained `fiskalo-pos-agent-win-x64` artifact for 14 days. Download it from the successful GitHub Actions run; it does not require a separately installed .NET runtime. The agent is still a foreground development host, not an installed Windows service.

## Operator test flow (Windows only)

1. Start `Fiskalo.PosAgent.Host.exe` from a trusted local folder. Keep the one-time pairing code private.
2. Pair the Fiskalo browser application using the local endpoint and code. The browser must send the bearer token only in the Authorization header.
3. Create a CSR using the authenticated `POST /api/v1/keys/csr` endpoint with `businessName`, `businessNui`, `branchId`, and `posId`. The key is created locally and protected with DPAPI.
4. Call `POST /api/v1/atk/test/verify` with the real ATK test NUI, EDI fiscalization number, POS ID, branch ID and ATK-issued application ID.
5. Only after ATK returns a verification code, call `POST /api/v1/atk/test/sign-csr` with the business identity, same identifiers and verification code. The agent creates a CSR from the same local key, calls the ATK test host, validates the returned certificate's public key against the local key and stores the public certificate.
6. Check authenticated `GET /api/v1/status` for `testCertificateInstalled: true`.

These calls have not been run. Do not send test requests until ATK has provided the proper test registration/identifiers and the operator has approved the request. The current host has no UI integration to invoke these routes yet; they can be exercised with a local API client. Never paste real credentials, verification codes, bearer tokens, private keys or certificates into GitHub issues.

## Current hard limits

- Windows x64 is the only supported runtime for DPAPI-backed key/queue storage.
- The executable runs in the foreground; no Windows service installer, auto-start, update mechanism or secure pairing UI exists yet.
- The agent does not yet create/submit fiscal coupons or automatically process the queue.
- No production ATK URL, production switch, or production credential support exists.
