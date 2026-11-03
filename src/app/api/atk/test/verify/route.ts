import { authorizeAtkOrganization, getAtkRequestContext, positiveInteger } from "@/lib/atk/server-auth";

function readableProviderMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.slice(0, 800);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "detail", "error", "description", "title"]) {
      if (record[key] !== undefined) {
        const message = readableProviderMessage(record[key], "");
        if (message) return message;
      }
    }
    try { return JSON.stringify(value).slice(0, 800); } catch { return fallback; }
  }
  return fallback;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const { supabase, user, authError } = await getAtkRequestContext(request);
  if (authError || !user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const nui = typeof body.nui === "string" ? body.nui : String(body.nui ?? "");
  const fiscalizationNumber = typeof body.fiscalizationNumber === "string" ? body.fiscalizationNumber.trim() : "";
  const branchId = positiveInteger(body.branchId);
  const posId = positiveInteger(body.posId);
  const applicationId = positiveInteger(body.applicationId);
  if (!organizationId || !/^\d{9}$/.test(nui) || !fiscalizationNumber || !branchId || !posId || !applicationId) {
    return Response.json({ error: "invalid_test_identifiers", detail: "Organization, 9-digit taxpayer NUI, test fiscalization number, branch ID, POS ID and Application ID are required." }, { status: 400 });
  }
  const authorization = await authorizeAtkOrganization(supabase, user.id, organizationId, nui);
  if (!authorization.ok) return Response.json({ error: "organization_not_authorized", detail: authorization.detail }, { status: authorization.status });

  try {
    const response = await fetch("https://fiskalizimi-test.atk-ks.org/ca/verify/" + encodeURIComponent(nui), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ fiscalization_no: fiscalizationNumber, pos_id: posId, branch_id: branchId, application_id: applicationId }),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    const text = await response.text();
    let result: Record<string, unknown> = {};
    try { result = JSON.parse(text) as Record<string, unknown>; } catch { /* handled below */ }
    if (!response.ok) {
      const detail = readableProviderMessage(result, readableProviderMessage(text, "ATK test verification was rejected."));
      return Response.json({ error: "atk_verification_rejected", detail, atkStatus: response.status }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const businessName = typeof result.business_name === "string" ? result.business_name : "";
    const verificationCode = typeof result.verification_code === "string" ? result.verification_code : "";
    if (!businessName || !verificationCode) return Response.json({ error: "atk_unexpected_response" }, { status: 502 });
    return Response.json({ businessName, verificationCode, environment: "TEST" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ error: timeout ? "atk_timeout" : "atk_unreachable", detail: timeout ? "ATK test service timed out." : "Could not reach ATK test service." }, { status: 502 });
  }
}
