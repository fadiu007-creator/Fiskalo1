"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createBrowserPosCsr, getBrowserPosCsr, hasBrowserPosKey } from "@/lib/atk/browser-key-vault";

type Org = { id: string; legal_name: string; municipality: string; nui: string; vat_registered: boolean; fiscalization_status: string };
type Product = { id: string; name: string; sku: string | null; unit_price: number; vat_rate: number; stock_quantity: number; item_type: string; track_stock: boolean; is_active: boolean };
type Customer = { id: string; name: string; business_number: string | null; email: string | null; phone: string | null; address: string | null };
type Invoice = { id: string; invoice_number: string | null; status: string; issue_date: string; total: number; vat_total: number; fiscalization_status: string; customer_id: string | null; payment_method: string; payment_status: string };
type Expense = { id: string; description: string; supplier_name: string | null; category: string; amount: number; vat_rate: number; expense_date: string };
type Member = { member_user_id: string; member_email: string; member_role: string; joined_at: string };
type PendingInvitation = { invitation_id: string; invite_email: string; invite_role: string; invited_at: string };
type Supplier = { id: string; name: string; business_number: string | null; email: string | null; phone: string | null; address: string | null };
type Purchase = { id: string; supplier_id: string; reference: string | null; purchase_date: string; status: string; total: number; paid_total: number; payment_status: string; received_at: string | null };
type AtkTaxpayerProfile = { organization_id: string; fiscalization_number: string; business_name_from_atk: string | null; last_verified_at: string | null };
type AtkPosInstallation = { id: string; atk_branch_id: number; pos_id: number; label: string; location: string | null; environment: string; status: string; certificate_serial: string | null; certificate_expires_at: string | null; agent_version: string | null; last_seen_at: string | null };
type AgentVerification = { businessName: string; verificationCode: string };

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
  const [customerForm, setCustomerForm] = useState({ name: "", business_number: "", email: "", phone: "", address: "" });
  const [expenseForm, setExpenseForm] = useState({ description: "", supplier_name: "", category: "Tjetër", amount: "", vat_rate: "0", expense_date: new Date().toISOString().slice(0, 10) });
  const [invoiceForm, setInvoiceForm] = useState({ customer_id: "", payment_method: "cash" });
  const [invoiceLines, setInvoiceLines] = useState([{ product_id: "", quantity: "1" }]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [memberForm, setMemberForm] = useState({ email: "", role: "cashier" });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [supplierForm, setSupplierForm] = useState({ name: "", business_number: "", email: "", phone: "", address: "" });
  const [purchaseForm, setPurchaseForm] = useState({ supplier_id: "", reference: "", purchase_date: new Date().toISOString().slice(0, 10), notes: "" });
  const [purchaseLines, setPurchaseLines] = useState([{ product_id: "", quantity: "1", unit_cost: "", vat_rate: "0" }]);
  const [payingPurchaseId, setPayingPurchaseId] = useState<string | null>(null);
  const [reportFrom, setReportFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(new Date().toISOString().slice(0, 10));
  const [purchasePaymentForm, setPurchasePaymentForm] = useState({ amount: "", method: "bank_transfer", reference: "" });
  const [atkProfile, setAtkProfile] = useState<AtkTaxpayerProfile | null>(null);
  const [atkPosInstallations, setAtkPosInstallations] = useState<AtkPosInstallation[]>([]);
  const [atkProfileForm, setAtkProfileForm] = useState({ fiscalization_number: "" });
  const [atkPosForm, setAtkPosForm] = useState({ atk_branch_id: "", pos_id: "", label: "", location: "" });
  const [agentPairingCode, setAgentPairingCode] = useState("");
  const [agentToken, setAgentToken] = useState("");
  const [agentStatus, setAgentStatus] = useState<Record<string, unknown> | null>(null);
  const [agentError, setAgentError] = useState("");
  const [agentNotice, setAgentNotice] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [atkApplicationId, setAtkApplicationId] = useState("");
  const [browserKeyState, setBrowserKeyState] = useState<Record<string, { exists: boolean; fingerprint?: string }>>({});
  const [browserKeyBusyId, setBrowserKeyBusyId] = useState<string | null>(null);
  const [agentVerifications, setAgentVerifications] = useState<Record<string, AgentVerification>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    await supabase.rpc("fiskalo_accept_pending_team_invitations");
    const [orgResult, productResult, customerResult, invoiceResult, expenseResult, supplierResult, purchaseResult, atkProfileResult, atkPosResult] = await Promise.all([
      supabase.from("fiskalo_organizations").select("id,legal_name,municipality,nui,vat_registered,fiscalization_status").eq("id", organizationId).single(),
      supabase.from("fiskalo_products").select("*").eq("organization_id", organizationId).order("name"),
      supabase.from("fiskalo_customers").select("*").eq("organization_id", organizationId).order("name"),
      supabase.from("fiskalo_invoices").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      supabase.from("fiskalo_expenses").select("*").eq("organization_id", organizationId).order("expense_date", { ascending: false }),
      supabase.from("fiskalo_suppliers").select("*").eq("organization_id", organizationId).order("name"),
      supabase.from("fiskalo_purchases").select("*").eq("organization_id", organizationId).order("purchase_date", { ascending: false }),
      supabase.from("fiskalo_atk_taxpayer_profiles").select("*").eq("organization_id", organizationId).maybeSingle(),
      supabase.from("fiskalo_atk_pos_installations").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    ]);
    if (orgResult.error) {
      setError("Nuk ke qasje në këtë biznes ose biznesi nuk ekziston.");
    } else {
      setOrg(orgResult.data as Org);
      setProducts((productResult.data ?? []) as Product[]);
      setCustomers((customerResult.data ?? []) as Customer[]);
      setInvoices((invoiceResult.data ?? []) as Invoice[]);
      setExpenses((expenseResult.data ?? []) as Expense[]);
      setSuppliers((supplierResult.data ?? []) as Supplier[]);
      setPurchases((purchaseResult.data ?? []) as Purchase[]);
      setAtkProfile((atkProfileResult.data ?? null) as AtkTaxpayerProfile | null);
      setAtkProfileForm({ fiscalization_number: atkProfileResult.data?.fiscalization_number ?? "" });
      setAtkPosInstallations((atkPosResult.data ?? []) as AtkPosInstallation[]);
      if (productResult.error || customerResult.error || invoiceResult.error || expenseResult.error || supplierResult.error || purchaseResult.error || atkProfileResult.error || atkPosResult.error) setError("Disa të dhëna nuk u ngarkuan. Rifresko faqen.");
    }
    setLoading(false);
  }, [organizationId, supabase]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const savedToken = window.sessionStorage.getItem("fiskalo-pos-agent-session");
    if (!savedToken) return;
    setAgentToken(savedToken);
    fetch("http://127.0.0.1:17843/api/v1/status", { headers: { Authorization: "Bearer " + savedToken } })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Sesioni lokal i POS Agent nuk është më aktiv.");
        setAgentStatus(data);
      })
      .catch((e) => {
        window.sessionStorage.removeItem("fiskalo-pos-agent-session");
        setAgentToken("");
        setAgentStatus(null);
        setAgentError(e instanceof Error ? e.message : "Nuk u rikthye lidhja me POS Agent.");
      });
  }, []);

  useEffect(() => {
    const savedApplicationId = window.sessionStorage.getItem("fiskalo-atk-application-id:" + organizationId);
    if (savedApplicationId) setAtkApplicationId(savedApplicationId);
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(atkPosInstallations.map(async (pos) => ({
      id: pos.id,
      exists: await hasBrowserPosKey(organizationId + ":" + pos.id).catch(() => false),
    }))).then((entries) => {
      if (!cancelled) setBrowserKeyState((current) => ({
        ...current,
        ...Object.fromEntries(entries.map((entry) => [entry.id, { exists: entry.exists }])),
      }));
    });
    return () => { cancelled = true; };
  }, [atkPosInstallations, organizationId]);

  async function downloadWebPosCsr(pos: AtkPosInstallation) {
    setBrowserKeyBusyId(pos.id); setAgentError(""); setAgentNotice("");
    try {
      if (!org?.nui || !/^\\d{9}$/.test(org.nui)) throw new Error("Ky biznes nuk ka NUI valid me 9 shifra. Plotëso identitetin e saktë të tatimpaguesit para gjenerimit të CSR-së.");
      const keyId = organizationId + ":" + pos.id;
      const existing = await getBrowserPosCsr(keyId);
      const result = existing ?? await createBrowserPosCsr(keyId, {
        businessName: org.legal_name, nui: org.nui,
        branchId: String(pos.atk_branch_id), posId: String(pos.pos_id),
      });
      const blob = new Blob([result.csrPem], { type: "application/pkcs10" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "fiskalo-" + pos.atk_branch_id + "-" + pos.pos_id + ".csr.pem";
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setBrowserKeyState((current) => ({ ...current, [pos.id]: { exists: true, fingerprint: result.publicKeySha256 } }));
      setAgentNotice("CSR u krijua në shfletues dhe u shkarkua. Çelësi privat nuk u dërgua në cloud. Kjo është fazë eksperimentale për testim; konfirmo me ATK nëse ruajtja e çelësit në shfletues pranohet për certifikim.");
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : "Nuk u krijua CSR në Web POS.");
    } finally { setBrowserKeyBusyId(null); }
  }

  async function saveAtkProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const fiscalizationNumber = atkProfileForm.fiscalization_number.trim();
    if (!fiscalizationNumber) { setBusy(false); setError("Shëno numrin e fiskalizimit të marrë nga EDI i ATK-së."); return; }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setBusy(false); setError("Sesioni ka skaduar. Hyr përsëri."); return; }
    const { error: saveError } = await supabase.from("fiskalo_atk_taxpayer_profiles").upsert({
      organization_id: organizationId, fiscalization_number: fiscalizationNumber, created_by: authData.user.id,
    }, { onConflict: "organization_id" });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setNotice("Numri i fiskalizimit u ruajt. Ende nuk është verifikuar nga ATK."); await load();
  }

  async function addAtkPosInstallation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    if (!atkProfile) { setBusy(false); setError("Ruaje së pari numrin e fiskalizimit të biznesit."); return; }
    const branchId = Number(atkPosForm.atk_branch_id);
    const posId = Number(atkPosForm.pos_id);
    if (!Number.isSafeInteger(branchId) || branchId <= 0 || !Number.isSafeInteger(posId) || posId <= 0) {
      setBusy(false); setError("ID-ja e degës dhe ID-ja e POS-it duhet të jenë numra të plotë pozitivë."); return;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setBusy(false); setError("Sesioni ka skaduar. Hyr përsëri."); return; }
    const { error: insertError } = await supabase.from("fiskalo_atk_pos_installations").insert({
      organization_id: organizationId, atk_branch_id: branchId, pos_id: posId,
      label: atkPosForm.label.trim(), location: atkPosForm.location.trim() || null,
      environment: "test", status: "unregistered", created_by: authData.user.id,
    });
    setBusy(false);
    if (insertError) { setError(insertError.code === "23505" ? "Ky kombinim i degës dhe POS-it ekziston tashmë në mjedisin test." : insertError.message); return; }
    setAtkPosForm({ atk_branch_id: "", pos_id: "", label: "", location: "" });
    setNotice("Pajisja u regjistrua në listën lokale të Fiskalo-s. Kjo nuk e regjistron ende pajisjen në ATK."); await load();
  }

  async function agentRequest(path: string, body?: unknown) {
    if (!agentToken) throw new Error("Lidhe fillimisht POS Agent-in.");
    const response = await fetch("http://127.0.0.1:17843" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: "Bearer " + agentToken, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.title || data.message || data.error || ("POS Agent error " + response.status));
    return data;
  }

  async function pairPosAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAgentBusy(true); setAgentError(""); setAgentNotice("");
    try {
      const response = await fetch("http://127.0.0.1:17843/api/v1/pair", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingCode: agentPairingCode.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.sessionToken) throw new Error(data.message || "Nuk u lidh POS Agent. Kontrollo kodin dhe sigurohu që programi po punon në këtë kompjuter.");
      setAgentToken(data.sessionToken);
      window.sessionStorage.setItem("fiskalo-pos-agent-session", data.sessionToken);
      setAgentPairingCode("");
      const statusResponse = await fetch("http://127.0.0.1:17843/api/v1/status", {
        headers: { Authorization: "Bearer " + data.sessionToken },
      });
      const status = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok) throw new Error("Lidhja u krijua, por statusi i POS Agent nuk u lexua.");
      setAgentStatus(status);
      setAgentNotice("POS Agent u lidh në këtë sesion të shfletuesit.");
    } catch (e) {
      setAgentToken(""); setAgentStatus(null);
      window.sessionStorage.removeItem("fiskalo-pos-agent-session");
      setAgentError(e instanceof Error ? e.message : "Gabim gjatë lidhjes me POS Agent.");
    } finally { setAgentBusy(false); }
  }

  async function refreshAgentStatus() {
    setAgentBusy(true); setAgentError(""); setAgentNotice("");
    try {
      const status = await agentRequest("/api/v1/status");
      setAgentStatus(status);
      setAgentNotice("Statusi i POS Agent u rifreskua.");
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : "Nuk u lexua statusi i POS Agent.");
    } finally { setAgentBusy(false); }
  }

  async function verifyAtkPos(pos: AtkPosInstallation) {
    setAgentBusy(true); setAgentError(""); setAgentNotice("");
    try {
      if (!atkProfile?.fiscalization_number) throw new Error("Ruaje së pari numrin e fiskalizimit nga EDI.");
      const applicationId = Number(atkApplicationId);
      const nui = Number(org?.nui);
      if (!Number.isSafeInteger(applicationId) || applicationId <= 0) throw new Error("Shëno application ID-në e dhënë nga ATK.");
      if (!Number.isSafeInteger(nui) || nui <= 0) throw new Error("NUI i biznesit nuk është numër valid.");
      const result = await agentRequest("/api/v1/atk/test/verify", {
        nui, fiscalizationNumber: atkProfile.fiscalization_number, posId: pos.pos_id,
        branchId: pos.atk_branch_id, applicationId,
      });
      setAgentVerifications((current) => ({ ...current, [pos.id]: { businessName: result.businessName, verificationCode: result.verificationCode } }));
      setAgentNotice("ATK e verifikoi pajisjen në mjedisin TEST. Vazhdo me kërkesën për certifikatë testuese.");
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : "Verifikimi në ATK dështoi.");
    } finally { setAgentBusy(false); }
  }

  async function requestAtkTestCertificate(pos: AtkPosInstallation) {
    setAgentBusy(true); setAgentError(""); setAgentNotice("");
    try {
      const verified = agentVerifications[pos.id];
      if (!verified) throw new Error("Verifikoje fillimisht pajisjen në ATK.");
      const applicationId = Number(atkApplicationId);
      const nui = Number(org?.nui);
      const result = await agentRequest("/api/v1/atk/test/sign-csr", {
        businessName: verified.businessName, businessNui: nui, branchId: pos.atk_branch_id,
        verificationCode: verified.verificationCode, posId: pos.pos_id, applicationId,
      });
      const status = await agentRequest("/api/v1/status");
      setAgentStatus(status);
      setAgentNotice("ATK lëshoi certifikatën testuese dhe POS Agent verifikoi përputhjen me çelësin lokal. Certifikata nuk është për prodhim.");
      void result;
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : "Kërkesa për certifikatë testuese dështoi.");
    } finally { setAgentBusy(false); }
  }

  async function signOut() {
    window.sessionStorage.removeItem("fiskalo-pos-agent-session");
    setAgentToken("");
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function resetProductForm() {
    setEditingProductId(null);
    setProductForm({ name: "", sku: "", unit_price: "", vat_rate: "18", item_type: "product", stock_quantity: "0", track_stock: true });
  }

  function beginEditProduct(product: Product) {
    setEditingProductId(product.id);
    setProductForm({ name: product.name, sku: product.sku || "", unit_price: String(product.unit_price), vat_rate: String(product.vat_rate), item_type: product.item_type, stock_quantity: String(product.stock_quantity), track_stock: product.track_stock });
    setError(""); setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function addProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    if (editingProductId) {
      const current = products.find((item) => item.id === editingProductId);
      if (!current) { setBusy(false); setError("Produkti nuk u gjet. Rifresko faqen."); return; }
      const { error: updateError } = await supabase.from("fiskalo_products").update({
        name: productForm.name.trim(), sku: productForm.sku.trim() || null,
        unit_price: Number(productForm.unit_price), vat_rate: Number(productForm.vat_rate),
      }).eq("id", editingProductId).eq("organization_id", organizationId);
      if (updateError) { setBusy(false); setError(updateError.message); return; }
      const targetStock = Number(productForm.stock_quantity || 0);
      if (current.track_stock && targetStock !== Number(current.stock_quantity)) {
        const { error: stockError } = await supabase.rpc("fiskalo_set_stock", {
          target_product: editingProductId, target_quantity: targetStock, movement_note: "Përditësim i stokut nga redaktimi i produktit",
        });
        if (stockError) { setBusy(false); setError("Emri dhe çmimi u ruajtën, por stoku nuk u ndryshua: " + stockError.message); await load(); return; }
      }
      setBusy(false); resetProductForm(); setNotice("Produkti u përditësua."); await load(); return;
    }
    const { error: saveError } = await supabase.from("fiskalo_products").insert({
      organization_id: organizationId, name: productForm.name.trim(), sku: productForm.sku.trim() || null,
      unit_price: Number(productForm.unit_price), vat_rate: Number(productForm.vat_rate), item_type: productForm.item_type,
      stock_quantity: Number(productForm.stock_quantity || 0), track_stock: productForm.track_stock,
    });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    resetProductForm(); setNotice("Artikulli u ruajt."); await load();
  }

  async function addCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { error: saveError } = await supabase.from("fiskalo_customers").insert({
      organization_id: organizationId, name: customerForm.name.trim(), business_number: customerForm.business_number.trim() || null,
      email: customerForm.email.trim() || null, phone: customerForm.phone.trim() || null, address: customerForm.address.trim() || null,
    });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setCustomerForm({ name: "", business_number: "", email: "", phone: "", address: "" }); setNotice("Klienti u ruajt."); await load();
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

  async function addSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { error: saveError } = await supabase.from("fiskalo_suppliers").insert({
      organization_id: organizationId, name: supplierForm.name.trim(),
      business_number: supplierForm.business_number.trim() || null,
      email: supplierForm.email.trim() || null, phone: supplierForm.phone.trim() || null,
      address: supplierForm.address.trim() || null,
    });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setSupplierForm({ name: "", business_number: "", email: "", phone: "", address: "" });
    setNotice("Furnitori u ruajt."); await load();
  }

  async function createPurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    if (!purchaseForm.supplier_id) { setBusy(false); setError("Zgjidh furnitorin."); return; }
    const selected = purchaseLines.map((line) => ({ ...line, product: products.find((p) => p.id === line.product_id) }));
    if (selected.some((line) => !line.product || !line.product.track_stock || !(Number(line.quantity) > 0) || !(Number(line.unit_cost) >= 0))) {
      setBusy(false); setError("Zgjidh produktet me menaxhim stoku dhe plotëso sasitë e kostot."); return;
    }
    const { error: saveError } = await supabase.rpc("fiskalo_create_purchase", {
      payload: {
        organization_id: organizationId, supplier_id: purchaseForm.supplier_id,
        reference: purchaseForm.reference.trim() || null, purchase_date: purchaseForm.purchase_date,
        notes: purchaseForm.notes.trim() || null,
        items: selected.map((line) => ({ product_id: line.product_id, quantity: Number(line.quantity), unit_cost: Number(line.unit_cost), vat_rate: Number(line.vat_rate) })),
      },
    });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setPurchaseForm({ supplier_id: "", reference: "", purchase_date: new Date().toISOString().slice(0, 10), notes: "" });
    setPurchaseLines([{ product_id: "", quantity: "1", unit_cost: "", vat_rate: "0" }]);
    setNotice("Blerja u ruajt si draft. Pranoje pasi malli të arrijë fizikisht.");
    await load();
  }

  async function recordPurchasePayment(event: React.FormEvent<HTMLFormElement>, purchaseId: string) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const amount = Number(purchasePaymentForm.amount);
    const purchase = purchases.find((item) => item.id === purchaseId);
    if (!purchase || !Number.isFinite(amount) || amount <= 0 || amount > Number(purchase.total) - Number(purchase.paid_total) + 0.005) {
      setBusy(false); setError("Kontrollo shumën. Ajo duhet të jetë pozitive dhe jo më e madhe se borxhi i mbetur."); return;
    }
    const { error: paymentError } = await supabase.rpc("fiskalo_record_purchase_payment", {
      target_purchase: purchaseId, payment_amount: amount, method: purchasePaymentForm.method,
      payment_reference: purchasePaymentForm.reference.trim() || null,
    });
    setBusy(false);
    if (paymentError) { setError(paymentError.message); return; }
    setPayingPurchaseId(null); setPurchasePaymentForm({ amount: "", method: "bank_transfer", reference: "" });
    setNotice("Pagesa ndaj furnitorit u regjistrua."); await load();
  }

  async function receivePurchase(purchaseId: string) {
    if (!window.confirm("Konfirmo që malli ka arritur. Stoku do të rritet menjëherë.")) return;
    setBusy(true); setError(""); setNotice("");
    const { error: receiveError } = await supabase.rpc("fiskalo_receive_purchase", { target_purchase: purchaseId });
    setBusy(false);
    if (receiveError) { setError(receiveError.message); return; }
    setNotice("Blerja u pranua dhe stoku u përditësua."); await load();
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
      payment_method: invoiceForm.payment_method, payment_status: "unpaid",
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
    const [memberResult, invitationResult] = await Promise.all([
      supabase.rpc("fiskalo_list_members", { target_org: organizationId }),
      supabase.rpc("fiskalo_list_pending_team_invitations", { target_org: organizationId }),
    ]);
    if (memberResult.error) { setError(memberResult.error.message); return; }
    if (invitationResult.error) { setError(invitationResult.error.message); return; }
    setMembers((memberResult.data ?? []) as Member[]);
    setPendingInvitations((invitationResult.data ?? []) as PendingInvitation[]);
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { data, error: memberError } = await supabase.rpc("fiskalo_add_existing_member", {
      target_org: organizationId, target_email: memberForm.email.trim().toLowerCase(), target_role: memberForm.role,
    });
    setBusy(false);
    if (memberError) { setError(memberError.message); return; }
    setMemberForm({ email: "", role: "cashier" });
    setNotice(data?.status === "invited" ? "Ftesa u ruajt. Qasja aktivizohet automatikisht kur personi regjistrohet dhe hyn me këtë email." : "Anëtari u shtua dhe ka qasje në biznes.");
    await loadMembers();
  }

  async function removeMember(userId: string) {
    if (!window.confirm("A dëshiron ta largosh këtë anëtar nga biznesi?")) return;
    const { error: removeError } = await supabase.rpc("fiskalo_remove_member", { target_org: organizationId, target_user: userId });
    if (removeError) { setError(removeError.message); return; }
    setNotice("Qasja e anëtarit u largua."); await loadMembers();
  }

  function exportInvoices() {
    downloadCsv("fiskalo-faturat.csv", [["Numri", "Data", "Statusi", "Totali EUR", "TVSH EUR"], ...periodInvoices.map((i) => [i.invoice_number || "Draft", i.issue_date, i.status, i.total, i.vat_total])]);
  }

  function exportExpenses() {
    downloadCsv("fiskalo-shpenzimet.csv", [["Data", "Përshkrimi", "Furnitori", "Kategoria", "Shuma EUR"], ...periodExpenses.map((e) => [e.expense_date, e.description, e.supplier_name || "", e.category, e.amount])]);
  }

  function exportPurchases() {
    downloadCsv("fiskalo-blerjet.csv", [["Data", "Furnitori", "Referenca", "Statusi", "Totali EUR", "Paguar EUR", "Mbetur EUR"], ...periodPurchases.map((p) => [p.purchase_date, suppliers.find((s) => s.id === p.supplier_id)?.name || "", p.reference || "", p.status, p.total, p.paid_total, Number(p.total) - Number(p.paid_total)])]);
  }

  const periodInvoices = invoices.filter((item) => item.status === "issued" && item.issue_date >= reportFrom && item.issue_date <= reportTo);
  const periodExpenses = expenses.filter((item) => item.expense_date >= reportFrom && item.expense_date <= reportTo);
  const periodPurchases = purchases.filter((item) => item.purchase_date >= reportFrom && item.purchase_date <= reportTo);
  const periodRevenue = periodInvoices.reduce((sum, item) => sum + Number(item.total), 0);
  const periodVat = periodInvoices.reduce((sum, item) => sum + Number(item.vat_total), 0);
  const periodExpenseTotal = periodExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const periodPurchaseTotal = periodPurchases.reduce((sum, item) => sum + Number(item.total), 0);
  const periodSupplierBalance = periodPurchases.reduce((sum, item) => sum + Number(item.total) - Number(item.paid_total), 0);
  const revenue = invoices.filter((invoice) => invoice.status === "issued").reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const draftCount = invoices.filter((invoice) => invoice.status === "draft").length;
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const fmt = (value: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(value);
  const tabItems = [{ id: "overview", label: "Përmbledhje" }, { id: "products", label: "Produktet" }, { id: "customers", label: "Klientët" }, { id: "invoices", label: "Faturat" }, { id: "expenses", label: "Shpenzimet" }, { id: "purchases", label: "Blerjet" }, { id: "atk", label: "ATK / POS" }, { id: "reports", label: "Raportet" }, { id: "team", label: "Ekipi" }];

  if (loading) return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>Duke ngarkuar panelin...</main>;
  if (!org) return <main style={{ maxWidth: 800, margin: "0 auto", padding: 32 }}><p>{error || "Biznesi nuk u gjet."}</p><Link href="/app">Kthehu te bizneset</Link></main>;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 60px" }}>
      <header className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div><Link href="/app" style={{ color: "var(--brand)", fontWeight: 800, fontSize: 22 }}>fiskalo</Link><div style={{ color: "var(--muted)", fontSize: 12 }}>Paneli i biznesit</div></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><Link href={`/app/${organizationId}/pos`} style={primary}>Hap POS</Link><Link href="/app" style={secondary}>Bizneset</Link><button onClick={signOut} style={secondary}>Dil nga llogaria</button></div>
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
          <Stat label="Shpenzimet" value={fmt(expenseTotal)} /><Stat label="Blerjet" value={fmt(purchases.reduce((sum, p) => sum + Number(p.total), 0))} />
          <Stat label="Produkte / shërbime" value={String(products.length)} />
        </section>
        <section style={{ ...panel, marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>Gjendja e biznesit</h2>
          <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 13 }}>Regjistro artikujt, klientët, faturat dhe shpenzimet. Faturat e lëshuara ruhen me numër unik dhe nuk mund të ndryshohen. Ky version nuk kryen fiskalizim zyrtar dhe nuk zëvendëson pajisjen ose softuerin e certifikuar nga ATK.</p>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}><button style={primary} onClick={() => setTab("invoices")}>+ Krijo faturë</button><button style={secondary} onClick={() => setTab("products")}>+ Shto produkt</button><button style={secondary} onClick={() => setTab("expenses")}>+ Regjistro shpenzim</button></div>
        </section>
        <section style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Faturat e fundit</h2><InvoiceTable invoices={invoices.slice(0, 5)} fmt={fmt} customers={customers} organizationId={organizationId} /></section>
      </>}

      {tab === "products" && <section className="module-grid" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <form onSubmit={addProduct} style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>{editingProductId ? "Redakto produktin" : "Shto produkt / shërbim"}</h2>
          <label className="field-label">Emri<input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} style={field} /></label>
          <label className="field-label">Kodi / SKU<input value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} style={field} /></label>
          {!editingProductId && <label className="field-label">Lloji<select value={productForm.item_type} onChange={(e) => setProductForm({ ...productForm, item_type: e.target.value, track_stock: e.target.value === "product" })} style={field}><option value="product">Produkt</option><option value="service">Shërbim</option></select></label>}
          <label className="field-label">Çmimi (€)<input required type="number" min="0" step="0.0001" value={productForm.unit_price} onChange={(e) => setProductForm({ ...productForm, unit_price: e.target.value })} style={field} /></label>
          <label className="field-label">TVSH<select value={productForm.vat_rate} onChange={(e) => setProductForm({ ...productForm, vat_rate: e.target.value })} style={field}><option value="0">0% / përjashtim ose eksport</option><option value="8">8%</option><option value="18">18%</option></select></label>
          {productForm.track_stock && <label className="field-label">{editingProductId ? "Stoku aktual" : "Stoku fillestar"}<input required type="number" min="0" step="0.001" value={productForm.stock_quantity} onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })} style={field} /></label>}
          <button disabled={busy} style={{ ...primary, width: "100%", marginTop: 10 }}>{busy ? "Duke ruajtur..." : editingProductId ? "Ruaj ndryshimet" : "Ruaj artikullin"}</button>
          {editingProductId && <button type="button" onClick={resetProductForm} style={{ ...secondary, width: "100%", marginTop: 8 }}>Anulo redaktimin</button>}
        </form>
        <div style={{ display: "grid", gap: 14 }}>
          <section style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Lista e artikujve ({products.length})</h2><div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Emri</th><th>Lloji</th><th>Çmimi</th><th>TVSH</th><th>Stoku</th><th>Veprimi</th></tr></thead><tbody>{products.map((p) => <tr key={p.id}><td>{p.name}<small>{p.sku || ""}</small></td><td>{p.item_type === "service" ? "Shërbim" : "Produkt"}</td><td>{fmt(Number(p.unit_price))}</td><td>{p.vat_rate}%</td><td>{p.track_stock ? p.stock_quantity : "—"}</td><td><button type="button" onClick={() => beginEditProduct(p)} style={secondary}>Redakto</button></td></tr>)}{!products.length && <tr><td colSpan={6}>Nuk ka artikuj ende.</td></tr>}</tbody></table></div></section>
        </div>
      </section>}

      {tab === "customers" && <section className="module-grid" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <form onSubmit={addCustomer} style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Shto klient</h2>
          <label className="field-label">Emri / biznesi<input required value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} style={field} /></label>
          <label className="field-label">NUI / numri i biznesit<input value={customerForm.business_number} onChange={(e) => setCustomerForm({ ...customerForm, business_number: e.target.value })} style={field} /></label>
          <label className="field-label">Email<input type="email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} style={field} /></label>
          <label className="field-label">Telefoni<input value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} style={field} /></label>
          <label className="field-label">Adresa<input value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} style={field} /></label>
          <button disabled={busy} style={{ ...primary, width: "100%", marginTop: 10 }}>Ruaj klientin</button>
        </form>
        <section style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Klientët ({customers.length})</h2><div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Emri</th><th>NUI</th><th>Email</th><th>Telefoni</th><th>Adresa</th></tr></thead><tbody>{customers.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.business_number || "—"}</td><td>{c.email || "—"}</td><td>{c.phone || "—"}</td><td>{c.address || "—"}</td></tr>)}{!customers.length && <tr><td colSpan={5}>Nuk ka klientë ende.</td></tr>}</tbody></table></div></section>
      </section>}

      {tab === "invoices" && <section className="module-grid" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <form onSubmit={createInvoice} style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Lësho faturë</h2>
          <label className="field-label">Klienti<select value={invoiceForm.customer_id} onChange={(e) => setInvoiceForm({ ...invoiceForm, customer_id: e.target.value })} style={field}><option value="">Klient pa emër</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="field-label">Mënyra e pagesës<select value={invoiceForm.payment_method} onChange={(e) => setInvoiceForm({ ...invoiceForm, payment_method: e.target.value })} style={field}><option value="cash">Para në dorë</option><option value="card">Kartelë</option><option value="bank_transfer">Transfer bankar</option><option value="credit">Me afat / e papaguar</option></select></label><p style={{ color: "var(--muted)", fontSize: 11, marginTop: -6 }}>Pagesat shënohen manualisht sipas konfirmimit të arkëtarit. Përpunimi i kartelave nuk është i integruar.</p>
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
        <section style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Faturat ({invoices.length})</h2><InvoiceTable invoices={invoices} fmt={fmt} customers={customers} organizationId={organizationId} /></section>
      </section>}

      {tab === "expenses" && <section className="module-grid" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <form onSubmit={addExpense} style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Regjistro shpenzim</h2>
          <label className="field-label">Përshkrimi<input required value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} style={field} /></label>
          <label className="field-label">Furnitori<input value={expenseForm.supplier_name} onChange={(e) => setExpenseForm({ ...expenseForm, supplier_name: e.target.value })} style={field} /></label>
          <label className="field-label">Kategoria<select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} style={field}>{["Qira","Paga","Furnizim","Transport","Shërbime","Komunalitë","Tjetër"].map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="field-label">Shuma (€)<input required type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} style={field} /></label>
          <label className="field-label">TVSH<select value={expenseForm.vat_rate} onChange={(e) => setExpenseForm({ ...expenseForm, vat_rate: e.target.value })} style={field}><option value="0">0% / përjashtim ose eksport</option><option value="8">8%</option><option value="18">18%</option></select></label>
          <label className="field-label">Data<input required type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} style={field} /></label>
          <button disabled={busy} style={{ ...primary, width: "100%", marginTop: 10 }}>Ruaj shpenzimin</button>
        </form>
        <section style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Shpenzimet ({expenses.length})</h2><div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Data</th><th>Përshkrimi</th><th>Furnitori</th><th>Kategoria</th><th>Shuma</th></tr></thead><tbody>{expenses.map((e) => <tr key={e.id}><td>{e.expense_date}</td><td>{e.description}</td><td>{e.supplier_name || "—"}</td><td>{e.category}</td><td>{fmt(Number(e.amount))}</td></tr>)}{!expenses.length && <tr><td colSpan={5}>Nuk ka shpenzime ende.</td></tr>}</tbody></table></div></section>
      </section>}

      {tab === "purchases" && <section style={{ display: "grid", gap: 14 }}>
        <div className="module-grid" style={{ display: "grid", gridTemplateColumns: "minmax(250px,320px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
          <form onSubmit={addSupplier} style={panel}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>Shto furnitor</h2>
            <label className="field-label">Emri i furnitorit<input required value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} style={field} /></label>
            <label className="field-label">NUI<input value={supplierForm.business_number} onChange={(e) => setSupplierForm({ ...supplierForm, business_number: e.target.value })} style={field} /></label>
            <label className="field-label">Email<input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} style={field} /></label>
            <label className="field-label">Telefoni<input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} style={field} /></label>
            <label className="field-label">Adresa<input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} style={field} /></label>
            <button disabled={busy} style={{ ...primary, width: "100%", marginTop: 10 }}>Ruaj furnitorin</button>
          </form>
          <form onSubmit={createPurchase} style={panel}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>Regjistro blerje / furnizim</h2>
            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: -8 }}>Regjistro faturën e furnitorit si draft. Pranoje vetëm pasi malli të arrijë.</p>
            <label className="field-label">Furnitori<select required value={purchaseForm.supplier_id} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier_id: e.target.value })} style={field}><option value="">Zgjidh furnitorin</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
              <label className="field-label">Nr. faturës së furnitorit<input value={purchaseForm.reference} onChange={(e) => setPurchaseForm({ ...purchaseForm, reference: e.target.value })} style={field} /></label>
              <label className="field-label">Data e blerjes<input required type="date" value={purchaseForm.purchase_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })} style={field} /></label>
            </div>
            <h3 style={{ fontSize: 14 }}>Artikujt e blerjes</h3>
            {purchaseLines.map((line, index) => <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(140px,2fr) repeat(3,minmax(85px,1fr)) auto", gap: 7, alignItems: "end", border: "1px solid var(--line)", borderRadius: 9, padding: 9, marginBottom: 8 }}>
              <label className="field-label">Produkti<select required value={line.product_id} onChange={(e) => setPurchaseLines((rows) => rows.map((row,i) => i===index ? { ...row, product_id: e.target.value } : row))} style={field}><option value="">Zgjidh</option>{products.filter((p) => p.track_stock && p.item_type === "product").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label className="field-label">Sasia<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setPurchaseLines((rows) => rows.map((row,i) => i===index ? { ...row, quantity: e.target.value } : row))} style={field} /></label>
              <label className="field-label">Kosto / njësi (€)<input required type="number" min="0" step="0.0001" value={line.unit_cost} onChange={(e) => setPurchaseLines((rows) => rows.map((row,i) => i===index ? { ...row, unit_cost: e.target.value } : row))} style={field} /></label>
              <label className="field-label">TVSH<select value={line.vat_rate} onChange={(e) => setPurchaseLines((rows) => rows.map((row,i) => i===index ? { ...row, vat_rate: e.target.value } : row))} style={field}><option value="0">0%</option><option value="8">8%</option><option value="18">18%</option></select></label>
              {purchaseLines.length > 1 && <button type="button" onClick={() => setPurchaseLines((rows) => rows.filter((_,i) => i!==index))} style={secondary}>Hiq</button>}
            </div>)}
            <button type="button" style={{ ...secondary, width: "100%" }} onClick={() => setPurchaseLines((rows) => [...rows,{ product_id: "", quantity: "1", unit_cost: "", vat_rate: "0" }])}>+ Shto artikull</button>
            <label className="field-label">Shënime<textarea value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} style={{ ...field, minHeight: 65 }} /></label>
            <button disabled={busy || !suppliers.length || !products.some((p) => p.track_stock && p.item_type === "product")} style={{ ...primary, width: "100%", marginTop: 10 }}>{busy ? "Duke ruajtur..." : "Ruaj blerjen si draft"}</button>
            {!suppliers.length && <small>Regjistro së pari një furnitor.</small>}
          </form>
        </div>
        <section style={panel}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>Blerjet ({purchases.length})</h2>
          <div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Data</th><th>Furnitori</th><th>Referenca</th><th>Totali</th><th>Statusi</th><th>Veprimi</th></tr></thead><tbody>
            {purchases.map((purchase) => <tr key={purchase.id}><td>{purchase.purchase_date}</td><td>{suppliers.find((s) => s.id === purchase.supplier_id)?.name || "—"}</td><td>{purchase.reference || "—"}</td><td>{fmt(Number(purchase.total))}</td><td>{purchase.status === "received" ? "Malli u pranua" : "Draft — në pritje"}<small>Paguar: {fmt(Number(purchase.paid_total))} · Mbetur: {fmt(Number(purchase.total)-Number(purchase.paid_total))}</small></td><td style={{ minWidth: 150 }}>{purchase.status === "draft" && <button disabled={busy} onClick={() => void receivePurchase(purchase.id)} style={primary}>Prano mallin</button>}{Number(purchase.total)-Number(purchase.paid_total)>0.005 && <button type="button" disabled={busy} onClick={() => { setPayingPurchaseId(payingPurchaseId===purchase.id ? null : purchase.id); setPurchasePaymentForm({ amount: "", method: "bank_transfer", reference: "" }); }} style={{ ...secondary, marginTop: 6 }}>Regjistro pagesë</button>}{payingPurchaseId===purchase.id && <form onSubmit={(event) => void recordPurchasePayment(event,purchase.id)} style={{ display: "grid", gap: 6, minWidth: 210, marginTop: 8 }}><input required type="number" min="0.01" max={Number(purchase.total)-Number(purchase.paid_total)} step="0.01" placeholder="Shuma (€)" value={purchasePaymentForm.amount} onChange={(e) => setPurchasePaymentForm({ ...purchasePaymentForm, amount: e.target.value })} style={field} /><select value={purchasePaymentForm.method} onChange={(e) => setPurchasePaymentForm({ ...purchasePaymentForm, method: e.target.value })} style={field}><option value="bank_transfer">Transfer bankar</option><option value="cash">Para në dorë</option><option value="card">Kartelë</option></select><input placeholder="Referenca (opsionale)" value={purchasePaymentForm.reference} onChange={(e) => setPurchasePaymentForm({ ...purchasePaymentForm, reference: e.target.value })} style={field} /><button disabled={busy} style={primary}>Ruaj pagesën</button></form>}</td></tr>)}
            {!purchases.length && <tr><td colSpan={6}>Nuk ka blerje të regjistruara.</td></tr>}
          </tbody></table></div>
          <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>Pranimi rrit stokun dhe krijon lëvizje inventari e gjurmë auditimi. Pagesat ndaj furnitorëve dhe libri zyrtar i blerjeve për ATK nuk janë ende të integruara.</p>
        </section>
      </section>}
      {tab === "atk" && <section style={{ display: "grid", gap: 14 }}>
        <section style={{ ...panel, borderColor: "#d7b56d" }}>
          <h2 style={{ marginTop: 0, fontSize: 19 }}>Lidhja me ATK — faza e testimit</h2>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>Këtu përgatiten të dhënat e tatimpaguesit dhe pajisjeve POS për integrimin testues. Ruajtja e të dhënave nuk dërgon kërkesë. Veprimet “Verifiko ATK” dhe “Kërko certifikatën” dërgojnë kërkesa reale vetëm në mjedisin TEST të ATK-së.</p>
          <p style={{ fontSize: 13, marginBottom: 0 }}><strong>Statusi aktual:</strong> Fiskalo nuk është certifikuar. Mjedisi i prodhimit është i çaktivizuar.</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12, fontSize: 13 }}>
            <a href="https://apps.atk-ks.org/sefaplikimi/" target="_blank" rel="noreferrer" style={{ color: "var(--brand)", fontWeight: 700 }}>Portali zyrtar SEF</a>
            <a href="https://fiskalizimi-test.atk-ks.org/swagger/index.html" target="_blank" rel="noreferrer" style={{ color: "var(--brand)", fontWeight: 700 }}>Swagger i mjedisit testues</a>
            <a href="https://github.com/fiskalizimi/pos-csharp" target="_blank" rel="noreferrer" style={{ color: "var(--brand)", fontWeight: 700 }}>Shembulli zyrtar C#</a>
          </div>
        </section>
        <section style={panel}>
          <h3 style={{ marginTop: 0 }}>POS Agent lokal — lidhja me kompjuterin</h3>
          <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>POS Agent duhet të jetë duke punuar në të njëjtin kompjuter Windows ku është hapur ky panel. Nise programin dhe shkruaje këtu kodin njëpërdorimësh që shfaqet në terminal.</p>
          <form onSubmit={pairPosAgent} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <label className="field-label" style={{ flex: "1 1 260px" }}>Kodi i lidhjes<input type="password" autoComplete="off" value={agentPairingCode} onChange={(e) => setAgentPairingCode(e.target.value)} style={field} /></label>
            <button disabled={agentBusy || !agentPairingCode.trim()} style={primary}>{agentBusy ? "Duke u lidhur..." : "Lidhe POS Agent"}</button>
            {agentToken && <button type="button" disabled={agentBusy} onClick={refreshAgentStatus} style={secondary}>Rifresko statusin</button>}
          </form>
          {agentStatus && <p style={{ fontSize: 12, marginBottom: 0 }}>Agent {String(agentStatus.agentVersion || "")} · Windows DPAPI: {agentStatus.windowsKeyStoreAvailable ? "i disponueshëm" : "jo i disponueshëm"} · Çelësi lokal: {agentStatus.signingKeyInitialized ? "i krijuar" : "nuk është krijuar"} · Certifikata testuese: {agentStatus.testCertificateInstalled ? "e instaluar" : "nuk është instaluar"}</p>}
          <label className="field-label" style={{ maxWidth: 340, marginTop: 10 }}>Application ID nga emaili i ATK-së<input type="number" min="1" step="1" value={atkApplicationId} onChange={(e) => { setAtkApplicationId(e.target.value); window.sessionStorage.setItem("fiskalo-atk-application-id:" + organizationId, e.target.value); }} placeholder="Vendos ID-në nga emaili i konfirmimit" style={field} /></label><small style={{ display: "block", maxWidth: 480, color: "var(--muted)" }}>Përdor Application ID nga emaili i konfirmimit të kërkesës për testim dhe ruaje veçmas numrin e fiskalizimit. <a href="https://apps.atk-ks.org/sefaplikimi/PreApplication/VerifyTests" target="_blank" rel="noreferrer">Hap verifikimin zyrtar të testimeve në ATK</a>.</small>
          {agentError && <p role="alert" style={{ color: "#9d2d26", fontSize: 12 }}>{agentError}</p>}
          {agentNotice && <p role="status" style={{ color: "#155c3c", fontSize: 12 }}>{agentNotice}</p>}
        </section>
        <div className="module-grid" style={{ display: "grid", gridTemplateColumns: "minmax(260px,340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
          <form onSubmit={saveAtkProfile} style={panel}>
            <h3 style={{ marginTop: 0 }}>Të dhënat e fiskalizimit të biznesit</h3>
            <label className="field-label">Numri i fiskalizimit (nga EDI)<input required value={atkProfileForm.fiscalization_number} onChange={(e) => setAtkProfileForm({ fiscalization_number: e.target.value })} style={field} /></label>
            <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.5 }}>Ky numër merret nga EDI i ATK-së për biznesin. Mos vendos NUI-në në vend të tij.</p>
            <button disabled={busy} style={{ ...primary, width: "100%" }}>Ruaj të dhënat</button>
            {atkProfile?.last_verified_at && <small>Verifikuar: {new Date(atkProfile.last_verified_at).toLocaleString("sq-XK")}</small>}
            {atkProfile?.business_name_from_atk && <small>Emri sipas ATK-së: {atkProfile.business_name_from_atk}</small>}
          </form>
          <form onSubmit={addAtkPosInstallation} style={panel}>
            <h3 style={{ marginTop: 0 }}>Shto pajisje POS për testim</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
              <label className="field-label">ID e njësisë / degës (e konfirmuar)<input required type="number" min="1" step="1" value={atkPosForm.atk_branch_id} onChange={(e) => setAtkPosForm({ ...atkPosForm, atk_branch_id: e.target.value })} style={field} /></label>
              <label className="field-label">Numri i POS-it (i konfirmuar)<input required type="number" min="1" step="1" value={atkPosForm.pos_id} onChange={(e) => setAtkPosForm({ ...atkPosForm, pos_id: e.target.value })} style={field} /></label>
            </div>
            <label className="field-label">Emri i pajisjes<input required value={atkPosForm.label} onChange={(e) => setAtkPosForm({ ...atkPosForm, label: e.target.value })} placeholder="p.sh. Arka kryesore" style={field} /></label>
            <label className="field-label">Lokacioni<input value={atkPosForm.location} onChange={(e) => setAtkPosForm({ ...atkPosForm, location: e.target.value })} placeholder="p.sh. Ferizaj" style={field} /></label>
            <p style={{ color: "var(--muted)", fontSize: 11 }}>Mjedisi: TEST. Mos shpik ID të njësisë ose POS-it. Vendos vetëm identifikuesit që ATK i ka caktuar ose konfirmuar për këtë tatimpagues dhe instalim. Çdo instalim fiskal ka çift çelësash unik; çelësi privat duhet të mbetet në pajisje dhe nuk ruhet në cloud.</p>
            <button disabled={busy || !atkProfile} style={{ ...primary, width: "100%" }}>Shto pajisjen testuese</button>
            {!atkProfile && <small>Ruaje së pari numrin e fiskalizimit të biznesit.</small>}
          </form>
        </div>
        <section style={panel}>
          <h3 style={{ marginTop: 0 }}>Pajisjet POS të regjistruara në Fiskalo ({atkPosInstallations.length})</h3>
          <div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Pajisja</th><th>Dega ATK</th><th>POS ID</th><th>Mjedisi</th><th>Statusi</th><th>Certifikata</th><th>CSR Web</th><th>Veprimet testuese</th></tr></thead><tbody>
            {atkPosInstallations.map((pos) => <tr key={pos.id}><td>{pos.label}<small>{pos.location || "Lokacioni nuk është shënuar"}</small></td><td>{pos.atk_branch_id}</td><td>{pos.pos_id}</td><td>{pos.environment === "test" ? "Test" : "Prodhim"}</td><td>{({ unregistered: "Pa regjistruar në ATK", verification_pending: "Verifikimi në pritje", certificate_pending: "Certifikata në pritje", active: "Aktive", suspended: "Pezulluar", revoked: "Revokuar" } as Record<string,string>)[pos.status] || pos.status}</td><td>{pos.certificate_serial ? pos.certificate_serial : "Nuk ka certifikatë"}</td><td><button type="button" disabled={browserKeyBusyId === pos.id} onClick={() => void downloadWebPosCsr(pos)} style={secondary}>{browserKeyBusyId === pos.id ? "Duke krijuar..." : browserKeyState[pos.id]?.exists ? "Shkarko CSR Web" : "Gjenero CSR Web"}</button>{browserKeyState[pos.id]?.fingerprint && <small>SHA-256: {browserKeyState[pos.id].fingerprint}</small>}{browserKeyState[pos.id]?.exists && <small>Çelësi ruhet në këtë shfletues.</small>}</td><td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button type="button" disabled={agentBusy || !agentToken || !atkApplicationId} onClick={() => void verifyAtkPos(pos)} style={secondary}>Verifiko ATK</button><button type="button" disabled={agentBusy || !agentToken || !agentVerifications[pos.id] || !atkApplicationId} onClick={() => void requestAtkTestCertificate(pos)} style={secondary}>Kërko certifikatën</button></div>{agentVerifications[pos.id] && <small>Verifikimi u krye në këtë sesion.</small>}</td></tr>)}
            {!atkPosInstallations.length && <tr><td colSpan={8}>Nuk ka pajisje POS të regjistruara.</td></tr>}
          </tbody></table></div>
          <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>Lista paraqet konfigurimin e POS-it në Fiskalo. Veprimet testuese aktivizohen vetëm pasi të lidhësh POS Agent-in dhe të vendosësh application ID-në e dhënë nga ATK.</p>
        </section>
      </section>}
      {tab === "reports" && <section style={{ display: "grid", gap: 14 }}>
        <div style={{ ...panel, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div><h2 style={{ margin: "0 0 5px", fontSize: 19 }}>Raporti i biznesit</h2><p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>Përmbledhje operative nga të dhënat e regjistruara në Fiskalo.</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}><label style={{ fontSize: 11 }}>Prej<input type="date" value={reportFrom} max={reportTo} onChange={(e) => setReportFrom(e.target.value)} style={{ ...field, display: "block", marginTop: 4 }} /></label><label style={{ fontSize: 11 }}>Deri<input type="date" value={reportTo} min={reportFrom} onChange={(e) => setReportTo(e.target.value)} style={{ ...field, display: "block", marginTop: 4 }} /></label></div></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={secondary} onClick={exportInvoices}>Eksporto faturat CSV</button><button style={secondary} onClick={exportExpenses}>Eksporto shpenzimet CSV</button><button style={secondary} onClick={exportPurchases}>Eksporto blerjet CSV</button></div>
        </div>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          <Stat label="Fatura të lëshuara" value={String(periodInvoices.length)} />
          <Stat label="Të hyra (bruto)" value={fmt(periodRevenue)} />
          <Stat label="TVSH në fatura" value={fmt(periodVat)} />
          <Stat label="Shpenzime të regjistruara" value={fmt(periodExpenseTotal)} />
          <Stat label="Blerje gjithsej" value={fmt(periodPurchaseTotal)} />
          <Stat label="Borxhi ndaj furnitorëve" value={fmt(periodSupplierBalance)} />
          <Stat label="Të hyra minus shpenzime operative" value={fmt(periodRevenue - periodExpenseTotal)} />
        </section>
        <section style={panel}><h3 style={{ marginTop: 0 }}>Shënim për raportet tatimore</h3><p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>Këto janë raporte të brendshme menaxheriale. Diferenca e të hyrave dhe shpenzimeve nuk është fitim neto: nuk përfshin ende koston e mallrave të shitura, amortizimin dhe të gjitha rregullimet kontabël. Blerjet e stokut shfaqen veçmas dhe nuk zbriten automatikisht si shpenzim. Këto nuk janë libra zyrtarë apo deklarata të pranuara nga ATK.</p></section>
      </section>}

      {tab === "team" && <section className="module-grid" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        <form onSubmit={addMember} style={panel}><h2 style={{ fontSize: 18, marginTop: 0 }}>Fto anëtar në ekip</h2>
          <label className="field-label">Email<input required type="email" autoComplete="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} style={field} /></label>
          <label className="field-label">Roli<select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })} style={field}><option value="administrator">Administrator</option><option value="accountant">Kontabilist</option><option value="manager">Menaxher</option><option value="cashier">Arkëtar</option></select></label>
          <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }}>Nëse personi nuk ka llogari, ftesa ruhet këtu. Ky version nuk dërgon email automatik; dërgoja personit linkun <a href="/register" style={{ color: "var(--brand)", fontWeight: 700 }}>fiskalo.shqiptare.workers.dev/register</a>. Qasja aktivizohet kur regjistrohet dhe hyn me të njëjtin email.</p>
          <button disabled={busy} style={{ ...primary, width: "100%" }}>Ruaj ftesën / shto anëtarin</button>
        </form>
        <section style={panel}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><h2 style={{ fontSize: 18, marginTop: 0 }}>Anëtarët</h2><button style={secondary} onClick={() => void loadMembers()}>Rifresko</button></div>
          <div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Email</th><th>Roli</th><th></th></tr></thead><tbody>{members.map((m) => <tr key={m.member_user_id}><td>{m.member_email}</td><td>{({ owner: "Pronar", administrator: "Administrator", accountant: "Kontabilist", manager: "Menaxher", cashier: "Arkëtar" } as Record<string,string>)[m.member_role] || m.member_role}</td><td>{m.member_role !== "owner" && <button style={secondary} onClick={() => void removeMember(m.member_user_id)}>Largo</button>}</td></tr>)}{!members.length && <tr><td colSpan={3}>Nuk ka anëtarë shtesë.</td></tr>}</tbody></table></div>
          <h3 style={{ fontSize: 15, margin: "22px 0 8px" }}>Ftesat në pritje</h3>
          <div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Email</th><th>Roli</th><th>Statusi</th></tr></thead><tbody>{pendingInvitations.map((invite) => <tr key={invite.invitation_id}><td>{invite.invite_email}</td><td>{({ administrator: "Administrator", accountant: "Kontabilist", manager: "Menaxher", cashier: "Arkëtar" } as Record<string,string>)[invite.invite_role] || invite.invite_role}</td><td>Në pritje të regjistrimit / hyrjes</td></tr>)}{!pendingInvitations.length && <tr><td colSpan={3}>Nuk ka ftesa në pritje.</td></tr>}</tbody></table></div>
        </section>
      </section>}
      <footer style={{ marginTop: 24, color: "var(--muted)", fontSize: 11 }}>Të dhënat ruhen në hapësirën e këtij biznesi. Fiskalizimi zyrtar dhe certifikimi ATK nuk janë aktivizuar.</footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <article style={panel}><div style={{ color: "var(--muted)", fontSize: 12 }}>{label}</div><strong style={{ display: "block", fontSize: 22, marginTop: 8 }}>{value}</strong></article>;
}

