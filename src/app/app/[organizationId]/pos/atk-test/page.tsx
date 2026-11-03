"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { encodeAtkBase64, encodeAtkPosCoupon } from "@/lib/atk/protobuf";
import { hasBrowserPosCertificate, signAtkBase64Payload } from "@/lib/atk/browser-key-vault";
import { ArrowLeft, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";

type Invoice = { id: string; invoice_number: string | null; issue_date: string; status: string; payment_status: string; payment_method: string; subtotal: number; vat_total: number; total: number };
type Line = { id: string; product_id: string | null; description: string; quantity: number; unit_price: number; line_subtotal: number; line_vat: number };
type Pos = { id: string; atk_branch_id: number; pos_id: number; label: string; location: string | null; environment: string };
type Mapping = { unit: string; tax: string; itemType: string };
type FiscalDoc = { id: string; document_type: string; status: string; coupon_id: number; total: number; atk_transaction_id: number | null; last_error: string | null; created_at: string; source_invoice_id: string | null };

const field: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 11px", color: "var(--ink)", background: "white" };
const panel: React.CSSProperties = { background: "white", border: "1px solid var(--line)", borderRadius: 12, padding: 16 };
const button: React.CSSProperties = { border: 0, borderRadius: 8, padding: "11px 15px", background: "var(--brand)", color: "white", fontWeight: 750, cursor: "pointer" };

export default function AtkTestPosPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const supabase = useMemo(() => createClient(), []);
  const [nui, setNui] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [fiscalizationNumber, setFiscalizationNumber] = useState("");
  const [applicationId, setApplicationId] = useState("929645146946");
  const [positions, setPositions] = useState<Pos[]>([]);
  const [posId, setPosId] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [documents, setDocuments] = useState<FiscalDoc[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const selectedPos = positions.find((p) => p.id === posId);
  const selectedInvoice = invoices.find((i) => i.id === invoiceId);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [orgResult, profileResult, posResult, invoiceResult, documentResult] = await Promise.all([
      supabase.from("fiskalo_organizations").select("nui,municipality").eq("id", organizationId).single(),
      supabase.from("fiskalo_atk_taxpayer_profiles").select("fiscalization_number").eq("organization_id", organizationId).maybeSingle(),
      supabase.from("fiskalo_atk_pos_installations").select("id,atk_branch_id,pos_id,label,location,environment").eq("organization_id", organizationId).eq("environment", "test").order("created_at", { ascending: false }),
      supabase.from("fiskalo_invoices").select("id,invoice_number,issue_date,status,payment_status,payment_method,subtotal,vat_total,total").eq("organization_id", organizationId).eq("status", "issued").eq("payment_status", "paid").eq("payment_method", "cash").order("issued_at", { ascending: false }).limit(50),
      supabase.from("fiskalo_atk_fiscal_documents").select("id,document_type,status,coupon_id,total,atk_transaction_id,last_error,created_at,source_invoice_id").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(20),
    ]);
    if (orgResult.error || !orgResult.data) setError("Nuk u lexuan të dhënat e biznesit.");
    else { setNui(String(orgResult.data.nui)); setMunicipality(orgResult.data.municipality || ""); }
    setFiscalizationNumber(profileResult.data?.fiscalization_number || "");
    setPositions((posResult.data || []) as Pos[]);
    setInvoices((invoiceResult.data || []) as Invoice[]);
    setDocuments((documentResult.data || []) as FiscalDoc[]);
    if (posResult.data?.length) setPosId((current) => current || posResult.data[0].id);
    setLoading(false);
  }, [organizationId, supabase]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!invoiceId) { setLines([]); setMappings({}); return; }
    let cancelled = false;
    void (async () => {
      const { data, error: lineError } = await supabase.from("fiskalo_invoice_items")
        .select("id,product_id,description,quantity,unit_price,line_subtotal,line_vat")
        .eq("invoice_id", invoiceId);
      if (cancelled) return;
      if (lineError) { setError("Nuk u lexuan artikujt e faturës."); return; }
      const rows = (data || []) as Line[];
      setLines(rows);
      const productIds = Array.from(new Set(rows.map((line) => line.product_id).filter((id): id is string => Boolean(id))));
      const productResult = productIds.length
        ? await supabase.from("fiskalo_products").select("id,atk_unit_code,atk_tax_code,atk_item_category_code").eq("organization_id", organizationId).in("id", productIds)
        : { data: [], error: null };
      const saved = new Map<string, { id: string; atk_unit_code: string | null; atk_tax_code: string | null; atk_item_category_code: string | null }>(((productResult.data || []) as Array<{ id: string; atk_unit_code: string | null; atk_tax_code: string | null; atk_item_category_code: string | null }>).map((product) => [product.id, product] as const));
      setMappings(Object.fromEntries(rows.map((line) => {
        const product = line.product_id ? saved.get(line.product_id) : null;
        return [line.id, { unit: product?.atk_unit_code || "", tax: product?.atk_tax_code || "", itemType: product?.atk_item_category_code || "" }];
      })));
    })();
    return () => { cancelled = true; };
  }, [invoiceId, supabase]);

  function setMapping(id: string, key: keyof Mapping, value: string) {
    setMappings((current) => ({ ...current, [id]: { ...(current[id] || { unit: "", tax: "", itemType: "" }), [key]: value } }));
  }

  async function submitTestSale() {
    setBusy(true); setError(""); setNotice(""); setResult(null);
    try {
      if (!selectedPos || !selectedInvoice) throw new Error("Zgjidh një POS TEST dhe një faturë të lëshuar e të paguar me para në dorë.");
      if (!/^\d{9}$/.test(nui) || !fiscalizationNumber.trim() || !/^\d+$/.test(applicationId) || Number(applicationId) <= 0) {
        throw new Error("NUI, numri i fiskalizimit dhe Application ID duhet të jenë të plotësuara.");
      }
      if (!lines.length) throw new Error("Fatura nuk ka artikuj.");
      for (const line of lines) {
        const m = mappings[line.id];
        if (!m?.unit.trim() || !/^[A-Z]$/.test(m.tax.trim()) || !m.itemType.trim()) {
          throw new Error("Plotëso për çdo artikull kodin e njësisë, kodin e TVSH-së (një shkronjë sipas katalogut ATK) dhe kodin e kategorisë së artikullit.");
        }
      }
      const mappingWrites = lines.filter((line) => line.product_id).map((line) => {
        const m = mappings[line.id];
        return supabase.from("fiskalo_products").update({
          atk_unit_code: m.unit.trim(), atk_tax_code: m.tax.trim(), atk_item_category_code: m.itemType.trim(),
        }).eq("organization_id", organizationId).eq("id", line.product_id!);
      });
      const mappingResults = await Promise.all(mappingWrites);
      const failedMapping = mappingResults.find((write) => write.error);
      if (failedMapping?.error) { const detail = failedMapping.error as unknown as Record<string, unknown>; const reason = typeof detail.message === "string" ? detail.message : JSON.stringify(detail); throw new Error("Kodet u lexuan, por nuk u ruajtën te produktet: " + reason); }
      const keyId = organizationId + ":" + selectedPos.id;
      if (!await hasBrowserPosCertificate(keyId)) throw new Error("Nuk u gjet certifikata TEST për këtë POS në këtë shfletues. Hape lidhjen Regjistro / certifiko POS më sipër dhe përfundo të tre hapat në këtë profil të shfletuesit.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sesioni ka skaduar. Hyr përsëri.");

      const verifyResponse = await fetch("/api/atk/test/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, nui, fiscalizationNumber, branchId: selectedPos.atk_branch_id, posId: selectedPos.pos_id, applicationId: Number(applicationId) }),
      });
      const verification = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok) throw new Error(verification.detail || verification.error || "Verifikimi i POS-it në ATK TEST dështoi.");

      const { data: couponId, error: couponIdError } = await supabase.rpc("fiskalo_next_atk_coupon_id");
      if (couponIdError || !couponId) throw new Error("Nuk u caktua numri unik i kuponit ATK. Apliko migrimin 0024 dhe rifresko faqen.");

      const items = lines.map((line) => ({
        name: line.description,
        unitPriceEuro: Number(line.unit_price),
        unit: mappings[line.id].unit.trim(),
        quantity: Number(line.quantity),
        lineTotalCents: Math.round((Number(line.line_subtotal) + Number(line.line_vat)) * 100),
        taxRate: mappings[line.id].tax.trim(),
        itemType: mappings[line.id].itemType.trim(),
      }));
      const grouped = new Map<string, { totalForTaxCents: number; totalTaxCents: number }>();
      lines.forEach((line) => {
        const code = mappings[line.id].tax.trim();
        const current = grouped.get(code) || { totalForTaxCents: 0, totalTaxCents: 0 };
        current.totalForTaxCents += Math.round(Number(line.line_subtotal) * 100);
        current.totalTaxCents += Math.round(Number(line.line_vat) * 100);
        grouped.set(code, current);
      });
      const totalCents = Math.round(Number(selectedInvoice.total) * 100);
      const payload = encodeAtkPosCoupon({
        businessId: nui, couponId, branchId: selectedPos.atk_branch_id,
        location: location.trim() || selectedPos.location || municipality,
        operatorId: auth.user.id, posId: selectedPos.pos_id, applicationId: Number(applicationId),
        verificationNo: String(verification.verificationCode), type: 1,
        unixTime: Math.floor(Date.now() / 1000), items,
        payments: [{ type: 1, amountCents: totalCents }],
        totalCents, taxGroups: Array.from(grouped.entries()).map(([taxRate, values]) => ({ taxRate, ...values })),
        totalTaxCents: Math.round(Number(selectedInvoice.vat_total) * 100),
        totalNoTaxCents: Math.round(Number(selectedInvoice.subtotal) * 100),
      });
      const details = encodeAtkBase64(payload);
      const signature = await signAtkBase64Payload(keyId, details);
      const response = await fetch("/api/atk/test/coupon", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, nui, invoiceId, posInstallationId: selectedPos.id, couponId: String(couponId), applicationId: Number(applicationId), totalCents, details, signature }),
      });
      const submission = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(submission.detail || submission.error || "Dërgimi i kuponit në ATK TEST dështoi. Kontrollo statusin e dokumentit para se të provosh sërish.");
      setResult(submission);
      setNotice("ATK TEST e ka pranuar kuponin. Ky është rezultat testues, jo fiskalizim në prodhim.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dërgimi i kuponit testues dështoi.");
    } finally { setBusy(false); }
  }

  if (loading) return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>Duke ngarkuar POS TEST...</main>;

  return <main className="fiskalo-atk" style={{ maxWidth: 1000, margin: "0 auto", padding: "22px 16px 50px" }}>
    <header style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><Link href={`/app/${organizationId}/pos`} style={{ color: "var(--brand)", fontWeight: 750 }}><ArrowLeft size={15} /> Kthehu te arka</Link><Link href={`/app/${organizationId}/pos/setup`} style={{ color: "var(--brand)", fontWeight: 750 }}>Regjistro / certifiko POS →</Link></div>
      <h1 style={{ margin: "10px 0 4px", fontSize: 27 }}>Kuponët testues</h1>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>Ky ekran dërgon një shitje testuese të paguar me para në dorë nga një faturë e lëshuar në mjedisin TEST të ATK-së. Përdor vetëm artikuj dhe shuma testuese, jo shitje reale të klientëve. Nuk prek prodhimin.</p>
    </header>
    {error && <div role="alert" style={{ background: "#fff0ef", color: "#982d25", borderRadius: 9, padding: 12, marginBottom: 12 }}>{error}</div>}
    {notice && <div role="status" style={{ background: "#edf7f1", color: "#155c3c", borderRadius: 9, padding: 12, marginBottom: 12 }}>{notice}</div>}
    {result && <section style={{ ...panel, marginBottom: 14 }}><strong><CheckCircle2 size={17} /> Kuponi u pranua në ATK TEST</strong><p>Transaction ID: <strong>{String(result.transactionId)}</strong></p><small>Dokumenti Fiskalo: {String(result.fiscalDocumentId)}</small></section>}
    <section style={{ ...panel, display: "grid", gap: 12 }}>
      <div><strong><ShieldCheck size={17} /> 1. POS-i testues</strong><div style={{ color: "var(--muted)", fontSize: 12 }}>NUI: {nui || "—"} · Numri i fiskalizimit: {fiscalizationNumber || "Nuk është ruajtur"}</div></div>
      <label>POS TEST<select value={posId} onChange={(e) => setPosId(e.target.value)} style={field}><option value="">Zgjidh POS</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.label} · Njësia {p.atk_branch_id} · POS {p.pos_id}</option>)}</select></label>
      <label>Application ID<input value={applicationId} onChange={(e) => setApplicationId(e.target.value)} inputMode="numeric" style={field} /></label>
      <label>Lokacioni për kupon<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={selectedPos?.location || municipality || "Lokacioni i biznesit"} style={field} /></label>
      <div><strong>2. Zgjidh faturën</strong><select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} style={field}><option value="">Zgjidh faturë të paguar me para në dorë</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number || i.id} · {i.issue_date} · {Number(i.total).toFixed(2)} €</option>)}</select>{!invoices.length && <small style={{ color: "var(--muted)" }}>Nuk ka fatura të lëshuara dhe të paguara me para në dorë.</small>}</div>
    </section>
    {selectedInvoice && <section style={{ ...panel, marginTop: 12 }}>
      <strong>3. Kodet e artikujve sipas katalogut ATK</strong>
      <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>Këto kode nuk hamendësohen nga përqindja e TVSH-së. Vendosi sipas katalogut zyrtar ATK. Për produktet e ruajtura, kodet ruhen në kartelën e produktit dhe plotësohen automatikisht në testet e ardhshme.</p>
      <div style={{ display: "grid", gap: 12 }}>{lines.map((line) => <div key={line.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <strong>{line.description}</strong><small style={{ display: "block", color: "var(--muted)" }}>{line.quantity} × {Number(line.unit_price).toFixed(2)} € · Neto {Number(line.line_subtotal).toFixed(2)} € · TVSH {Number(line.line_vat).toFixed(2)} €</small>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>Kodi ATK i njësisë<input value={mappings[line.id]?.unit || ""} onChange={(e) => setMapping(line.id, "unit", e.target.value)} placeholder="Kodi zyrtar" style={field} /></label>
          <label style={{ fontSize: 12 }}>Kodi ATK i TVSH-së<select value={mappings[line.id]?.tax || ""} onChange={(e) => setMapping(line.id, "tax", e.target.value)} style={field}><option value="">Zgjidh kodin</option><option value="A">A – Përjashtuar nga TVSH (0%)</option><option value="C">C – TVSH 0%</option><option value="D">D – TVSH 8%</option><option value="E">E – TVSH 18%</option></select></label>
          <label style={{ fontSize: 12 }}>Kodi ATK i artikullit<input value={mappings[line.id]?.itemType || ""} onChange={(e) => setMapping(line.id, "itemType", e.target.value)} placeholder="Kodi zyrtar" style={field} /></label>
        </div>
      </div>)}</div>
      <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between" }}><strong>Totali i faturës</strong><strong>{Number(selectedInvoice.total).toFixed(2)} €</strong></div>
      <button disabled={busy || !selectedPos || !invoiceId} onClick={() => void submitTestSale()} style={{ ...button, width: "100%", opacity: busy || !selectedPos || !invoiceId ? 0.55 : 1 }}>{busy ? "Duke verifikuar, nënshkruar dhe dërguar..." : "Dërgo shitjen në ATK TEST"}</button>
    </section>}
    <section style={{ ...panel, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong>Kuponët e fundit ATK TEST</strong>
        <div style={{ display: "flex", gap: 10 }}><button type="button" onClick={() => void load()} style={{ ...button, padding: "7px 10px" }}><RefreshCw size={14} /> Rifresko</button><a href="https://apps.atk-ks.org/sefaplikimi/PreApplication/VerifyTests" target="_blank" rel="noreferrer" style={{ color: "var(--brand)", fontWeight: 700, fontSize: 12, alignSelf: "center" }}>Verifiko në ATK ↗</a></div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr><th style={{ textAlign: "left", padding: 8 }}>Data</th><th style={{ textAlign: "left", padding: 8 }}>Kuponi</th><th style={{ textAlign: "left", padding: 8 }}>Statusi</th><th style={{ textAlign: "right", padding: 8 }}>Totali</th><th style={{ textAlign: "left", padding: 8 }}>Transaction ID / Gabimi</th></tr></thead>
          <tbody>{documents.map((doc) => <tr key={doc.id} style={{ borderTop: "1px solid var(--line)" }}>
            <td style={{ padding: 8 }}>{new Date(doc.created_at).toLocaleString("sq-XK")}</td>
            <td style={{ padding: 8 }}>{doc.coupon_id}</td>
            <td style={{ padding: 8 }}><span className={"status-pill " + (doc.status === "accepted" ? "accepted" : doc.status === "rejected" ? "rejected" : doc.status === "queued" || doc.status === "offline_pending" ? "queued" : "")}>{({ queued: "Në radhë", submitted: "Dërguar", accepted: "Pranuar", rejected: "Refuzuar", offline_pending: "Në pritje – kontrollo ATK", draft: "Draft" } as Record<string,string>)[doc.status] || doc.status}</span></td>
            <td style={{ padding: 8, textAlign: "right" }}>{Number(doc.total).toFixed(2)} €</td>
            <td style={{ padding: 8, maxWidth: 280, overflowWrap: "anywhere" }}>{doc.atk_transaction_id || doc.last_error || "—"}</td>
          </tr>)}{!documents.length && <tr><td colSpan={5} style={{ padding: 10, color: "var(--muted)" }}>Nuk ka kupona të dërguar nga ky POS TEST.</td></tr>}</tbody>
        </table>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 11 }}>Nëse statusi është “Në pritje”, mos e ridërgo. Kontrollo fillimisht portalin e ATK-së për të shmangur kupon të dyfishtë.</p>
    </section>
    <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.5, marginTop: 14 }}>Kërkohet certifikatë TEST e instaluar në të njëjtin shfletues ku hapet kjo faqe. Nëse ATK nuk përgjigjet pas dërgimit, dokumenti ruhet si në pritje dhe nuk duhet ridërguar pa kontrolluar më parë statusin në ATK.</p>
  </main>;
}
