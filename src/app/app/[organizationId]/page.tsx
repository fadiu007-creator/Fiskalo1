import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowUpRight, Boxes, FileBarChart2, FileText, Settings2, ShoppingCart, Users, Wallet, Warehouse } from "lucide-react";

type Props = { params: Promise<{ organizationId: string }> };

export default async function BusinessDashboard({ params }: Props) {
  const { organizationId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: membership }, { data: organization }, invoiceCount, productCount, posCount] = await Promise.all([
    supabase.from("fiskalo_organization_users").select("role").eq("organization_id", organizationId).eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("fiskalo_organizations").select("legal_name,trade_name,municipality").eq("id", organizationId).maybeSingle(),
    supabase.from("fiskalo_invoices").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    supabase.from("fiskalo_products").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("is_active", true),
    supabase.from("fiskalo_atk_pos_installations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
  ]);
  if (!membership || !organization) redirect("/app");
  const role = membership.role;
  const roleLabel: Record<string,string> = { owner:"Pronari", administrator:"Administrator", manager:"Menaxher", accountant:"Kontabilist", cashier:"Arkëtar" };
  const modules = [
    ...(["owner","administrator","manager","cashier"].includes(role) ? [{ href:`/app/${organizationId}/pos`, title:"Arka / POS", description:"Regjistro shitjet, prano pagesat dhe lësho faturat.", icon:ShoppingCart, tint:"green", action:"Hap arkën" }] : []),
    { href:`/app/${organizationId}/invoices`, title:"Faturat", description:"Gjej faturat, kontrollo pagesat dhe statusin fiskal.", icon:FileText, tint:"blue", action:"Shiko faturat" },
    { href:`/app/${organizationId}/reports`, title:"Raportet", description:"Shitjet, TVSH-ja, pagesat, ndërrimet dhe statusi i ATK-së.", icon:FileBarChart2, tint:"violet", action:"Shiko raportet" },
    ...(["owner","administrator","manager"].includes(role) ? [{ href:`/app/${organizationId}/pos/products`, title:"Produktet", description:"Menaxho artikujt, çmimet, TVSH-në dhe stokun.", icon:Boxes, tint:"violet", action:"Menaxho produktet" }] : []),
    ...(["owner","administrator","manager"].includes(role) ? [{ href:`/app/${organizationId}/inventory`, title:"Inventari", description:"Kontrollo stokun, artikujt pa stok dhe historikun e lëvizjeve.", icon:Warehouse, tint:"amber", action:"Hap inventarin" }] : []),
    ...(["owner","administrator","manager","cashier"].includes(role) ? [{ href:`/app/${organizationId}/pos/shifts`, title:"Ndërrimet e arkës", description:"Hap arkën, regjistro lëvizjet dhe bëj mbylljen.", icon:Wallet, tint:"amber", action:"Hap ndërrimet" }] : []),
    ...(["owner","administrator"].includes(role) ? [
      { href:`/app/${organizationId}/team`, title:"Ekipi", description:"Shto punëtorë dhe cakto qasjet sipas rolit.", icon:Users, tint:"blue", action:"Menaxho ekipin" },
      { href:`/app/${organizationId}/pos/setup`, title:"Konfigurimi ATK", description:"Menaxho regjistrimin e POS-it dhe verifikimin për biznesin.", icon:Settings2, tint:"green", action:"Hap konfigurimin" },
    ] : []),
  ];
  return <main className="business-dashboard">
    <section className="business-dashboard-hero"><div><span className="business-dashboard-kicker">PANELI I BIZNESIT</span><h1>{organization.trade_name || organization.legal_name}</h1><p>{organization.municipality} · {roleLabel[role] ?? role}</p></div><span className="business-role-chip">{roleLabel[role] ?? role}</span></section>
    <section className="business-dashboard-stats">
      <article><span>Fatura të regjistruara</span><strong>{invoiceCount.count ?? 0}</strong><small>Gjithsej në këtë biznes</small></article>
      <article><span>Produkte aktive</span><strong>{productCount.count ?? 0}</strong><small>Artikuj në katalog</small></article>
      <article><span>Instalime POS</span><strong>{posCount.count ?? 0}</strong><small>Pajisje të regjistruara</small></article>
    </section>
    <div className="business-dashboard-section-title"><div><h2>Veprimet e përditshme</h2><p>Zgjidh modulin që dëshiron të përdorësh.</p></div></div>
    <section className="business-module-grid">{modules.map((module) => { const Icon=module.icon; return <Link key={module.href} href={module.href} className="business-module-card"><span className={"business-module-icon "+module.tint}><Icon size={21}/></span><strong>{module.title}</strong><p>{module.description}</p><span className="business-module-action">{module.action}<ArrowUpRight size={15}/></span></Link>; })}</section>
    <footer className="business-dashboard-footer"><Link href="/app">Ndërro biznesin</Link><span>Fiskalo · Paneli i biznesit</span></footer>
  </main>;
}
