"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Product = { id: string; name: string; sku: string | null; unit_price: number; vat_rate: number; stock_quantity: number; track_stock: boolean; item_type: string; is_active: boolean };
type Customer = { id: string; name: string; phone: string | null };
type CartLine = { productId: string; quantity: string };

const panel: React.CSSProperties = { background: "white", border: "1px solid var(--line)", borderRadius: 14, padding: 16 };
const field: React.CSSProperties = { width: "100%", minWidth: 0, border: "1px solid var(--line)", borderRadius: 9, padding: "11px 12px", background: "white", color: "var(--ink)" };
const button: React.CSSProperties = { border: 0, borderRadius: 9, padding: "12px 15px", background: "var(--brand)", color: "white", fontWeight: 750, cursor: "pointer" };
const secondary: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 9, padding: "10px 12px", background: "white", color: "var(--ink)", fontWeight: 650, cursor: "pointer" };
const money = (n: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(n);

export default function WebPosPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [confirmedPayment, setConfirmedPayment] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issuedInvoiceId, setIssuedInvoiceId] = useState("");
  const [issuedNumber, setIssuedNumber] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [productResult, customerResult] = await Promise.all([
      supabase.from("fiskalo_products").select("id,name,sku,unit_price,vat_rate,stock_quantity,track_stock,item_type,is_active").eq("organization_id", organizationId).eq("is_active", true).order("name"),
      supabase.from("fiskalo_customers").select("id,name,phone").eq("organization_id", organizationId).order("name"),
    ]);
    if (productResult.error || customerResult.error) setError("Nuk u ngarkuan produktet ose klientët. Kontrollo qasjen në biznes.");
    setProducts((productResult.data ?? []) as Product[]);
    setCustomers((customerResult.data ?? []) as Customer[]);
    setLoading(false);
  }, [organizationId, supabase]);

  useEffect(() => { void load(); }, [load]);

  const visibleProducts = products.filter((product) => {
    const q = search.trim().toLocaleLowerCase();
    return !q || product.name.toLocaleLowerCase().includes(q) || (product.sku ?? "").toLocaleLowerCase().includes(q);
  });
  const lines = cart.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    const quantity = Number(line.quantity);
    return { ...line, product, quantity, lineTotal: product && Number.isFinite(quantity) ? product.unit_price * quantity : 0 };
  }).filter((line) => line.product);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const total = lines.reduce((sum, line) => {
    const base = line.lineTotal;
    return sum + base + base * Number(line.product!.vat_rate) / 100;
  }, 0);

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

  async function completeSale() {
    setError(""); setNotice(""); setIssuedInvoiceId(""); setIssuedNumber("");
    const valid = lines.filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    if (!valid.length || valid.length !== lines.length) { setError("Shto artikuj dhe kontrollo sasitë."); return; }
    if (paymentMethod !== "credit" && !confirmedPayment) { setError("Konfirmo që pagesa është pranuar para se ta regjistrosh si të paguar."); return; }
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

    setBusy(false);
    setIssuedInvoiceId(invoice.id);
    setIssuedNumber(String(invoiceNumber ?? ""));
    setNotice(paymentMethod === "credit"
      ? "Fatura u lëshua. Pagesa mbeti e papaguar."
      : "Shitja u regjistrua dhe pagesa u shënua si e pranuar.");
    setCart([]);
    setCustomerId("");
    setPaymentMethod("cash");
    setConfirmedPayment(false);
    await load();
  }

  if (loading) return <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>Duke hapur POS...</main>;

  return <main style={{ maxWidth: 1440, margin: "0 auto", padding: "18px clamp(12px,3vw,28px) 50px" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      <div><Link href={`/app/${organizationId}`} style={{ color: "var(--brand)", fontWeight: 750 }}>← Paneli i biznesit</Link><h1 style={{ margin: "8px 0 0", fontSize: 27 }}>Pika e shitjes</h1><div style={{ color: "var(--muted)", fontSize: 12 }}>POS për shitje dhe fatura të brendshme</div></div>
      <button style={secondary} onClick={() => void load()}>Rifresko produktet</button>
    </header>
    {error && <div role="alert" style={{ background: "#fff0ef", color: "#982d25", padding: 12, borderRadius: 9, marginBottom: 12 }}>{error}</div>}
    {notice && <div role="status" style={{ background: "#edf7f1", color: "#155c3c", padding: 12, borderRadius: 9, marginBottom: 12 }}>{notice}</div>}
    {issuedInvoiceId && <div style={{ ...panel, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
      <strong>{issuedNumber ? "Fatura " + issuedNumber : "Draft i ruajtur"}</strong>
      <Link href={`/app/${organizationId}/invoices/${issuedInvoiceId}`} style={{ color: "var(--brand)", fontWeight: 750 }}>Hap faturën dhe pagesën →</Link>
    </div>}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(310px,0.85fr)", gap: 14, alignItems: "start" }}>
      <section style={panel}>
        <input aria-label="Kërko produkt" placeholder="Kërko sipas emrit ose SKU..." value={search} onChange={(event) => setSearch(event.target.value)} style={{ ...field, marginBottom: 12 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(145px,1fr))", gap: 9 }}>
          {visibleProducts.map((product) => <button key={product.id} onClick={() => addProduct(product)} style={{ ...secondary, textAlign: "left", minHeight: 100, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 700 }}>{product.name}</span><span style={{ color: "var(--brand)", fontSize: 17, fontWeight: 800 }}>{money(Number(product.unit_price))}</span>
            <small style={{ color: "var(--muted)" }}>{product.item_type === "service" ? "Shërbim" : product.track_stock ? "Stok: " + product.stock_quantity : "Produkt"}</small>
          </button>)}
          {!visibleProducts.length && <p style={{ color: "var(--muted)" }}>Nuk u gjetën produkte aktive.</p>}
        </div>
      </section>
      <aside style={{ ...panel, position: "sticky", top: 12 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 19 }}>Shporta ({lines.length})</h2>
        <div style={{ display: "grid", gap: 10, maxHeight: "42vh", overflowY: "auto" }}>
          {lines.map((line) => <div key={line.productId} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{line.product!.name}</strong><strong>{money(line.lineTotal)}</strong></div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7 }}>
              <input aria-label={"Sasia " + line.product!.name} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateQuantity(line.productId, event.target.value)} style={{ ...field, width: 105 }} />
              <button style={secondary} onClick={() => setCart((current) => current.filter((row) => row.productId !== line.productId))}>Hiq</button>
            </div>
          </div>)}
          {!lines.length && <p style={{ color: "var(--muted)", textAlign: "center", padding: 18 }}>Zgjidh produktet për të filluar shitjen.</p>}
        </div>
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 12, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Nëntotali pa TVSH (orientues)</span><strong>{money(subtotal)}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20 }}><strong>Totali</strong><strong>{money(total)}</strong></div>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 650 }}>Klienti
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} style={field}><option value="">Klient pa emër</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? " · " + customer.phone : ""}</option>)}</select>
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 650 }}>Mënyra e pagesës
            <select value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setConfirmedPayment(false); }} style={field}>
              <option value="cash">Para në dorë</option><option value="card">Kartelë (e pranuar manualisht)</option><option value="bank_transfer">Transfer bankar (i konfirmuar)</option><option value="credit">Me afat — pa pagesë</option>
            </select>
          </label>
          {paymentMethod !== "credit" && <label style={{ display: "flex", alignItems: "start", gap: 8, fontSize: 12, lineHeight: 1.4 }}>
            <input type="checkbox" checked={confirmedPayment} onChange={(event) => setConfirmedPayment(event.target.checked)} style={{ marginTop: 2 }} />
            Konfirmoj se pagesa është pranuar. Fiskalo nuk proceson pagesa me kartelë.
          </label>}
          <button disabled={busy || !lines.length} onClick={() => void completeSale()} style={{ ...button, width: "100%", opacity: busy || !lines.length ? 0.55 : 1 }}>{busy ? "Duke regjistruar..." : paymentMethod === "credit" ? "Lësho faturën" : "Përfundo shitjen · " + money(total)}</button>
          <button disabled={busy || !cart.length} onClick={() => { setCart([]); setConfirmedPayment(false); }} style={{ ...secondary, width: "100%" }}>Pastro shportën</button>
        </div>
      </aside>
    </div>
    <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.5, marginTop: 14 }}>Ky POS krijon dhe lëshon faturë të brendshme në Fiskalo. Nuk është ende POS fiskal i certifikuar nga ATK dhe nuk dërgon kupon fiskal. Pagesat me kartelë nuk procesohen nga aplikacioni.</p>
    <style jsx>{`@media (max-width: 760px) { main > div:nth-of-type(2) { grid-template-columns: minmax(0,1fr) !important; } aside { position: static !important; } }`}</style>
  </main>;
}
