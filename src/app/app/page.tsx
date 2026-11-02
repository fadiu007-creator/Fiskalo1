import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function BusinessHome() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: memberships, error } = await supabase
    .from("fiskalo_organization_users")
    .select("organization_id, role, fiskalo_organizations(legal_name, municipality)")
    .eq("user_id", userId);

  if (error) throw new Error("Nuk u ngarkuan bizneset. Provo përsëri.");
  if (!memberships?.length) redirect("/onboarding");

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "40px 24px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 42 }}>
        <Link href="/" style={{ fontSize: 23, fontWeight: 800 }}>fiskalo</Link>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>{claimsData?.claims?.email as string}</span>
      </header>
      <h1 style={{ fontSize: 34, marginBottom: 8 }}>Bizneset e mia</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>Zgjidh biznesin për të hapur panelin e menaxhimit.</p>
      <section style={{ display: "grid", gap: 12, marginTop: 28 }}>
        {memberships.map((membership) => {
          const org = membership.fiskalo_organizations as { legal_name?: string; municipality?: string } | null;
          return (
            <Link key={membership.organization_id} href={`/app/${membership.organization_id}`} style={{ display: "block", background: "white", border: "1px solid var(--line)", borderRadius: 14, padding: 20 }}>
              <strong>{org?.legal_name ?? "Biznes"}</strong>
              <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 0 }}>{org?.municipality ?? ""} · Roli: {membership.role}</p>
            </Link>
          );
        })}
      </section>
      <Link href="/onboarding" style={{ display: "inline-block", marginTop: 20, color: "var(--brand)", fontWeight: 700 }}>+ Shto biznes tjetër</Link>
    </main>
  );
}
