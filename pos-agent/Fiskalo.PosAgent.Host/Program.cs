using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json.Serialization;
using Fiskalo.PosAgent.Core.Atk;
using Fiskalo.PosAgent.Core.Queue;
using Fiskalo.PosAgent.Core.Security;

const string AgentVersion = "0.1.0";
const string PairPath = "/api/v1/pair";
const string StatusPath = "/api/v1/status";
const string HealthPath = "/health";
const string CsrPath = "/api/v1/keys/csr";
const string QueuePath = "/api/v1/queue";
const string AtkVerifyPath = "/api/v1/atk/test/verify";
const string AtkSignCsrPath = "/api/v1/atk/test/sign-csr";

var allowedOrigins = (Environment.GetEnvironmentVariable("FISKALO_ALLOWED_ORIGINS")
    ?? "https://fiskalo.shqiptare.workers.dev")
    .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .ToHashSet(StringComparer.Ordinal);

var pairingCode = Base64Url(RandomNumberGenerator.GetBytes(32));
string? sessionToken = null;
var failedPairAttempts = 0;
var pairLockedUntil = DateTimeOffset.MinValue;
var dataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Fiskalo", "PosAgent");
var keyPath = Path.Combine(dataDirectory, "pos-signing-key.dpapi");
var queuePath = Path.Combine(dataDirectory, "fiscal-queue.bin");
var certificatePath = Path.Combine(dataDirectory, "atk-test-certificate.pem");
var keyStore = new WindowsDpapiEcdsaKeyStore();

Console.WriteLine("Fiskalo POS Agent " + AgentVersion);
Console.WriteLine("Local endpoint: http://127.0.0.1:17843");
Console.WriteLine("One-time pairing code (keep private): " + pairingCode);
Console.WriteLine("Allowed browser origins: " + string.Join(", ", allowedOrigins));

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 17843));
var app = builder.Build();

app.Use(async (context, next) =>
{
    if (context.Connection.RemoteIpAddress is not { } remote || !IPAddress.IsLoopback(remote))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }

    // Reject unexpected Host values to reduce DNS-rebinding exposure.
    var host = context.Request.Host;
    if (!host.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
        host.Port != 17843)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    var origin = context.Request.Headers["Origin"].ToString();
    if (!string.IsNullOrEmpty(origin) && !allowedOrigins.Contains(origin))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }

    if (context.Request.Method == HttpMethods.Options)
    {
        if (string.IsNullOrEmpty(origin) || !allowedOrigins.Contains(origin))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        context.Response.Headers["Access-Control-Allow-Origin"] = origin;
        context.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        context.Response.Headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
        if (context.Request.Headers.ContainsKey("Access-Control-Request-Private-Network"))
            context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
        context.Response.Headers["Vary"] = "Origin";
        context.Response.StatusCode = StatusCodes.Status204NoContent;
        return;
    }

    if (!string.IsNullOrEmpty(origin) && allowedOrigins.Contains(origin))
    {
        context.Response.Headers["Access-Control-Allow-Origin"] = origin;
        context.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        context.Response.Headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
        context.Response.Headers["Vary"] = "Origin";
    }

    await next();
});

app.MapGet(HealthPath, () => Results.Ok(new
{
    service = "fiskalo-pos-agent",
    version = AgentVersion,
    state = "running",
    fiscalizationEnabled = false
}));

app.MapPost(PairPath, (PairRequest request, HttpContext context) =>
{
    var origin = context.Request.Headers["Origin"].ToString();
    if (string.IsNullOrEmpty(origin) || !allowedOrigins.Contains(origin))
        return Results.StatusCode(StatusCodes.Status403Forbidden);

    if (DateTimeOffset.UtcNow < pairLockedUntil)
        return Results.StatusCode(StatusCodes.Status429TooManyRequests);

    if (sessionToken is not null)
        return Results.Conflict(new { error = "already_paired", message = "Agent is already paired. Restart it to create a new pairing session." });

    var supplied = Encoding.UTF8.GetBytes(request.PairingCode ?? "");
    var expected = Encoding.UTF8.GetBytes(pairingCode);
    var valid = supplied.Length == expected.Length &&
        CryptographicOperations.FixedTimeEquals(supplied, expected);

    if (!valid)
    {
        failedPairAttempts++;
        if (failedPairAttempts >= 5)
        {
            pairLockedUntil = DateTimeOffset.UtcNow.AddMinutes(5);
            failedPairAttempts = 0;
        }
        return Results.Unauthorized();
    }

    sessionToken = Base64Url(RandomNumberGenerator.GetBytes(32));
    pairingCode = ""; // One-time code cannot be reused after successful pairing.
    failedPairAttempts = 0;
    return Results.Ok(new PairResponse(sessionToken, AgentVersion));
});

