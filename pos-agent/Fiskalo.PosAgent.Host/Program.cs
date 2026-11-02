using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;

const string AgentVersion = "0.1.0";
const string PairPath = "/api/v1/pair";
const string StatusPath = "/api/v1/status";
const string HealthPath = "/health";

var allowedOrigins = (Environment.GetEnvironmentVariable("FISKALO_ALLOWED_ORIGINS")
    ?? "https://fiskalo.shqiptare.workers.dev")
    .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .ToHashSet(StringComparer.Ordinal);

var pairingCode = Base64Url(RandomNumberGenerator.GetBytes(32));
string? sessionToken = null;
var failedPairAttempts = 0;
var pairLockedUntil = DateTimeOffset.MinValue;

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
        capabilities = new[] { "health", "secure-local-pairing" },
        nextStep = "host-integration-and-certificate-onboarding-pending"
    });
});

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
