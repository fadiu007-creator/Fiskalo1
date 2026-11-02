import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function BusinessHome() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_users")
    .select("organization_id, role, organizations(legal_name, municipality)")
    .eq("user_id", userId);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 42 }}>
        <Link href="/" style={{ fontSize: 23, fontWeight: 800 }}>fiskalo</Link>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{claimsData?.claims?.email as string}</span>
      </header>
      <h1 style={{ fontSize: 34, marginBottom: 8 }}>Hapësira e biznesit</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Zgjidh biznesin për të vazhduar ose përgatitu për regjistrimin e tij.</p>
      {!memberships?.length ? (
        <section style={{ marginTop: 28, background: "white", border: "1px solid var(--line)", borderRadius: 16, padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Nuk ke regjistruar ende biznes</h2>
          <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>Hapi i radhës është të shtosh të dhënat ligjore të biznesit dhe komunën ku operon.</p>
          <Link href="/onboarding" style={{ display: "inline-block", marginTop: 8, background: "var(--brand)", color: "white", borderRadius: 9, padding: "12px 16px", fontWeight: 700 }}>Regjistro biznesin</Link>
        </section>
      ) : (
        <section style={{ display: "grid", gap: 12, marginTop: 28 }}>
          {memberships.map((membership) => (
            <article key={membership.organization_id} style={{ background: "white", border: "1px solid var(--line)", borderRadius: 14, padding: 20 }}>
              <strong>{(membership.organizations as { legal_name?: string } | null)?.legal_name ?? "Biznes"}</strong>
              <p style={{ color: "var(--muted)", fontSize: 13 }}>Roli: {membership.role}</p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
