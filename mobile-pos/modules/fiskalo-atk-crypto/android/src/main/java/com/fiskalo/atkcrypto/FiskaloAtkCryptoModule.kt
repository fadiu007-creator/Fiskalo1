package com.fiskalo.atkcrypto

import android.Manifest
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbManager
import android.os.Build
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.security.SecureRandom
import java.security.spec.ECGenParameterSpec
import java.security.cert.CertificateFactory

class FiskaloAtkCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FiskaloAtkCrypto")

    AsyncFunction("hasKey") { alias: String ->
      keyStore().containsAlias(normalizeAlias(alias))
    }

    AsyncFunction("createVerificationNo") {
      val alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      val random = SecureRandom()
      buildString(16) { repeat(16) { append(alphabet[random.nextInt(alphabet.length)]) } }
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
      val pem = "-----BEGIN CERTIFICATE REQUEST-----\n" +
        Base64.encodeToString(csr, Base64.NO_WRAP).chunked(64).joinToString("\n") +
        "\n-----END CERTIFICATE REQUEST-----"
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
      Base64.encodeToString(Der.ecdsaDerToP1363(signer.sign()), Base64.NO_WRAP)
    }

    AsyncFunction("matchesCertificate") { alias: String, certificatePem: String ->
      val clean = certificatePem.replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "").replace(Regex("\\s+"), "")
      val certificateBytes = Base64.decode(clean, Base64.DEFAULT)
      val certificate = CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(certificateBytes))
      val localCertificate = keyStore().getCertificate(normalizeAlias(alias)) ?: return@AsyncFunction false
      MessageDigest.isEqual(certificate.publicKey.encoded, localCertificate.publicKey.encoded)
    }

    AsyncFunction("requestBluetoothPermission") {
      val activity = appContext.currentActivity
      if (activity == null) false
      else if (Build.VERSION.SDK_INT < 31) true
      else if (activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == android.content.pm.PackageManager.PERMISSION_GRANTED) true
      else {
        activity.requestPermissions(arrayOf(Manifest.permission.BLUETOOTH_CONNECT), 7331)
        false
      }
    }

    AsyncFunction("listBluetoothPrinters") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      if (Build.VERSION.SDK_INT >= 31 && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != android.content.pm.PackageManager.PERMISSION_GRANTED)
        throw IllegalStateException("Grant Nearby devices permission, then refresh paired printers.")
      val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
        ?: throw IllegalStateException("This Android device does not support Bluetooth.")
      adapter.bondedDevices.map { device ->
        mapOf("name" to (device.name ?: "Bluetooth printer"), "address" to device.address)
      }.sortedBy { it["name"].toString() }
    }

    AsyncFunction("printBluetooth") { address: String, dataBase64: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      if (Build.VERSION.SDK_INT >= 31 && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != android.content.pm.PackageManager.PERMISSION_GRANTED)
        throw IllegalStateException("Grant Nearby devices permission, then retry printing.")
      require(address.matches(Regex("(?i)[0-9a-f]{2}(:[0-9a-f]{2}){5}"))) { "Select a paired Bluetooth printer." }
      val bytes = Base64.decode(dataBase64, Base64.DEFAULT)
      require(bytes.isNotEmpty() && bytes.size <= 262144) { "Print data must be between 1 byte and 256 KB." }
      val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
        ?: throw IllegalStateException("Bluetooth is not available.")
      val device = adapter.bondedDevices.firstOrNull { it.address.equals(address, true) }
        ?: throw IllegalStateException("Pair the printer in Android Bluetooth settings first.")
      val socket = device.createRfcommSocketToServiceRecord(UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"))
      try {
        adapter.cancelDiscovery()
        socket.connect()
        socket.outputStream.use { stream -> stream.write(bytes); stream.flush() }
      } finally { runCatching { socket.close() } }
      mapOf("printed" to true, "transport" to "bluetooth-classic")
    }

    AsyncFunction("listUsbPrinters") {
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
      manager.deviceList.values.map { device ->
        mapOf(
          "deviceId" to device.deviceId,
          "deviceName" to device.deviceName,
          "manufacturerName" to (device.manufacturerName ?: ""),
          "productName" to (device.productName ?: "USB printer"),
          "vendorId" to device.vendorId,
          "productId" to device.productId,
          "hasPermission" to manager.hasPermission(device)
        )
      }
    }

    AsyncFunction("requestUsbPermission") { deviceId: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
      val device = manager.deviceList.values.firstOrNull { it.deviceId == deviceId }
        ?: throw IllegalArgumentException("USB device was not found.")
      if (!manager.hasPermission(device)) {
        val intent = Intent("com.fiskalo.pos.USB_PERMISSION").setPackage(context.packageName)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val permissionIntent = PendingIntent.getBroadcast(context, deviceId, intent, flags)
        manager.requestPermission(device, permissionIntent)
      }
      mapOf("permissionGranted" to manager.hasPermission(device), "permissionDialogRequested" to !manager.hasPermission(device))
    }

    AsyncFunction("printUsb") { deviceId: Int, dataBase64: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
      val device = manager.deviceList.values.firstOrNull { it.deviceId == deviceId }
        ?: throw IllegalArgumentException("USB printer was not found. Reconnect it and refresh.")
      if (!manager.hasPermission(device)) {
        val intent = Intent("com.fiskalo.pos.USB_PERMISSION").setPackage(context.packageName)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        manager.requestPermission(device, PendingIntent.getBroadcast(context, deviceId, intent, flags))
        throw IllegalStateException("USB_PERMISSION_REQUESTED: approve the Android USB prompt, then tap print again.")
      }
      val bytes = Base64.decode(dataBase64, Base64.DEFAULT)
      require(bytes.isNotEmpty() && bytes.size <= 262144) { "Print data must be between 1 byte and 256 KB." }
      val connection = manager.openDevice(device) ?: throw IllegalStateException("Android could not open the USB printer.")
      try {
        var selectedInterface: android.hardware.usb.UsbInterface? = null
        var selectedEndpoint: android.hardware.usb.UsbEndpoint? = null
        for (interfaceIndex in 0 until device.interfaceCount) {
          val candidate: android.hardware.usb.UsbInterface = device.getInterface(interfaceIndex)
          for (endpointIndex in 0 until candidate.endpointCount) {
            val endpoint: android.hardware.usb.UsbEndpoint = candidate.getEndpoint(endpointIndex)
            if (endpoint.direction == UsbConstants.USB_DIR_OUT &&
              endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
              selectedInterface = candidate
              selectedEndpoint = endpoint
              break
            }
          }
          if (selectedInterface != null) break
        }
        val usbInterface = selectedInterface
          ?: throw IllegalStateException("No USB bulk-output endpoint was found. This printer may need a vendor driver.")
        val outputEndpoint = selectedEndpoint
          ?: throw IllegalStateException("No USB bulk-output endpoint was found. This printer may need a vendor driver.")
        if (!connection.claimInterface(usbInterface, true)) throw IllegalStateException("Could not claim the USB printer interface.")
        try {
          var offset = 0
          while (offset < bytes.size) {
            val length = minOf(16384, bytes.size - offset)
            val chunk = bytes.copyOfRange(offset, offset + length)
            val sent = connection.bulkTransfer(outputEndpoint, chunk, chunk.size, 5000)
            if (sent <= 0) throw IllegalStateException("USB printer stopped accepting data.")
            offset += sent
          }
        } finally { connection.releaseInterface(usbInterface) }
      } finally { connection.close() }
      mapOf("printed" to true, "transport" to "usb")
    }

    AsyncFunction("printNetwork") { host: String, port: Int, dataBase64: String ->
      require(port == 9100) { "For safety, raw LAN printing is restricted to TCP port 9100." }
      val parts = host.split(".").mapNotNull { it.toIntOrNull() }
      require(parts.size == 4 && parts.all { it in 0..255 }) { "Enter the printer's private IPv4 address." }
      val privateAddress = parts[0] == 10 ||
        (parts[0] == 172 && parts[1] in 16..31) ||
        (parts[0] == 192 && parts[1] == 168) ||
        (parts[0] == 169 && parts[1] == 254)
      require(privateAddress) { "Only private local-network printer addresses are allowed." }
      val bytes = Base64.decode(dataBase64, Base64.DEFAULT)
      require(bytes.isNotEmpty() && bytes.size <= 262144) { "Print data must be between 1 byte and 256 KB." }
      Socket().use { socket ->
        socket.connect(InetSocketAddress(host, port), 5000)
        socket.soTimeout = 5000
        socket.getOutputStream().use { stream -> stream.write(bytes); stream.flush() }
      }
      mapOf("printed" to true, "transport" to "lan-9100")
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
  fun ecdsaDerToP1363(signature: ByteArray): ByteArray {
    var offset = 0
    require(signature.size > 8 && signature[offset++].toInt() == 0x30) { "Invalid ECDSA DER signature." }
    val sequenceLength = readLength(signature, offset)
    offset = sequenceLength.second
    require(offset + sequenceLength.first == signature.size) { "Invalid ECDSA DER sequence length." }
    fun readInteger(): ByteArray {
      require(offset < signature.size && signature[offset++].toInt() == 0x02) { "Invalid ECDSA DER integer." }
      val length = readLength(signature, offset)
      offset = length.second
      require(length.first > 0 && offset + length.first <= signature.size) { "Invalid ECDSA DER integer length." }
      var value = signature.copyOfRange(offset, offset + length.first)
      offset += length.first
      while (value.size > 32 && value[0] == 0.toByte()) value = value.copyOfRange(1, value.size)
      require(value.size <= 32) { "ECDSA integer exceeds P-256 width." }
      return ByteArray(32 - value.size) + value
    }
    val r = readInteger()
    val s = readInteger()
    require(offset == signature.size) { "Unexpected trailing ECDSA signature bytes." }
    return r + s
  }
  private fun readLength(bytes: ByteArray, initialOffset: Int): Pair<Int, Int> {
    var offset = initialOffset
    require(offset < bytes.size) { "Missing DER length." }
    val first = bytes[offset++].toInt() and 0xFF
    if (first < 128) return Pair(first, offset)
    val count = first and 0x7F
    require(count in 1..4 && offset + count <= bytes.size) { "Invalid DER length." }
    var length = 0
    repeat(count) { length = length * 256 + (bytes[offset++].toInt() and 0xFF) }
    return Pair(length, offset)
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
