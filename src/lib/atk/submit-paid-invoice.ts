"use client";

import { encodeAtkBase64, encodeAtkPosCoupon } from "@/lib/atk/protobuf";
import { hasBrowserPosCertificate, signAtkBase64Payload } from "@/lib/atk/browser-key-vault";
import type { createClient } from "@/lib/supabase/client";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

function createCouponVerificationNo(): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return Array.from(random, (byte) => alphabet[byte % alphabet.length]).join("");
}

function errorText(value: unknown, fallback: string): string {
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    for (const key of ["detail", "message", "error"]) if (typeof row[key] === "string") return String(row[key]);
  }
  return fallback;
}

/**
 * Sends one paid cash invoice to ATK TEST using the certificate installed on this POS browser.
 * The server enforces one fiscal document per invoice; this client helper never retries an existing document.
 */
export async function submitPaidInvoiceToATK(
  supabase: SupabaseBrowserClient,
  organizationId: string,
  invoiceId: string,
): Promise<{ status: string; transactionId?: string; message: string }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sesioni ka skaduar. Hyr përsëri.");

  const { data: invoice, error: invoiceError } = await supabase
    .from("fiskalo_invoices")
    .select("id,organization_id,status,total,invoice_number,payment_status,payment_method,subtotal,vat_total")
    .eq("id", invoiceId).eq("organization_id", organizationId).single();
  if (invoiceError || !invoice) throw new Error("Fatura nuk u gjet për fiskalizim.");
  if (invoice.status !== "issued" || invoice.payment_status !== "paid") {
    return { status: "not_due", message: "Fatura nuk është ende plotësisht e paguar." };
  }
  if (invoice.payment_method !== "cash") {
    return { status: "payment_method_not_configured", message: "Dërgimi automatik në ATK për këtë mënyrë pagese nuk është konfiguruar ende. MVP aktualisht mbështet para në dorë." };
  }

  const { data: existing, error: existingError } = await supabase.from("fiskalo_atk_fiscal_documents")
    .select("id,status,atk_transaction_id").eq("organization_id", organizationId)
    .eq("source_invoice_id", invoiceId).maybeSingle();
  if (existingError) throw new Error("Nuk u kontrollua statusi ekzistues i ATK-së: " + existingError.message);
  if (existing) {
    return { status: existing.status, transactionId: existing.atk_transaction_id ? String(existing.atk_transaction_id) : undefined,
      message: existing.status === "accepted" ? "Fatura është pranuar tashmë nga ATK." : "Kjo faturë tashmë ka një dërgesë ATK (" + existing.status + "). Nuk u krijua kupon i dytë." };
  }

  const [{ data: org, error: orgError }, { data: pos, error: posError }, { data: lines, error: linesError }] = await Promise.all([
    supabase.from("fiskalo_organizations").select("nui,municipality").eq("id", organizationId).single(),
    supabase.from("fiskalo_atk_pos_installations").select("id,atk_branch_id,pos_id,label,location,environment,status")
      .eq("organization_id", organizationId).eq("environment", "test").eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("fiskalo_invoice_items").select("id,product_id,description,quantity,unit_price,line_subtotal,line_vat,vat_rate")
      .eq("invoice_id", invoiceId),
  ]);
  if (orgError || !org || !/^\d{9}$/.test(String(org.nui))) throw new Error("NUI i biznesit mungon ose nuk është valid.");
  if (posError || !pos) throw new Error("Nuk ka POS TEST aktiv. Përfundo konfigurimin dhe certifikimin një herë.");
  if (linesError || !lines?.length) throw new Error("Fatura nuk ka artikuj të lexueshëm.");

  const { data: verification, error: verificationError } = await supabase.from("fiskalo_atk_pos_verifications")
    .select("nui,atk_branch_id,pos_id,application_id,verified_at")
    .eq("organization_id", organizationId).eq("pos_installation_id", pos.id).maybeSingle();
  if (verificationError || !verification || verification.nui !== org.nui ||
      Number(verification.atk_branch_id) !== Number(pos.atk_branch_id) ||
      Number(verification.pos_id) !== Number(pos.pos_id)) {
    throw new Error("POS-i nuk ka verifikim ATK TEST të ruajtur për këtë biznes. Konfigurimi fillestar duhet përfunduar një herë.");
  }

  const keyId = organizationId + ":" + pos.id;
  if (!await hasBrowserPosCertificate(keyId)) {
    throw new Error("Certifikata e POS-it nuk gjendet në këtë pajisje/shfletues. Hyr nga pajisja ku është instaluar certifikata ose instaloje një herë.");
  }

  const productIds = Array.from(new Set(lines.map((line) => line.product_id).filter((id): id is string => Boolean(id)));
  const { data: products, error: productsError } = productIds.length
    ? await supabase.from("fiskalo_products").select("id,atk_unit_code,atk_tax_code,atk_item_category_code")
      .eq("organization_id", organizationId).in("id", productIds)
    : { data: [], error: null };
  if (productsError) throw new Error("Kodet ATK të produkteve nuk u lexuan: " + productsError.message);
  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const itemRows = lines.map((line) => {
    const product = line.product_id ? productMap.get(line.product_id) : null;
    const unit = product?.atk_unit_code?.trim() ?? "";
    const tax = product?.atk_tax_code?.trim() ?? "";
    const itemType = product?.atk_item_category_code?.trim() ?? "";
    if (!unit || !/^[A-Z]$/.test(tax) || !itemType) {
      throw new Error("Plotëso kodet ATK (njësia, TVSH dhe kategoria) te produktet para shitjes së parë.");
    }
    return { line, unit, tax, itemType };
  });

  const { data: couponId, error: couponError } = await supabase.rpc("fiskalo_next_atk_coupon_id");
  if (couponError || !couponId) throw new Error("Nuk u caktua numri unik i kuponit ATK.");
  const totalCents = Math.round(Number(invoice.total) * 100);
  const items = itemRows.map(({ line, unit, tax, itemType }) => ({
    name: line.description, unitPriceEuro: Number(line.unit_price), unit, quantity: Number(line.quantity),
    lineTotalCents: Math.round((Number(line.line_subtotal) + Number(line.line_vat)) * 100),
    taxRate: tax, itemType,
  }));
  const grouped = new Map<string, { totalForTaxCents: number; totalTaxCents: number }>();
  itemRows.forEach(({ line, tax }) => {
    const current = grouped.get(tax) || { totalForTaxCents: 0, totalTaxCents: 0 };
    current.totalForTaxCents += Math.round(Number(line.line_subtotal) * 100);
    current.totalTaxCents += Math.round(Number(line.line_vat) * 100);
    grouped.set(tax, current);
  });
  const payload = encodeAtkPosCoupon({
    businessId: String(org.nui), couponId, branchId: pos.atk_branch_id,
    location: pos.location || org.municipality || "",
    operatorId: auth.user.id, posId: pos.pos_id, applicationId: Number(verification.application_id),
    verificationNo: createCouponVerificationNo(), type: 1, unixTime: Math.floor(Date.now() / 1000),
    items, payments: [{ type: 1, amountCents: totalCents }], totalCents,
    taxGroups: Array.from(grouped.entries()).map(([taxRate, values]) => ({ taxRate, ...values })),
    totalTaxCents: Math.round(Number(invoice.vat_total) * 100),
    totalNoTaxCents: Math.round(Number(invoice.subtotal) * 100),
  });
  const details = encodeAtkBase64(payload);
  const signature = await signAtkBase64Payload(keyId, details);
  const response = await fetch("/api/atk/test/coupon", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId, nui: String(org.nui), invoiceId, posInstallationId: pos.id,
      couponId: String(couponId), applicationId: Number(verification.application_id), totalCents, details, signature }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(result, "Dërgimi i faturës në ATK dështoi. Kontrollo statusin para çdo veprimi tjetër."));
  return { status: "accepted", transactionId: String(result.transactionId), message: "Fatura u dërgua dhe u pranua nga ATK TEST." };
}
