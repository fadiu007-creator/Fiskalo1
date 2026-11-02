import { authorizeAtkOrganization, getAtkRequestContext, positiveInteger } from "@/lib/atk/server-auth";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const { supabase, user, authError } = await getAtkRequestContext(request);
  if (authError || !user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const nui = typeof body.nui === "string" ? body.nui : String(body.nui ?? "");
  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
  const verificationCode = typeof body.verificationCode === "string" ? body.verificationCode.trim() : "";
  const csrPem = typeof body.csrPem === "string" ? body.csrPem.trim() : "";
  const branchId = positiveInteger(body.branchId);
  const posId = positiveInteger(body.posId);
  const applicationId = positiveInteger(body.applicationId);
  if (!organizationId || !/^\\d{9}$/.test(nui) || !businessName || !verificationCode ||
      !csrPem.startsWith("-----BEGIN CERTIFICATE REQUEST-----") || !branchId || !posId || !applicationId) {
    return Response.json({ error: "invalid_certificate_request", detail: "Verified business identity, NUI, verification code, CSR, branch ID, POS ID and Application ID are required." }, { status: 400 });
  }
  const authorization = await authorizeAtkOrganization(supabase, user.id, organizationId, nui);
  if (!authorization.ok) return Response.json({ error: "organization_not_authorized", detail: authorization.detail }, { status: authorization.status });
  if (businessName !== authorization.organization.legal_name) {
    return Response.json({ error: "business_name_mismatch", detail: "Business name must match the registered Fiskalo organization name." }, { status: 400 });
  }

  try {
    const response = await fetch("https://fiskalizimi-test.atk-ks.org/ca/signcsr", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        business_name: businessName, business_id: Number(nui), branch_id: branchId,
        verification_code: verificationCode, pos_id: posId, application_id: applicationId, csr: csrPem,
      }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
    const text = await response.text();
    let result: Record<string, unknown> = {};
    try { result = JSON.parse(text) as Record<string, unknown>; } catch { /* handled below */ }
    if (!response.ok) {
      const detail = String(result.message ?? result.error ?? result.detail ?? "ATK rejected the CSR request.").slice(0, 800);
      return Response.json({ error: "atk_certificate_rejected", detail, atkStatus: response.status }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const signedCertificate = typeof result.signed_certificate === "string" ? result.signed_certificate : "";
    if (!signedCertificate) return Response.json({ error: "atk_unexpected_certificate_response" }, { status: 502 });
    return Response.json({ signedCertificate, environment: "TEST" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ error: timeout ? "atk_timeout" : "atk_unreachable", detail: timeout ? "ATK test certificate request timed out." : "Could not reach ATK test service." }, { status: 502 });
  }
}
