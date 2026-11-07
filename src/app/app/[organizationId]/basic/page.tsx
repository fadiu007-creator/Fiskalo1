import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowUpRight, Boxes, FileBarChart2, FileText, ReceiptText, Settings2, ShoppingCart } from "lucide-react";

type Props = { params: Promise<{ organizationId: string }> };
const money = (value: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(value);

export default async function FiskaloBasicApp({ params }: Props) {
  const { organizationId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: membership }, { data: organization }, { data: invoices, error: invoiceError }, { count: productCount, error: productError }] = await Promise.all([
    supabase.from("fiskalo_organization_users").select("role").eq("organization_id", organizationId).eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("fiskalo_organizations").select("legal_name,trade_name,municipality").eq("id", organizationId).maybeSingle(),
    supabase.from("fiskalo_invoices").select("id,invoice_number,issue_date,total,payment_status,fiscalization_status").eq("organization_id", organizationId).eq("status", "issued").order("created_at", { ascending: false }).limit(8),
    supabase.from("fiskalo_products").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_active", true),
  ]);
  if (!membership || !organization) redirect("/app");
  const role = String(membership.role);
  const canSell = ["owner", "administrator", "manager", "cashier"].includes(role);
  const canManage = ["owner", "administrator", "manager"].includes(role);
  const recent = invoices ?? [];
  const accepted = recent.filter((row) => row.fiscalization_status === "accepted").length;
  const pending = recent.filter((row) => ["queued", "submitted", "pending"].includes(String(row.fiscalization_status))).length;
  const actions = [
    ...(canSell ? [{ href: `/app/${organizationId}/basic/pos`, title: "Arka / POS", description: "Regjistro shitje dhe prano pagesa.", icon: ShoppingCart, primary: true }] : []),
    ...(canManage ? [{ href: `/app/${organizationId}/basic/inventory`, title: "Produktet", description: "Menaxho artikujt, çmimet dhe kodet fiskale ATK.", icon: Boxes }] : []),
    { href: `/app/${organizationId}/basic/invoices`, title: "Faturat", description: "Shiko faturat, pagesat dhe statusin fiskal.", icon: FileText },
    ...(canManage ? [{ href: `/app/${organizationId}/basic/pos/setup`, title: "Konfigurimi ATK / POS", description: "Kontrollo regjistrimin, verifikimin dhe certifikatën.", icon: Settings2 }] : []),
    ...(canManage ? [{ href: `/app/${organizationId}/basic/reports`, title: "Raportet bazë", description: "Kontrollo shitjet dhe TVSH-në.", icon: FileBarChart2 }] : []),
  ];
  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "22px clamp(14px,3vw,28px) 48px" }}>
    <nav aria-label="Zgjedhja e aplikacionit" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
      <Link href={`/app/${organizationId}`} style={{ border: "1px solid var(--line)", background: "white", color: "var(--ink)", borderRadius: 9, padding: "10px 14px", fontWeight: 650, textDecoration: "none" }}>Fiskalo Full</Link>
      <span aria-current="page" style={{ background: "var(--brand)", color: "white", borderRadius: 9, padding: "10px 14px", fontWeight: 750 }}>Fiskalo Basic</span>
    </nav>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, marginBottom: 26 }}>
      <div><span style={{ color: "var(--brand)", fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>FISKALIZIMI I THJESHTË</span><h1 style={{ margin: "7px 0 5px", fontSize: "clamp(28px,4vw,38px)" }}>Fiskalo Basic</h1><p style={{ margin: 0, color: "var(--muted)" }}>{organization.trade_name || organization.legal_name} · {organization.municipality || "Kosovë"}</p></div>
      {canSell && <Link href={`/app/${organizationId}/basic/pos`} style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 10, padding: "12px 16px", color: "white", background: "var(--brand)", fontWeight: 750, textDecoration: "none" }}><ShoppingCart size={17}/> Shitje e re</Link>}
    </header>
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 22 }}>
      <article style={metric}><span>Produkte aktive</span><strong>{productError ? "—" : productCount ?? 0}</strong><small>{productError ? "Të dhënat nuk u verifikuan" : "Katalogu i artikujve"}</small></article>
      <article style={metric}><span>Fatura të fundit</span><strong>{invoiceError ? "—" : recent.length}</strong><small>{invoiceError ? "Të dhënat nuk u verifikuan" : "Faturat e lëshuara së fundmi"}</small></article>
      <article style={metric}><span>Pranuar nga ATK</span><strong>{invoiceError ? "—" : accepted}</strong><small>Ndër faturat e fundit të shfaqura</small></article>
      <article style={metric}><span>Në proces</span><strong>{invoiceError ? "—" : pending}</strong><small>Kontrollo statusin para riprovimit</small></article>
    </section>
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 13 }}>
      {actions.map((action) => { const Icon = action.icon; return <Link key={action.href} href={action.href} style={{ ...tile, ...(action.primary ? { borderColor: "var(--brand)", boxShadow: "0 3px 14px rgba(0,0,0,.05)" } : {}) }}><span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--surface)", display: "grid", placeItems: "center", color: "var(--brand)" }}><Icon size={19}/></span><strong>{action.title}</strong><span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>{action.description}</span><span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--brand)", fontSize: 13, fontWeight: 750, marginTop: "auto" }}>Hap <ArrowUpRight size={15}/></span></Link>; })}
    </section>
    <section style={{ ...tile, marginTop: 22, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 17, borderBottom: "1px solid var(--line)" }}><div><strong>Faturat e fundit</strong><p style={{ color: "var(--muted)", fontSize: 12, margin: "4px 0 0" }}>Pagesat dhe rezultati i fiskalizimit.</p></div><Link href={`/app/${organizationId}/basic/invoices`} style={{ color: "var(--brand)", fontSize: 13, fontWeight: 700 }}>Të gjitha <ArrowUpRight size={14}/></Link></div>
      {invoiceError ? <p style={{ padding: 16, color: "#a12b2b" }}>Faturat nuk u ngarkuan. Kontrollo qasjen në databazë.</p> : recent.length ? <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr>{["Fatura","Data","Pagesa","ATK","Totali"].map((label) => <th key={label} style={th}>{label}</th>)}</tr></thead><tbody>{recent.map((row) => <tr key={row.id}><td style={td}><Link href={`/app/${organizationId}/basic/invoices/${row.id}`} style={{ color: "var(--brand)", fontWeight: 700 }}>{row.invoice_number || "Faturë"}</Link></td><td style={td}>{new Date(row.issue_date + "T12:00:00").toLocaleDateString("sq-XK")}</td><td style={td}>{row.payment_status === "paid" ? "E paguar" : row.payment_status === "partial" ? "Pjesërisht" : "E papaguar"}</td><td style={td}>{row.fiscalization_status || "Pa status"}</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{money(Number(row.total))}</td></tr>)}</tbody></table></div> : <p style={{ padding: 18, color: "var(--muted)" }}>Ende nuk ka fatura. Hap arkën për të regjistruar shitjen e parë.</p>}
    </section>
    <footer style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginTop: 24, color: "var(--muted)", fontSize: 12 }}><span>Fiskalo Basic · Moduli i thjeshtë i fiskalizimit</span><Link href="/login" style={{ color: "var(--brand)" }}>Dil nga llogaria</Link></footer>
  </main>;
}

const metric: React.CSSProperties = { display: "grid", gap: 7, padding: 17, border: "1px solid var(--line)", borderRadius: 13, background: "white" };
const tile: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10, padding: 18, border: "1px solid var(--line)", borderRadius: 13, background: "white", color: "var(--ink)", textDecoration: "none", minHeight: 160 };
const th: React.CSSProperties = { textAlign: "left", padding: "11px 14px", color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid var(--line)" };
const td: React.CSSProperties = { padding: "12px 14px", borderBottom: "1px solid var(--line)" };
