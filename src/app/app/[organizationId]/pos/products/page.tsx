"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Product = {
  id: string; name: string; sku: string | null; item_type: string; unit: string;
  unit_price: number; vat_rate: number; stock_quantity: number; track_stock: boolean;
  is_active: boolean; atk_unit_code: string | null; atk_tax_code: string | null; atk_item_category_code: string | null;
};
const blank = { name: "", sku: "", item_type: "product", unit: "copë", unit_price: "0", vat_rate: "18",
  stock_quantity: "0", track_stock: false, atk_unit_code: "", atk_tax_code: "", atk_item_category_code: "" };
const field: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", borderRadius: 9, padding: "10px 11px", background: "white", color: "var(--ink)" };
const primary: React.CSSProperties = { border: 0, borderRadius: 9, padding: "11px 15px", background: "var(--brand)", color: "white", fontWeight: 750, cursor: "pointer" };

export default function PosProductsPage() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from("fiskalo_products")
      .select("id,name,sku,item_type,unit,unit_price,vat_rate,stock_quantity,track_stock,is_active,atk_unit_code,atk_tax_code,atk_item_category_code")
      .eq("organization_id", organizationId).order("name");
    if (loadError) setError(loadError.message);
    else setProducts((data ?? []) as Product[]);
  }, [organizationId, supabase]);
  useEffect(() => { void load(); }, [load]);

  const visible = products.filter((p) => (p.name + " " + (p.sku || "")).toLowerCase().includes(search.trim().toLowerCase()));
  function edit(product: Product) {
    setEditingId(product.id);
    setForm({ name: product.name, sku: product.sku || "", item_type: product.item_type, unit: product.unit || "copë",
      unit_price: String(product.unit_price), vat_rate: String(product.vat_rate), stock_quantity: String(product.stock_quantity),
      track_stock: product.track_stock, atk_unit_code: product.atk_unit_code || "", atk_tax_code: product.atk_tax_code || "",
      atk_item_category_code: product.atk_item_category_code || "" });
    setError(""); setNotice("");
  }
  function reset() { setEditingId(""); setForm(blank); }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const price = Number(form.unit_price), vat = Number(form.vat_rate), stock = Number(form.stock_quantity);
    if (!form.name.trim() || !Number.isFinite(price) || price < 0 || ![0, 8, 18].includes(vat) ||
        !Number.isFinite(stock) || stock < 0) {
      setBusy(false); setError("Kontrollo emrin, çmimin, TVSH-në (0, 8 ose 18) dhe stokun."); return;
    }
    const values = { organization_id: organizationId, name: form.name.trim(), sku: form.sku.trim() || null,
      item_type: form.item_type, unit: form.unit.trim() || "copë", unit_price: price, vat_rate: vat,
      stock_quantity: stock, track_stock: form.item_type === "product" && form.track_stock,
      atk_unit_code: form.atk_unit_code.trim() || null, atk_tax_code: form.atk_tax_code.trim().toUpperCase() || null,
      atk_item_category_code: form.atk_item_category_code.trim() || null };
    const result = editingId
      ? await supabase.from("fiskalo_products").update(values).eq("organization_id", organizationId).eq("id", editingId)
      : await supabase.from("fiskalo_products").insert(values);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setNotice(editingId ? "Produkti u përditësua." : "Produkti u shtua.");
    reset(); await load();
  }

  async function toggleActive(product: Product) {
    setBusy(true); setError(""); setNotice("");
    const { error: updateError } = await supabase.from("fiskalo_products")
      .update({ is_active: !product.is_active }).eq("organization_id", organizationId).eq("id", product.id);
    setBusy(false);
    if (updateError) setError(updateError.message); else { setNotice(product.is_active ? "Produkti u çaktivizua." : "Produkti u aktivizua."); await load(); }
  }

  return <main style={{ maxWidth: 1050, margin: "0 auto", padding: "22px 16px 50px" }}>
    <Link href={"/app/" + organizationId + "/pos"} style={{ color: "var(--brand)", fontWeight: 750 }}>← Kthehu te arka</Link>
    <h1 style={{ margin: "12px 0 4px", fontSize: 27 }}>Produktet dhe shërbimet</h1>
    <p style={{ color: "var(--muted)", fontSize: 13 }}>Katalogu i artikujve që shiten në arkë. Kodet ATK plotësohen sipas katalogut zyrtar përpara fiskalizimit.</p>
    {error && <div role="alert" style={{ background: "#fff0ef", color: "#982d25", padding: 12, borderRadius: 9, marginBottom: 12 }}>{error}</div>}
    {notice && <div role="status" style={{ background: "#edf7f1", color: "#155c3c", padding: 12, borderRadius: 9, marginBottom: 12 }}>{notice}</div>}
    <form onSubmit={save} style={{ background: "white", border: "1px solid var(--line)", borderRadius: 13, padding: 16, display: "grid", gap: 11, marginBottom: 18 }}>
      <strong>{editingId ? "Ndrysho artikullin" : "Shto artikull të ri"}</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <label style={{ fontSize: 12 }}>Emri<input required value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} style={field}/></label>
        <label style={{ fontSize: 12 }}>SKU / Barkodi<input value={form.sku} onChange={e=>setForm(v=>({...v,sku:e.target.value}))} style={field}/></label>
        <label style={{ fontSize: 12 }}>Lloji<select value={form.item_type} onChange={e=>setForm(v=>({...v,item_type:e.target.value}))} style={field}><option value="product">Produkt</option><option value="service">Shërbim</option></select></label>
        <label style={{ fontSize: 12 }}>Njësia<input value={form.unit} onChange={e=>setForm(v=>({...v,unit:e.target.value}))} style={field}/></label>
        <label style={{ fontSize: 12 }}>Çmimi (€)<input required type="number" min="0" step="0.01" value={form.unit_price} onChange={e=>setForm(v=>({...v,unit_price:e.target.value}))} style={field}/></label>
        <label style={{ fontSize: 12 }}>TVSH<select value={form.vat_rate} onChange={e=>setForm(v=>({...v,vat_rate:e.target.value}))} style={field}><option value="0">0%</option><option value="8">8%</option><option value="18">18%</option></select></label>
        <label style={{ fontSize: 12 }}>Stoku<input type="number" min="0" step="0.001" value={form.stock_quantity} onChange={e=>setForm(v=>({...v,stock_quantity:e.target.value}))} style={field}/></label>
      </div>
      {form.item_type === "product" && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={form.track_stock} onChange={e=>setForm(v=>({...v,track_stock:e.target.checked}))}/> Menaxho stokun</label>}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <strong style={{ fontSize: 13 }}>Kodet fiskale ATK</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>Kodi i njësisë<input value={form.atk_unit_code} onChange={e=>setForm(v=>({...v,atk_unit_code:e.target.value}))} placeholder="Sipas katalogut ATK" style={field}/></label>
          <label style={{ fontSize: 12 }}>Kodi i TVSH-së<input maxLength={1} value={form.atk_tax_code} onChange={e=>setForm(v=>({...v,atk_tax_code:e.target.value.toUpperCase()}))} placeholder="Shkronja ATK" style={field}/></label>
          <label style={{ fontSize: 12 }}>Kategoria e artikullit<input value={form.atk_item_category_code} onChange={e=>setForm(v=>({...v,atk_item_category_code:e.target.value}))} placeholder="Kodi ATK" style={field}/></label>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button disabled={busy} type="submit" style={primary}>{busy ? "Duke ruajtur..." : editingId ? "Ruaj ndryshimet" : "Shto produktin"}</button>{editingId && <button type="button" onClick={reset} style={{ ...primary, background: "white", color: "var(--ink)", border: "1px solid var(--line)" }}>Anulo</button>}</div>
    </form>
    <input aria-label="Kërko produkt" placeholder="Kërko sipas emrit ose SKU..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...field, marginBottom: 12 }}/>
    <div style={{ display: "grid", gap: 8 }}>{visible.map(product=><div key={product.id} style={{ background: "white", border: "1px solid var(--line)", borderRadius: 10, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div><strong>{product.name}</strong><div style={{ color: "var(--muted)", fontSize: 12 }}>{product.sku || "Pa SKU"} · {product.item_type === "service" ? "Shërbim" : "Produkt"} · TVSH {product.vat_rate}% · {Number(product.unit_price).toFixed(2)} € · {product.atk_unit_code && product.atk_tax_code && product.atk_item_category_code ? "Kodet ATK gati" : "Mungojnë kodet ATK"}</div></div>
      <div style={{ display: "flex", gap: 7 }}><button type="button" onClick={()=>edit(product)} style={{ ...primary, background: "white", color: "var(--ink)", border: "1px solid var(--line)" }}>Ndrysho</button><button type="button" disabled={busy} onClick={()=>void toggleActive(product)} style={{ ...primary, background: product.is_active ? "#8a3b35" : "var(--brand)" }}>{product.is_active ? "Çaktivizo" : "Aktivizo"}</button></div>
    </div>)}
    {!visible.length && <p style={{ color: "var(--muted)" }}>Nuk ka artikuj. Shto produktin e parë më lart.</p>}</div>
  </main>;
}
