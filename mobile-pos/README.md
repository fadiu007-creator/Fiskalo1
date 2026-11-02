# Fiskalo Android POS

This is an Android-native POS client scaffold using Expo/React Native and the existing Fiskalo Supabase schema.

## Configure

1. Copy `.env.example` to `.env`.
2. Set the Fiskalo Supabase project URL and publishable key. Never put a service-role key in the app.
3. From this folder run `npm install`.
4. Run `npx expo start` and open the project on an Android device with Expo Go.
5. To create an installable internal-test APK, install/configure EAS and run `npx eas-cli build --platform android --profile preview`.

## Implemented

- Email/password sign-in through Supabase Auth.
- Business membership selection with existing RLS.
- Active product and customer loading.
- Search, cart quantities, VAT-inclusive display total.
- Draft creation, invoice item insertion and atomic invoice issue through existing Fiskalo RPC.
- Explicit cashier confirmation before recording a cash/card/transfer payment.
- Credit invoice option without a payment record.
- SecureStore-backed Supabase auth persistence.

## Important limitations

- This is a standard business POS client, not an ATK-certified fiscal POS.
- It does not yet sign or submit ATK coupons from Android. The current fiscal signing agent is Windows-only and uses Windows DPAPI. Android needs a separate native signing module using Android Keystore, a certificate lifecycle, and ATK-authorized test coverage.
- No offline invoice issuance, card terminal integration, barcode scanner integration or printer driver is included.
- Card payments are recorded only after the cashier confirms that an external terminal/payment provider has accepted the payment. The app does not process card details.
- The Android project has not yet been built or tested on a physical Android device.

Do not use the app to issue official fiscal coupons before ATK certification.
