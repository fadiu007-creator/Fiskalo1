import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ClipboardList, Package, ReceiptText, Settings2, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ organizationId: string }> };

const tile = {
  display: "flex", flexDirection: "column" as const, gap: 10, minHeight: 150,
  padding: 20, background: "white", border: "1px solid var(--line)",
  borderRadius: 16, textDecoration: "none", boxShadow: "0 4px 18px rgba(20,45,32,.035)",
};

export default async function BusinessDashboard({ params }: Props) {
  const { organizationId } = await params;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: membership }, { data: organization }] = await Promise.all([
    supabase.from("fiskalo_organization_users").select("role")
      .eq("organization_id", organizationId).eq("user_id", userId).maybeSingle(),
    supabase.from("fiskalo_organizations").select("legal_name,trade_name,municipality")
      .eq("id", organizationId).maybeSingle(),
  ]);
  if (!membership || !organization) redirect("/app");

  const role = String(membership.role);
  const canManage = ["owner", "administrator", "manager"].includes(role);
  const canConfigure = ["owner", "administrator"].includes(role);
  const roleLabel: Record<string, string> = {
    owner: "Pronar", administrator: "Administrator", manager: "Menaxher",
    accountant: "Kontabilist", cashier: "Arkëtar",
  };
  const name = organization.trade_name || organization.legal_name;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px clamp(14px,3vw,30px) 56px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 28 }}>
        <Link href="/app" style={{ color: "var(--brand)", fontWeight: 850, fontSize: 22 }}>fiskalo</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 13 }}>
          <span>{String(claimsData?.claims?.email ?? "")}</span>
          <span style={{ background: "#eaf5ef", color: "#17633f", borderRadius: 999, padding: "6px 10px", fontWeight: 750 }}>{roleLabel[role] || role}</span>
        </div>
      </header>

      <section style={{ background: "linear-gradient(120deg,#0d5e41,#16845b)", color: "white", borderRadius: 20, padding: "clamp(22px,4vw,34px)", marginBottom: 24 }}>
        <div style={{ fontSize: 12, opacity: .8, fontWeight: 750, letterSpacing: ".08em", textTransform: "uppercase" }}>Paneli i biznesit</div>
        <h1 style={{ fontSize: "clamp(25px,4vw,34px)", letterSpacing: "-.035em", margin: "9px 0 5px" }}>{name}</h1>
        <p style={{ margin: 0, opacity: .85, fontSize: 14 }}>{organization.municipality || "Kosovë"} · Zgjedh shërbimin që dëshiron të përdorësh.</p>
        <Link href={`/app/${organizationId}/pos`} style={{ display: "inline-flex", alignItems: "center", gap: 9, background: "white", color: "#0d6848", borderRadius: 11, padding: "13px 18px", marginTop: 22, fontWeight: 850 }}>
          <Wallet size={18} /> Hape arkën / POS <ArrowUpRight size={17} />
        </Link>
      </section>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap", marginBottom: 13 }}>
        <div><h2 style={{ fontSize: 20, margin: 0 }}>Shërbimet</h2><p style={{ color: "var(--muted)", margin: "5px 0 0", fontSize: 13 }}>Qasje e drejtpërdrejtë sipas rolit tënd në biznes.</p></div>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 13 }}>
        <Link href={`/app/${organizationId}/pos`} style={{ ...tile, borderColor: "rgba(20,122,85,.35)" }}>
          <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, background: "#eaf5ef", color: "var(--brand)" }}><Wallet size={21}/></span>
          <strong style={{ fontSize: 17 }}>Arka / POS</strong><span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>Regjistro shitje, skano barkode, prano pagesa dhe lësho fatura.</span>
          <span style={{ color: "var(--brand)", fontWeight: 750, fontSize: 13, marginTop: "auto" }}>Hap arkën →</span>
        </Link>
        <Link href={`/app/${organizationId}/pos/shifts`} style={tile}>
          <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, background: "#f0f4fa", color: "#42658b" }}><ClipboardList size={21}/></span>
          <strong style={{ fontSize: 17 }}>Ndërrimet e arkëtarëve</strong><span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>Hap ose mbyll ndërrimin dhe kontrollo gjendjen e arkës.</span>
          <span style={{ color: "var(--brand)", fontWeight: 750, fontSize: 13, marginTop: "auto" }}>Hap ndërrimet →</span>
        </Link>
        {canManage && <Link href={`/app/${organizationId}/pos/products`} style={tile}>
          <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, background: "#fff4e7", color: "#9b641f" }}><Package size={21}/></span>
          <strong style={{ fontSize: 17 }}>Produktet dhe çmimet</strong><span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>Menaxho katalogun, çmimet, kategoritë, barkodet dhe stokun.</span>
          <span style={{ color: "var(--brand)", fontWeight: 750, fontSize: 13, marginTop: "auto" }}>Menaxho produktet →</span>
        </Link>}
        {canConfigure && <Link href={`/app/${organizationId}/pos/setup`} style={tile}>
          <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, background: "#f3effb", color: "#7653a5" }}><Settings2 size={21}/></span>
          <strong style={{ fontSize: 17 }}>Konfigurimi ATK TEST</strong><span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>Konfiguro POS-in dhe certifikatën e testimit. Vetëm për pronarë dhe administratorë.</span>
          <span style={{ color: "var(--brand)", fontWeight: 750, fontSize: 13, marginTop: "auto" }}>Hap konfigurimin →</span>
        </Link>}
      </section>

      <section style={{ marginTop: 20, padding: 16, border: "1px solid var(--line)", borderRadius: 14, background: "#fbfcfb", color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
        <strong style={{ color: "var(--ink)" }}>Qasje e stafit:</strong> Punonjësit hyjnë me llogarinë e tyre dhe hapin direkt POS-in nga kjo faqe. Konfigurimi fiskal dhe menaxhimi i produkteve shfaqen vetëm sipas rolit të caktuar.
      </section>
    </main>
  );
}
