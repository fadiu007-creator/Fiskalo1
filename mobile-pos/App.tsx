import React, { useEffect, useMemo, useState } from "react";
import { FlatList, SafeAreaView, ScrollView, Share, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import FiskaloAtkCrypto from "fiskalo-atk-crypto";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./src/supabase";
import { encodeAtkBase64, encodeAtkPosCoupon } from "../src/lib/atk/protobuf";

type Org = { organization_id: string; role: string; fiskalo_organizations: { legal_name: string; municipality: string; nui: string } | null };
type Product = {
  id: string; name: string; sku: string | null; unit_price: number; vat_rate: number;
  stock_quantity: number; track_stock: boolean; item_type: string; is_active: boolean;
  atk_unit_code: string | null; atk_tax_code: string | null; atk_item_category_code: string | null;
};
type Customer = { id: string; name: string };
type CartLine = { product: Product; quantity: number };
const ink = "#17212b";
const brand = "#245b50";
const line = "#dce3e1";
const money = (n: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(n);

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [organizations, setOrganizations] = useState<Org[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationNui, setOrganizationNui] = useState("");
  const [showAtkSetup, setShowAtkSetup] = useState(false);
  const [atkBranchId, setAtkBranchId] = useState("");
  const [atkPosId, setAtkPosId] = useState("");
  const [atkCsr, setAtkCsr] = useState("");
  const [atkFingerprint, setAtkFingerprint] = useState("");
  const [atkHardwareBacked, setAtkHardwareBacked] = useState<boolean | null>(null);
  const [atkBusy, setAtkBusy] = useState(false);
  const [atkFiscalizationNumber, setAtkFiscalizationNumber] = useState("");
  const [atkApplicationId, setAtkApplicationId] = useState("");
  const [atkVerification, setAtkVerification] = useState<{ businessName: string; verificationCode: string } | null>(null);
  const [atkCertificateInstalled, setAtkCertificateInstalled] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank_transfer" | "credit">("cash");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const total = useMemo(() => cart.reduce((sum, row) => {
    const base = Number(row.product.unit_price) * row.quantity;
    return sum + base + base * Number(row.product.vat_rate) / 100;
  }, 0), [cart]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  async function signIn() {
    setBusy(true); setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) { setError(signInError.message); return; }
    setSignedIn(true);
    await loadOrganizations();
  }

  async function loadOrganizations() {
    setBusy(true); setError("");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setSignedIn(false); setBusy(false); return; }
    await supabase.rpc("fiskalo_accept_pending_team_invitations");
    const { data, error: queryError } = await supabase.from("fiskalo_organization_users")
      .select("organization_id,role,fiskalo_organizations(legal_name,municipality,nui)")
      .eq("user_id", userData.user.id);
    setBusy(false);
    if (queryError) { setError(queryError.message); return; }
    const rows = (data ?? []) as unknown as Org[];
    setOrganizations(rows);
    if (rows.length === 1) await selectOrganization(rows[0]);
  }

  async function selectOrganization(org: Org) {
    setBusy(true); setError(""); setMessage("");
    const { data: p, error: pError } = await supabase.from("fiskalo_products")
      .select("id,name,sku,unit_price,vat_rate,stock_quantity,track_stock,item_type,is_active,atk_unit_code,atk_tax_code,atk_item_category_code")
      .eq("organization_id", org.organization_id).eq("is_active", true).order("name");
    const { data: c, error: cError } = await supabase.from("fiskalo_customers")
      .select("id,name").eq("organization_id", org.organization_id).order("name");
    setBusy(false);
    if (pError || cError) { setError(pError?.message ?? cError?.message ?? "Nuk u ngarkuan të dhënat."); return; }
    setOrganizationId(org.organization_id);
    setOrganizationName(org.fiskalo_organizations?.legal_name ?? "Biznesi");
    setOrganizationNui(org.fiskalo_organizations?.nui ?? "");
    setAtkCsr(""); setAtkFingerprint(""); setAtkHardwareBacked(null);
    setProducts((p ?? []) as Product[]);
    setCustomers((c ?? []) as Customer[]);
  }

  function add(product: Product) {
    setCart((current) => {
      const existing = current.find((row) => row.product.id === product.id);
      return existing
        ? current.map((row) => row.product.id === product.id ? { ...row, quantity: row.quantity + 1 } : row)
        : [...current, { product, quantity: 1 }];
    });
  }

  async function checkout() {
    setError(""); setMessage("");
    if (!cart.length) { setError("Shporta është bosh."); return; }
    if (paymentMethod !== "credit" && !paymentConfirmed) { setError("Konfirmo se pagesa është pranuar."); return; }
    if (paymentMethod !== "credit") {
      const unmapped = cart.filter(({ product }) => {
        const vat = Number(product.vat_rate);
        const tax = product.atk_tax_code?.trim() ?? "";
        const taxMatches = vat === 8 ? tax === "D" : vat === 18 ? tax === "E" : vat === 0 ? ["A", "C"].includes(tax) : false;
        return !product.atk_unit_code?.trim() || !product.atk_item_category_code?.trim() || !taxMatches;
      });
      if (unmapped.length) {
        setError("Plotëso kodet zyrtare ATK për: " + unmapped.map((row) => row.product.name).join(", ") + ". Shitja nuk u krijua.");
        return;
      }
    }
    const invalidStock = cart.find((row) => row.product.track_stock && row.quantity > Number(row.product.stock_quantity));
    if (invalidStock) { setError("Stok i pamjaftueshëm: " + invalidStock.product.name); return; }

    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setBusy(false); setError("Sesioni ka skaduar."); return; }
    const { data: invoice, error: invoiceError } = await supabase.from("fiskalo_invoices").insert({
      organization_id: organizationId, created_by: auth.user.id, customer_id: customerId || null,
      payment_method: paymentMethod, payment_status: "unpaid", issue_date: new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (invoiceError || !invoice) { setBusy(false); setError(invoiceError?.message ?? "Fatura nuk u krijua."); return; }

    const { error: itemError } = await supabase.from("fiskalo_invoice_items").insert(cart.map((row) => ({
      invoice_id: invoice.id, product_id: row.product.id, description: row.product.name,
      quantity: row.quantity, unit_price: Number(row.product.unit_price), vat_rate: Number(row.product.vat_rate),
    })));
    if (itemError) { setBusy(false); setError("Drafti u krijua, por artikujt nuk u ruajtën: " + itemError.message); return; }

    const { data: invoiceNumber, error: issueError } = await supabase.rpc("fiskalo_issue_invoice", { target_invoice: invoice.id });
    if (issueError) { setBusy(false); setError("Fatura mbeti draft: " + issueError.message); return; }

    const { data: issuedInvoice, error: issuedReadError } = await supabase.from("fiskalo_invoices").select("total").eq("id", invoice.id).eq("organization_id", organizationId).single();
    if (issuedReadError || !issuedInvoice) { setBusy(false); setError("Fatura u lëshua, por totali nuk u lexua. Kontrolloje para pagesës."); return; }

    if (paymentMethod !== "credit") {
      const { error: payError } = await supabase.rpc("fiskalo_record_payment", {
        target_invoice: invoice.id, payment_amount: Number(issuedInvoice.total), method: paymentMethod, payment_reference: null,
      });
      if (payError) { setBusy(false); setError("Fatura " + invoiceNumber + " u lëshua, por pagesa nuk u regjistrua: " + payError.message); return; }
    }
    let fiscalMessage = "";
    if (paymentMethod !== "credit") {
      try {
        fiscalMessage = " " + await submitAndroidPaidInvoiceToATK(invoice.id);
      } catch (fiscalError) {
        fiscalMessage = " Pagesa u regjistrua, por fiskalizimi automatik nuk u konfirmua: " +
          (fiscalError instanceof Error ? fiscalError.message : "Gabim i panjohur.") +
          " Kontrollo statusin ATK para çdo prove tjetër.";
      }
    }
    setBusy(false); setCart([]); setCustomerId(""); setPaymentConfirmed(false); setPaymentMethod("cash");
    setMessage("Fatura " + invoiceNumber + " u lëshua. " + (paymentMethod === "credit" ? "Mbeti e papaguar." : "Pagesa u regjistrua." + fiscalMessage));
    await selectOrganization({ organization_id: organizationId, role: "", fiskalo_organizations: { legal_name: organizationName, municipality: "", nui: organizationNui } });
  }

  async function createAndroidAtkCsr() {
    setError(""); setMessage(""); setAtkCsr(""); setAtkFingerprint("");
    if (!/^\d{9}$/.test(organizationNui)) { setError("Biznesi nuk ka NUI valid me 9 shifra."); return; }
    if (!/^\d{1,20}$/.test(atkBranchId) || !/^\d{1,20}$/.test(atkPosId)) {
      setError("Vendos ID-në e njësisë dhe numrin e POS-it të konfirmuar nga ATK. Mos shpik identifikues.");
      return;
    }
    setAtkBusy(true);
    try {
      const alias = organizationId + "." + atkBranchId + "." + atkPosId;
      const cacheKey = "fiskalo-atk-csr:" + alias;
      const cached = await SecureStore.getItemAsync(cacheKey);
      if (cached) {
        const previous = JSON.parse(cached) as { csrPem: string; publicKeySha256: string; secureHardwareBacked: boolean };
        setAtkCsr(previous.csrPem); setAtkFingerprint(previous.publicKeySha256); setAtkHardwareBacked(previous.secureHardwareBacked);
        setMessage("U rikthye CSR-ja ekzistuese. Çelësi privat mbetet në Android Keystore.");
        return;
      }
      if (await FiskaloAtkCrypto.hasKey(alias)) {
        throw new Error("Ky instalim ka çelës Android Keystore, por CSR-ja lokale nuk u gjet. Mos fshi ose zëvendëso çelësin; kontakto mbështetjen për rikuperim të sigurt.");
      }
      const result = await FiskaloAtkCrypto.createCsr(alias, organizationName, organizationNui, atkBranchId, atkPosId);
      await SecureStore.setItemAsync(cacheKey, JSON.stringify(result));
      setAtkCsr(result.csrPem);
      setAtkFingerprint(result.publicKeySha256);
      setAtkHardwareBacked(result.secureHardwareBacked);
      setAtkCertificateInstalled(false); setAtkVerification(null);
      setMessage(result.secureHardwareBacked
        ? "CSR u krijua me çelës të mbrojtur nga hardueri në Android Keystore."
        : "CSR u krijua në Android Keystore, por pajisja nuk konfirmoi mbrojtje hardware-backed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nuk u krijua CSR në Android.");
    } finally { setAtkBusy(false); }
  }

  async function getAndroidTestPosInstallation(): Promise<{
    id: string; atk_branch_id: number; pos_id: number; location: string | null; status: string;
  }> {
    const { data, error: lookupError } = await supabase
      .from("fiskalo_atk_pos_installations")
      .select("id,atk_branch_id,pos_id,location,status")
      .eq("organization_id", organizationId)
      .eq("environment", "test")
      .eq("atk_branch_id", Number(atkBranchId))
      .eq("pos_id", Number(atkPosId))
      .limit(2);
    if (lookupError) throw new Error("Nuk u lexua instalimi TEST i POS-it: " + lookupError.message);
    if (!data || data.length !== 1) {
      throw new Error(data && data.length > 1
        ? "Ka më shumë se një instalim TEST me këto ID. Zgjidh/korrekto instalimin para verifikimit."
        : "Nuk u gjet instalimi TEST i këtij POS-i në biznes. Regjistroje një herë te konfigurimi ATK në Web POS.");
    }
    return data[0] as { id: string; atk_branch_id: number; pos_id: number; location: string | null; status: string };
  }

  function androidAtkApiBase(): string {
    const value = process.env.EXPO_PUBLIC_FISKALO_API_URL?.trim();
    if (!value) throw new Error("Konfiguro EXPO_PUBLIC_FISKALO_API_URL me adresën reale të Fiskalo Cloudflare Worker.");
    return value.endsWith("/") ? value.slice(0, -1) : value;
  }

  function createAndroidVerificationNo(): string {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let value = "";
    for (let i = 0; i < 16; i++) value += alphabet[Math.floor(Math.random() * alphabet.length)];
    return value;
  }

  async function submitAndroidPaidInvoiceToATK(invoiceId: string): Promise<string> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sesioni ka skaduar. Hyr përsëri.");
    const { data: invoice, error: invoiceError } = await supabase.from("fiskalo_invoices")
      .select("id,organization_id,status,total,invoice_number,payment_status,subtotal,vat_total")
      .eq("id", invoiceId).eq("organization_id", organizationId).single();
    if (invoiceError || !invoice) throw new Error("Fatura nuk u gjet për fiskalizim.");
    if (invoice.status !== "issued" || invoice.payment_status !== "paid") return "Fatura nuk është plotësisht e paguar; nuk u dërgua në ATK.";

    const { data: existing, error: existingError } = await supabase.from("fiskalo_atk_fiscal_documents")
      .select("status,atk_transaction_id").eq("organization_id", organizationId).eq("source_invoice_id", invoiceId).maybeSingle();
    if (existingError) throw new Error("Nuk u kontrollua statusi ekzistues ATK: " + existingError.message);
    if (existing) return existing.status === "accepted"
      ? "ATK e ka pranuar tashmë këtë faturë (ID " + String(existing.atk_transaction_id ?? "") + ")."
      : "Kjo faturë ka tashmë një dërgesë ATK (" + existing.status + "). Nuk u krijua kupon i dytë.";

    const pos = await getAndroidTestPosInstallation();
    if (pos.status !== "active") throw new Error("Ky POS Android nuk është aktivizuar pas instalimit të certifikatës ATK TEST.");
    const alias = organizationId + "." + atkBranchId + "." + atkPosId;
    if (!await FiskaloAtkCrypto.hasKey(alias)) throw new Error("Mungon çelësi privat i këtij POS-i në Android Keystore.");
    const certificate = await SecureStore.getItemAsync("fiskalo-atk-certificate:" + alias);
    if (!certificate || !await FiskaloAtkCrypto.matchesCertificate(alias, certificate)) {
      throw new Error("Certifikata ATK TEST mungon ose nuk përputhet me çelësin lokal të Android-it.");
    }
    const { data: verification, error: verificationError } = await supabase.from("fiskalo_atk_pos_verifications")
      .select("nui,atk_branch_id,pos_id,application_id").eq("organization_id", organizationId)
      .eq("pos_installation_id", pos.id).maybeSingle();
    if (verificationError || !verification || verification.nui !== organizationNui ||
        Number(verification.atk_branch_id) !== Number(pos.atk_branch_id) ||
        Number(verification.pos_id) !== Number(pos.pos_id)) {
      throw new Error("Ky POS Android nuk ka verifikim ATK TEST që përputhet me NUI, degën dhe POS ID.");
    }

    const [{ data: org, error: orgError }, { data: lines, error: linesError }, { data: payments, error: paymentsError }] = await Promise.all([
      supabase.from("fiskalo_organizations").select("nui,municipality").eq("id", organizationId).single(),
      supabase.from("fiskalo_invoice_items").select("product_id,description,quantity,unit_price,line_subtotal,line_vat,vat_rate").eq("invoice_id", invoiceId),
      supabase.from("fiskalo_invoice_payments").select("amount,payment_method").eq("invoice_id", invoiceId).order("created_at"),
    ]);
    if (orgError || !org || String(org.nui) !== organizationNui) throw new Error("NUI i biznesit nuk përputhet me profilin fiskal.");
    if (linesError || !lines?.length) throw new Error("Fatura nuk ka artikuj të lexueshëm.");
    if (paymentsError || !payments?.length) throw new Error("Nuk u lexua evidenca e pagesave.");

    const productIds = Array.from(new Set(lines.map((line) => line.product_id).filter((id): id is string => Boolean(id))));
    const { data: mappedProducts, error: productsError } = productIds.length
      ? await supabase.from("fiskalo_products").select("id,atk_unit_code,atk_tax_code,atk_item_category_code")
        .eq("organization_id", organizationId).in("id", productIds)
      : { data: [], error: null };
    if (productsError) throw new Error("Kodet fiskale nuk u lexuan: " + productsError.message);
    const productMap = new Map((mappedProducts ?? []).map((product) => [product.id, product]));
    const itemRows = lines.map((line) => {
      const product = line.product_id ? productMap.get(line.product_id) : null;
      const unit = product?.atk_unit_code?.trim() ?? "";
      const tax = product?.atk_tax_code?.trim() ?? "";
      const itemType = product?.atk_item_category_code?.trim() ?? "";
      const vat = Number(line.vat_rate);
      const matches = vat === 8 ? tax === "D" : vat === 18 ? tax === "E" : vat === 0 ? ["A", "C"].includes(tax) : false;
      if (!unit || !itemType || !matches) throw new Error("Artikulli " + line.description + " nuk ka kode ATK të plota ose kodi i TVSH-së nuk përputhet.");
      return { line, unit, tax, itemType };
    });

    const paymentTypes: Record<string, number> = { cash: 1, card: 2, bank_transfer: 6 };
    const paymentTotals = new Map<number, number>();
    for (const payment of payments) {
      const type = paymentTypes[payment.payment_method];
      if (!type) throw new Error("Mënyra e pagesës " + payment.payment_method + " nuk ka kod ATK të konfiguruar.");
      paymentTotals.set(type, (paymentTotals.get(type) ?? 0) + Math.round(Number(payment.amount) * 100));
    }
    const paymentCents = Array.from(paymentTotals.values()).reduce((sum, value) => sum + value, 0);
    const totalCents = Math.round(Number(invoice.total) * 100);
    if (paymentCents !== totalCents) throw new Error("Totali i pagesave nuk përputhet me totalin e faturës.");

    const { data: couponId, error: couponError } = await supabase.rpc("fiskalo_next_atk_coupon_id");
    if (couponError || !couponId) throw new Error("Nuk u caktua numri unik i kuponit ATK: " + (couponError?.message ?? ""));
    const grouped = new Map<string, { totalForTaxCents: number; totalTaxCents: number }>();
    itemRows.forEach(({ line, tax }) => {
      const current = grouped.get(tax) || { totalForTaxCents: 0, totalTaxCents: 0 };
      current.totalForTaxCents += Math.round(Number(line.line_subtotal) * 100);
      current.totalTaxCents += Math.round(Number(line.line_vat) * 100);
      grouped.set(tax, current);
    });
    const payload = encodeAtkBase64(encodeAtkPosCoupon({
      businessId: String(org.nui), couponId, branchId: pos.atk_branch_id,
      location: pos.location || org.municipality || "", operatorId: auth.user.id,
      posId: pos.pos_id, applicationId: Number(verification.application_id),
      verificationNo: createAndroidVerificationNo(), type: 1, unixTime: Math.floor(Date.now() / 1000),
      items: itemRows.map(({ line, unit, tax, itemType }) => ({
        name: line.description, unitPriceEuro: Number(line.unit_price), unit, quantity: Number(line.quantity),
        lineTotalCents: Math.round((Number(line.line_subtotal) + Number(line.line_vat)) * 100), taxRate: tax, itemType,
      })),
      payments: Array.from(paymentTotals.entries()).map(([type, amountCents]) => ({ type, amountCents })),
      totalCents,
      taxGroups: Array.from(grouped.entries()).map(([taxRate, values]) => ({ taxRate, ...values })),
      totalTaxCents: Math.round(Number(invoice.vat_total) * 100),
      totalNoTaxCents: Math.round(Number(invoice.subtotal) * 100),
    }));
    const signature = await FiskaloAtkCrypto.signBase64(alias, payload);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Sesioni ka skaduar. Hyr përsëri.");
    const response = await fetch(androidAtkApiBase() + "/api/atk/test/coupon", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ organizationId, nui: String(org.nui), invoiceId, posInstallationId: pos.id,
        couponId: String(couponId), applicationId: Number(verification.application_id), totalCents, details: payload, signature }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || result.error || "Dërgimi automatik në ATK TEST dështoi. Kontrollo statusin para çdo prove tjetër.");
    return "ATK TEST e pranoi faturën. Transaction ID: " + String(result.transactionId ?? "");
  }

  async function verifyAndroidAtkPos() {
    setError(""); setMessage("");
    if (!atkFiscalizationNumber.trim() || !/^\d{9}$/.test(organizationNui) ||
        !/^\d{1,20}$/.test(atkBranchId) || !/^\d{1,20}$/.test(atkPosId) ||
        !/^\\d+$/.test(atkApplicationId)) {
      setError("Plotëso numrin e fiskalizimit për TEST, Application ID, NUI, ID e njësisë dhe POS ID sipas emailit/udhëzimeve të ATK-së.");
      return;
    }
    setAtkBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sesioni ka skaduar. Hyr përsëri.");
      const apiBase = androidAtkApiBase();
      const posInstallationId = await getAndroidTestPosInstallationId();
      const response = await fetch(apiBase.replace(/\/$/, "") + "/api/atk/test/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          organizationId, posInstallationId, nui: organizationNui, fiscalizationNumber: atkFiscalizationNumber.trim(),
          branchId: atkBranchId, posId: atkPosId, applicationId: atkApplicationId,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || result.error || "Verifikimi ATK dështoi.");
      const verification = { businessName: result.businessName as string, verificationCode: result.verificationCode as string };
      setAtkVerification(verification);
      await SecureStore.setItemAsync("fiskalo-atk-verification:" + organizationId + ":" + atkBranchId + ":" + atkPosId, JSON.stringify(verification));
      setMessage("ATK verifikoi POS-in në TEST. Tani mund të kërkosh certifikatën për CSR-në e këtij Android-i.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verifikimi ATK dështoi.");
    } finally { setAtkBusy(false); }
  }

  async function requestAndroidAtkCertificate() {
    setError(""); setMessage("");
    setAtkBusy(true);
    try {
      const alias = organizationId + "." + atkBranchId + "." + atkPosId;
      const verificationKey = "fiskalo-atk-verification:" + organizationId + ":" + atkBranchId + ":" + atkPosId;
      const verification = atkVerification ?? JSON.parse((await SecureStore.getItemAsync(verificationKey)) || "null");
      if (!verification?.businessName || !verification?.verificationCode) throw new Error("Verifikoje fillimisht POS-in në ATK.");
      const cachedCsr = await SecureStore.getItemAsync("fiskalo-atk-csr:" + alias);
      if (!cachedCsr) throw new Error("Gjenero CSR-në në këtë Android para kërkesës për certifikatë.");
      const csr = JSON.parse(cachedCsr) as { csrPem: string };
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sesioni ka skaduar. Hyr përsëri.");
      const apiBase = androidAtkApiBase();
      const posInstallationId = await getAndroidTestPosInstallationId();
      const response = await fetch(apiBase.replace(/\/$/, "") + "/api/atk/test/sign-csr", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          organizationId, posInstallationId, nui: organizationNui, businessName: verification.businessName,
          verificationCode: verification.verificationCode, branchId: atkBranchId,
          posId: atkPosId, applicationId: atkApplicationId, csrPem: csr.csrPem,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || result.error || "ATK nuk lëshoi certifikatën testuese.");
      const matches = await FiskaloAtkCrypto.matchesCertificate(alias, result.signedCertificate);
      if (!matches) throw new Error("Certifikata e ATK-së nuk përputhet me çelësin lokal të këtij Android-i. Nuk u ruajt.");
      await SecureStore.setItemAsync("fiskalo-atk-certificate:" + alias, result.signedCertificate as string);
      const posInstallation = await getAndroidTestPosInstallation();
      const { error: activationError } = await supabase.from("fiskalo_atk_pos_installations")
        .update({ status: "active" }).eq("organization_id", organizationId).eq("id", posInstallation.id);
      if (activationError) throw new Error("Certifikata u mor, por instalimi nuk u aktivizua në llogarinë e biznesit: " + activationError.message);
      setAtkCertificateInstalled(true);
      setMessage("Certifikata TEST u mor nga ATK dhe u verifikua se përputhet me çelësin Android Keystore. Nuk është certifikatë prodhimi.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kërkesa për certifikatë dështoi.");
    } finally { setAtkBusy(false); }
  }

  async function shareAndroidAtkCsr() {
    if (!atkCsr) return;
    await Share.share({ title: "Fiskalo ATK test CSR", message: atkCsr });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSignedIn(false); setOrganizations([]); setOrganizationId(""); setOrganizationNui(""); setCart([]);
  }

  const filtered = products.filter((p) => p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || (p.sku ?? "").toLocaleLowerCase().includes(search.toLocaleLowerCase()));

  return <SafeAreaView style={{ flex:  1, backgroundColor: "#f4f7f6" }}>
    <ExpoStatusBar style="dark" />
    <StatusBar barStyle="dark-content" />
    <View style={{ padding: 16, backgroundColor: "white", borderBottomWidth: 1, borderColor: line }}>
      <Text style={{ color: brand, fontWeight: "900", fontSize: 24 }}>fiskalo</Text>
      <Text style={{ color: ink, fontSize: 13 }}>POS Android {organizationName ? "· " + organizationName : ""}</Text>
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ margin: 12, padding: 12, color: "#9a3028", backgroundColor: "#ffeded", borderRadius: 8 }}>{error}</Text>}
    {!!message && <Text accessibilityRole="alert" style={{ margin: 12, padding: 12, color: "#145b3a", backgroundColor: "#e8f5ec", borderRadius: 8 }}>{message}</Text>}

    {!signedIn ? <View style={{ padding: 18, gap: 12 }}>
      <Text style={{ fontSize: 23, fontWeight: "800", color: ink }}>Hyr në Fiskalo</Text>
      <TextInput placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={inputStyle} />
      <TextInput placeholder="Fjalëkalimi" secureTextEntry value={password} onChangeText={setPassword} style={inputStyle} />
      <Action label={busy ? "Duke hyrë..." : "Hyr"} disabled={busy} onPress={() => void signIn()} />
    </View> : !organizationId ? <ScrollView contentContainerStyle={{ padding: 18, gap: 10 }}>
      <Text style={{ color: ink, fontSize: 22, fontWeight: "800" }}>Zgjidh biznesin</Text>
      {organizations.map((org) => <TouchableOpacity key={org.organization_id} onPress={() => void selectOrganization(org)} style={cardStyle}>
        <Text style={{ color: ink, fontWeight: "800", fontSize: 16 }}>{org.fiskalo_organizations?.legal_name ?? "Biznesi"}</Text>
        <Text style={{ color: "#687773" }}>{org.fiskalo_organizations?.municipality ?? ""} · {org.role}</Text>
      </TouchableOpacity>)}
      {!organizations.length && <Action label="Ngarko bizneset" onPress={() => void loadOrganizations()} />}
      <Action label="Dil" secondary onPress={() => void signOut()} />
    </ScrollView> : <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <TouchableOpacity onPress={() => setShowAtkSetup((value) => !value)} style={{ padding: 12, marginBottom: 8, backgroundColor: "white", borderWidth: 1, borderColor: line, borderRadius: 9 }}>
          <Text style={{ color: ink, fontWeight: "800" }}>ATK / Siguria e POS-it · {showAtkSetup ? "Mbyll" : "Hap konfigurimin"}</Text>
          <Text style={{ color: "#687773", fontSize: 11, marginTop: 3 }}>Krijo çelësin dhe CSR në këtë pajisje Android. Vetëm për testim.</Text>
        </TouchableOpacity>
        {showAtkSetup && <View style={{ padding: 12, marginBottom: 9, backgroundColor: "white", borderWidth: 1, borderColor: line, borderRadius: 9, gap: 7 }}>
          <Text style={{ color: ink, fontWeight: "800" }}>Identiteti i tatimpaguesit</Text>
          <Text style={{ color: "#687773", fontSize: 12 }}>Biznesi: {organizationName} · NUI: {organizationNui || "Nuk është regjistruar"}</Text>
          <TextInput placeholder="ID e njësisë / degës (e konfirmuar nga ATK)" keyboardType="number-pad" value={atkBranchId} onChangeText={setAtkBranchId} style={inputStyle} />
          <TextInput placeholder="Numri i POS-it (i konfirmuar)" keyboardType="number-pad" value={atkPosId} onChangeText={setAtkPosId} style={inputStyle} />
          <TextInput placeholder="Numri i fiskalizimit për TEST (nga emaili ATK)" value={atkFiscalizationNumber} onChangeText={setAtkFiscalizationNumber} style={inputStyle} />
          <TextInput placeholder="Application ID (nga emaili ATK)" keyboardType="number-pad" value={atkApplicationId} onChangeText={setAtkApplicationId} style={inputStyle} />
          <Action label={atkBusy ? "Duke krijuar CSR..." : "Gjenero çelës dhe CSR në Android"} disabled={atkBusy} onPress={() => void createAndroidAtkCsr()} />
          <Action label={atkBusy ? "Duke verifikuar..." : "Verifiko POS-in në ATK TEST"} secondary disabled={atkBusy} onPress={() => void verifyAndroidAtkPos()} />
          <Action label={atkBusy ? "Duke kërkuar certifikatën..." : "Kërko certifikatën TEST"} secondary disabled={atkBusy || !atkVerification} onPress={() => void requestAndroidAtkCertificate()} />
          {atkCertificateInstalled && <Text style={{ color: "#145b3a", fontSize: 12 }}>Certifikata TEST u instalua dhe përputhet me çelësin lokal.</Text>}
          {!!atkFingerprint && <Text selectable style={{ color: "#52635e", fontSize: 11 }}>SHA-256: {atkFingerprint} · Hardware-backed: {atkHardwareBacked ? "Po" : "Jo"}</Text>}
          {!!atkCsr && <>
            <Text style={{ color: ink, fontWeight: "700" }}>CSR (çelësi privat nuk përfshihet)</Text>
            <Text selectable style={{ color: "#52635e", fontSize: 9, maxHeight: 80 }}>{atkCsr}</Text>
            <Action label="Ndaje CSR-në" secondary onPress={() => void shareAndroidAtkCsr()} />
          </>}
          <Text style={{ color: "#8a5a18", fontSize: 11 }}>Mos e dërgo çelësin privat askund. Ky modul mbështet onboarding TEST dhe kontrollon që certifikata përputhet me çelësin lokal. Dërgimi i kuponëve fiskalë nga Android ende nuk është implementuar. Konfirmo me ATK pranueshmërinë e pajisjes dhe modelit të ruajtjes para përdorimit zyrtar.</Text>
        </View>}
        <TextInput placeholder="Kërko produkt / SKU" value={search} onChangeText={setSearch} style={inputStyle} />
      </View>
      <View style={{ flex: 1 }}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={{ padding: 8 }}
          renderItem={({ item }) => <TouchableOpacity onPress={() => add(item)} style={{ flex: 1, margin: 5, minHeight: 94, padding: 12, backgroundColor: "white", borderRadius: 10, borderWidth: 1, borderColor: line, justifyContent: "space-between" }}>
            <Text style={{ color: ink, fontWeight: "700" }}>{item.name}</Text>
            <Text style={{ color: brand, fontWeight: "900", fontSize: 16 }}>{money(Number(item.unit_price))}</Text>
            <Text style={{ color: "#687773", fontSize: 11 }}>{item.track_stock ? "Stok: " + item.stock_quantity : item.item_type === "service" ? "Shërbim" : "Pa stok"}</Text>
          </TouchableOpacity>}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: "#687773", margin: 24 }}>Nuk ka produkte aktive.</Text>}
        />
      </View>
      <View style={{ maxHeight: "48%", backgroundColor: "white", borderTopWidth: 1, borderColor: line, padding: 14 }}>
        <Text style={{ fontSize: 18, fontWeight: "900", color: ink, marginBottom: 8 }}>Shporta · {cart.length}</Text>
        <ScrollView style={{ maxHeight: 120 }}>
          {cart.map((row) => <View key={row.product.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5 }}>
            <Text style={{ flex: 1, color: ink }}>{row.product.name}</Text>
            <TouchableOpacity onPress={() => setCart((current) => current.map((item) => item.product.id === row.product.id ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item))}><Text style={{ padding: 7, color: brand }}>−</Text></TouchableOpacity>
            <Text style={{ color: ink, minWidth: 22, textAlign: "center" }}>{row.quantity}</Text>
            <TouchableOpacity onPress={() => setCart((current) => current.map((item) => item.product.id === row.product.id ? { ...item, quantity: item.quantity + 1 } : item))}><Text style={{ padding: 7, color: brand }}>+</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setCart((current) => current.filter((item) => item.product.id !== row.product.id))}><Text style={{ color: "#a33", padding: 7 }}>Hiq</Text></TouchableOpacity>
          </View>)}
        </ScrollView>
        <Text style={{ color: ink, fontWeight: "900", fontSize: 21, marginVertical: 7 }}>Totali: {money(total)}</Text>
        <Text style={{ color: "#687773", fontSize: 11, marginBottom: 5 }}>Klienti (opsional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 42, marginBottom: 5 }}>
          <TouchableOpacity onPress={() => setCustomerId("")} style={{ padding: 9, marginRight: 6, borderRadius: 8, backgroundColor: !customerId ? brand : "#eef2f0" }}>
            <Text style={{ color: !customerId ? "white" : ink, fontSize: 12 }}>Pa emër</Text>
          </TouchableOpacity>
          {customers.map((customer) => <TouchableOpacity key={customer.id} onPress={() => setCustomerId(customer.id)} style={{ padding: 9, marginRight: 6, borderRadius: 8, backgroundColor: customerId === customer.id ? brand : "#eef2f0" }}>
            <Text style={{ color: customerId === customer.id ? "white" : ink, fontSize: 12 }}>{customer.name}</Text>
          </TouchableOpacity>)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 42 }}>
          {(["cash", "card", "bank_transfer", "credit"] as const).map((method) => <TouchableOpacity key={method} onPress={() => { setPaymentMethod(method); setPaymentConfirmed(false); }} style={{ padding: 9, marginRight: 6, borderRadius: 8, backgroundColor: paymentMethod === method ? brand : "#eef2f0" }}>
            <Text style={{ color: paymentMethod === method ? "white" : ink, fontSize: 12 }}>{({ cash: "Cash", card: "Kartelë", bank_transfer: "Transfer", credit: "Me afat" })[method]}</Text>
          </TouchableOpacity>)}
        </ScrollView>
        {paymentMethod !== "credit" && <TouchableOpacity onPress={() => setPaymentConfirmed((value) => !value)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
          <Text style={{ color: ink }}>{paymentConfirmed ? "☑" : "□"} Konfirmoj se pagesa është pranuar</Text>
        </TouchableOpacity>}
        <Action label={busy ? "Duke regjistruar..." : paymentMethod === "credit" ? "Lësho faturën" : "Përfundo shitjen"} disabled={busy || !cart.length} onPress={() => void checkout()} />
        <Action label="Ndërro biznesin" secondary onPress={() => { setOrganizationId(""); setCart([]); }} />
        <Action label="Dil nga llogaria" secondary onPress={() => void signOut()} />
      </View>
    </View>}
  </SafeAreaView>;
}

const inputStyle = { backgroundColor: "white", borderWidth: 1, borderColor: line, borderRadius: 9, padding: 12, color: ink, marginBottom: 8 } as const;
const cardStyle = { backgroundColor: "white", padding: 16, borderRadius: 10, borderWidth: 1, borderColor: line } as const;
function Action({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} style={{ backgroundColor: secondary ? "white" : brand, borderWidth: secondary ? 1 : 0, borderColor: line, padding: 13, borderRadius: 9, marginTop: 7, opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ color: secondary ? ink : "white", textAlign: "center", fontWeight: "800" }}>{label}</Text>
  </TouchableOpacity>;
}
