# Fiskalo Android POS

This is an Android-native POS client scaffold using Expo/React Native and the existing Fiskalo Supabase schema.

## Android thermal printer support

- Pair a Bluetooth Classic ESC/POS printer in Android system settings.
- Open the POS screen, use **Printer termik · Android**, grant nearby-device permission, refresh paired devices and select a Bluetooth printer.
- For USB OTG, connect the printer, find USB devices, grant Android's system permission, refresh the list and run the test.
- Run the test print to verify text and the ESC/POS QR command. This is a printer connectivity test only, not an ATK fiscal receipt.
- Select 58 mm or 80 mm and optionally enable automatic printing after checkout. Auto-print is guarded: it only prints when an ATK TEST fiscal document has an `accepted` status and a saved QR payload; the printed receipt is explicitly labelled ATK TEST.
- Supported Android transports: Bluetooth Classic SPP, USB OTG bulk-output devices and private LAN printers on TCP 9100. USB permission is requested through Android's system dialog. The current Android integration provides device discovery and a text+QR test print; it is not yet wired to automatic receipt printing after checkout. For production use, validate each printer model, character encoding and ATK receipt/QR requirements.

## Configure

1. Copy `.env.example` to `.env`.
2. Set the Fiskalo Supabase project URL and publishable key. Never put a service-role key in the app.
3. From this folder run `npm install`.
4. Run `npx expo start` and open the project on an Android device with Expo Go.
5. Expo Go supports ordinary POS screens only. The local ATK crypto module requires a custom native build; create an installable internal-test APK with `npx eas-cli build --platform android --profile preview`.

## Implemented

- Email/password sign-in through Supabase Auth.
- Business membership selection with existing RLS.
- Active product and customer loading.
- Search, cart quantities, VAT-inclusive display total.
- Draft creation, invoice item insertion and atomic invoice issue through existing Fiskalo RPC.
- Explicit cashier confirmation before recording a cash/card/transfer payment.
- Credit invoice option without a payment record.
- SecureStore-backed Supabase auth persistence.
- Experimental native ATK crypto module using Android Keystore P-256 key generation, local PKCS#10 CSR creation and ECDSA/SHA-256 signing of ATK Base64 payloads.
- ATK / Siguria e POS-it panel to generate and share a CSR on the Android device. The private key remains in Android Keystore; only the public CSR is shared.
- ATK TEST POS verification and certificate-request calls, tied to the exact saved POS installation; the returned certificate is checked against the local Android Keystore key.
- Automatic ATK TEST coupon construction, native signing and submission after a fully paid Android POS checkout. The same one-sale-per-invoice ledger and server-side ATK checks are used as the Web POS.

## Important limitations

- This is a standard business POS client, not an ATK-certified fiscal POS.
- The Android Keystore module is source-implemented but not yet built into an APK or verified on a physical device. CSR generation and ECDSA signing are not yet verified against ATK test responses.
- Android certificate lifecycle renewal/revocation, durable offline queue and manual reconciliation are not yet integrated. Ambiguous ATK responses must be checked before any retry.
- No offline invoice issuance, card terminal integration or barcode scanner integration is included. Android USB support is limited to USB host devices exposing a bulk OUT endpoint; some vendor-specific printer protocols may need model-specific handling.
- Card payments are recorded only after the cashier confirms that an external terminal/payment provider has accepted the payment. The app does not process card details.
- Android ATK onboarding and automatic coupon submission are source-implemented but have not yet been verified on a physical device or with a newly submitted Android coupon. EAS custom builds are required for the native module; Expo Go cannot load it.
- Set `EXPO_PUBLIC_FISKALO_API_URL` to the actual deployed Fiskalo Cloudflare Worker URL. The app deliberately has no guessed fallback URL.

Do not use the app to issue official fiscal coupons before ATK certification.


## CI debug APK artifact

The Android POS workflow now assembles a debug APK after the native Kotlin compilation step and uploads it as the GitHub Actions artifact `fiskalo-android-pos-debug-apk` (14-day retention). This is an installable internal test build, not a Play Store release or a production-signed APK. Download it from the successful **Android POS CI** run → Artifacts. Install only on a test device and do not use it for real fiscalization.
