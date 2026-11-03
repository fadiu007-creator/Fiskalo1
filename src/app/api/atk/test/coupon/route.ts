import { createHash } from "node:crypto";
import { authorizeAtkOrganization, getAtkRequestContext, positiveInteger } from "@/lib/atk/server-auth";

export const runtime = "nodejs";

function isBase64(value: string): boolean {
  if (!value || value.length > 2_000_000 || value.length % 4 !== 0) return false;
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }

  const { supabase, user, authError } = await getAtkRequestContext(request);
  if (authError || !user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const nui = typeof body.nui === "string" ? body.nui : "";
  const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
  const posInstallationId = typeof body.posInstallationId === "string" ? body.posInstallationId : "";
  const details = typeof body.details === "string" ? body.details : "";
  const signature = typeof body.signature === "string" ? body.signature : "";
  const couponId = positiveInteger(body.couponId);
  const totalCents = positiveInteger(body.totalCents);
  if (!organizationId || !invoiceId || !posInstallationId || !/^\d{9}$/.test(nui) ||
      !couponId || totalCents === null || !isBase64(details) || !isBase64(signature)) {
    return Response.json({ error: "invalid_coupon_request", detail: "Organization, invoice, TEST POS, NUI, coupon ID, total and signed Protobuf details are required." }, { status: 400 });
  }

  const authorization = await authorizeAtkOrganization(supabase, user.id, organizationId, nui);
  if (!authorization.ok) return Response.json({ error: "organization_not_authorized", detail: authorization.detail }, { status: authorization.status });

  const [{ data: invoice, error: invoiceError }, { data: pos, error: posError }] = await Promise.all([
    supabase.from("fiskalo_invoices").select("id,organization_id,status,total,invoice_number").eq("id", invoiceId).eq("organization_id", organizationId).single(),
    supabase.from("fiskalo_atk_pos_installations").select("id,organization_id,atk_branch_id,pos_id,environment").eq("id", posInstallationId).eq("organization_id", organizationId).single(),
  ]);
  if (invoiceError || !invoice || invoice.status !== "issued") {
    return Response.json({ error: "invoice_not_eligible", detail: "Only an issued Fiskalo invoice can be submitted as an ATK TEST sale." }, { status: 409 });
  }
  if (posError || !pos || pos.environment !== "test") {
    return Response.json({ error: "test_pos_not_ready", detail: "The selected POS installation is not configured for the ATK TEST environment." }, { status: 409 });
  }
  if (Math.round(Number(invoice.total) * 100) !== totalCents) {
    return Response.json({ error: "invoice_total_mismatch", detail: "The signed coupon total does not match the issued Fiskalo invoice." }, { status: 409 });
  }

  const { data: existing } = await supabase.from("fiskalo_atk_fiscal_documents")
    .select("id,status,atk_transaction_id").eq("organization_id", organizationId).eq("source_invoice_id", invoiceId).maybeSingle();
  if (existing) {
    return Response.json({ error: "invoice_already_submitted", fiscalDocumentId: existing.id, status: existing.status, transactionId: existing.atk_transaction_id }, { status: 409 });
  }

  const payloadHash = createHash("sha256").update(details, "utf8").digest("hex");
  const { data: fiscalDocument, error: insertError } = await supabase.from("fiskalo_atk_fiscal_documents").insert({
    organization_id: organizationId,
    pos_installation_id: posInstallationId,
    source_invoice_id: invoiceId,
    coupon_id: couponId,
    document_type: "sale",
    status: "queued",
    occurred_at: new Date().toISOString(),
    total: Number(invoice.total),
    pos_coupon_base64: details,
    signature_base64: signature,
    payload_sha256: payloadHash,
    created_by: user.id,
  }).select("id").single();

  if (insertError || !fiscalDocument) {
    return Response.json({ error: "fiscal_document_save_failed", detail: insertError?.message ?? "Could not save the ATK TEST document." }, { status: 500 });
  }

  await supabase.from("fiskalo_atk_fiscal_events").insert({
    organization_id: organizationId, fiscal_document_id: fiscalDocument.id,
    event_type: "submission_started", details: { environment: "TEST", invoiceNumber: invoice.invoice_number },
  });
  await supabase.from("fiskalo_atk_fiscal_documents").update({
    status: "submitted", submission_attempts: 1, last_submitted_at: new Date().toISOString(),
  }).eq("id", fiscalDocument.id).eq("organization_id", organizationId);

  try {
    const response = await fetch("https://fiskalizimi-test.atk-ks.org/pos/coupon", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ details, signature }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
    const raw = await response.text();
    let result: Record<string, unknown> = {};
    try { result = JSON.parse(raw) as Record<string, unknown>; } catch { /* checked below */ }
    if (!response.ok) {
      const detail = String(result.message ?? result.error ?? result.detail ?? raw ?? "ATK rejected the TEST coupon.").slice(0, 1200);
      await supabase.from("fiskalo_atk_fiscal_documents").update({ status: "rejected", last_error: detail, atk_response: result }).eq("id", fiscalDocument.id);
      await supabase.from("fiskalo_atk_fiscal_events").insert({ organization_id: organizationId, fiscal_document_id: fiscalDocument.id, event_type: "rejected", details: { httpStatus: response.status, detail } });
      return Response.json({ error: "atk_coupon_rejected", detail, atkStatus: response.status, fiscalDocumentId: fiscalDocument.id }, { status: 502 });
    }
    const transactionId = positiveInteger(result.transaction_id);
    if (!transactionId) {
      const detail = "ATK returned a successful HTTP status but no valid transaction_id. The coupon is not marked accepted.";
      await supabase.from("fiskalo_atk_fiscal_documents").update({ status: "rejected", last_error: detail, atk_response: result }).eq("id", fiscalDocument.id);
      await supabase.from("fiskalo_atk_fiscal_events").insert({ organization_id: organizationId, fiscal_document_id: fiscalDocument.id, event_type: "rejected", details: { detail } });
      return Response.json({ error: "atk_unexpected_response", detail, fiscalDocumentId: fiscalDocument.id }, { status: 502 });
    }
    await supabase.from("fiskalo_atk_fiscal_documents").update({
      status: "accepted", atk_transaction_id: transactionId, atk_response: result,
      accepted_at: new Date().toISOString(), last_error: null,
    }).eq("id", fiscalDocument.id).eq("organization_id", organizationId);
    await supabase.from("fiskalo_atk_fiscal_events").insert({
      organization_id: organizationId, fiscal_document_id: fiscalDocument.id,
      event_type: "accepted", details: { transactionId, environment: "TEST" },
    });
    return Response.json({ accepted: true, environment: "TEST", transactionId, fiscalDocumentId: fiscalDocument.id, message: result.message ?? "ATK accepted the TEST coupon." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const detail = error instanceof Error && error.name === "TimeoutError" ? "ATK TEST request timed out; check ATK before retrying to avoid a duplicate." : "Could not reach ATK TEST. Check the fiscal document before retrying.";
    await supabase.from("fiskalo_atk_fiscal_documents").update({ status: "offline_pending", last_error: detail }).eq("id", fiscalDocument.id);
    await supabase.from("fiskalo_atk_fiscal_events").insert({ organization_id: organizationId, fiscal_document_id: fiscalDocument.id, event_type: "offline_saved", details: { detail } });
    return Response.json({ error: "atk_unreachable", detail, fiscalDocumentId: fiscalDocument.id }, { status: 502 });
  }
}
