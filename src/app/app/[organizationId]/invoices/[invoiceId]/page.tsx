"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitPaidInvoiceToATK } from "@/lib/atk/submit-paid-invoice";

type Invoice = { id: string; invoice_number: string | null; status: string; issue_date: string; due_date: string | null; subtotal: number; vat_total: number; total: number; payment_method: string; payment_status: string; fiscalization_status: string; notes: string | null; customer_id: string | null };
type Org = { legal_name: string; trade_name: string | null; nui: string; fiscal_number: string | null; address: string | null; municipality: string; phone: string | null; email: string | null };
type Line = { id: string; product_id: string | null; description: string; quantity: number; unit_price: number; vat_rate: number; line_subtotal: number; line_vat: number };
type Product = { id: string; name: string; unit_price: number; vat_rate: number; stock_quantity: number; track_stock: boolean; is_active: boolean };
type CustomerOption = { id: string; name: string };
const fieldStyle: React.CSSProperties = { width: "100%", minWidth: 0, border: "1px solid var(--line)", borderRadius: 8, padding: "10px 11px", background: "white", color: "var(--ink)" };
type Payment = { id: string; amount: number; payment_method: string; reference: string | null; created_at: string };

export default function InvoiceDetailPage() {
  const params = useParams<{ organizationId: string; invoiceId: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [customer, setCustomer] = useState<{ name: string; business_number: string | null; address: string | null; email: string | null } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [draftCustomerId, setDraftCustomerId] = useState("");
  const [draftPaymentMethod, setDraftPaymentMethod] = useState("cash");
  const [draftLines, setDraftLines] = useState<{ product_id: string; quantity: string }[]>([]);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "cash", reference: "" });
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [printMode, setPrintMode] = useState<"invoice" | "receipt">("invoice");
  const fmt = (n: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(n);
  const fmtUnit = (n: number) => new Intl.NumberFormat("sq-XK", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n) + " €";
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const remainingBalance = Math.max(0, Number(invoice?.total ?? 0) - totalPaid);

  useEffect(() => {
    async function load() {
      const [inv, business, items, paymentRows, productRows, customerRows] = await Promise.all([
        supabase.from("fiskalo_invoices").select("*").eq("id", params.invoiceId).eq("organization_id", params.organizationId).single(),
        supabase.from("fiskalo_organizations").select("legal_name,trade_name,nui,fiscal_number,address,municipality,phone,email").eq("id", params.organizationId).single(),
        supabase.from("fiskalo_invoice_items").select("*").eq("invoice_id", params.invoiceId),
        supabase.from("fiskalo_invoice_payments").select("*").eq("invoice_id", params.invoiceId).order("created_at"),
        supabase.from("fiskalo_products").select("id,name,unit_price,vat_rate,stock_quantity,track_stock,is_active").eq("organization_id", params.organizationId).eq("is_active", true).order("name"),
        supabase.from("fiskalo_customers").select("id,name").eq("organization_id", params.organizationId).order("name"),
      ]);
      if (inv.error || business.error || items.error || paymentRows.error || productRows.error || customerRows.error || !inv.data || !business.data) {
        setError("Fatura nuk u gjet ose nuk ke qasje.");
        setLoading(false);
        return;
      }
      const loadedLines = (items.data ?? []) as Line[];
      setInvoice(inv.data as Invoice);
      setOrg(business.data as Org);
      setLines(loadedLines);
      setProducts((productRows.data ?? []) as Product[]);
      setCustomerOptions((customerRows.data ?? []) as CustomerOption[]);
      setDraftCustomerId(inv.data.customer_id || "");
      setDraftPaymentMethod(inv.data.payment_method || "cash");
      setDraftLines(loadedLines.map((line) => ({ product_id: line.product_id || "", quantity: String(line.quantity) })));
      setPayments((paymentRows.data ?? []) as Payment[]);
      if (inv.data.customer_id) {
        const { data } = await supabase.from("fiskalo_customers").select("name,business_number,address,email").eq("id", inv.data.customer_id).single();
        setCustomer(data);
      }
      setLoading(false);
    }
    void load();
  }, [params.invoiceId, params.organizationId, supabase]);

  async function saveDraft(): Promise<boolean> {
    if (!invoice || invoice.status !== "draft") return false;
    setDraftBusy(true); setDraftMessage("");
    const validLines = draftLines.filter((line) => line.product_id && Number(line.quantity) > 0);
    if (!validLines.length || validLines.length !== draftLines.length) {
      setDraftBusy(false); setDraftMessage("Shto së paku një artikull dhe kontrollo sasitë."); return false;
    }
    const { error: saveError } = await supabase.rpc("fiskalo_update_draft_invoice", {
      target_invoice: invoice.id,
      target_customer: draftCustomerId || null,
      target_payment_method: draftPaymentMethod,
      target_items: validLines.map((line) => ({ product_id: line.product_id, quantity: Number(line.quantity) })),
    });
    if (saveError) { setDraftBusy(false); setDraftMessage(saveError.message); return false; }
    const [freshInvoice, freshItems] = await Promise.all([
      supabase.from("fiskalo_invoices").select("*").eq("id", invoice.id).single(),
      supabase.from("fiskalo_invoice_items").select("*").eq("invoice_id", invoice.id),
    ]);
    if (freshInvoice.data) setInvoice(freshInvoice.data as Invoice);
    if (freshItems.data) {
      const refreshed = freshItems.data as Line[];
      setLines(refreshed);
      setDraftLines(refreshed.map((line) => ({ product_id: line.product_id || "", quantity: String(line.quantity) })));
    }
    setDraftBusy(false); setDraftMessage("Drafti u përditësua.");
    return true;
  }

  async function issueDraft() {
    const saved = await saveDraft();
    if (!saved) return;
    setDraftBusy(true); setDraftMessage("");
    const { data: number, error: issueError } = await supabase.rpc("fiskalo_issue_invoice", { target_invoice: params.invoiceId });
    if (issueError) { setDraftBusy(false); setDraftMessage(issueError.message); return; }
    const { data: fresh } = await supabase.from("fiskalo_invoices").select("*").eq("id", params.invoiceId).single();
    if (fresh) setInvoice(fresh as Invoice);
    setDraftBusy(false); setDraftMessage("Fatura u lëshua me numër " + number + ".");
  }

  async function recordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentMessage("Shkruaj një shumë më të madhe se zero.");
      return;
    }
    if (amount - remainingBalance > 0.005) {
      setPaymentMessage("Shuma është më e madhe se bilanci i mbetur.");
      return;
    }
    setPaymentBusy(true); setPaymentMessage("");
    const { error: payError } = await supabase.rpc("fiskalo_record_payment", {
      target_invoice: params.invoiceId, payment_amount: amount,
      method: paymentForm.method, payment_reference: paymentForm.reference,
    });
    if (payError) { setPaymentMessage(payError.message); setPaymentBusy(false); return; }
    const [freshInvoice, freshPayments] = await Promise.all([
      supabase.from("fiskalo_invoices").select("*").eq("id", params.invoiceId).single(),
      supabase.from("fiskalo_invoice_payments").select("*").eq("invoice_id", params.invoiceId).order("created_at"),
    ]);
    if (freshInvoice.data) setInvoice(freshInvoice.data as Invoice);
    if (freshPayments.data) setPayments(freshPayments.data as Payment[]);
    setPaymentForm({ amount: "", method: "cash", reference: "" });
    if (freshInvoice.data?.payment_status === "paid") {
      try {
        const fiscal = await submitPaidInvoiceToATK(supabase, params.organizationId, params.invoiceId);
        setPaymentMessage("Pagesa u regjistrua. " + fiscal.message);
      } catch (fiscalError) {
        setPaymentMessage("Pagesa u regjistrua, por dërgimi automatik në ATK nuk u përfundua: " +
          (fiscalError instanceof Error ? fiscalError.message : "Gabim i panjohur.") +
          " Kontrollo statusin para çdo prove tjetër.");
      }
    } else {
      setPaymentMessage("Pagesa u regjistrua. Fatura do të dërgohet në ATK kur të paguhet plotësisht.");
    }
    setPaymentBusy(false);
  }

  if (loading) return <main style={{ maxWidth: 850, margin: "0 auto", padding: 30 }}>Duke ngarkuar faturën...</main>;
  if (error || !invoice || !org) return <main style={{ maxWidth: 850, margin: "0 auto", padding: 30 }}><p>{error || "Fatura nuk u gjet."}</p><Link href={`/app/${params.organizationId}`}>Kthehu te biznesi</Link></main>;

  return <main style={{ maxWidth: 850, margin: "0 auto", padding: "28px 20px 60px" }}>
    <div className="no-print" style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
      <Link href={`/app/${params.organizationId}`} style={{ color: "var(--brand)", fontWeight: 700 }}>← Kthehu te paneli</Link>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={() => { setPrintMode("invoice"); window.setTimeout(() => window.print(), 0); }} style={{ border: 0, borderRadius: 8, background: "var(--brand)", color: "white", padding: "10px 15px", fontWeight: 700 }}>Printo faturën A4</button><button onClick={() => { setPrintMode("receipt"); window.setTimeout(() => window.print(), 0); }} style={{ border: "1px solid var(--brand)", borderRadius: 8, background: "white", color: "var(--brand)", padding: "10px 15px", fontWeight: 700 }}>Printo kuponin 80mm</button></div>
    </div>
    {printMode === "receipt" && <article className="thermal-receipt" aria-label="Kupon i brendshëm për printer termik">
      <header style={{ textAlign: "center", marginBottom: 12 }}>
        <strong style={{ fontSize: 18 }}>{org.trade_name || org.legal_name}</strong>
        <div>{org.address || ""}{org.address ? ", " : ""}{org.municipality}</div>
        <div>NUI: {org.nui}</div>
        {org.phone && <div>Tel: {org.phone}</div>}
        <hr />
        <strong>FATURË E BRENDSHME</strong>
        <div>{invoice.invoice_number || "DRAFT"}</div>
        <div>{new Date(invoice.issue_date + "T00:00:00").toLocaleDateString("sq-XK")} · {invoice.payment_method === "cash" ? "Para në dorë" : invoice.payment_method === "card" ? "Kartelë" : invoice.payment_method === "bank_transfer" ? "Transfer bankar" : "Me afat"}</div>
        <div>Klienti: {customer?.name || "Klient pa emër"}</div>
      </header>
      <div className="thermal-lines">{lines.map((line, i) => <div key={line.id} style={{ marginBottom: 8 }}>
        <div>{i + 1}. {line.description}</div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>{line.quantity} × {fmtUnit(Number(line.unit_price))} ({line.vat_rate}% TVSH)</span><strong>{fmt(Number(line.line_subtotal) + Number(line.line_vat))}</strong></div>
      </div>)}</div>
      <hr />
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Nëntotali</span><strong>{fmt(Number(invoice.subtotal))}</strong></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>TVSH</span><strong>{fmt(Number(invoice.vat_total))}</strong></div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, marginTop: 5 }}><strong>TOTALI</strong><strong>{fmt(Number(invoice.total))}</strong></div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}><span>Paguar</span><strong>{fmt(totalPaid)}</strong></div>
      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Bilanci</span><strong>{fmt(remainingBalance)}</strong></div>
      <hr />
      <footer style={{ textAlign: "center", fontSize: 10, lineHeight: 1.4 }}>Faleminderit!<br />Dokument i brendshëm Fiskalo — JO KUPON FISKAL ATK.<br />Nuk është fiskalizuar zyrtarisht.</footer>
    </article>}
    <article style={{ background: "white", border: "1px solid var(--line)", borderRadius: 14, padding: "clamp(20px,5vw,42px)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", borderBottom: "2px solid var(--ink)", paddingBottom: 22 }}>
        <div><div style={{ color: "var(--brand)", fontSize: 24, fontWeight: 800 }}>fiskalo</div><h1 style={{ margin: "12px 0 4px", fontSize: 27 }}>FATURË</h1><strong>{invoice.invoice_number || "DRAFT"}</strong></div>
        <div style={{ textAlign: "right", fontSize: 12, lineHeight: 1.7 }}><strong>{org.trade_name || org.legal_name}</strong><br />NUI: {org.nui}<br />{org.fiscal_number ? `Nr. fiskal: ${org.fiscal_number}` : null}<br />{org.address || ""}, {org.municipality}<br />{org.phone || ""}<br />{org.email || ""}</div>
      </header>
      {invoice.status === "draft" && <section className="no-print" style={{ margin: "20px 0", padding: 16, border: "1px solid #d6a64b", borderRadius: 10, background: "#fffaf0" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>Draft — mund ta redaktosh</h2>
        <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 12 }}>Ndrysho sasitë, hiq artikujt ose shto të rinj. Stoku kontrollohet përsëri kur provon ta lëshosh faturën.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 12 }}>Klienti<select value={draftCustomerId} onChange={(e) => setDraftCustomerId(e.target.value)} style={fieldStyle}><option value="">Klient pa emër</option>{/* Customers are resolved by invoice selection below when available */}{customerOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
          <label style={{ display: "grid", gap: 5, fontSize: 12 }}>Mënyra e pagesës<select value={draftPaymentMethod} onChange={(e) => setDraftPaymentMethod(e.target.value)} style={fieldStyle}><option value="cash">Para në dorë</option><option value="card">Kartelë</option><option value="bank_transfer">Transfer bankar</option><option value="credit">Me afat / e papaguar</option></select></label>
        </div>
        {draftLines.map((line, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 12 }}>Artikulli<select value={line.product_id} onChange={(e) => setDraftLines((rows) => rows.map((row, i) => i === index ? { ...row, product_id: e.target.value } : row))} style={fieldStyle}><option value="">Zgjidh artikullin</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} — {fmt(Number(product.unit_price))}{product.track_stock ? ` (Stok: ${product.stock_quantity})` : ""}</option>)}</select></label>
          <label style={{ display: "grid", gap: 5, fontSize: 12 }}>Sasia<input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setDraftLines((rows) => rows.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row))} style={fieldStyle} /></label>
          <button type="button" onClick={() => setDraftLines((rows) => rows.filter((_, i) => i !== index))} style={{ ...fieldStyle, width: "auto", cursor: "pointer" }}>Hiq</button>
        </div>)}
        <button type="button" onClick={() => setDraftLines((rows) => [...rows, { product_id: "", quantity: "1" }])} style={{ ...fieldStyle, margin: "4px 0 12px", cursor: "pointer" }}>+ Shto artikull</button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={draftBusy} onClick={saveDraft} style={{ border: 0, borderRadius: 8, background: "var(--brand)", color: "white", padding: "10px 14px", fontWeight: 700 }}>{draftBusy ? "Duke ruajtur..." : "Ruaj draftin"}</button>
          <button type="button" disabled={draftBusy} onClick={issueDraft} style={{ ...fieldStyle, width: "auto", cursor: "pointer" }}>Ruaj dhe provo lëshimin</button>
        </div>
        {draftMessage && <p role="status" style={{ marginBottom: 0, fontSize: 12 }}>{draftMessage}</p>}
      </section>}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 20, padding: "22px 0" }}>
        <div><div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 5 }}>FATURUAR PËR</div><strong>{customer?.name || "Klient pa emër"}</strong><div style={{ fontSize: 12, lineHeight: 1.6 }}>{customer?.business_number ? `NUI: ${customer.business_number}` : ""}<br />{customer?.address || ""}<br />{customer?.email || ""}</div></div>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}><div><span style={{ color: "var(--muted)" }}>Data: </span><strong>{invoice.issue_date}</strong></div><div><span style={{ color: "var(--muted)" }}>Afati: </span>{invoice.due_date || "—"}</div><div><span style={{ color: "var(--muted)" }}>Pagesa: </span>{remainingBalance <= 0.005 ? "Paguar" : totalPaid > 0 ? "Pjesërisht e paguar" : "E papaguar"}</div><div><span style={{ color: "var(--muted)" }}>Mënyra: </span>{({ cash: "Para në dorë", card: "Kartelë", bank_transfer: "Transfer bankar", credit: "Me afat" } as Record<string,string>)[invoice.payment_method] || invoice.payment_method}</div></div>
      </section>
      <div style={{ overflowX: "auto" }}><table className="data-table" style={{ minWidth: 560 }}><thead><tr><th>Nr.</th><th>Përshkrimi</th><th>Sasia</th><th>Çmimi</th><th>TVSH</th><th>Gjithsej</th></tr></thead><tbody>{lines.map((line, i) => <tr key={line.id}><td>{i + 1}</td><td>{line.description}</td><td>{line.quantity}</td><td>{fmtUnit(Number(line.unit_price))}</td><td>{line.vat_rate}%</td><td>{fmt(Number(line.line_subtotal) + Number(line.line_vat))}</td></tr>)}</tbody></table></div>
      <section style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
        <div style={{ width: "100%", maxWidth: 300, fontSize: 13, lineHeight: 2 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span>Nëntotali</span><strong>{fmt(Number(invoice.subtotal))}</strong></div><div style={{ display: "flex", justifyContent: "space-between" }}><span>TVSH</span><strong>{fmt(Number(invoice.vat_total))}</strong></div><div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 8, fontSize: 18 }}><strong>TOTALI</strong><strong>{fmt(Number(invoice.total))}</strong></div></div>
      </section>
      <section style={{ marginTop: 22, padding: 16, background: "var(--canvas)", borderRadius: 10 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Pagesat</h2>
        <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>Regjistro vetëm shumën që klienti ta ka paguar realisht. Mund të shtosh disa pagesa në data të ndryshme; bilanci ulet pas secilës pagesë dhe fatura shënohet “Paguar” kur bilanci arrin zero.</p>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, lineHeight: 1.8 }}><span>Paguar deri tani</span><strong>{fmt(totalPaid)}</strong></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, lineHeight: 1.8 }}><span>Bilanci i mbetur</span><strong>{fmt(remainingBalance)}</strong></div>
        {payments.length > 0 && <div style={{ marginTop: 10, overflowX: "auto" }}><table className="data-table"><thead><tr><th>Data</th><th>Mënyra</th><th>Referenca</th><th>Shuma</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id}><td>{new Date(p.created_at).toLocaleDateString("sq-XK")}</td><td>{({ cash: "Para në dorë", card: "Kartelë", bank_transfer: "Transfer bankar" } as Record<string, string>)[p.payment_method]}</td><td>{p.reference || "—"}</td><td>{fmt(Number(p.amount))}</td></tr>)}</tbody></table></div>}
        {invoice.status === "draft" && <p className="no-print" style={{ margin: "14px 0 0", padding: 12, borderRadius: 8, background: "#fff8e8", fontSize: 12 }}>Për të regjistruar pagesë, së pari lësho faturën me butonin “Ruaj dhe provo lëshimin” më lart. Draftet nuk pranojnë pagesa.</p>}
        {invoice.status === "issued" && remainingBalance > 0.005 && <form className="no-print" onSubmit={recordPayment} style={{ marginTop: 16, padding: 14, border: "2px solid var(--brand)", borderRadius: 10, background: "white", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Regjistro pagesë të re</h3>
            <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>Mund të regjistrosh vetëm një pjesë të shumës, p.sh. 40.00 €.</p>
          </div>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>Shuma që u pagua (€)<input required type="number" inputMode="decimal" min="0.01" max={remainingBalance} step="0.01" placeholder="p.sh. 40.00" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} style={{ ...fieldStyle, fontSize: 16, padding: 12 }} /></label>
          <label style={{ display: "grid", gap: 6, fontSize: 12 }}>Mënyra<select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} style={fieldStyle}><option value="cash">Para në dorë</option><option value="card">Kartelë</option><option value="bank_transfer">Transfer bankar</option></select></label>
          <label style={{ display: "grid", gap: 6, fontSize: 12 }}>Referenca (opsionale)<input placeholder="Nr. i transaksionit" value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} style={fieldStyle} /></label>
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            <button type="submit" disabled={paymentBusy} style={{ border: 0, borderRadius: 8, background: "var(--brand)", color: "white", padding: "11px 14px", fontWeight: 700 }}>{paymentBusy ? "Duke ruajtur..." : "Regjistro pagesën"}</button>
            <button type="button" disabled={paymentBusy} onClick={() => setPaymentForm({ ...paymentForm, amount: remainingBalance.toFixed(2) })} style={{ ...fieldStyle, width: "auto", cursor: "pointer" }}>Paguaj krejt</button>
          </div>
          {paymentMessage && <p role="alert" style={{ gridColumn: "1 / -1", margin: 0, color: "#9d2d26", fontSize: 12 }}>{paymentMessage}</p>}
        </form>}
        {invoice.status === "issued" && remainingBalance <= 0.005 && <p role="status" style={{ margin: "14px 0 0", fontSize: 12 }}>Fatura është paguar plotësisht. Nuk ka bilanc të mbetur.</p>}
      </section>
      {invoice.notes && <p style={{ marginTop: 24, fontSize: 12 }}>Shënim: {invoice.notes}</p>}
      <footer style={{ borderTop: "1px solid var(--line)", marginTop: 30, paddingTop: 16, color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>Dokument i krijuar në Fiskalo. Ky dokument nuk është fiskalizuar zyrtarisht dhe nuk përbën kupon fiskal të certifikuar nga ATK.</footer>
    </article>
    <style jsx global>{`@media print { @page { size: 80mm auto; margin: 3mm; } body { background: #fff !important; } body:has(.thermal-receipt) main > .no-print, body:has(.thermal-receipt) main > article:not(.thermal-receipt) { display: none !important; } .thermal-receipt { display: block !important; width: 74mm; max-width: 74mm; margin: 0 auto; padding: 0 !important; border: 0 !important; border-radius: 0 !important; color: #000 !important; background: #fff !important; font: 11px/1.35 Arial, sans-serif; } .thermal-receipt hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; } } @media screen { .thermal-receipt { display: none; } }`}</style>\n  </main>;
}
