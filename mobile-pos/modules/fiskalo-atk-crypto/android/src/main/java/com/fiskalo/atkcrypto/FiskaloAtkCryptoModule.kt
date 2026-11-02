package com.fiskalo.atkcrypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec

class FiskaloAtkCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FiskaloAtkCrypto")

    AsyncFunction("hasKey") { alias: String ->
      keyStore().containsAlias(normalizeAlias(alias))
    }

    AsyncFunction("createCsr") { alias: String, businessName: String, nui: String, branchId: String, posId: String ->
      require(businessName.isNotBlank()) { "Business name is required." }
      require(nui.matches(Regex("\\d{9}"))) { "NUI must contain exactly 9 digits." }
      require(branchId.matches(Regex("\\d{1,20}"))) { "Unit/branch ID must contain digits only." }
      require(posId.matches(Regex("\\d{1,20}"))) { "POS ID must contain digits only." }

      val keyAlias = normalizeAlias(alias)
      val store = keyStore()
      require(!store.containsAlias(keyAlias)) { "A key already exists for this POS. Do not replace it during ATK testing." }

      val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
      generator.initialize(
        KeyGenParameterSpec.Builder(
          keyAlias,
          KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
          .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
          .setDigests(KeyProperties.DIGEST_SHA256)
          .setUserAuthenticationRequired(false)
          .build()
      )
      val pair = generator.generateKeyPair()
      val csrInfo = Der.sequence(
        Der.integer(byteArrayOf(0)),
        Der.subject(businessName, nui, branchId, posId),
        pair.public.encoded,
        Der.tagged(0xA0, byteArrayOf())
      )
      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(pair.private)
      signer.update(csrInfo)
      val csr = Der.sequence(
        csrInfo,
        Der.sequence(Der.oid(byteArrayOf(0x2A, 0x86.toByte(), 0x48, 0xCE.toByte(), 0x3D, 0x04, 0x03, 0x02))),
        Der.tagged(0x03, byteArrayOf(0) + signer.sign())
      )
      val keyInfo = KeyFactory.getInstance(pair.private.algorithm, "AndroidKeyStore")
        .getKeySpec(pair.private, KeyInfo::class.java)
      val fingerprint = MessageDigest.getInstance("SHA-256").digest(pair.public.encoded)
        .joinToString(":") { "%02x".format(it) }
      val pem = "-----BEGIN CERTIFICATE REQUEST-----\\n" +
        Base64.encodeToString(csr, Base64.NO_WRAP).chunked(64).joinToString("\\n") +
        "\\n-----END CERTIFICATE REQUEST-----"
      mapOf(
        "alias" to keyAlias,
        "csrPem" to pem,
        "publicKeySha256" to fingerprint,
        "secureHardwareBacked" to keyInfo.isInsideSecureHardware
      )
    }

    AsyncFunction("signBase64") { alias: String, base64Payload: String ->
      require(base64Payload.isNotBlank()) { "Payload is required." }
      val key = keyStore().getKey(normalizeAlias(alias), null) as? java.security.PrivateKey
        ?: throw IllegalStateException("No Android Keystore signing key exists for this POS.")
      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(key)
      signer.update(base64Payload.toByteArray(StandardCharsets.UTF_8))
      Base64.encodeToString(signer.sign(), Base64.NO_WRAP)
    }

    AsyncFunction("deleteKey") { alias: String ->
      val store = keyStore()
      val keyAlias = normalizeAlias(alias)
      val existed = store.containsAlias(keyAlias)
      if (existed) store.deleteEntry(keyAlias)
      existed
    }
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  private fun normalizeAlias(alias: String): String {
    require(alias.isNotBlank() && alias.length <= 120) { "Invalid POS key alias." }
    return "fiskalo.atk." + alias.replace(Regex("[^A-Za-z0-9._-]"), "_")
  }
}

private object Der {
  fun tagged(tag: Int, value: ByteArray): ByteArray = byteArrayOf(tag.toByte()) + length(value.size) + value
  fun sequence(vararg values: ByteArray): ByteArray = tagged(0x30, values.fold(ByteArray(0)) { acc, item -> acc + item })
  fun set(value: ByteArray): ByteArray = tagged(0x31, value)
  fun oid(value: ByteArray): ByteArray = tagged(0x06, value)
  fun utf8(value: String): ByteArray = tagged(0x0C, value.toByteArray(StandardCharsets.UTF_8))
  fun printable(value: String): ByteArray = tagged(0x13, value.toByteArray(StandardCharsets.US_ASCII))
  fun integer(value: ByteArray): ByteArray {
    var start = 0
    while (start < value.size - 1 && value[start] == 0.toByte()) start++
    var body = value.copyOfRange(start, value.size)
    if ((body[0].toInt() and 0x80) != 0) body = byteArrayOf(0) + body
    return tagged(0x02, body)
  }
  fun subject(name: String, nui: String, branch: String, pos: String): ByteArray {
    fun attribute(oidBytes: ByteArray, value: ByteArray) = set(sequence(oid(oidBytes), value))
    return sequence(
      attribute(byteArrayOf(0x55, 0x04, 0x06), printable("RKS")),
      attribute(byteArrayOf(0x55, 0x04, 0x0A), utf8(nui)),
      attribute(byteArrayOf(0x55, 0x04, 0x0B), utf8(pos)),
      attribute(byteArrayOf(0x55, 0x04, 0x07), utf8(branch)),
      attribute(byteArrayOf(0x55, 0x04, 0x03), utf8(name.trim()))
    )
  }
  private fun length(size: Int): ByteArray {
    if (size < 128) return byteArrayOf(size.toByte())
    var n = size
    val bytes = ByteArrayOutputStream()
    while (n > 0) { bytes.write(n and 0xFF); n = n ushr 8 }
    val body = bytes.toByteArray().reversedArray()
    return byteArrayOf((0x80 or body.size).toByte()) + body
  }
}
