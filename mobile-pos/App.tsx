import React, { useEffect, useMemo, useState } from "react";
import { FlatList, SafeAreaView, ScrollView, Share, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import FiskaloAtkCrypto from "fiskalo-atk-crypto";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { supabase } from "./src/supabase";

type Org = { organization_id: string; role: string; fiskalo_organizations: { legal_name: string; municipality: string; nui: string } | null };
type Product = { id: string; name: string; sku: string | null; unit_price: number; vat_rate: number; stock_quantity: number; track_stock: boolean; item_type: string; is_active: boolean };
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
      .select("id,name,sku,unit_price,vat_rate,stock_quantity,track_stock,item_type,is_active")
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
    setBusy(false); setCart([]); setCustomerId(""); setPaymentConfirmed(false); setPaymentMethod("cash");
    setMessage("Fatura " + invoiceNumber + " u lëshua. " + (paymentMethod === "credit" ? "Mbeti e papaguar." : "Pagesa u regjistrua."));
    await selectOrganization({ organization_id: organizationId, role: "", fiskalo_organizations: { legal_name: organizationName, municipality: "" } });
  }

  async function createAndroidAtkCsr() {
    setError(""); setMessage(""); setAtkCsr(""); setAtkFingerprint("");
    if (!/^\\d{9}$/.test(organizationNui)) { setError("Biznesi nuk ka NUI valid me 9 shifra."); return; }
    if (!/^\\d{1,20}$/.test(atkBranchId) || !/^\\d{1,20}$/.test(atkPosId)) {
      setError("Vendos ID-në e njësisë dhe numrin e POS-it të konfirmuar nga ATK. Mos shpik identifikues.");
      return;
    }
    setAtkBusy(true);
    try {
      const alias = organizationId + "." + atkBranchId + "." + atkPosId;
      if (await FiskaloAtkCrypto.hasKey(alias)) {
        throw new Error("Ky instalim ka tashmë çelës Android Keystore. Përdor CSR-në e ruajtur më parë ose kërko ri-regjistrim nga ATK; mos krijo çelës të ri pa arsye.");
      }
      const result = await FiskaloAtkCrypto.createCsr(alias, organizationName, organizationNui, atkBranchId, atkPosId);
      setAtkCsr(result.csrPem);
      setAtkFingerprint(result.publicKeySha256);
      setAtkHardwareBacked(result.secureHardwareBacked);
      setMessage(result.secureHardwareBacked
        ? "CSR u krijua me çelës të mbrojtur nga hardueri në Android Keystore."
        : "CSR u krijua në Android Keystore, por pajisja nuk konfirmoi mbrojtje hardware-backed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nuk u krijua CSR në Android.");
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
          <TextInput placeholder="Numri i POS-it (i konfirmuar nga ATK)" keyboardType="number-pad" value={atkPosId} onChangeText={setAtkPosId} style={inputStyle} />
          <Action label={atkBusy ? "Duke krijuar CSR..." : "Gjenero çelës dhe CSR në Android"} disabled={atkBusy} onPress={() => void createAndroidAtkCsr()} />
          {!!atkFingerprint && <Text selectable style={{ color: "#52635e", fontSize: 11 }}>SHA-256: {atkFingerprint} · Hardware-backed: {atkHardwareBacked ? "Po" : "Jo"}</Text>}
          {!!atkCsr && <>
            <Text style={{ color: ink, fontWeight: "700" }}>CSR (çelësi privat nuk përfshihet)</Text>
            <Text selectable style={{ color: "#52635e", fontSize: 9, maxHeight: 80 }}>{atkCsr}</Text>
            <Action label="Ndaje CSR-në" secondary onPress={() => void shareAndroidAtkCsr()} />
          </>}
          <Text style={{ color: "#8a5a18", fontSize: 11 }}>Mos e dërgo çelësin privat askund. Ky modul krijon çelës lokal Android Keystore, por certifikata ATK dhe dërgimi i kuponëve ende nuk janë lidhur. Konfirmo me ATK pranueshmërinë e ruajtjes dhe pajisjes para përdorimit zyrtar.</Text>
        </View>}
      </View>
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
