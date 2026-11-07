# Fiskalo POS Agent Host

Windows local fiscalization agent for ATK TEST workflows. It is a development/validation host, not a certified SEF.

## Runtime

- .NET 8, Windows x64 for protected key and queue operations.
- Binds only to 127.0.0.1:17843.
- Allows only exact origins listed in FISKALO_ALLOWED_ORIGINS; default is https://fiskalo.shqiptare.workers.dev.
- Rejects non-loopback clients and unexpected Host values.
- Uses one-time console pairing code and bearer session. Restarting the agent invalidates the session and generates a new code.
- Session token is held in memory; the dashboard keeps it in browser sessionStorage.

## Install

The successful Windows x64 CI artifact includes the executable and scripts:

1. Download and extract fiskalo-pos-agent-win-x64 from the latest successful POS Agent CI run.
2. Open PowerShell in the extracted directory.
3. Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-FiskaloPosAgent.ps1
4. Start Fiskalo POS Agent from the desktop shortcut. Keep its console window open.
5. Pair the dashboard using the one-time code printed by the agent.

The installer creates a per-user application directory and desktop shortcut. It does not install a Windows service or configure auto-start. The uninstaller removes application files but preserves protected local fiscal data.

## Authenticated routes

| Method | Route | Purpose |
|---|---|---|
| GET | /health | Unauthenticated local health |
| POST | /api/v1/pair | Exchange one-time pairing code for session |
| GET | /api/v1/status | Paired agent status |
| POST | /api/v1/keys/csr | Create/reuse local P-256 key and generate CSR |
| POST | /api/v1/atk/test/verify | Verify registered test taxpayer/POS with ATK |
| POST | /api/v1/atk/test/sign-csr | Request ATK test certificate and check public-key match |
| POST | /api/v1/atk/test/coupon | Sign, queue and submit an ATK test coupon |
| GET | /api/v1/printers | Enumerate installed Windows printers |
| POST | /api/v1/printers/test | Print a non-fiscal ESC/POS test receipt (58/80 mm) |
| POST | /api/v1/printers/print | Send ESC/POS bytes to a Windows queue or private LAN printer on TCP 9100 |
| GET | /api/v1/queue | Read queue metadata; never returns signed payloads |
| POST | /api/v1/queue/reconcile | Operator-controlled resolution of uncertain submissions |

Operational routes require Authorization: Bearer session. Never paste pairing codes, bearer tokens, verification codes, private keys or certificate files into GitHub issues or support messages.

## ATK test onboarding

Before making ATK requests, obtain authorization and identifiers from ATK:
- test taxpayer NUI;
- EDI fiscalization number;
- ATK application ID;
- registered branch ID and POS ID.

Then:
1. Start and pair the Windows agent.
2. Run ATK test verification for the exact taxpayer/POS identity.
3. Use the returned verification code to request the test certificate.
4. The agent checks that the returned certificate public key matches its local P-256 key.
5. Build a test coupon using current ATK catalogue codes and balanced payment allocations.
6. Submit the Sale coupon once and record the ATK transaction ID.
7. Submit Cancel and Return as separate documents referencing the original accepted coupon ID.

No ATK test call is sent automatically at startup. The client uses the fixed official ATK test hostname only. No production endpoint or production switch is included.

## Queue and reconciliation safety

The signed Protobuf payload and signature are persisted in the DPAPI-protected local queue before submission.

- ATK success: record transaction ID and mark Accepted.
- Definitive ATK 4xx rejection: mark Rejected.
- Timeout, network error, 5xx or interrupted process: mark NeedsReconciliation.
- Restart during submission: recover as NeedsReconciliation.

The queue endpoint exposes `recoveryDeadlineExceeded` and `overdueCount`. The 48-hour deadline is monitored; an overdue record remains preserved and queued records continue to be delivered. A deadline overrun must be escalated to the operator/provider and documented. It never authorizes deleting a record or creating a replacement.

For an uncertain result, check ATK test records manually before choosing a resolution:
- accepted: requires the ATK transaction ID.
- rejected: requires an operator review note.
- not_found_confirmed: requires explicit confirmation that no matching ATK record exists. It re-queues the same persisted signed document; the background worker may then submit that same document. It never creates a new coupon ID.

Do not choose not_found_confirmed when ATK is unavailable, when the search is incomplete, or merely because the original request timed out. A missed recovery deadline is an operational incident; the original fiscal record remains preserved. Do not create a replacement solely because the deadline elapsed.

## PowerShell scripts

- Install-FiskaloPosAgent.ps1: per-user install and desktop shortcut.
- Start-FiskaloPosAgent.ps1: validates exact HTTPS origins and starts the agent.
- Uninstall-FiskaloPosAgent.ps1: removes application files while preserving protected fiscal data.

## Current limitations

- Not ATK-certified; production fiscalization is disabled.
- Foreground process only; no Windows service, auto-start, persistent pairing session or updater.
- Windows x64 only for DPAPI-backed signing and queue protection.
- Thermal receipt printing is supported through installed Windows printer queues (USB or Bluetooth devices installed in Windows) and private LAN printers using raw TCP port 9100. Android app printing is a separate Bluetooth Classic SPP path. Android USB direct printing, cash drawer and card terminal integration are not included.
- Browser checkout and Android app issue internal Fiskalo invoices; invoice-to-ATK mapping is a core milestone and is not yet automatically wired to checkout.
- Android does not yet have an ATK signing agent or Android Keystore implementation.
- No test taxpayer, ATK test certificate or coupon submission has been supplied/performed in this development batch.
