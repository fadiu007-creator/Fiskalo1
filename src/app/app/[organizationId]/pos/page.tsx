"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { submitPaidInvoiceToATK } from "@/lib/atk/submit-paid-invoice";
import { ArrowRight, FileText, Plus, RefreshCw, Search, Settings2, ShoppingCart } from "lucide-react";

type Product = { id: string; name: string; sku: string | null; unit_price: number; vat_rate: number; stock_quantity: number; track_stock: boolean; item_type: string; is_active: boolean };
type Customer = { id: string; name: string; phone: string | null };
type InvoiceRow = { id: string; invoice_number: string | null; issue_date: string; status: string; payment_status: string; payment_method: string; total: number; customer_id: string | null; atk_test_status?: string | null };
type CartLine = { productId: string; quantity: string };

const panel: React.CSSProperties = { background: "white", border: "1px solid var(--line)", borderRadius: 14, padding: 16 };
const field: React.CSSProperties = { width: "100%", minWidth: 0, border: "1px solid var(--line)", borderRadius: 9, padding: "11px 12px", background: "white", color: "var(--ink)" };
const button: React.CSSProperties = { border: 0, borderRadius: 9, padding: "12px 15px", background: "var(--brand)", color: "white", fontWeight: 750, cursor: "pointer" };
const secondary: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 9, padding: "10px 12px", background: "white", color: "var(--ink)", fontWeight: 650, cursor: "pointer" };
const money = (n: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(n);
const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function WebPosPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [activeView, setActiveView] = useState<"pos" | "invoices">("pos");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [confirmedPayment, setConfirmedPayment] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issuedInvoiceId, setIssuedInvoiceId] = useState("");
  const [issuedNumber, setIssuedNumber] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [productResult, customerResult, invoiceResult] = await Promise.all([
      supabase.from("fiskalo_products").select("id,name,sku,unit_price,vat_rate,stock_quantity,track_stock,item_type,is_active").eq("organization_id", organizationId).eq("is_active", true).order("name"),
      supabase.from("fiskalo_customers").select("id,name,phone").eq("organization_id", organizationId).order("name"),
      supabase.from("fiskalo_invoices").select("id,invoice_number,issue_date,status,payment_status,payment_method,total,customer_id").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
    ]);
    if (productResult.error || customerResult.error || invoiceResult.error) setError("Nuk u ngarkuan të gjitha të dhënat. Rifresko faqen ose kontrollo qasjen në biznes.");
    setProducts((productResult.data ?? []) as Product[]);
    setCustomers((customerResult.data ?? []) as Customer[]);
    const invoiceRows = (invoiceResult.data ?? []) as InvoiceRow[];
    const invoiceIds = invoiceRows.map((row) => row.id);
    const fiscalResult = invoiceIds.length
      ? await supabase.from("fiskalo_atk_fiscal_documents").select("source_invoice_id,status,created_at").eq("organization_id", organizationId).in("source_invoice_id", invoiceIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    const latestFiscalStatus = new Map<string, string>();
    for (const doc of (fiscalResult.data ?? []) as Array<{ source_invoice_id: string | null; status: string }>) {
      if (doc.source_invoice_id && !latestFiscalStatus.has(doc.source_invoice_id)) latestFiscalStatus.set(doc.source_invoice_id, doc.status);
    }
    setInvoices(invoiceRows.map((row) => ({ ...row, atk_test_status: latestFiscalStatus.get(row.id) ?? null })));
    setLoading(false);
  }, [organizationId, supabase]);

  useEffect(() => { void load(); }, [load]);

  const visibleInvoices = invoices.filter((invoice) => `${invoice.invoice_number ?? ""} ${invoice.status} ${invoice.payment_status} ${invoice.issue_date}`.toLocaleLowerCase().includes(invoiceSearch.trim().toLocaleLowerCase()));
  const visibleProducts = products.filter((product) => {
    const q = search.trim().toLocaleLowerCase();
    return !q || product.name.toLocaleLowerCase().includes(q) || (product.sku ?? "").toLocaleLowerCase().includes(q);
  });
  const lines = cart.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    const quantity = Number(line.quantity);
    const lineSubtotal = product && Number.isFinite(quantity) ? roundMoney(Number(product.unit_price) * quantity) : 0;
    const lineVat = product && Number.isFinite(quantity) ? roundMoney(Number(product.unit_price) * quantity * Number(product.vat_rate) / 100) : 0;
    return { ...line, product, quantity, lineSubtotal, lineVat, lineTotal: lineSubtotal + lineVat };
  }).filter((line) => line.product);
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineSubtotal, 0));
  const vatTotal = roundMoney(lines.reduce((sum, line) => sum + line.lineVat, 0));
  const total = roundMoney(subtotal + vatTotal);
  const cashReceivedAmount = cashReceived.trim() === "" ? 0 : Number(cashReceived);
  const cashChange = paymentMethod === "cash" && Number.isFinite(cashReceivedAmount) ? roundMoney(Math.max(0, cashReceivedAmount - total)) : 0;

  function addProduct(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) return current.map((line) => line.productId === product.id ? { ...line, quantity: String(Number(line.quantity) + 1) } : line);
      return [...current, { productId: product.id, quantity: "1" }];
    });
    setNotice(""); setError("");
  }

  function updateQuantity(productId: string, quantity: string) {
    setCart((current) => current.map((line) => line.productId === productId ? { ...line, quantity } : line));
  }

  function handleProductSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = search.trim().toLocaleLowerCase();
    if (!code) return;
    const exact = products.find((product) => product.is_active && (product.sku ?? "").trim().toLocaleLowerCase() === code);
    if (!exact) {
      setError("Nuk u gjet produkt me këtë barkod ose SKU. Kontrollo kodin ose kërko produktin me emër.");
      return;
    }
    addProduct(exact);
    setSearch("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  async function completeSale() {
    setError(""); setNotice(""); setIssuedInvoiceId(""); setIssuedNumber("");
    const valid = lines.filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    if (!valid.length || valid.length !== lines.length) { setError("Shto artikuj dhe kontrollo sasitë."); return; }
    if (paymentMethod !== "credit" && !confirmedPayment) { setError("Konfirmo që pagesa është pranuar para se ta regjistrosh si të paguar."); return; }
    if (paymentMethod === "cash" && (!Number.isFinite(cashReceivedAmount) || cashReceivedAmount + 0.0001 < total)) {
      setError("Shuma e pranuar në para duhet të jetë së paku sa totali i shitjes.");
      return;
    }
    for (const line of valid) {
      if (line.product!.track_stock && line.quantity > Number(line.product!.stock_quantity)) {
        setError("Stoku i pamjaftueshëm për: " + line.product!.name + ". Ndrysho sasinë ose rifresko produktet.");
        return;
      }
    }

    setBusy(true);
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setBusy(false); setError("Sesioni ka skaduar. Hyr përsëri."); return; }

    const { data: invoice, error: invoiceError } = await supabase.from("fiskalo_invoices").insert({
      organization_id: organizationId,
      created_by: auth.user.id,
      customer_id: customerId || null,
      payment_method: paymentMethod,
      payment_status: "unpaid",
      issue_date: new Date().toISOString().slice(0, 10),
    }).select("id").single();

    if (invoiceError || !invoice) { setBusy(false); setError(invoiceError?.message ?? "Fatura nuk u krijua."); return; }

    const { error: itemError } = await supabase.from("fiskalo_invoice_items").insert(valid.map((line) => ({
      invoice_id: invoice.id,
      product_id: line.product!.id,
      description: line.product!.name,
      quantity: line.quantity,
      unit_price: Number(line.product!.unit_price),
      vat_rate: Number(line.product!.vat_rate),
    })));

    if (itemError) {
      setBusy(false);
      setError("Drafti u krijua, por artikujt nuk u ruajtën. Hape draftin për ta korrigjuar: " + itemError.message);
      setIssuedInvoiceId(invoice.id);
      return;
    }

    const { data: invoiceNumber, error: issueError } = await supabase.rpc("fiskalo_issue_invoice", { target_invoice: invoice.id });
    if (issueError) {
      setBusy(false);
      setError("Fatura mbeti draft. Nuk u lëshua: " + issueError.message);
      setIssuedInvoiceId(invoice.id);
      return;
    }

    const { data: issuedInvoice, error: issuedReadError } = await supabase.from("fiskalo_invoices").select("total").eq("id", invoice.id).eq("organization_id", organizationId).single();
    if (issuedReadError || !issuedInvoice) {
      setBusy(false);
      setIssuedInvoiceId(invoice.id);
      setIssuedNumber(String(invoiceNumber ?? ""));
      setError("Fatura u lëshua, por totali i saj nuk u lexua. Kontrollo faturën para regjistrimit të pagesës.");
      return;
    }

    if (paymentMethod !== "credit") {
      const { error: paymentError } = await supabase.rpc("fiskalo_record_payment", {
        target_invoice: invoice.id,
        payment_amount: Number(issuedInvoice.total),
        method: paymentMethod,
        payment_reference: null,
      });
      if (paymentError) {
        setBusy(false);
        setIssuedInvoiceId(invoice.id);
        setIssuedNumber(String(invoiceNumber ?? ""));
        setError("Fatura u lëshua, por pagesa nuk u regjistrua. Hape faturën dhe regjistro pagesën veçmas: " + paymentError.message);
        await load();
        return;
      }
    }

    setIssuedInvoiceId(invoice.id);
    setIssuedNumber(String(invoiceNumber ?? ""));
    let fiscalNotice = "";
    if (paymentMethod !== "credit") {
      try {
        const fiscalResult = await submitPaidInvoiceToATK(supabase, organizationId, invoice.id);
        fiscalNotice = " " + fiscalResult.message;
      } catch (fiscalError) {
        fiscalNotice = " Pagesa u ruajt, por dërgimi automatik në ATK nuk u përfundua: " +
          (fiscalError instanceof Error ? fiscalError.message : "Gabim i panjohur.") +
          " Kontrollo statusin e faturës para çdo prove tjetër.";
      }
    }
    setNotice(paymentMethod === "credit"
      ? "Fatura u lëshua. Pagesa mbeti e papaguar."
      : "Shitja u regjistrua dhe pagesa u shënua si e pranuar." + fiscalNotice);
    setBusy(false);
    setCart([]);
    setCustomerId("");
    setPaymentMethod("cash");
    setCashReceived("");
    setConfirmedPayment(false);
    await load();
  }

  if (loading) return <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>Duke hapur POS...</main>;

  return <main className="fiskalo-pos" style={{ maxWidth: 1440, margin: "0 auto", padding: "22px clamp(12px,3vw,28px) 50px" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      <div><Link href={`/app/${organizationId}`} style={{ color: "var(--brand)", fontWeight: 750 }}>← Paneli i biznesit</Link><h1 style={{ margin: "8px 0 0", fontSize: 28 }}>Arka</h1><div style={{ color: "var(--muted)", fontSize: 13 }}>Regjistro shitjen; faturat e paguara dërgohen automatikisht në ATK TEST.</div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link href={`/app/${organizationId}/pos/products`} style={{ ...secondary, textDecoration: "none" }}>Produktet</Link><Link href={`/app/${organizationId}/pos/setup`} style={{ ...secondary, textDecoration: "none" }}><Settings2 size={15} /> Konfiguro ATK</Link><Link href={`/app/${organizationId}/pos/shifts`} style={{ ...secondary, textDecoration: "none" }}>Ndërrimet</Link><button style={secondary} onClick={() => void load()}><RefreshCw size={15} /> Rifresko</button></div>
    </header>
    <nav aria-label="POS dhe faturat" style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}><button aria-pressed={activeView === "pos"} onClick={() => setActiveView("pos")} style={{ ...(activeView === "pos" ? button : secondary) }}><ShoppingCart size={15} /> Shitje</button><button aria-pressed={activeView === "invoices"} onClick={() => setActiveView("invoices")} style={{ ...(activeView === "invoices" ? button : secondary) }}><FileText size={15} /> Faturat <span className="status-pill">{invoices.length}</span></button></nav>
    {error && <div role="alert" style={{ background: "#fff0ef", color: "#982d25", padding: 12, borderRadius: 9, marginBottom: 12 }}>{error}</div>}
    {notice && <div role="status" style={{ background: "#edf7f1", color: "#155c3c", padding: 12, borderRadius: 9, marginBottom: 12 }}>{notice}</div>}
    {issuedInvoiceId && <div style={{ ...panel, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div><strong>{issuedNumber ? "Fatura " + issuedNumber : "Draft i ruajtur"}</strong><div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3 }}>{"Kontrollo statusin e pagesës dhe fiskalizimit."}</div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href={`/app/${organizationId}/invoices/${issuedInvoiceId}`} style={{ color: "var(--brand)", fontWeight: 750, alignSelf: "center" }}>Hap faturën →</Link>
        
      </div>
    </div>}
    <div className="pos-layout" style={{ display: activeView === "pos" ? "grid" : "none", gridTemplateColumns: "minmax(0,1.55fr) minmax(310px,0.85fr)", gap: 14, alignItems: "start" }}>
      <section style={panel}>
        <input ref={searchRef} aria-label="Kërko produkt ose skano barkod" placeholder="Kërko produkt ose skano barkod / SKU..." value={search} onChange={(event) => { setSearch(event.target.value); setError(""); }} onKeyDown={handleProductSearchKeyDown} style={{ ...field, marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(145px,1fr))", gap: 9 }}>
          {visibleProducts.map((product) => <button key={product.id} onClick={() => addProduct(product)} style={{ ...secondary, textAlign: "left", minHeight: 100, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 700 }}>{product.name}</span><span style={{ color: "var(--brand)", fontSize: 17, fontWeight: 800 }}>{money(Number(product.unit_price))}</span>
            <small style={{ color: "var(--muted)" }}>{product.item_type === "service" ? "Shërbim" : product.track_stock ? "Stok: " + product.stock_quantity : "Produkt"}</small>
          </button>)}
          {!visibleProducts.length && <p style={{ color: "var(--muted)" }}>Nuk u gjetën produkte aktive.</p>}
        </div>
      </section>
      <aside style={{ ...panel, position: "sticky", top: 12 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}><ShoppingCart size={18} /> Shporta <span className="status-pill">{lines.length}</span></h2>
        <div style={{ display: "grid", gap: 10, maxHeight: "42vh", overflowY: "auto" }}>
          {lines.map((line) => <div key={line.productId} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{line.product!.name}</strong><strong>{money(line.lineTotal)}</strong></div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7 }}>
              <input aria-label={"Sasia " + line.product!.name} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateQuantity(line.productId, event.target.value)} style={{ ...field, width: 105 }} />
              <button style={secondary} onClick={() => setCart((current) => current.filter((row) => row.productId !== line.productId))}>Hiq</button>
            </div>
          </div>)}
          {!lines.length && <p className="cart-empty" style={{ color: "var(--muted)", textAlign: "center", padding: 20 }}>Shporta është bosh.<br/>Zgjidh produktet për të filluar.</p>}
        </div>
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Nëntotali pa TVSH</span><strong>{money(subtotal)}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>TVSH</span><strong>{money(vatTotal)}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20 }}><strong>Totali</strong><strong>{money(total)}</strong></div>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 650 }}>Klienti
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} style={field}><option value="">Klient pa emër</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? " · " + customer.phone : ""}</option>)}</select>
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 650 }}>Mënyra e pagesës
            <select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setConfirmedPayment(false); setCashReceived(""); }} style={field}>
              <option value="cash">Para në dorë</option><option value="card">Kartelë (e pranuar manualisht)</option><option value="bank_transfer">Transfer bankar (i konfirmuar)</option><option value="credit">Me afat — pa pagesë</option>
            </select>
          </label>
          {paymentMethod === "cash" && <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 650 }}>Para të pranuara (€)
            <input type="number" min={total} step="0.01" inputMode="decimal" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder={total.toFixed(2)} style={field} />
            <span style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontWeight: 500 }}><span>Kusuri</span><strong style={{ color: "var(--ink)" }}>{money(cashChange)}</strong></span>
          </label>}
          {paymentMethod !== "credit" && <label style={{ display: "flex", alignItems: "start", gap: 8, fontSize: 12, lineHeight: 1.4 }}>
            <input type="checkbox" checked={confirmedPayment} onChange={(event) => setConfirmedPayment(event.target.checked)} style={{ marginTop: 2 }} />
            Konfirmoj se pagesa është pranuar. Fiskalo nuk proceson pagesa me kartelë.
          </label>}
          <button disabled={busy || !lines.length} onClick={() => void completeSale()} style={{ ...button, width: "100%", opacity: busy || !lines.length ? 0.55 : 1 }}>{busy ? "Duke regjistruar..." : paymentMethod === "credit" ? "Lësho faturën" : "Përfundo shitjen · " + money(total)}</button>
          <button disabled={busy || !cart.length} onClick={() => { setCart([]); setConfirmedPayment(false); setCashReceived(""); }} style={{ ...secondary, width: "100%" }}>Pastro shportën</button>
        </div>
      </aside>
    </div>
    <p style={{ display: activeView === "pos" ? "block" : "none", color: "var(--muted)", fontSize: 11, lineHeight: 1.5, marginTop: 14 }}>Shitjet regjistrohen në arkë. Pas pagesës së plotë, Fiskalo tenton dërgimin automatik në ATK TEST. Pagesat me kartelë nuk procesohen nga aplikacioni.</p>
    <section style={{ display: activeView === "invoices" ? "block" : "none", ...panel }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}><div><h2 style={{ margin: 0, fontSize: 20 }}>Faturat</h2><p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>Shitjet e regjistruara së fundmi</p></div><button onClick={() => setActiveView("pos")} style={button}><Plus size={16} /> Shitje e re</button></div><div style={{ display: "flex", gap: 8, marginBottom: 12 }}><div style={{ position: "relative", flex: 1, maxWidth: 360 }}><Search size={16} style={{ position: "absolute", left: 12, top: 13, color: "var(--muted)" }} /><input className="invoice-search" aria-label="Kërko faturë" value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} placeholder="Kërko sipas numrit ose statusit..." style={{ ...field, paddingLeft: 36 }} /></div></div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr><th style={{ textAlign: "left", padding: 9 }}>Numri</th><th style={{ textAlign: "left", padding: 9 }}>Data</th><th style={{ textAlign: "left", padding: 9 }}>Statusi</th><th style={{ textAlign: "left", padding: 9 }}>Fiskalizimi ATK</th><th style={{ textAlign: "right", padding: 9 }}>Totali</th><th style={{ textAlign: "right", padding: 9 }}> </th></tr></thead><tbody>{visibleInvoices.map((invoice) => <tr key={invoice.id} style={{ borderTop: "1px solid var(--line)" }}><td style={{ padding: 9 }}>{invoice.invoice_number || "Draft"}</td><td style={{ padding: 9 }}>{invoice.issue_date}</td><td style={{ padding: 9 }}><span className={"status-pill " + (invoice.status === "draft" ? "" : invoice.payment_status === "paid" ? "paid" : "unpaid")}>{invoice.status === "draft" ? "Draft" : invoice.payment_status === "paid" ? "Paguar" : "E papaguar"}</span></td><td style={{ padding: 9 }}>{invoice.atk_test_status ? <span className={"status-pill " + (invoice.atk_test_status === "accepted" ? "accepted" : invoice.atk_test_status === "rejected" ? "rejected" : invoice.atk_test_status === "queued" || invoice.atk_test_status === "offline_pending" ? "queued" : "")}>{({ queued: "Në radhë", submitted: "Dërguar", accepted: "Pranuar", rejected: "Refuzuar", offline_pending: "Në pritje", draft: "Draft" } as Record<string,string>)[invoice.atk_test_status] || invoice.atk_test_status}</span> : <span style={{ color: "var(--muted)", fontSize: 12 }}>{invoice.payment_status === "paid" ? "Dërgimi nuk u krye" : "Pas pagesës"}</span>}</td><td style={{ padding: 9, textAlign: "right", fontWeight: 700 }}>{money(Number(invoice.total))}</td><td style={{ padding: 9, textAlign: "right", whiteSpace: "nowrap" }}><Link href={`/app/${organizationId}/invoices/${invoice.id}`} style={{ color: "var(--brand)", fontWeight: 700 }}>Hap <ArrowRight size={14} /></Link></td></tr>)}{!visibleInvoices.length && <tr><td colSpan={6} style={{ padding: 18, color: "var(--muted)", textAlign: "center" }}>Nuk ka fatura ende. Krijo shitjen e parë nga POS.</td></tr>}</tbody></table></div></section>
    <style jsx>{`.pos-layout { grid-template-columns: minmax(0,1.55fr) minmax(310px,0.85fr); } @media (max-width: 760px) { .pos-layout { grid-template-columns: minmax(0,1fr) !important; } .pos-layout aside { position: static !important; } }`}</style>
  </main>;
}
