"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Org = { id: string; legal_name: string; municipality: string; nui: string; vat_registered: boolean; fiscalization_status: string };
type Product = { id: string; name: string; sku: string | null; unit_price: number; vat_rate: number; stock_quantity: number; item_type: string; track_stock: boolean; is_active: boolean };
type Customer = { id: string; name: string; business_number: string | null; email: string | null; phone: string | null };
type Invoice = { id: string; invoice_number: string | null; status: string; issue_date: string; total: number; vat_total: number; fiscalization_status: string; customer_id: string | null; payment_method: string; payment_status: string };
type Expense = { id: string; description: string; supplier_name: string | null; category: string; amount: number; vat_rate: number; expense_date: string };
type Member = { member_user_id: string; member_email: string; member_role: string; joined_at: string };

const panel: React.CSSProperties = { background: "white", border: "1px solid var(--line)", borderRadius: 14, padding: 18 };
const field: React.CSSProperties = { width: "100%", minWidth: 0, border: "1px solid var(--line)", borderRadius: 8, padding: "10px 11px", background: "white", color: "var(--ink)" };
const primary: React.CSSProperties = { border: 0, borderRadius: 8, background: "var(--brand)", color: "white", padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
const secondary: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 8, background: "white", color: "var(--ink)", padding: "9px 12px", fontWeight: 600, cursor: "pointer" };