function InvoiceTable({ invoices, fmt, customers, organizationId }: { invoices: Invoice[]; fmt: (value: number) => string; customers: Customer[]; organizationId: string }) {
  return <div style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Numri</th><th>Data</th><th>Klienti</th><th>Statusi</th><th>Pagesa</th><th>Totali</th><th></th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><Link href={`/app/${organizationId}/invoices/${invoice.id}`} style={{ color: "var(--brand)", fontWeight: 700 }}>{invoice.invoice_number || "Draft"}</Link></td><td>{invoice.issue_date}</td><td>{customers.find((c) => c.id === invoice.customer_id)?.name || "—"}</td><td>{invoice.status === "issued" ? "E lëshuar" : invoice.status === "cancelled" ? "Anuluar" : "Draft"}</td><td>{invoice.payment_status === "paid" ? "Paguar" : invoice.payment_status === "partial" ? "Pjesërisht" : invoice.payment_method === "credit" ? "Me afat" : "E papaguar"}</td><td>{fmt(Number(invoice.total))}</td><td>{invoice.status === "issued" && <Link className="no-print" href={`/app/${organizationId}/invoices/${invoice.id}`} style={{ color: "var(--brand)", fontWeight: 700 }}>Hap</Link>}</td></tr>)}{!invoices.length && <tr><td colSpan={7}>Nuk ka fatura ende.</td></tr>}</tbody></table></div>;
}




function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
