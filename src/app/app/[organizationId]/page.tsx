import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowUpRight, ClipboardList, FileText, Package, Settings2, ShoppingCart, Wallet } from "lucide-react";

const modules = [
  { title: "Arka / POS", description: "Regjistro shitje, skano barkode dhe prano pagesa.", href: "/pos", icon: ShoppingCart, primary: true },
  { title: "Faturat", description: "Shiko faturat, pagesat dhe statusin e tyre.", href: "/invoices", icon: FileText },
  { title: "Produktet", description: "Menaxho katalogun, çmimet dhe stokun.", href: "/pos/products", icon: Package },
  { title: "Ndërrimet e arkës", description: "Hap dhe mbyll ndërrimin, barazo paratë.", href: "/pos/shifts", icon: Wallet },
];

export default async function BusinessDashboard({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: membership, error: membershipError }, { data: organization }] = await Promise.all([
    supabase.from("fiskalo_organization_users").select("role").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    supabase.from("fiskalo_organizations").select("legal_name,trade_name,municipality,nui").eq("id", organizationId).maybeSingle(),
  ]);

  if (membershipError || !membership || !organization) redirect("/app");
  // Cashiers should land directly in the till after signing in or selecting their workplace.
  if (membership.role === "cashier") redirect(`/app/${organizationId}/pos`);

  const isAdmin = membership.role === "owner" || membership.role === "administrator";
  const roleLabel: Record<string, string> = {
    owner: "Pronar", administrator: "Administrator", manager: "Menaxher", accountant: "Kontabilist", cashier: "Arkëtar",
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px clamp(16px,3vw,32px) 56px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 34 }}>
        <Link href="/" style={{ fontSize: 23, fontWeight: 850, letterSpacing: "-.04em", color: "var(--brand)" }}>fiskalo</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--muted)", fontSize: 13 }}>
          <span>{claimsData?.claims?.email as string}</span>
          <span style={{ background: "#eaf4ee", color: "var(--brand-dark)", borderRadius: 999, padding: "7px 11px", fontWeight: 750 }}>{roleLabel[membership.role] ?? membership.role}</span>
        </div>
      </header>

      <section style={{ background: "linear-gradient(125deg,#0d6043,#16865d)", borderRadius: 22, padding: "clamp(22px,4vw,36px)", color: "white", marginBottom: 22 }}>
        <div style={{ fontSize: 12, opacity: .82, fontWeight: 750, letterSpacing: ".08em", textTransform: "uppercase" }}>Paneli i biznesit</div>
        <h1 style={{ fontSize: "clamp(26px,4vw,36px)", letterSpacing: "-.04em", margin: "10px 0 6px" }}>{organization.trade_name || organization.legal_name}</h1>
        <p style={{ margin: 0, opacity: .84, fontSize: 14 }}>{organization.municipality} · NUI {organization.nui}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
          <Link href={`/app/${organizationId}/pos`} style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "white", color: "#0d6043", borderRadius: 11, padding: "12px 17px", fontWeight: 800 }}>
            <ShoppingCart size={18}/> Hap arkën <ArrowUpRight size={16}/>
          </Link>
          <Link href="/app" style={{ display: "inline-flex", alignItems: "center", border: "1px solid rgba(255,255,255,.4)", color: "white", borderRadius: 11, padding: "12px 15px", fontWeight: 700 }}>
            Ndërro biznesin
          </Link>
        </div>
      </section>

      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12, margin: "28px 0 14px" }}>
        <div><h2 style={{ fontSize: 20, margin: 0 }}>Puna e përditshme</h2><p style={{ color: "var(--muted)", fontSize: 13, margin: "5px 0 0" }}>Zgjidh një modul për të vazhduar.</p></div>
      </div>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 13 }}>
        {modules.map((item) => {
          const Icon = item.icon;
          return <Link key={item.title} href={`/app/${organizationId}${item.href}`} style={{ background: "white", border: "1px solid var(--line)", borderRadius: 16, padding: 19, minHeight: 148, display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 5px 22px rgba(24,44,34,.035" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, background: item.primary ? "#e8f5ee" : "#f2f6f3", color: "var(--brand)" }}><Icon size={21}/></span>
              <ArrowUpRight size={17} color="var(--muted)"/>
            </div>
            <div><strong style={{ fontSize: 16 }}>{item.title}</strong><p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.5, margin: "5px 0 0" }}>{item.description}</p></div>
          </Link>;
        })}
        {isAdmin && <Link href={`/app/${organizationId}/pos/setup`} style={{ background: "white", border: "1px solid var(--line)", borderRadius: 16, padding: 19, minHeight: 148, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, background: "#f2f6f3", color: "var(--brand)" }}><Settings2 size={21}/></span>
          <div><strong style={{ fontSize: 16 }}>Konfigurimi ATK TEST</strong><p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.5, margin: "5px 0 0" }}>Konfiguro POS-in dhe certifikatën testuese. Vetëm për pronarë dhe administratorë.</p></div>
        </Link>}
      </section>
      <footer style={{ marginTop: 26, borderTop: "1px solid var(--line)", paddingTop: 15, color: "var(--muted)", fontSize: 12 }}>
        Fiskalo · Qasja dhe veprimet përcaktohen nga roli yt në këtë biznes.
      </footer>
    </main>
  );
}
