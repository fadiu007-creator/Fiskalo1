# Fiskalo — ATK pre-application test runbook

**Status:** Preparation only. No ATK test taxpayer has been verified and no test coupon has been submitted by this project.

## 1. Understand the identifiers

| Identifier | Meaning | Where it comes from |
|---|---|---|
| Applicant NUI | Business applying to have the SEF certified | ARBK business registration |
| Applicant personal number | Identity of a natural-person applicant | Kosovo personal identification document |
| Taxpayer NUI for fiscalization | The actual taxpayer whose POS is being onboarded | That taxpayer's registered NUI |
| Test fiscalization number | Identifier generated for the pre-application test request | ATK pre-application confirmation email |
| Test Application ID | Identifier for the pre-application test request | ATK pre-application confirmation email |
| Branch/unit ID | Stable numeric identifier for the business location | Assign/confirm according to the taxpayer's unit records and ATK instructions |
| POS ID | Stable numeric identifier for an individual register within a unit | Assign a unique numeric ID per POS and confirm the convention with ATK |

Do not confuse the test fiscalization number in the pre-application email with the taxpayer's production Unique Fiscalization Code obtained through EDI's **Fiscalization → Request for Fiscalization** service. ATK says the production Unique Fiscalization Code is a prerequisite for using an EFS. The pre-application form separately says it generates a fiscalization number when the test request is submitted.

The ATK public POS integration reference describes the POS ID as a unique numeric value for each POS and the branch ID as the unique ID of the branch where the POS is located. Keep both stable and do not reuse the same POS ID for two registers.

## 2. If you do not have a business NUI

The ATK pre-application page has two applicant types:
- **Business:** requires the applicant's 9-digit NUI.
- **Natural person:** asks for first name, surname and a 10-digit personal number.

However, the same form has a separate **Fiscalization** section that asks for the NUI and name of the taxpayer that will actually be registered for fiscalization. The natural-person applicant option does not remove that separate taxpayer-NUI field.

Therefore:
- If you are applying as a natural-person SEF developer, use your real personal details in the applicant section.
- For POS fiscalization tests, use the NUI of a taxpayer who is authorized to participate in the test, with the taxpayer's permission.
- If you have no such taxpayer NUI, contact ATK and ask whether they can issue/authorize a test taxpayer or specify an approved alternative. Do not invent an NUI, use a random number, or use another business's NUI without authorization.

## 3. Submit the ATK pre-application test request

1. Open https://apps.atk-ks.org/sefaplikimi/
2. Choose **Testo para Aplikimit**.
3. Complete the applicant section using your real details:
   - Business: legal applicant NUI; or
   - Natural person: personal name and personal number.
4. Complete the separate fiscalization section using the real/ATK-authorized taxpayer NUI and taxpayer name.
5. Submit the request.
6. Keep the confirmation email. ATK says the test fiscalization number is generated automatically during submission and the confirmation email provides the test Application ID and fiscalization number.

Do not use the production EDI code in place of the test number from this email unless ATK explicitly tells you to.

## 4. Prepare Fiskalo test installation(s)

For each actual register to be tested:

1. Choose a stable branch/unit ID for the location and a unique numeric POS ID for the register, following the taxpayer's unit records and ATK's instructions.
2. In Fiskalo, open the organization dashboard → **ATK / POS**.
3. Save the test fiscalization number from the ATK confirmation email.
4. Add a test POS installation with the confirmed branch/unit ID and POS ID.
5. On the relevant device, generate its own P-256 key pair and CSR. Never copy a private key between Web, Android or another POS.
6. Keep the private key on that device. Only the CSR/public key is sent to ATK.

The current Windows Agent has the existing test verify/sign-CSR HTTP workflow. The Web POS browser key vault and Android Keystore CSR module are experimental foundations; their CSR generation has not yet been verified against ATK. Do not submit those CSR files as a production onboarding until ATK confirms the key-storage/device model and we complete device tests.

## 5. Complete the test onboarding sequence

For an authorized taxpayer and test identifiers, the technical sequence is:

1. Call the ATK test verification endpoint using the taxpayer NUI and the exact test fiscalization number, POS ID, branch ID and test Application ID.
2. Record the returned business name and verification code.
3. Generate a P-256 CSR on the same POS that owns the private key.
4. Send the CSR with the exact verified business name, NUI, branch ID, POS ID, verification code and Application ID to the ATK test certificate endpoint.
5. Validate the returned certificate and confirm that its public key matches the POS's locally held private key.
6. Only after onboarding succeeds, prepare a Sale coupon using current official ATK tax, unit, item-category and payment codes.
7. Submit the Sale once and record the exact request, response and ATK transaction identifier.
8. Submit a separate Cancel test and a Return test referencing the original accepted coupon as required by the current ATK specification.
9. Use ATK's **Verifiko testimet** page to check the reported status of fiscalization, onboarding and POS coupons.

Never repeat a coupon submission after a timeout until its status has been reconciled with ATK. The current integration intentionally does not blindly retry ambiguous submissions.

## 6. Verify results in ATK

Open https://apps.atk-ks.org/sefaplikimi/PreApplication/VerifyTests and enter:
- Test Application ID from the confirmation email.
- Test fiscalization number from the same email.

The portal displays the test status for fiscalization, onboarding and POS coupons. Save screenshots or exports of the final status and keep the original request/response evidence for the certification file.

The formal certification application requires technical testing under the same NUI or personal number, including onboarding and POS coupons for Sale, Cancel and Return. Do not apply until those tests are complete and ATK's required evidence is ready.

## 7. Important current Fiskalo limitations

- Web POS and Android POS currently issue Fiskalo internal invoices; they are not yet ATK-fiscalizing checkout clients.
- The browser key vault stores a non-extractable P-256 CryptoKey in IndexedDB. This is browser-profile storage, not a hardware-backed key store and not yet confirmed by ATK as an acceptable SEF key custody model.
- The Android module creates P-256 keys in Android Keystore and generates a CSR locally. It has not yet been compiled into an APK or tested on a physical device; hardware-backed protection depends on the device.
- Android and browser ATK coupon signing/submission, certificate lifecycle, durable offline queue and reconciliation are not yet complete.
- No ATK test request, certificate or coupon has been submitted by this development work.
- Production fiscalization remains disabled until the provider and Fiskalo SEF solution are formally authorized/certified and the production taxpayer identifiers/credentials are issued.

## Official references

- ATK pre-application test form: https://apps.atk-ks.org/sefaplikimi/PreApplication/Create
- ATK test verification: https://apps.atk-ks.org/sefaplikimi/PreApplication/VerifyTests
- ATK application form: https://apps.atk-ks.org/sefaplikimi/Application/Create
- ATK SEF portal and current documents: https://apps.atk-ks.org/sefaplikimi/
- ATK EDI notice about the production Unique Fiscalization Code: https://www.atk-ks.org/njoftim-per-tatimpagues-publikohet-versioni-i-ri-i-sistemit-elektronik-edi/
- Official ATK POS implementation reference: https://github.com/fiskalizimi/pos-golang
