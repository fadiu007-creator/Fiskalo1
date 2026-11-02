"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Invoice = { id: string; invoice_number: string | null; status: string; issue_date: string; due_date: string | null; subtotal: number; vat_total: number; total: number; payment_method: string; payment_status: string; fiscalization_status: string; notes: string | null; customer_id: string | null };
type Org = { legal_name: string; trade_name: string | null; nui: string; fiscal_number: string | null; address: string | null; municipality: string; phone: string | null; email: string | null };
type Line = { id: string; description: string; quantity: number; unit_price: number; vat_rate: number; line_subtotal: number; line_vat: number };

export default function InvoiceDetailPage() {
  const params = useParams<{ organizationId: string; invoiceId: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [customer, setCustomer] = useState<{ name: string; business_number: string | null; address: string | null; email: string | null } | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const fmt = (n: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(n);

  useEffect(() => {
    async function load() {
      const [inv, business, items] = await Promise.all([
        supabase.from("fiskalo_invoices").select("*").eq("id", params.invoiceId).eq("organization_id", params.organizationId).single(),
        supabase.from("fiskalo_organizations").select("legal_name,trade_name,nui,fiscal_number,address,municipality,phone,email").eq("id", params.organizationId).single(),
        supabase.from("fiskalo_invoice_items").select("*").eq("invoice_id", params.invoiceId),
      ]);
      if (inv.error || business.error || items.error || !inv.data || !business.data) {
        setError("Fatura nuk u gjet ose nuk ke qasje.");
        setLoading(false);
        return;
      }
      setInvoice(inv.data as Invoice);
      setOrg(business.data as Org);
      setLines((items.data ?? []) as Line[]);
      if (inv.data.customer_id) {
        const { data } = await supabase.from("fiskalo_customers").select("name,business_number,address,email").eq("id", inv.data.customer_id).single();
        setCustomer(data);
      }
      setLoading(false);
    }
    void load();
  }, [params.invoiceId, params.organizationId, supabase]);

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
      {invoice.notes && <p style={{ marginTop: 24, fontSize: 12 }}>Shënim: {invoice.notes}</p>}
      <footer style={{ borderTop: "1px solid var(--line)", marginTop: 30, paddingTop: 16, color: "var(--muted)", fontSize: 11, lineHeight: 1.6 }}>Dokument i krijuar në Fiskalo. Ky dokument nuk është fiskalizuar zyrtarisht dhe nuk përbën kupon fiskal të certifikuar nga ATK.</footer>
    </article>
  </main>;
}