export default function BusinessDashboard() {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const supabase = useMemo(() => createClient(), []);
  const [org, setOrg] = useState<Org | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [productForm, setProductForm] = useState({ name: "", sku: "", unit_price: "", vat_rate: "18", item_type: "product", stock_quantity: "0", track_stock: true });
  const [customerForm, setCustomerForm] = useState({ name: "", business_number: "", email: "", phone: "" });
  const [expenseForm, setExpenseForm] = useState({ description: "", supplier_name: "", category: "Tjetër", amount: "", vat_rate: "0", expense_date: new Date().toISOString().slice(0, 10) });
  const [invoiceForm, setInvoiceForm] = useState({ customer_id: "", payment_method: "cash" });
  const [invoiceLines, setInvoiceLines] = useState([{ product_id: "", quantity: "1" }]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberForm, setMemberForm] = useState({ email: "", role: "cashier" });
  const [stockForm, setStockForm] = useState({ product_id: "", delta: "", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [orgResult, productResult, customerResult, invoiceResult, expenseResult] = await Promise.all([
      supabase.from("fiskalo_organizations").select("id,legal_name,municipality,nui,vat_registered,fiscalization_status").eq("id", organizationId).single(),
      supabase.from("fiskalo_products").select("*").eq("organization_id", organizationId).order("name"),
      supabase.from("fiskalo_customers").select("*").eq("organization_id", organizationId).order("name"),
      supabase.from("fiskalo_invoices").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      supabase.from("fiskalo_expenses").select("*").eq("organization_id", organizationId).order("expense_date", { ascending: false }),
    ]);
    if (orgResult.error) {
      setError("Nuk ke qasje në këtë biznes ose biznesi nuk ekziston.");
    } else {
      setOrg(orgResult.data as Org);
      setProducts((productResult.data ?? []) as Product[]);
      setCustomers((customerResult.data ?? []) as Customer[]);
      setInvoices((invoiceResult.data ?? []) as Invoice[]);
      setExpenses((expenseResult.data ?? []) as Expense[]);
      if (productResult.error || customerResult.error || invoiceResult.error || expenseResult.error) setError("Disa të dhëna nuk u ngarkuan. Rifresko faqen.");
    }
    setLoading(false);
  }, [organizationId, supabase]);

  useEffect(() => { void load(); }, [load]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { error: saveError } = await supabase.from("fiskalo_products").insert({
      organization_id: organizationId, name: productForm.name.trim(), sku: productForm.sku.trim() || null,
      unit_price: Number(productForm.unit_price), vat_rate: Number(productForm.vat_rate), item_type: productForm.item_type,
      stock_quantity: Number(productForm.stock_quantity || 0), track_stock: productForm.track_stock,
    });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setProductForm({ name: "", sku: "", unit_price: "", vat_rate: "18", item_type: "product", stock_quantity: "0", track_stock: true });
    setNotice("Artikulli u ruajt."); await load();
  }

  async function adjustStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { data, error: stockError } = await supabase.rpc("fiskalo_adjust_stock", {
      target_product: stockForm.product_id, quantity_delta: Number(stockForm.delta), movement_note: stockForm.note,
    });
    setBusy(false);
    if (stockError) { setError(stockError.message); return; }
    setNotice("Stoku u përditësua. Gjendja e re: " + data + "."); setStockForm({ product_id: "", delta: "", note: "" }); await load();
  }

  async function addCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { error: saveError } = await supabase.from("fiskalo_customers").insert({
      organization_id: organizationId, name: customerForm.name.trim(), business_number: customerForm.business_number.trim() || null,
      email: customerForm.email.trim() || null, phone: customerForm.phone.trim() || null,
    });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setCustomerForm({ name: "", business_number: "", email: "", phone: "" }); setNotice("Klienti u ruajt."); await load();
  }

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setBusy(false); setError("Sesioni ka skaduar."); return; }
    const { error: saveError } = await supabase.from("fiskalo_expenses").insert({
      organization_id: organizationId, created_by: auth.user.id, description: expenseForm.description.trim(),
      supplier_name: expenseForm.supplier_name.trim() || null, category: expenseForm.category,
      amount: Number(expenseForm.amount), vat_rate: Number(expenseForm.vat_rate), expense_date: expenseForm.expense_date,
    });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setExpenseForm({ description: "", supplier_name: "", category: "Tjetër", amount: "", vat_rate: "0", expense_date: new Date().toISOString().slice(0, 10) });
    setNotice("Shpenzimi u regjistrua."); await load();
  }

  async function createInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const selectedLines = invoiceLines.map((line) => ({ line, product: products.find((item) => item.id === line.product_id) }));
    if (selectedLines.some(({ line, product }) => !product || !(Number(line.quantity) > 0))) {
      setBusy(false); setError("Zgjidh produktin dhe sasinë për secilin rresht."); return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setBusy(false); setError("Sesioni ka skaduar."); return; }
    const { data: invoice, error: invoiceError } = await supabase.from("fiskalo_invoices").insert({
      organization_id: organizationId, created_by: auth.user.id, customer_id: invoiceForm.customer_id || null,
      payment_method: invoiceForm.payment_method, payment_status: invoiceForm.payment_method === "credit" ? "unpaid" : "paid",
      issue_date: new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (invoiceError || !invoice) { setBusy(false); setError(invoiceError?.message ?? "Fatura nuk u krijua."); return; }
    const { error: itemError } = await supabase.from("fiskalo_invoice_items").insert(selectedLines.map(({ line, product }) => ({
      invoice_id: invoice.id, product_id: product!.id, description: product!.name, quantity: Number(line.quantity),
      unit_price: Number(product!.unit_price), vat_rate: Number(product!.vat_rate),
    })));
    if (itemError) { setBusy(false); setError("Fatura draft u krijua, por artikujt nuk u shtuan: " + itemError.message); await load(); return; }
    const { data: invoiceNumber, error: issueError } = await supabase.rpc("fiskalo_issue_invoice", { target_invoice: invoice.id });
    setBusy(false);
    if (issueError) { setError("Fatura u ruajt si draft, por nuk u lëshua: " + issueError.message); await load(); return; }
    setInvoiceForm({ customer_id: "", payment_method: "cash" }); setInvoiceLines([{ product_id: "", quantity: "1" }]);
    setNotice("Fatura u lëshua me numër " + invoiceNumber + "."); await load();
  }

  async function loadMembers() {
    setError(""); setNotice("");
    const { data, error: memberError } = await supabase.rpc("fiskalo_list_members", { target_org: organizationId });
    if (memberError) { setError(memberError.message); return; }
    setMembers((data ?? []) as Member[]);
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { error: memberError } = await supabase.rpc("fiskalo_add_existing_member", {
      target_org: organizationId, target_email: memberForm.email.trim(), target_role: memberForm.role,
    });
    setBusy(false);
    if (memberError) { setError(memberError.message); return; }
    setMemberForm({ email: "", role: "cashier" }); setNotice("Anëtari u shtua ose roli u përditësua."); await loadMembers();
  }

  async function removeMember(userId: string) {
    if (!window.confirm("A dëshiron ta largosh këtë anëtar nga biznesi?")) return;
    const { error: removeError } = await supabase.rpc("fiskalo_remove_member", { target_org: organizationId, target_user: userId });
    if (removeError) { setError(removeError.message); return; }
    setNotice("Qasja e anëtarit u largua."); await loadMembers();
  }

  function exportInvoices() {
    downloadCsv("fiskalo-faturat.csv", [["Numri", "Data", "Statusi", "Totali EUR", "TVSH EUR"], ...invoices.map((i) => [i.invoice_number || "Draft", i.issue_date, i.status, i.total, i.vat_total])]);
  }

  function exportExpenses() {
    downloadCsv("fiskalo-shpenzimet.csv", [["Data", "Përshkrimi", "Furnitori", "Kategoria", "Shuma EUR"], ...expenses.map((e) => [e.expense_date, e.description, e.supplier_name || "", e.category, e.amount])]);
  }

  const revenue = invoices.filter((invoice) => invoice.status === "issued").reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const draftCount = invoices.filter((invoice) => invoice.status === "draft").length;
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const fmt = (value: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(value);
  const tabItems = [{ id: "overview", label: "Përmbledhje" }, { id: "products", label: "Produktet" }, { id: "customers", label: "Klientët" }, { id: "invoices", label: "Faturat" }, { id: "expenses", label: "Shpenzimet" }, { id: "reports", label: "Raportet" }, { id: "team", label: "Ekipi" }];

  if (loading) return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>Duke ngarkuar panelin...</main>;
  if (!org) return <main style={{ maxWidth: 800, margin: "0 auto", padding: 32 }}><p>{error || "Biznesi nuk u gjet."}</p><Link href="/app">Kthehu te bizneset</Link></main>;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 60px" }}>
      <header className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div><Link href="/app" style={{ color: "var(--brand)", fontWeight: 800, fontSize: 22 }}>fiskalo</Link><div style={{ color: "var(--muted)", fontSize: 12 }}>Paneli i biznesit</div></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Link href="/app" style={secondary}>Bizneset</Link><button onClick={signOut} style={secondary}>Dil nga llogaria</button></div>
      </header>
      <section style={{ ...panel, marginBottom: 18, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div><h1 style={{ margin: "0 0 5px", fontSize: 27 }}>{org.legal_name}</h1><span style={{ color: "var(--muted)", fontSize: 13 }}>{org.municipality} · NUI: {org.nui}</span></div>
        <div style={{ alignSelf: "center", fontSize: 12, color: "var(--muted)", maxWidth: 290 }}>Fiskalizimi zyrtar: <strong>{org.fiscalization_status === "certified" ? "I konfiguruar" : "Jo aktiv"}</strong><br />Fiskalo nuk është i certifikuar nga ATK.</div>
      </section>
      <nav className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {tabItems.map((item) => <button key={item.id} onClick={() => { setTab(item.id); setNotice(""); setError(""); if (item.id === "team") void loadMembers(); }} style={{ ...secondary, ...(tab === item.id ? { background: "var(--brand)", color: "white", borderColor: "var(--brand)" } : {}) }}>{item.label}</button>)}
      </nav>
      {error && <p role="alert" style={{ background: "#fff0ef", color: "#9d2d26", padding: 12, borderRadius: 9, fontSize: 13 }}>{error}</p>}
      {notice && <p role="status" style={{ background: "#edf7f1", color: "#155c3c", padding: 12, borderRadius: 9, fontSize: 13 }}>{notice}</p>}

      {tab === "overview" && <>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 18 }}>
          <Stat label="Qarkullimi i faturuar" value={fmt(revenue)} />
          <Stat label="Fatura gjithsej" value={String(invoices.length)} />
          <Stat label="Draft" value={String(draftCount)} />
          <Stat label="Shpenzimet" value={fmt(expenseTotal)} />
          <Stat label="Produkte / shërbime" value={String(products.length)} />
        </section>
        <section style={{ ...panel, marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>Gjendja e biznesit</h2>
          <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 13 }}>Regjistro artikujt, klientët, faturat dhe shpenzimet. Faturat e lëshuara ruhen me numër unik dhe nuk mund të ndryshohen. Ky version nuk kryen fiskalizim zyrtar dhe nuk zëvendëson pajisjen ose softuerin e certifikuar nga ATK.</p>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}><button style={primary} onClick={() => setTab("invoices")}>+ Krijo faturë</button><button style={secondary} onClick={() => setTab("products")}>+ Shto produkt</button><button style={secondary} onClick={() => setTab("expenses")}>+ Regjistro shpenzim</button></div>
        </section>
        <section style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Faturat e fundit</h2><InvoiceTable invoices={invoices.slice(0, 5)} fmt={fmt} customers={customers} /></section>
      </>}

      {tab === "products" && <section style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <form onSubmit={addProduct} style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Shto produkt / shërbim</h2>
          <label className="field-label">Emri<input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} style={field} /></label>
          <label className="field-label">Kodi / SKU<input value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} style={field} /></label>
          <label className="field-label">Lloji<select value={productForm.item_type} onChange={(e) => setProductForm({ ...productForm, item_type: e.target.value })} style={field}><option value="product">Produkt</option><option value="service">Shërbim</option></select></label>
          <label className="field-label">Çmimi (€)<input required type="number" min="0" step="0.01" value={productForm.unit_price} onChange={(e) => setProductForm({ ...productForm, unit_price: e.target.value })} style={field} /></label>
          <label className="field-label">TVSH<select value={productForm.vat_rate} onChange={(e) => setProductForm({ ...productForm, vat_rate: e.target.value })} style={field}><option value="0">0%</option><option value="8">8%</option><option value="18">18%</option></select></label>
          {productForm.item_type === "product" && <label className="field-label">Stoku fillestar<input type="number" step="0.001" value={productForm.stock_quantity} onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })} style={field} /></label>}
          <button disabled={busy} style={{ ...primary, width: "100%", marginTop: 10 }}>Ruaj artikullin</button>
        </form>
        <div style={{ display: "grid", gap: 14 }}>
          <section style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Lista e artikujve ({products.length})</h2><div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Emri</th><th>Lloji</th><th>Çmimi</th><th>TVSH</th><th>Stoku</th></tr></thead><tbody>{products.map((p) => <tr key={p.id}><td>{p.name}<small>{p.sku || ""}</small></td><td>{p.item_type === "service" ? "Shërbim" : "Produkt"}</td><td>{fmt(Number(p.unit_price))}</td><td>{p.vat_rate}%</td><td>{p.track_stock ? p.stock_quantity : "—"}</td></tr>)}{!products.length && <tr><td colSpan={5}>Nuk ka artikuj ende.</td></tr>}</tbody></table></div></section>
          <form onSubmit={adjustStock} style={panel}><h2 style={{ fontSize: 17, marginTop: 0 }}>Rregullo stokun</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            <label className="field-label">Produkti<select required value={stockForm.product_id} onChange={(e) => setStockForm({ ...stockForm, product_id: e.target.value })} style={field}><option value="">Zgjidh produktin</option>{products.filter((p) => p.track_stock).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.stock_quantity}</option>)}</select></label>
            <label className="field-label">Ndryshimi (+ / -)<input required type="number" step="0.001" value={stockForm.delta} onChange={(e) => setStockForm({ ...stockForm, delta: e.target.value })} style={field} /></label>
            <label className="field-label">Shënim<input value={stockForm.note} onChange={(e) => setStockForm({ ...stockForm, note: e.target.value })} style={field} /></label>
          </div><button disabled={busy || !products.some((p) => p.track_stock)} style={primary}>Ruaj ndryshimin e stokut</button></form>
        </div>
      </section>}

      {tab === "customers" && <section style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <form onSubmit={addCustomer} style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Shto klient</h2>
          <label className="field-label">Emri / biznesi<input required value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} style={field} /></label>
          <label className="field-label">NUI / numri i biznesit<input value={customerForm.business_number} onChange={(e) => setCustomerForm({ ...customerForm, business_number: e.target.value })} style={field} /></label>
          <label className="field-label">Email<input type="email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} style={field} /></label>
          <label className="field-label">Telefoni<input value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} style={field} /></label>
          <button disabled={busy} style={{ ...primary, width: "100%", marginTop: 10 }}>Ruaj klientin</button>
        </form>
        <section style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Klientët ({customers.length})</h2><div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Emri</th><th>NUI</th><th>Email</th><th>Telefoni</th></tr></thead><tbody>{customers.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.business_number || "—"}</td><td>{c.email || "—"}</td><td>{c.phone || "—"}</td></tr>)}{!customers.length && <tr><td colSpan={4}>Nuk ka klientë ende.</td></tr>}</tbody></table></div></section>
      </section>}

      {tab === "invoices" && <section style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <form onSubmit={createInvoice} style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Lësho faturë</h2>
          <label className="field-label">Klienti<select value={invoiceForm.customer_id} onChange={(e) => setInvoiceForm({ ...invoiceForm, customer_id: e.target.value })} style={field}><option value="">Klient pa emër</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="field-label">Mënyra e pagesës<select value={invoiceForm.payment_method} onChange={(e) => setInvoiceForm({ ...invoiceForm, payment_method: e.target.value })} style={field}><option value="cash">Para në dorë</option><option value="card">Kartelë</option><option value="bank_transfer">Transfer bankar</option><option value="credit">Me afat / e papaguar</option></select></label><p style={{ color: "var(--muted)", fontSize: 11, marginTop: -6 }}>Pagesat shënohen manualisht sipas konfirmimit të arkëtarit. Përpunimi i kartelave nuk është i integruar.</p><p style={{ color: "var(--muted)", fontSize: 11, marginTop: -6 }}>Pagesat shënohen manualisht sipas konfirmimit të arkëtarit. Përpunimi i kartelave nuk është i integruar.</p>
          <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>Artikujt e faturës</h3>
          {invoiceLines.map((line, index) => <div key={index} style={{ border: "1px solid var(--line)", borderRadius: 9, padding: 10, marginBottom: 9 }}>
            <label className="field-label">Produkti / shërbimi<select required value={line.product_id} onChange={(e) => setInvoiceLines((current) => current.map((row, i) => i === index ? { ...row, product_id: e.target.value } : row))} style={field}><option value="">Zgjidh artikullin</option>{products.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(Number(p.unit_price))}</option>)}</select></label>
            <div style={{ display: "flex", gap: 8, alignItems: "end" }}><label className="field-label" style={{ flex: 1 }}>Sasia<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setInvoiceLines((current) => current.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row))} style={field} /></label>{invoiceLines.length > 1 && <button type="button" onClick={() => setInvoiceLines((current) => current.filter((_, i) => i !== index))} style={secondary}>Hiq</button>}</div>
          </div>)}
          <button type="button" onClick={() => setInvoiceLines((current) => [...current, { product_id: "", quantity: "1" }])} style={{ ...secondary, width: "100%" }}>+ Shto artikull</button>
          <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>Numri i faturës caktohet automatikisht gjatë lëshimit. Stoku kontrollohet para lëshimit dhe zbritet në mënyrë atomike. Faturat e lëshuara nuk mund të ndryshohen.</p>
          <button disabled={busy || products.length === 0} style={{ ...primary, width: "100%" }}>{busy ? "Duke ruajtur..." : "Krijo dhe lësho faturën"}</button>
          {!products.length && <small>Shto së pari një produkt ose shërbim.</small>}
        </form>
        <section style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Faturat ({invoices.length})</h2><InvoiceTable invoices={invoices} fmt={fmt} customers={customers} /></section>
      </section>}

      {tab === "expenses" && <section style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <form onSubmit={addExpense} style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Regjistro shpenzim</h2>
          <label className="field-label">Përshkrimi<input required value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} style={field} /></label>
          <label className="field-label">Furnitori<input value={expenseForm.supplier_name} onChange={(e) => setExpenseForm({ ...expenseForm, supplier_name: e.target.value })} style={field} /></label>
          <label className="field-label">Kategoria<select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} style={field}>{["Qira","Paga","Furnizim","Transport","Shërbime","Komunalitë","Tjetër"].map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="field-label">Shuma (€)<input required type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} style={field} /></label>
          <label className="field-label">TVSH<select value={expenseForm.vat_rate} onChange={(e) => setExpenseForm({ ...expenseForm, vat_rate: e.target.value })} style={field}><option value="0">0%</option><option value="8">8%</option><option value="18">18%</option></select></label>
          <label className="field-label">Data<input required type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} style={field} /></label>
          <button disabled={busy} style={{ ...primary, width: "100%", marginTop: 10 }}>Ruaj shpenzimin</button>
        </form>
        <section style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Shpenzimet ({expenses.length})</h2><div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Data</th><th>Përshkrimi</th><th>Furnitori</th><th>Kategoria</th><th>Shuma</th></tr></thead><tbody>{expenses.map((e) => <tr key={e.id}><td>{e.expense_date}</td><td>{e.description}</td><td>{e.supplier_name || "—"}</td><td>{e.category}</td><td>{fmt(Number(e.amount))}</td></tr>)}{!expenses.length && <tr><td colSpan={5}>Nuk ka shpenzime ende.</td></tr>}</tbody></table></div></section>
      </section>}
      {tab === "reports" && <section style={{ display: "grid", gap: 14 }}>
        <div style={{ ...panel, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div><h2 style={{ margin: "0 0 5px", fontSize: 19 }}>Raporti i biznesit</h2><p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>Përmbledhje operative nga të dhënat e regjistruara në Fiskalo.</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={secondary} onClick={exportInvoices}>Eksporto faturat CSV</button><button style={secondary} onClick={exportExpenses}>Eksporto shpenzimet CSV</button></div>
        </div>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <Stat label="Fatura të lëshuara" value={String(invoices.filter((i) => i.status === "issued").length)} />
          <Stat label="Të hyra (bruto)" value={fmt(revenue)} />
          <Stat label="TVSH në fatura" value={fmt(invoices.filter((i) => i.status === "issued").reduce((s, i) => s + Number(i.vat_total), 0))} />
          <Stat label="Shpenzime të regjistruara" value={fmt(expenseTotal)} />
          <Stat label="Diferenca operative" value={fmt(revenue - expenseTotal)} />
        </section>
        <section style={panel}><h3 style={{ marginTop: 0 }}>Shënim për raportet tatimore</h3><p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>Këto janë raporte të brendshme menaxheriale. Nuk janë libra zyrtarë të shitjes/blerjes, deklarata tatimore apo raportim i pranuar nga ATK. Klasifikimi dhe trajtimi tatimor duhet të verifikohen para përdorimit për deklarim.</p></section>
      </section>}

      {tab === "team" && <section style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <form onSubmit={addMember} style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Shto anëtar të ekipit</h2>
          <label className="field-label">Email i llogarisë<input required type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} style={field} /></label>
          <label className="field-label">Roli<select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} style={field}><option value="administrator">Administrator</option><option value="accountant">Kontabilist</option><option value="manager">Menaxher</option><option value="cashier">Arkëtar</option></select></label>
          <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>Personi duhet të ketë krijuar paraprakisht llogari në Fiskalo. Ftesat me email do të shtohen në fazën e konfigurimit të email serverit.</p>
          <button disabled={busy} style={{ ...primary, width: "100%" }}>Shto / përditëso rolin</button>
        </form>
        <section style={panel}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><h2 style={{ fontSize: 18, marginTop: 0 }}>Anëtarët</h2><button style={secondary} onClick={() => void loadMembers()}>Rifresko</button></div>
          <div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Email</th><th>Roli</th><th></th></tr></thead><tbody>{members.map((m) => <tr key={m.member_user_id}><td>{m.member_email}</td><td>{({ owner: "Pronar", administrator: "Administrator", accountant: "Kontabilist", manager: "Menaxher", cashier: "Arkëtar" } as Record<string,string>)[m.member_role] || m.member_role}</td><td>{m.member_role !== "owner" && <button style={secondary} onClick={() => void removeMember(m.member_user_id)}>Largo</button>}</td></tr>)}{!members.length && <tr><td colSpan={3}>Shtyp “Rifresko” për të parë anëtarët. Kjo pjesë është e disponueshme për pronarët dhe administratorët.</td></tr>}</tbody></table></div>
        </section>
      </section>}
      <footer style={{ marginTop: 24, color: "var(--muted)", fontSize: 11 }}>Të dhënat ruhen në hapësirën e këtij biznesi. Fiskalizimi zyrtar dhe certifikimi ATK nuk janë aktivizuar.</footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <article style={panel}><div style={{ color: "var(--muted)", fontSize: 12 }}>{label}</div><strong style={{ display: "block", fontSize: 22, marginTop: 8 }}>{value}</strong></article>;
}

function InvoiceTable({ invoices, fmt, customers }: { invoices: Invoice[]; fmt: (value: number) => string; customers: Customer[] }) {
  return <div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Numri</th><th>Data</th><th>Klienti</th><th>Statusi</th><th>Pagesa</th><th>Totali</th><th></th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.invoice_number || "Draft"}</td><td>{invoice.issue_date}</td><td>{customers.find((c) => c.id === invoice.customer_id)?.name || "—"}</td><td>{invoice.status === "issued" ? "E lëshuar" : invoice.status === "cancelled" ? "Anuluar" : "Draft"}</td><td>{invoice.payment_status === "paid" ? "Paguar" : invoice.payment_method === "credit" ? "Me afat" : "E papaguar"}</td><td>{fmt(Number(invoice.total))}</td><td>{invoice.status === "issued" && <button className="no-print" style={secondary} onClick={() => window.print()}>Printo</button>}</td></tr>)}{!invoices.length && <tr><td colSpan={7}>Nuk ka fatura ende.</td></tr>}</tbody></table></div>;
}




function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
