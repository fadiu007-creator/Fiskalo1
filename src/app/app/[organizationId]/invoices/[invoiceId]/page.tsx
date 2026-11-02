"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Invoice = { id: string; invoice_number: string | null; status: string; issue_date: string; due_date: string | null; subtotal: number; vat_total: number; total: number; payment_method: string; payment_status: string; fiscalization_status: string; notes: string | null; customer_id: string | null };
type Org = { legal_name: string; trade_name: string | null; nui: string; fiscal_number: string | null; address: string | null; municipality: string; phone: string | null; email: string | null };
type Line = { id: string; description: string; quantity: number; unit_price: number; vat_rate: number; line_subtotal: number; line_vat: number };
const fieldStyle: React.CSSProperties = { width: "100%", minWidth: 0, border: "1px solid var(--line)", borderRadius: 8, padding: "10px 11px", background: "white", color: "var(--ink)" };
type Payment = { id: string; amount: number; payment_method: string; reference: string | null; created_at: string };

export default function InvoiceDetailPage() {
  const params = useParams<{ organizationId: string; invoiceId: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [customer, setCustomer] = useState<{ name: string; business_number: string | null; address: string | null; email: string | null } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "cash", reference: "" });
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const fmt = (n: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(n);

  useEffect(() => {
    async function load() {
      const [inv, business, items, paymentRows] = await Promise.all([
        supabase.from("fiskalo_invoices").select("*").eq("id", params.invoiceId).eq("organization_id", params.organizationId).single(),
        supabase.from("fiskalo_organizations").select("legal_name,trade_name,nui,fiscal_number,address,municipality,phone,email").eq("id", params.organizationId).single(),
        supabase.from("fiskalo_invoice_items").select("*").eq("invoice_id", params.invoiceId),
        supabase.from("fiskalo_invoice_payments").select("*").eq("invoice_id", params.invoiceId).order("created_at"),
      ]);
      if (inv.error || business.error || items.error || paymentRows.error || !inv.data || !business.data) {
        setError("Fatura nuk u gjet ose nuk ke qasje.");
        setLoading(false);
        return;
      }
      setInvoice(inv.data as Invoice);
      setOrg(business.data as Org);
      setLines((items.data ?? []) as Line[]);
      setPayments((paymentRows.data ?? []) as Payment[]);
      if (inv.data.customer_id) {
        const { data } = await supabase.from("fiskalo_customers").select("name,business_number,address,email").eq("id", inv.data.customer_id).single();
        setCustomer(data);
      }
      setLoading(false);
    }
    void load();
  }, [params.invoiceId, params.organizationId, supabase]);

  async function recordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPaymentBusy(true); setPaymentMessage("");
    const { error: payError } = await supabase.rpc("fiskalo_record_payment", {
      target_invoice: params.invoiceId, payment_amount: Number(paymentForm.amount),
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
    setPaymentMessage("Pagesa u regjistrua.");
    setPaymentBusy(false);
  }

  if (loading) return <main style={{ maxWidth: 850, margin: "0 auto", padding: 30 }}>Duke ngarkuar faturën...</main>;
  if (error || !invoice || !org) return <main style={{ maxWidth: 850, margin: "0 auto", padding: 30 }}><p>{error || "Fatura nuk u gjet."}</p><Link href={`/app/${params.organizationId}`}>Kthehu te biznesi</Link></main>;

  return <main style={{ maxWidth: 850, margin: "0 auto", padding: "28px 20px 60px" }}>
    <div className="no-print" style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
      <Link href={`/app/${params.organizationId}`} style={{ color: "var(--brand)", fontWeight: 700 }}>← Kthehu te paneli</Link>
      <button onClick={() => window.print()} style={{ border: 0, borderRadius: 8, background: "var(--brand)", color: "white", padding: "10px 15px", fontWeight: 700 }}>Printo faturën</button>
    </div>
    <article style={{ background: "white", border: "1px solid var(--line)", borderRadius: 14, padding: "clamp(20px,5vw,42px)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", borderBottom: "2px solid var(--ink)", paddingBottom: 22 }}>
        <div><div style={{ color: "var(--brand)", fontSize: 24, fontWeight: 800 }}>fiskalo</div><h1 style={{ margin: "12px 0 4px", fontSize: 27 }}>FATURË</h1><strong>{invoice.invoice_number || "DRAFT"}</strong></div>
        <div style={{ textAlign: "right", fontSize: 12, lineHeight: 1.7 }}><strong>{org.trade_name || org.legal_name}</strong><br />NUI: {org.nui}<br />{org.fiscal_number ? `Nr. fiskal: ${org.fiscal_number}` : null}<br />{org.address || ""}, {org.municipality}<br />{org.phone || ""}<br />{org.email || ""}</div>
      </header>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 20, padding: "22px 0" }}>
        <div><div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 5 }}>FATURUAR PËR</div><strong>{customer?.name || "Klient pa emër"}</strong><div style={{ fontSize: 12, lineHeight: 1.6 }}>{customer?.business_number ? `NUI: ${customer.business_number}` : ""}<br />{customer?.address || ""}<br />{customer?.email || ""}</div></div>
        <div style={{ fontSize: 12, lineHeight: 1.8 }}><div><span style={{ color: "var(--muted)" }}>Data: </span><strong>{invoice.issue_date}</strong></div><div><span style={{ color: "var(--muted)" }}>Afati: </span>{invoice.due_date || "—"}</div><div><span style={{ color: "var(--muted)" }}>Pagesa: </span>{invoice.payment_status === "paid" ? "Paguar" : "E papaguar"}</div><div><span style={{ color: "var(--muted)" }}>Mënyra: </span>{({ cash: "Para në dorë", card: "Kartelë", bank_transfer: "Transfer bankar", credit: "Me afat" } as Record<string,string>)[invoice.payment_method] || invoice.payment_method}</div></div>
      </section>
      <div style={{ overflowX: "auto" }}><table className="data-table" style={{ minWidth: 560 }}><thead><tr><th>Nr.</th><th>Përshkrimi</th><th>Sasia</th><th>Çmimi</th><th>TVSH</th><th>Gjithsej</th></tr></thead><tbody>{lines.map((line, i) => <tr key={line.id}><td>{i + 1}</td><td>{line.description}</td><td>{line.quantity}</td><td>{fmt(Number(line.unit_price))}</td><td>{line.vat_rate}%</td><td>{fmt(Number(line.line_subtotal) + Number(line.line_vat))}</td></tr>)}</tbody></table></div>
      <section style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
        <div style={{ width: "100%", maxWidth: 300, fontSize: 13, lineHeight: 2 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span>Nëntotali</span><strong>{fmt(Number(invoice.subtotal))}</strong></div><div style={{ display: "flex", justifyContent: "space-between" }}><span>TVSH</span><strong>{fmt(Number(invoice.vat_total))}</strong></div><div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 8, fontSize: 18 }}><strong>TOTALI</strong><strong>{fmt(Number(invoice.total))}</strong></div></div>
      </section>
      <section style={{ marginTop: 22, padding: 16, background: "var(--canvas)", borderRadius: 10 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>Pagesat</h2>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, lineHeight: 1.8 }}><span>Paguar deri tani</span><strong>{fmt(payments.reduce((sum, p) => sum + Number(p.amount), 0))}</strong></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, lineHeight: 1.8 }}><span>Bilanci i mbetur</span><strong>{fmt(Math.max(0, Number(invoice.total) - payments.reduce((sum, p) => sum + Number(p.amount), 0)))}</strong></div>
        {payments.length > 0 && <div style={{ marginTop: 10, overflowX: "auto" }}><table className="data-table"><thead><tr><th>Data</th><th>Mënyra</th><th>Referenca</th><th>Shuma</th></tr></thead><tbody>{payments.map((p) => <tr key={p.id}><td>{new Date(p.created_at).toLocaleDateString("sq-XK")}</td><td>{({ cash: "Para në dorë", card: "Kartelë", bank_transfer: "Transfer bankar" } as Record<string, string>)[p.payment_method]}</td><td>{p.reference || "—"}</td><td>{fmt(Number(p.amount))}</td></tr>)}</tbody></table></div>}
        {invoice.status === "issued" && invoice.payment_status !== "paid" && <form className="no-print" onSubmit={recordPayment} style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 9 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 11 }}>Shuma (€)<input required type="number" min="0.01" max={Math.max(0.01, Number(invoice.total) - payments.reduce((sum,p) => sum + Number(p.amount),0))} step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} style={{ ...fieldStyle }} /></label>
          <label style={{ display: "grid", gap: 5, fontSize: 11 }}>Mënyra<select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} style={fieldStyle}><option value="cash">Para në dorë</option><option value="card">Kartelë</option><option value="bank_transfer">Transfer bankar</option></select></label>
          <label style={{ display: "grid", gap: 5, fontSize: 11 }}>Referenca<input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} style={fieldStyle} /></label>
          <button disabled={paymentBusy} style={{ alignSelf: "end", border: 0, borderRadius: 8, background: "var(--brand)", color: "white", padding: 10, fontWeight: 700 }}>{paymentBusy ? "Duke ruajtur..." : "Regjistro pagesën"}</button>
          {paymentMessage && <p role="status" style={{ gridColumn: "1 / -1", fontSize: 12 }}>{paymentMessage}</p>}
        </form>}
      </section>
      {invoice.notes && <p style={{ marginTop: 24, fontSize: 12 }}>Shënim: {invoice.notes}</p>}
      <footer style={{ borderTop: "1px solid var(--line)", marginTop: 30, paddingTop: 16, color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>Dokument i krijuar në Fiskalo. Ky dokument nuk është fiskalizuar zyrtarisht dhe nuk përbën kupon fiskal të certifikuar nga ATK.</footer>
    </article>
  </main>;
}
