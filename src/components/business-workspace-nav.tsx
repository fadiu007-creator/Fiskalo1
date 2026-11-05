"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeftRight, Boxes, Building2, FileBarChart2, FileText, LayoutDashboard, LogOut, ReceiptText, Settings2, ShoppingCart, Users, Wallet, UserCircle, Warehouse, Truck, Contact, ChartNoAxesCombined } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ReactNode } from "react";

type NavItem = { path: string; label: string; icon: typeof LayoutDashboard; roles: string[] };
type NavGroup = { label: string; items: NavItem[] };
const allRoles = ["owner", "administrator", "manager", "accountant", "cashier"];
const managers = ["owner", "administrator", "manager"];
const finance = ["owner", "administrator", "manager", "accountant"];
const groups: NavGroup[] = [
  { label: "PËRDITSHMËRIA", items: [
    { path: "", label: "Përmbledhja", icon: LayoutDashboard, roles: allRoles },
    { path: "/pos", label: "Arka / POS", icon: ShoppingCart, roles: ["owner", "administrator", "manager", "cashier"] },
  ]},
  { label: "SHITJET DHE BLERJET", items: [
    { path: "/invoices", label: "Faturat", icon: FileText, roles: allRoles },
    { path: "/customers", label: "Klientët", icon: Contact, roles: finance },
    { path: "/purchases", label: "Blerjet dhe furnitorët", icon: Truck, roles: finance },
    { path: "/expenses", label: "Shpenzimet", icon: ReceiptText, roles: finance },
  ]},
  { label: "PRODUKTET DHE STOKU", items: [
    { path: "/pos/products", label: "Produktet", icon: Boxes, roles: managers },
    { path: "/inventory", label: "Inventari", icon: Warehouse, roles: managers },
  ]},
  { label: "FINANCAT DHE EKIPI", items: [
    { path: "/reports", label: "Raportet", icon: FileBarChart2, roles: finance },
    { path: "/pos/shifts", label: "Ndërrimet e arkës", icon: Wallet, roles: ["owner", "administrator", "manager", "cashier"] },
    { path: "/team", label: "Ekipi", icon: Users, roles: ["owner", "administrator"] },
    { path: "/pos/setup", label: "Konfigurimi ATK", icon: Settings2, roles: ["owner", "administrator"] },
  ]},
];
const routeLabels = groups.flatMap(g => g.items).reduce<Record<string,string>>((a, item) => { a[item.path] = item.label; return a; }, {});

export default function BusinessWorkspaceNav({ organizationId, businessName, role, isProvider, children }: {
  organizationId: string; businessName: string; role: string; isProvider: boolean; children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = "/app/" + organizationId;
  const visibleGroups = groups.map(group => ({ ...group, items: group.items.filter(item => item.roles.includes(role)) })).filter(group => group.items.length);
  const current = Object.entries(routeLabels).filter(([path]) => path === "" ? pathname === base : pathname === base + path || pathname.startsWith(base + path + "/")).sort((a,b) => b[0].length-a[0].length)[0]?.[1] ?? "Paneli";
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  const renderLink = (item: NavItem) => {
    const href = base + item.path;
    const active = item.path === "" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    const Icon = item.icon;
    return <Link key={item.path} href={href} className={"business-nav-link" + (active ? " active" : "")} aria-current={active ? "page" : undefined}><Icon size={17}/><span>{item.label}</span></Link>;
  };
  return <div className="business-app-shell">
    <aside className="business-sidebar">
      <Link href={base} className="business-sidebar-brand"><span className="business-brand-mark">F</span><strong>fiskalo</strong><small>BUSINESS</small></Link>
      <div className="business-sidebar-company"><span>BIZNESI AKTIV</span><strong title={businessName}>{businessName}</strong><Link href="/app?switch=1"><ArrowLeftRight size={13}/> Ndërro biznesin</Link></div>
      <nav className="business-sidebar-nav" aria-label="Navigimi kryesor">
        {visibleGroups.map(group => <section className="business-nav-group" key={group.label}><h2>{group.label}</h2>{group.items.map(renderLink)}</section>)}
      </nav>
      <div className="business-sidebar-bottom">
        {isProvider && <Link href="/provider" className="business-sidebar-provider"><Building2 size={16}/> Paneli i ofruesit</Link>}
        <Link href="/account" className="business-sidebar-account"><UserCircle size={17}/><span>Profili dhe llogaria</span></Link>
        <button type="button" onClick={() => void signOut()} className="business-sidebar-account"><LogOut size={17}/><span>Dil nga llogaria</span></button>
        <div className="business-sidebar-footnote">Fiskalo · Menaxhimi i biznesit</div>
      </div>
    </aside>
    <div className="business-app-main">
      <header className="business-topbar">
        <div><span className="business-topbar-eyebrow">HAPËSIRA E PUNËS / {current.toUpperCase()}</span><strong>{businessName}</strong></div>
        <div className="business-topbar-actions">{isProvider && <Link href="/provider"><Building2 size={15}/> Ofruesi</Link>}<Link href="/account"><UserCircle size={17}/><span>Llogaria</span></Link><button type="button" onClick={() => void signOut()}><LogOut size={16}/><span>Dil</span></button></div>
      </header>
      <nav className="business-mobile-nav" aria-label="Navigimi i biznesit">{visibleGroups.flatMap(group => group.items).map(renderLink)}</nav>
      <div className="business-app-content">{children}</div>
    </div>
  </div>;
}
