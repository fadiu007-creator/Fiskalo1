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
