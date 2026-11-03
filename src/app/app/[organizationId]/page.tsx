"import Link from \"next/link\";
import { redirect } from \"next/navigation\";
import { createClient } from \"@/lib/supabase/server\";
import { ArrowRight, FileText, Package, ReceiptText, Settings2, Users } from \"lucide-react\";

type OrganizationSummary = { legal_name?: string | null; municipality?: string | null };

const cardStyle: React.CSSProperties = {
  display: \"flex\", alignItems: \"center\", gap: 16, padding: 20,
  border: \"1px solid var(--line)\", borderRadius: 16, background: \"white\",
  boxShadow: \"0 4px 18px rgba(20,40,30,.035)\",
};

export default async function BusinessDashboard({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect(\"/login\");

  const { data: membership, error } = await supabase
    .from(\"fiskalo_organization_users\")
    .select(\"role, fiskalo_organizations(legal_name, municipality)\")
    .eq(\"organization_id\", organizationId)
    .eq(\"user_id\", userId)
    .maybeSingle();

  if (error || !membership) redirect(\"/app\");
  const organization = membership.fiskalo_organizations as OrganizationSummary | null;
  const role = String(membership.role);
  const isManagement = [\"owner\", \"administrator\"].includes(role);
  const roleLabels: Record<string, string> = {
    owner: \"Pronar\", administrator: \"Administrator\", accountant: \"Kontabilist\",
    cashier: \"Arkëtar\", manager: \"Menaxher\",
  };

  const links = [
    { href: `/app/${organizationId}/pos`, title: \"Arka / POS\", detail: \"Regjistro shitje, skano produkte dhe lësho fatura\", icon: ReceiptText, primary: true },
    { href: `/app/${organizationId}/pos/shifts`, title: \"Ndërrimi i arkës\", detail: \"Hap dhe mbyll ndërrimin, kontrollo paratë në arkë\", icon: FileText },
    { href: `/app/${organizationId}/pos/products`, title: \"Produktet\", detail: \"Kërko dhe menaxho katalogun e produkteve\", icon: Package },
    { href: `/app/${organizationId}/invoices`, title: \"Faturat\", detail: \"Shiko faturat dhe statusin e pagesave\", icon: FileText },
    ...(isManagement ? [{ href: `/app/${organizationId}/pos/setup`, title: \"Konfigurimi ATK\", detail: \"Konfigurimi dhe verifikimi i POS TEST\", icon: Settings2 }] : []),
  ];

  return (
    <main style={{ maxWidth: 1120, margin: \"0 auto\", padding: \"28px clamp(14px,3vw,30px) 56px\" }}>
      <header style={{ display: \"flex\", justifyContent: \"space-between\", alignItems: \"center\", gap: 16, flexWrap: \"wrap\", marginBottom: 30 }}>
        <Link href=\"/\" style={{ fontSize: 24, fontWeight: 850, color: \"var(--brand)\", letterSpacing: \"-.04em\" }}>fiskalo</Link>
        <div style={{ textAlign: \"right\", fontSize: 12, color: \"var(--muted)\" }}>
          <div>{claimsData?.claims?.email as string}</div>
          <strong style={{ color: \"var(--ink)\" }}>{roleLabels[role] ?? role}</strong>
        </div>
      </header>

      <section style={{ marginBottom: 24 }}>
        <p style={{ color: \"var(--brand)\", fontSize: 12, fontWeight: 800, textTransform: \"uppercase\", letterSpacing: \".08em\", margin: \"0 0 8px\" }}>Paneli i biznesit</p>
        <h1 style={{ fontSize: 32, letterSpacing: \"-.04em\", margin: 0 }}>{organization?.legal_name ?? \"Biznesi yt\"}</h1>
        <p style={{ color: \"var(--muted)\", margin: \"8px 0 0\" }}>{organization?.municipality ?? \"\"} · Zgjidh shërbimin që dëshiron të përdorësh.</p>
      </section>

      <Link href={`/app/${organizationId}/pos`} style={{ ...cardStyle, background: \"var(--brand)\", color: \"white\", borderColor: \"var(--brand)\", marginBottom: 18, padding: \"24px 22px\" }}>
        <span style={{ width: 54, height: 54, borderRadius: 15, background: \"rgba(255,255,255,.16)\", display: \"grid\", placeItems: \"center\" }}><ReceiptText size={28} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: \"block\", fontSize: 22 }}>Hap arkën (POS)</strong>
          <span style={{ display: \"block\", opacity: .9, fontSize: 13, marginTop: 5 }}>Shitje e re · Produkte · Pagesa · Faturat</span>
        </span>
        <ArrowRight size={22} />
      </Link>

      <h2 style={{ fontSize: 17, margin: \"26px 0 12px\" }}>Shërbimet e biznesit</h2>
      <section className=\"business-module-grid\" style={{ display: \"grid\", gridTemplateColumns: \"repeat(auto-fit,minmax(230px,1fr))\", gap: 12 }}>
        {links.slice(1).map(({ href, title, detail, icon: Icon }) => (
          <Link key={href} href={href} style={cardStyle}>
            <span style={{ width: 42, height: 42, flex: \"0 0 auto\", borderRadius: 12, background: \"#edf6f1\", color: \"var(--brand)\", display: \"grid\", placeItems: \"center\" }}><Icon size={20} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: \"block\", fontSize: 14 }}>{title}</strong>
              <span style={{ display: \"block\", color: \"var(--muted)\", fontSize: 12, lineHeight: 1.45, marginTop: 5 }}>{detail}</span>
            </span>
            <ArrowRight size={16} color=\"var(--muted)\" />
          </Link>
        ))}
      </section>
      <p style={{ color: \"var(--muted)\", fontSize: 12, marginTop: 22 }}>
        Qasja jote përcaktohet nga roli në biznes. Për konfigurimet fiskale dhe të llogarisë kërkohet qasje administratori.
      </p>
      {isManagement && <Link href=\"/app\" style={{ color: \"var(--brand)\", fontSize: 13, fontWeight: 700 }}>Kalo te bizneset e mia</Link>}
    </main>
  );
}
