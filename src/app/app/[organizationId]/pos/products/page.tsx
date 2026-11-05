"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Product = {
  id: string; name: string; sku: string | null; item_type: string; unit: string; pos_category: string; image_url: string | null;
  unit_price: number; vat_rate: number; stock_quantity: number; track_stock: boolean;
  is_active: boolean; atk_unit_code: string | null; atk_tax_code: string | null; atk_item_category_code: string | null;
};
const blank = { name: "", sku: "", item_type: "product", unit: "cope", pos_category: "TT", image_url: "", unit_price: "0", vat_rate: "18",
  stock_quantity: "0", track_stock: false, atk_unit_code: "", atk_tax_code: "E", atk_item_category_code: "" };
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
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [planInfo, setPlanInfo] = useState<{ plan_package: string; product_limit: number } | null>(null);
  const unitCodes = Array.from(new Set(["cope", ...products.map(p => p.atk_unit_code || p.unit).filter((v): v is string => Boolean(v))])).sort();
  const itemCategoryCodes = Array.from(new Set(["TT", ...products.map(p => p.atk_item_category_code || p.pos_category).filter((v): v is string => Boolean(v))])).sort();

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const { data: membership } = auth.user ? await supabase.from("fiskalo_organization_users").select("role").eq("organization_id", organizationId).eq("user_id", auth.user.id).maybeSingle() : { data: null };
    const allowed = Boolean(membership && ["owner", "administrator", "manager"].includes(membership.role));
    setCanManage(allowed);
    setPermissionChecked(true);
    if (!allowed) return;
    const { data: orgPlan } = await supabase.from("fiskalo_organizations").select("plan_package,product_limit").eq("id", organizationId).maybeSingle();
    setPlanInfo(orgPlan ? { plan_package: String(orgPlan.plan_package), product_limit: Number(orgPlan.product_limit) } : null);
    const { data, error: loadError } = await supabase.from("fiskalo_products")
      .select("id,name,sku,item_type,unit,pos_category,image_url,unit_price,vat_rate,stock_quantity,track_stock,is_active,atk_unit_code,atk_tax_code,atk_item_category_code")
      .eq("organization_id", organizationId).order("name");
    if (loadError) setError(loadError.message);
    else setProducts((data ?? []) as Product[]);
  }, [organizationId, supabase]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!scanning) return;
    let active = true;
    let stream: MediaStream | null = null;
    let frame = 0;
    type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
    type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;
    const start = async () => {
      const DetectorClass = (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) {
        setScanMessage("Skanimi me kamerë nuk mbështetet në këtë shfletues. Përdor skaner USB/Bluetooth ose shkruaje barkodin.");
        setScanning(false); return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!active || !videoRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new DetectorClass({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"] });
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes.find(code => code.rawValue)?.rawValue;
            if (value) { setForm(current => ({ ...current, sku: value })); setScanMessage("U lexua barkodi: " + value); setScanning(false); return; }
          } catch { /* Keep scanning. */ }
          frame = window.requestAnimationFrame(scan);
        };
        frame = window.requestAnimationFrame(scan);
      } catch (cameraError) {
        setScanMessage("Kamera nuk u hap: " + (cameraError instanceof Error ? cameraError.message : "Kontrollo lejen e kamerës."));
        setScanning(false);
      }
    };
    void start();
    return () => { active = false; if (frame) window.cancelAnimationFrame(frame); stream?.getTracks().forEach(track => track.stop()); };
  }, [scanning]);

  async function uploadProductImage(file: File) {
    setError(""); setNotice("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Ngarko vetëm JPG, PNG ose WebP."); return; }
    if (file.size > 3 * 1024 * 1024) { setError("Fotoja duhet të jetë maksimumi 3 MB."); return; }
    setUploadingImage(true);
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const objectPath = organizationId + "/" + crypto.randomUUID() + "." + extension;
    const { error: uploadError } = await supabase.storage.from("fiskalo-product-images").upload(objectPath, file, { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (uploadError) { setUploadingImage(false); setError("Fotoja nuk u ngarkua: " + uploadError.message); return; }
    const { data } = supabase.storage.from("fiskalo-product-images").getPublicUrl(objectPath);
    setForm(current => ({ ...current, image_url: data.publicUrl }));
    setUploadingImage(false);
    setNotice("Fotoja u ngarkua. Ruaje produktin për ta lidhur me katalogun.");
  }

  const visible = products.filter((p) => (p.name + " " + (p.sku || "")).toLowerCase().includes(search.trim().toLowerCase()));
  function edit(product: Product) {
    setEditingId(product.id);
    setForm({ name: product.name, sku: product.sku || "", item_type: product.item_type, unit: product.atk_unit_code || product.unit || "cope", pos_category: product.atk_item_category_code || product.pos_category || "TT", image_url: product.image_url || "",
      unit_price: String(product.unit_price), vat_rate: String(product.vat_rate), stock_quantity: String(product.stock_quantity),
      track_stock: product.track_stock, atk_unit_code: product.atk_unit_code || product.unit || "cope", atk_tax_code: product.atk_tax_code || (Number(product.vat_rate) === 8 ? "D" : Number(product.vat_rate) === 18 ? "E" : "A"),
      atk_item_category_code: product.atk_item_category_code || product.pos_category || "TT" });
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
    const taxCode = form.atk_tax_code.trim().toUpperCase();
    const expectedTaxCode = vat === 8 ? "D" : vat === 18 ? "E" : vat === 0 ? (taxCode === "C" ? "C" : "A") : "INVALID";
    if (expectedTaxCode === "INVALID" || taxCode !== expectedTaxCode) {
      setBusy(false);
      setError("Kontrollo trajtimin e TVSH-së dhe kodin përkatës ATK.");
      return;
    }
    const values = { organization_id: organizationId, name: form.name.trim(), sku: form.sku.trim() || null,
      item_type: form.item_type, unit: form.atk_unit_code.trim(), pos_category: form.atk_item_category_code.trim(), image_url: form.image_url.trim() || null, unit_price: price, vat_rate: vat,
      stock_quantity: stock, track_stock: form.item_type === "product" && form.track_stock,
      atk_unit_code: form.atk_unit_code.trim(),
      atk_tax_code: taxCode || (vat === 8 ? "D" : vat === 18 ? "E" : null),
      atk_item_category_code: form.atk_item_category_code.trim() };
    if (!editingId && planInfo && products.length >= planInfo.product_limit) {
      setBusy(false);
      setError(`Paketa ${planInfo.plan_package} lejon maksimum ${planInfo.product_limit} produkte. Përmirëso paketën për të shtuar produkte të tjera.`);
      return;
    }
    const result = editingId
      ? await supabase.from("fiskalo_products").update(values).eq("organization_id", organizationId).eq("id", editingId)
      : await supabase.from("fiskalo_products").insert(values);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setNotice(editingId ? "Produkti u përditësua." : "Produkti u shtua.");
    reset(); await load();
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`A dëshiron ta fshish produktin “${product.name}”? Ky veprim nuk mund të kthehet.`)) return;
    setBusy(true); setError(""); setNotice("");
    const { error: deleteError } = await supabase.from("fiskalo_products").delete()
      .eq("organization_id", organizationId).eq("id", product.id);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message.includes("foreign key") || deleteError.code === "23503"
        ? "Produkti është përdorur në fatura dhe nuk mund të fshihet. Çaktivizoje për ta larguar nga arka pa ndryshuar historikun."
        : deleteError.message);
      return;
    }
    setNotice("Produkti u fshi.");
    if (editingId === product.id) reset();
    await load();
  }

  async function toggleActive(product: Product) {
    setBusy(true); setError(""); setNotice("");
    const { error: updateError } = await supabase.from("fiskalo_products")
      .update({ is_active: !product.is_active }).eq("organization_id", organizationId).eq("id", product.id);
    setBusy(false);
    if (updateError) setError(updateError.message); else { setNotice(product.is_active ? "Produkti u çaktivizua." : "Produkti u aktivizua."); await load(); }
  }

  if (!permissionChecked) return <main style={{ maxWidth: 1050, margin: "0 auto", padding: 24 }}>Po kontrollohet qasja…</main>;
  if (!canManage) return <main style={{ maxWidth: 650, margin: "40px auto", padding: 24 }}><h1>Qasje e kufizuar</h1><p style={{ color: "var(--muted)" }}>Produktet dhe çmimet menaxhohen nga pronari, administratori ose menaxheri.</p><Link href={"/app/" + organizationId} style={{ color: "var(--brand)", fontWeight: 750 }}>Kthehu te paneli</Link></main>;

  return <main style={{ maxWidth: 1050, margin: "0 auto", padding: "22px 16px 50px" }}>
    <Link href={"/app/" + organizationId + "/pos"} style={{ color: "var(--brand)", fontWeight: 750 }}>← Kthehu te arka</Link>
    <h1 style={{ margin: "12px 0 4px", fontSize: 27 }}>Produktet dhe shërbimet</h1>
    <p style={{ color: "var(--muted)", fontSize: 13 }}>Katalogu i artikujve që shiten në arkë. TVSH-ja caktohet vetëm një herë; kodi përkatës ATK plotësohet automatikisht.</p>
    {planInfo && <div style={{ background: "white", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", margin: "12px 0 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><strong>Paketa {planInfo.plan_package.charAt(0).toUpperCase()+planInfo.plan_package.slice(1)}</strong><div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3 }}>Produkte të përdorura: {products.length} nga {planInfo.product_limit}</div></div><strong style={{ alignSelf: "center" }}>{products.length}/{planInfo.product_limit}</strong></div>}
    {error && <div role="alert" style={{ background: "#fff0ef", color: "#982d25", padding: 12, borderRadius: 9, marginBottom: 12 }}>{error}</div>}
    {notice && <div role="status" style={{ background: "#edf7f1", color: "#155c3c", padding: 12, borderRadius: 9, marginBottom: 12 }}>{notice}</div>}
    <form onSubmit={save} style={{ background: "white", border: "1px solid var(--line)", borderRadius: 13, padding: 16, display: "grid", gap: 11, marginBottom: 18 }}>
      <strong>{editingId ? "Ndrysho artikullin" : "Shto artikull të ri"}</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <label style={{ fontSize: 12 }}>Emri<input required value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} style={field}/></label>
        <label style={{ fontSize: 12 }}>SKU / Barkodi<div style={{ display: "flex", gap: 6 }}><input value={form.sku} onChange={e=>setForm(v=>({...v,sku:e.target.value}))} placeholder="Shkruaj ose skano barkodin" style={field}/><button type="button" onClick={()=>{setScanMessage("");setScanning(v=>!v);}} style={{ ...primary, whiteSpace: "nowrap", background: scanning ? "#8a3b35" : "var(--brand)" }}>{scanning ? "Ndalo" : "Skanoni"}</button></div></label>
        <label style={{ fontSize: 12 }}>Lloji<select value={form.item_type} onChange={e=>setForm(v=>({...v,item_type:e.target.value}))} style={field}><option value="product">Produkt</option><option value="service">Shërbim</option></select></label>
        <label style={{ fontSize: 12 }}>Foto e produktit<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingImage} onChange={e=>{const selected=e.target.files?.[0];if(selected)void uploadProductImage(selected);e.currentTarget.value="";}} style={{ ...field, padding: 7 }}/><span style={{ display: "block", color: "var(--muted)", marginTop: 4 }}>JPG, PNG ose WebP · maksimumi 3 MB {uploadingImage ? "· Duke ngarkuar…" : ""}</span></label>
        <label style={{ fontSize: 12 }}>Çmimi (€)<input required type="number" min="0" step="0.01" value={form.unit_price} onChange={e=>setForm(v=>({...v,unit_price:e.target.value}))} style={field}/></label>
        <label style={{ fontSize: 12 }}>TVSH / trajtimi fiskal ATK<select value={`${form.vat_rate}:${form.atk_tax_code || (form.vat_rate === "8" ? "D" : form.vat_rate === "18" ? "E" : "A")}`} onChange={e=>{const [rate,code]=e.target.value.split(":");setForm(v=>({...v,vat_rate:rate,atk_tax_code:code}));}} style={field}><option value="0:A">0% — Përjashtuar nga TVSH (A)</option><option value="0:C">0% — Normë zero (C)</option><option value="8:D">8% — TVSH (D)</option><option value="18:E">18% — TVSH (E)</option></select></label>
        <label style={{ fontSize: 12 }}>Stoku<input type="number" min="0" step="0.001" value={form.stock_quantity} onChange={e=>setForm(v=>({...v,stock_quantity:e.target.value}))} style={field}/></label>
      </div>
      {scanning && <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}><video ref={videoRef} muted playsInline style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 8, background: "#111" }}/><p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 0" }}>Drejto kamerën te barkodi. Nëse kamera nuk hapet, lejo qasjen ose përdor skaner USB/Bluetooth.</p></div>}
      {scanMessage && <p role="status" style={{ color: "var(--muted)", fontSize: 12, margin: 0 }}>{scanMessage}</p>}
      {form.image_url && <div style={{ display: "flex", alignItems: "center", gap: 10 }}><img src={form.image_url} alt="Pamja e produktit" style={{ width: 76, height: 76, objectFit: "cover", borderRadius: 9, border: "1px solid var(--line)" }}/><button type="button" onClick={()=>setForm(v=>({...v,image_url:""}))} style={{ ...primary, background: "white", color: "#982d25", border: "1px solid #e4b8b4" }}>Hiqe foton</button></div>}
      {form.item_type === "product" && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={form.track_stock} onChange={e=>setForm(v=>({...v,track_stock:e.target.checked}))}/> Menaxho stokun</label>}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <strong style={{ fontSize: 13 }}>Kodet fiskale ATK</strong><p style={{ color: "var(--muted)", fontSize: 12, margin: "4px 0 0" }}>Njësia dhe kategoria caktohen vetëm këtu, sipas kodeve që dërgohen në kuponin ATK.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>Njësia — kodi ATK<select required value={form.atk_unit_code} onChange={e=>setForm(v=>({...v,atk_unit_code:e.target.value}))} style={field}>{unitCodes.map(code=><option key={code} value={code}>{code}</option>)}</select></label>