app.MapGet(StatusPath, (HttpContext context) =>
{
    if (!HasValidSession(context, sessionToken))
        return Results.Unauthorized();

    return Results.Ok(new
    {
        service = "fiskalo-pos-agent",
        version = AgentVersion,
        paired = true,
        fiscalizationEnabled = false,
        capabilities = new[] { "health", "secure-local-pairing", "windows-dpapi-key-csr", "encrypted-queue-inspection" },
        windowsKeyStoreAvailable = OperatingSystem.IsWindows(),
        signingKeyInitialized = OperatingSystem.IsWindows() && File.Exists(keyPath),
        queueInitialized = OperatingSystem.IsWindows() && File.Exists(queuePath),
        nextStep = "ATK-test-certificate-onboarding-required"
    });
});

app.MapPost(CsrPath, (CsrRequest request, HttpContext context) => {
    if (!HasValidSession(context, sessionToken)) return Results.Unauthorized();
    if (!OperatingSystem.IsWindows()) return Results.Problem("Local signing-key storage currently requires Windows DPAPI.", statusCode: StatusCodes.Status501NotImplemented);
    if (request.BusinessNui == 0 || request.BranchId == 0 || request.PosId == 0 || string.IsNullOrWhiteSpace(request.BusinessName)) return Results.BadRequest(new { error = "business_name, business_nui, branch_id and pos_id are required" });
    try {
        Directory.CreateDirectory(dataDirectory);
        using var key = keyStore.LoadOrCreate(keyPath);
        var csr = AtkPki.CreateCsrPem(key, request.BusinessName, request.BusinessNui, request.BranchId, request.PosId);
        return Results.Ok(new { csrPem = csr, keyAlgorithm = "ECDSA-P256", privateKeyExported = false, storage = "Windows DPAPI CurrentUser", certificateStatus = "not-issued", fiscalizationEnabled = false });
    } catch (Exception ex) when (ex is CryptographicException or IOException or UnauthorizedAccessException) {
        return Results.Problem("Unable to create or load the locally protected signing key.", statusCode: StatusCodes.Status500InternalServerError);
    }
});

app.MapGet(QueuePath, async (HttpContext context, CancellationToken cancellationToken) => {
    if (!HasValidSession(context, sessionToken)) return Results.Unauthorized();
    if (!OperatingSystem.IsWindows()) return Results.Problem("Local encrypted queue currently requires Windows DPAPI.", statusCode: StatusCodes.Status501NotImplemented);
    try {
        var store = new FiscalQueueStore(queuePath, new WindowsDpapiFiscalQueueProtector());
        var items = await store.GetAllAsync(cancellationToken);
        return Results.Ok(new { count = items.Count, items = items.Select(item => new { item.IdempotencyKey, item.DocumentType, item.CreatedAtUtc, item.RecoveryDeadlineUtc, item.NextAttemptAtUtc, status = item.Status.ToString(), item.AttemptCount, item.LastError, item.AtkTransactionId }) });
    } catch (Exception ex) when (ex is CryptographicException or IOException or UnauthorizedAccessException) {
        return Results.Problem("Unable to read the protected local fiscal queue.", statusCode: StatusCodes.Status500InternalServerError);
    }
});

app.MapPost(AtkVerifyPath, async (AtkVerifyRequest request, HttpContext context, CancellationToken cancellationToken) => {
    if (!HasValidSession(context, sessionToken)) return Results.Unauthorized();
    if (request.Nui == 0 || request.PosId == 0 || request.BranchId == 0 || request.ApplicationId == 0 || string.IsNullOrWhiteSpace(request.FiscalizationNumber)) return Results.BadRequest(new { error = "NUI, fiscalization number, POS ID, branch ID and ATK application ID are required." });
    try {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        var result = await new AtkTestClient(http).VerifyPosAsync(request.Nui, request.FiscalizationNumber, request.PosId, request.BranchId, request.ApplicationId, cancellationToken);
        return Results.Ok(new { businessName = result.BusinessName, verificationCode = result.VerificationCode, environment = "ATK TEST", productionEnabled = false });
    } catch (AtkApiException ex) {
        return Results.Problem("ATK test verification failed (HTTP " + (int)ex.StatusCode + "). Check the supplied test identifiers and ATK test-service availability.", statusCode: StatusCodes.Status502BadGateway);
    } catch (HttpRequestException) {
        return Results.Problem("Could not reach the ATK test service.", statusCode: StatusCodes.Status502BadGateway);
    } catch (TaskCanceledException) {
        return Results.Problem("ATK test request timed out.", statusCode: StatusCodes.Status504GatewayTimeout);
    }
});

