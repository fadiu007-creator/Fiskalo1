import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ organizationId: string }> };

export default async function BusinessDashboard({ params }: Props) {
  const { organizationId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: membership }, { data: organization }] = await Promise.all([
    supabase.from("fiskalo_organization_users").select("role")
      .eq("organization_id", organizationId).eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("fiskalo_organizations").select("legal_name,trade_name,municipality")
      .eq("id", organizationId).maybeSingle(),
  ]);

  if (!membership || !organization) redirect("/app");
  const role = membership.role;
  const isAdmin = ["owner", "administrator"].includes(role);
  const isCashier = role === "cashier";
  const roleLabel: Record<string, string> = { owner: "Pronari", administrator: "Administrator", manager: "Menaxher", accountant: "Kontabilist", cashier: "Punëtor / Arkëtar" };
  const modules = [
    { href: `/app/${organizationId}/pos`, title: "Arka / POS", description: "Regjistro shitjet, prano pagesat dhe hap faturat.", icon: "▦" },
    { href: `/app/${organizationId}/pos/shifts`, title: "Ndërrimi i arkës", description: "Hap ndërrimin, regjistro hyrje/dalje dhe mbylle arkën.", icon: "◷" },
    ...(!isCashier && role !== "accountant" ? [{ href: `/app/${organizationId}/pos/products`, title: "Produktet", description: "Shto artikuj, ndrysho çmimet, TVSH-në dhe stokun.", icon: "▤" }] : []),
    ...(isAdmin ? [{ href: `/app/${organizationId}/pos/setup`, title: "Konfigurimi ATK", description: "Regjistrimi i POS-it, certifikatat dhe konfigurimi fiskal.", icon: "⚙" }] : []),
    ...(isAdmin ? [{ href: `/app/${organizationId}/team`, title: "Punëtorët", description: "Shto punëtorë dhe cakto rolet e qasjen në biznes.", icon: "♙" }] : []),
  ];

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px clamp(16px,3vw,32px) 56px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 34 }}>
        <Link href="/" style={{ color: "var(--brand)", fontSize: 24, fontWeight: 850, letterSpacing: "-.04em" }}>fiskalo</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted)", fontSize: 13 }}>
          <span>{auth.user.email}</span>
          <span style={{ background: "#eaf5ef", color: "var(--brand-dark)", padding: "7px 11px", borderRadius: 999, fontWeight: 750 }}>{roleLabel[role] ?? role}</span>
        </div>
      </header>
      <div style={{ marginBottom: 26 }}>
        <p style={{ margin: "0 0 8px", color: "var(--brand)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Paneli i biznesit</p>
        <h1 style={{ margin: 0, fontSize: "clamp(27px,4vw,36px)", letterSpacing: "-.04em" }}>{organization.trade_name || organization.legal_name}</h1>
        <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>{organization.municipality} · {isCashier ? "Këto janë veglat që të duhen për punën e përditshme." : "Zgjidh pjesën e biznesit që dëshiron të hapësh."}</p>
      </div>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}>
        {modules.map((module, index) => (
          <Link key={module.href} href={module.href} style={{ minHeight: 168, display: "flex", flexDirection: "column", gap: 12, background: "white", border: "1px solid var(--line)", borderRadius: 16, padding: 20, boxShadow: "0 5px 22px rgba(24,44,34,.04)" }}>
            <span aria-hidden="true" style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, background: "#eaf5ef", color: "var(--brand)", fontSize: 23 }}>{module.icon}</span>
            <strong style={{ fontSize: 17 }}>{module.title}</strong>
            <span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>{module.description}</span>
          </Link>
        ))}
      </section>
      <section style={{ marginTop: 26, border: "1px solid var(--line)", borderRadius: 14, padding: 18, background: "#fbfcfb" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Qasja sipas rolit</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
          <div><strong>Pronari / Administratori</strong><br/>POS, shitjet, faturat, produktet, ndërrimet dhe konfigurimi ATK.</div>
          <div><strong>Menaxheri</strong><br/>POS, faturat, produktet dhe ndërrimet. Pa konfigurimin ATK.</div>
          <div><strong>Kontabilisti</strong><br/>POS dhe faturat për punë financiare. Pa konfigurimin ATK.</div>
          <div><strong>Punëtori / Arkëtari</strong><br/>POS, shitjet dhe ndërrimi i arkës. Pa menaxhim biznesi ose ATK.</div>
        </div>
      </section>
      <footer style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, color: "var(--muted)", fontSize: 12 }}>
        <Link href="/app" style={{ color: "var(--brand)", fontWeight: 700 }}>Ndërro biznesin</Link>
        <span>Fiskalo · Menaxhimi i biznesit</span>
      </footer>
      <style>{`@media(max-width:600px){main{padding-top:18px!important} }`}</style>
    </main>
  );
}
