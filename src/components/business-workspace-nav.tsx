"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeftRight, Boxes, Building2, FileBarChart2, FileText, LayoutDashboard, Settings2, ShoppingCart, Users, Wallet, UserCircle, LogOut, Warehouse, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const items = [
  { path: "", label: "Përmbledhja", icon: LayoutDashboard, roles: ["owner","administrator","manager","accountant","cashier"] },
  { path: "/pos", label: "Arka / POS", icon: ShoppingCart, roles: ["owner","administrator","manager","cashier"] },
  { path: "/invoices", label: "Faturat", icon: FileText, roles: ["owner","administrator","manager","accountant","cashier"] },
  { path: "/reports", label: "Raportet", icon: FileBarChart2, roles: ["owner","administrator","manager","accountant"] },
  { path: "/pos/products", label: "Produktet", icon: Boxes, roles: ["owner","administrator","manager"] },
  { path: "/inventory", label: "Inventari", icon: Warehouse, roles: ["owner","administrator","manager"] },
  { path: "/purchases", label: "Blerjet", icon: Truck, roles: ["owner","administrator","manager","accountant"] },
  { path: "/pos/shifts", label: "Ndërrimet", icon: Wallet, roles: ["owner","administrator","manager","cashier"] },
  { path: "/team", label: "Ekipi", icon: Users, roles: ["owner","administrator"] },
  { path: "/pos/setup", label: "ATK", icon: Settings2, roles: ["owner","administrator"] },
];

export default function BusinessWorkspaceNav({ organizationId, businessName, role, isProvider }: {
  organizationId: string; businessName: string; role: string; isProvider: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  const visible = items.filter((item) => item.roles.includes(role));
  return <header className="business-shell-header">
    <div className="business-shell-inner">
      <Link href={"/app/" + organizationId} className="business-shell-brand"><span>F</span><strong>fiskalo</strong></Link>
      <div className="business-shell-divider"/>
      <div className="business-shell-name" title={businessName}>{businessName}</div>
      <nav className="business-shell-nav" aria-label="Navigimi i biznesit">
        {visible.map((item) => {
          const href = "/app/" + organizationId + item.path;
          const active = item.path === "" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          const Icon = item.icon;
          return <Link key={item.path} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon size={16}/><span>{item.label}</span></Link>;
        })}
      </nav>
      <div className="business-shell-actions">{isProvider && <Link href="/provider" className="business-provider-link"><Building2 size={15}/><span>Ofruesi</span></Link>}<Link href="/account" className="business-switch-link" title="Profili im"><UserCircle size={16}/><span>Profili</span></Link><Link href="/app?switch=1" className="business-switch-link" title="Ndërro biznesin"><ArrowLeftRight size={16}/><span>Bizneset</span></Link><button type="button" className="business-switch-link" title="Dil nga llogaria" onClick={() => void signOut()}><LogOut size={16}/><span>Dil</span></button></div>
    </div>
  </header>;
}
