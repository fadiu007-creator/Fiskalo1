import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Boxes, FileBarChart2, FileText, Settings2, ShoppingCart } from "lucide-react";

type Props = { children: ReactNode; params: Promise<{ organizationId: string }> };
export default async function FiskaloBasicLayout({ children, params }: Props) {
  const { organizationId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: membership } = await supabase.from("fiskalo_organization_users").select("role").eq("organization_id", organizationId).eq("user_id", auth.user.id).maybeSingle();
  if (!membership) redirect("/app");
  const role = String(membership.role);
  const links = [
    { href: `/app/${organizationId}/basic`, label: "Përmbledhja", icon: FileBarChart2, roles: ["owner","administrator","manager","accountant","cashier"] },
    { href: `/app/${organizationId}/basic/pos`, label: "Arka / POS", icon: ShoppingCart, roles: ["owner","administrator","manager","cashier"] },
    { href: `/app/${organizationId}/basic/products`, label: "Produktet", icon: Boxes, roles: ["owner","administrator","manager"] },
    { href: `/app/${organizationId}/basic/invoices`, label: "Faturat", icon: FileText, roles: ["owner","administrator","manager","accountant","cashier"] },
    { href: `/app/${organizationId}/basic/pos/setup`, label: "ATK / POS", icon: Settings2, roles: ["owner","administrator"] },
    { href: `/app/${organizationId}/basic/reports`, label: "Raportet", icon: FileBarChart2, roles: ["owner","administrator","manager","accountant"] },
  ].filter((item) => item.roles.includes(role));
  return <><nav aria-label="Navigimi Fiskalo Basic" style={{ maxWidth: 1180, margin: "0 auto", padding: "12px clamp(14px,3vw,28px) 0", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
    <strong style={{ color: "var(--brand)", marginRight: 8 }}>BASIC</strong>
    {links.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 9, background: "white", color: "var(--ink)", textDecoration: "none", fontSize: 12, fontWeight: 700 }}><Icon size={14}/>{item.label}</Link>; })}
    <Link href={`/app/${organizationId}`} style={{ marginLeft: "auto", padding: "9px 11px", color: "var(--brand)", fontWeight: 750, fontSize: 12 }}>Kalo te Fiskalo Full →</Link>
  </nav>{children}</>;
}