app.MapPost(AtkSignCsrPath, async (AtkSignCsrRequest request, HttpContext context, CancellationToken cancellationToken) => {
    if (!HasValidSession(context, sessionToken)) return Results.Unauthorized();
    if (!OperatingSystem.IsWindows()) return Results.Problem("Local signing-key storage currently requires Windows DPAPI.", statusCode: StatusCodes.Status501NotImplemented);
    if (request.BusinessNui == 0 || request.BranchId == 0 || request.PosId == 0 || request.ApplicationId == 0 || string.IsNullOrWhiteSpace(request.BusinessName) || string.IsNullOrWhiteSpace(request.VerificationCode)) return Results.BadRequest(new { error = "Business identity, ATK verification code and POS identifiers are required." });
    try {
        Directory.CreateDirectory(dataDirectory);
        using var key = keyStore.LoadOrCreate(keyPath);
        var csr = AtkPki.CreateCsrPem(key, request.BusinessName, request.BusinessNui, request.BranchId, request.PosId);
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        var response = await new AtkTestClient(http).SignCsrAsync(request.BusinessName, request.BusinessNui, request.BranchId, request.VerificationCode, request.PosId, request.ApplicationId, csr, cancellationToken);
        using var certificate = ParseCertificate(response.SignedCertificate);
        using var certificateKey = certificate.GetECDsaPublicKey();
        if (certificateKey is null || !SamePublicKey(key, certificateKey)) return Results.Problem("ATK returned a certificate whose public key does not match this POS private key. It was not saved.", statusCode: StatusCodes.Status502BadGateway);
        var pem = certificate.ExportCertificatePem();
        await File.WriteAllTextAsync(certificatePath, pem, cancellationToken);
        return Results.Ok(new { certificateStatus = "ATK_TEST_CERTIFICATE_RECEIVED_AND_KEY_MATCHED", subject = certificate.Subject, thumbprint = certificate.Thumbprint, environment = "ATK TEST", privateKeyExported = false, productionEnabled = false });
    } catch (AtkApiException ex) {
        return Results.Problem("ATK test certificate request failed (HTTP " + (int)ex.StatusCode + "). Check the verification code and test identifiers.", statusCode: StatusCodes.Status502BadGateway);
    } catch (HttpRequestException) {
        return Results.Problem("Could not reach the ATK test service.", statusCode: StatusCodes.Status502BadGateway);
    } catch (TaskCanceledException) {
        return Results.Problem("ATK certificate request timed out.", statusCode: StatusCodes.Status504GatewayTimeout);
    } catch (CryptographicException) {
        return Results.Problem("ATK response was not a valid certificate matching the locally protected POS key.", statusCode: StatusCodes.Status502BadGateway);
    }
});
static X509Certificate2 ParseCertificate(string certificate)
{
    if (string.IsNullOrWhiteSpace(certificate))
        throw new CryptographicException("ATK returned an empty certificate.");
    if (certificate.Contains("-----BEGIN CERTIFICATE-----", StringComparison.Ordinal))
        return X509Certificate2.CreateFromPem(certificate);
    try
    {
        return new X509Certificate2(Convert.FromBase64String(certificate));
    }
    catch (FormatException ex)
    {
        throw new CryptographicException("ATK certificate encoding is not PEM or Base64 DER.", ex);
    }
}

static bool SamePublicKey(ECDsa first, ECDsa second)
{
    var a = first.ExportParameters(false);
    var b = second.ExportParameters(false);
    return a.Curve.Oid.Value == b.Curve.Oid.Value &&
        a.Q.X is not null && a.Q.Y is not null &&
        b.Q.X is not null && b.Q.Y is not null &&
        CryptographicOperations.FixedTimeEquals(a.Q.X, b.Q.X) &&
        CryptographicOperations.FixedTimeEquals(a.Q.Y, b.Q.Y);
}


app.Run();

static bool HasValidSession(HttpContext context, string? expectedToken)
{
    if (string.IsNullOrEmpty(expectedToken)) return false;
    var header = context.Request.Headers["Authorization"].ToString();
    if (!header.StartsWith("Bearer ", StringComparison.Ordinal)) return false;

    var supplied = Encoding.UTF8.GetBytes(header[7..].Trim());
    var expected = Encoding.UTF8.GetBytes(expectedToken);
    return supplied.Length == expected.Length &&
        CryptographicOperations.FixedTimeEquals(supplied, expected);
}

static string Base64Url(byte[] bytes) =>
    Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

internal sealed record PairRequest(
    [property: JsonPropertyName("pairingCode")] string? PairingCode);

internal sealed record PairResponse(
    [property: JsonPropertyName("sessionToken")] string SessionToken,
    [property: JsonPropertyName("agentVersion")] string AgentVersion);


internal sealed record CsrRequest(
    [property: JsonPropertyName("businessName")] string BusinessName,
    [property: JsonPropertyName("businessNui")] ulong BusinessNui,
    [property: JsonPropertyName("branchId")] ulong BranchId,
    [property: JsonPropertyName("posId")] ulong PosId);

internal sealed record AtkVerifyRequest(
    [property: JsonPropertyName("nui")] ulong Nui,
    [property: JsonPropertyName("fiscalizationNumber")] string FiscalizationNumber,
    [property: JsonPropertyName("posId")] ulong PosId,
    [property: JsonPropertyName("branchId")] ulong BranchId,
    [property: JsonPropertyName("applicationId")] ulong ApplicationId);

internal sealed record AtkSignCsrRequest(
    [property: JsonPropertyName("businessName")] string BusinessName,
    [property: JsonPropertyName("businessNui")] ulong BusinessNui,
    [property: JsonPropertyName("branchId")] ulong BranchId,
    [property: JsonPropertyName("verificationCode")] string VerificationCode,
    [property: JsonPropertyName("posId")] ulong PosId,
    [property: JsonPropertyName("applicationId")] ulong ApplicationId);