<label style={{ fontSize: 12 }}>Kategoria e artikullit — kodi ATK<select required value={form.atk_item_category_code} onChange={e=>setForm(v=>({...v,atk_item_category_code:e.target.value}))} style={field}>{itemCategoryCodes.map(code=><option key={code} value={code}>{code}</option>)}</select></label>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 6 }}>Lista fillestare përdor vlerat e shembullit zyrtar të integrimit ATK (cope / TT) dhe ruan kodet e përdorura tashmë në katalog. Lista e plotë zyrtare duhet konfirmuar me katalogun aktual të ATK-së.</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button disabled={busy} type="submit" style={primary}>{busy ? "Duke ruajtur..." : editingId ? "Ruaj ndryshimet" : planInfo && products.length >= planInfo.product_limit ? "Limiti i paketës u arrit" : "Shto produktin"}</button>{editingId && <button type="button" onClick={reset} style={{ ...primary, background: "white", color: "var(--ink)", border: "1px solid var(--line)" }}>Anulo</button>}</div>
    </form>
    <input aria-label="Kërko produkt" placeholder="Kërko sipas emrit ose SKU..." value={search} onChange={e=>setSearch(e.target.value)} style={{ ...field, marginBottom: 12 }}/>
    <div style={{ display: "grid", gap: 8 }}>{visible.map(product=><div key={product.id} style={{ background: "white", border: "1px solid var(--line)", borderRadius: 10, padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div><strong>{product.name}</strong><div style={{ color: "var(--muted)", fontSize: 12 }}>{product.atk_item_category_code || product.pos_category || "Pa kategori"} · {product.sku || "Pa SKU"} · {product.item_type === "service" ? "Shërbim" : "Produkt"} · TVSH {product.vat_rate}% · {Number(product.unit_price).toFixed(2)} € · {product.atk_unit_code && product.atk_tax_code && product.atk_item_category_code ? "Kodet ATK të plotësuara" : "Mungojnë kodet ATK"}</div></div>
      <div style={{ display: "flex", gap: 7 }}><button type="button" onClick={()=>edit(product)} style={{ ...primary, background: "white", color: "var(--ink)", border: "1px solid var(--line)" }}>Ndrysho</button><button type="button" disabled={busy} onClick={()=>void toggleActive(product)} style={{ ...primary, background: product.is_active ? "#8a3b35" : "var(--brand)" }}>{product.is_active ? "Çaktivizo" : "Aktivizo"}</button><button type="button" disabled={busy} onClick={()=>void deleteProduct(product)} style={{ ...primary, background: "white", color: "#982d25", border: "1px solid #e4b8b4" }}>Fshije</button></div>
    </div>)}
    {!visible.length && <p style={{ color: "var(--muted)" }}>Nuk ka artikuj. Shto produktin e parë më lart.</p>}</div>
  </main>;
}
