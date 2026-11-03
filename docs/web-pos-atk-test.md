# Fiskalo Web POS — automatic ATK TEST submission

This is a TEST-only workflow. It does not enable production fiscalization and does not establish that Fiskalo is ATK-certified.

## Checkout flow

1. Sign in to the business and open **Arka**.
2. Add catalogue products to the cart. Fiskalo calculates net amount, VAT and gross total from the saved product prices and quantities; the cashier does not type the invoice amount.
3. Confirm that the customer payment was received. Cash sales require an open cashier shift.
4. Complete the sale. Fiskalo creates and issues the internal invoice, records the payment, and then automatically attempts ATK TEST submission for a fully paid invoice.
5. The cashier sees the ATK result. A transaction ID is displayed only after ATK returns a valid `transaction_id`.

There is no separate manual coupon-creation step in the normal Web POS sale flow. Unpaid credit invoices are not submitted until paid.

## Prerequisites

- The business has a valid taxpayer NUI and an ATK TEST taxpayer profile.
- A TEST POS installation exists with the correct branch/unit ID and unique POS ID.
- The ATK TEST fiscalization number and Application ID belong to the same taxpayer test application.
- The owner/administrator completes initial POS verification and certificate onboarding. Each browser profile that signs coupons must have its own locally held P-256 key and matching ATK TEST certificate.
- Every sold product/service has official ATK unit, tax and item-category codes. Fiskalo validates that the VAT tax code matches the VAT rate, but it does not invent official item-category codes.
- The fiscal document ledger migrations are applied, including the unique one-sale-per-invoice index.

## Submission safeguards

- Only the ATK TEST host is called by this flow.
- The private key remains in the browser's local key vault; it is not sent to Fiskalo's server.
- The server verifies the authenticated business membership, taxpayer NUI, issued/paid invoice, TEST POS verification, Protobuf identifiers and invoice total.
- Fiskalo saves the signed payload, signature, payload hash, attempt state and ATK response in its fiscal document ledger.
- A single fiscal document is allowed for each sale invoice. A second request does not create another coupon.
- A definitive ATK rejection is marked `rejected`. A timeout, network failure, HTTP 5xx or success response without a valid transaction ID is marked `offline_pending` / unconfirmed. Do not blindly resend such a sale: ATK may already have received it.
- The current Web POS test flow has no automated reconciliation API or safe automatic retry for ambiguous submissions. Those are still required milestones.
- Browser IndexedDB key storage is a development/testing approach, not an ATK-approved production key custody design.

## Evidence and limitations

The project database has recorded four accepted ATK TEST sale documents, including a recent €11.80 cash sale with ATK's `Coupon received successfully` response. This proves that the Web POS TEST submission path has worked for that tested sale. It does not prove all payment methods, all catalogue mappings, Android checkout, or production certification.

Cancellation, return, full offline queue/reconciliation, official receipt/QR rendering, Android automatic ATK submission and production fiscalization remain outside the completed Web POS test slice.
