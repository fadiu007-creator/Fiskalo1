# Fiskalo Android POS

This is an Android-native POS client scaffold using Expo/React Native and the existing Fiskalo Supabase schema.

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

## Important limitations

- This is a standard business POS client, not an ATK-certified fiscal POS.
- The Android Keystore module is source-implemented but not yet built into an APK or verified on a physical device. CSR generation and ECDSA signing are not yet verified against ATK test responses.
- Android certificate installation/renewal/revocation, ATK verification and certificate API calls, Protobuf coupon mapping/submission, offline queue and manual reconciliation are not yet integrated into checkout.
- No offline invoice issuance, card terminal integration, barcode scanner integration or printer driver is included.
- Card payments are recorded only after the cashier confirms that an external terminal/payment provider has accepted the payment. The app does not process card details.
- The Android project has not yet been built or tested on a physical Android device. EAS custom builds are required for the native module; Expo Go cannot load it.

Do not use the app to issue official fiscal coupons before ATK certification.


## CI debug APK artifact

The Android POS workflow now assembles a debug APK after the native Kotlin compilation step and uploads it as the GitHub Actions artifact `fiskalo-android-pos-debug-apk` (14-day retention). This is an installable internal test build, not a Play Store release or a production-signed APK. Download it from the successful **Android POS CI** run → Artifacts. Install only on a test device and do not use it for real fiscalization.
