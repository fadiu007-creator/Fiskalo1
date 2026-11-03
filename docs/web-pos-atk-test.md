# Fiskalo Web POS — ATK TEST Sale workflow

This is a TEST-only workflow. It does not enable production fiscalization and does not establish that Fiskalo is ATK-certified.

## Where to open it

1. Sign in to the Fiskalo business.
2. Open **Pika e shitjes** (Web POS).
3. Select **Dërgo kupon në ATK TEST** in the POS header.
4. Select the registered TEST POS installation and the Application ID.
5. Select an already-issued, fully-paid cash sale invoice.
6. Enter the current ATK catalogue codes for every invoice line:
   - unit-of-measure code;
   - one-character ATK tax code;
   - item/goods-service category code.
7. Submit the sale. Fiskalo re-verifies the POS with ATK TEST, builds the PosCoupon Protobuf, signs the Base64 payload using the browser-local key, and posts `details` plus `signature` to the ATK TEST `/pos/coupon` endpoint.
8. A transaction ID is displayed only when ATK returns a successful response containing `transaction_id`.

## Prerequisites

- A TEST taxpayer profile and TEST POS installation exist in Fiskalo. The Web POS setup wizard is available at `/app/{organizationId}/pos/setup` and can create the local TEST installation.
- The browser used for submission is the same browser/profile where the CSR key was generated and the signed TEST certificate was installed. The setup wizard performs verification, creates the local key/CSR, calls ATK's TEST sign-CSR endpoint, validates the certificate public key against the local key, and marks the TEST POS active.
- The fiscalization number and Application ID are valid for the same NUI / POS test application.
- The selected invoice is issued, paid in full and paid by cash. The first Web flow deliberately limits the test to a single Cash payment allocation.
- ATK unit, tax and item category codes must come from the current ATK catalogue. Fiskalo does not infer them from the product unit, VAT percentage or product/service flag. After entering the official values once, Fiskalo stores them on the linked product and pre-fills them for later test invoices.
- Apply migration `0024_atk_test_coupon_submission.sql` before using the new route.

## Safety and retry behavior

- Only the ATK TEST host is called.
- The private key remains in browser IndexedDB and is not sent to Fiskalo's server.
- The server checks the authenticated owner/administrator, organization NUI, issued/paid/cash invoice, TEST POS installation, Protobuf coupon identifiers and total.
- Fiskalo records the signed payload, signature, payload hash and ATK response in its fiscal document ledger.
- If the request times out or the connection fails after submission, the record is marked `offline_pending`. Do not blindly submit again: ATK may have received the first request. Check ATK before any retry.
- Cancellation, return, split tender, non-cash payment mapping, durable retry/reconciliation and production fiscalization are not part of this first Web TEST slice.
- Browser IndexedDB key storage is a development/testing approach, not an ATK-approved production key custody design.
