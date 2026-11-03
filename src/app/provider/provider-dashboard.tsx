"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Activity, ArrowUpRight, Building2, CheckCircle2, CircleAlert, Cpu,
  LayoutDashboard, Search, Settings2, ShieldCheck, Store,
} from "lucide-react";

export type ProviderBusiness = {
  id: string; trade_name: string | null; legal_name: string;
  municipality: string; fiscalization_status: string; created_at: string;
};
export type ProviderPos = {
  id: string; organization_id: string; label: string; status: string;
  environment: string; last_seen_at: string | null;
};
export type ProviderSettings = {
  provider_nui: string | null; sef_code: string | null; application_id: number | null;
  solution_name: string; solution_version: string; certification_status: string;
  production_enabled: boolean;
};

const moneyless = (value: number) => new Intl.NumberFormat("sq-XK").format(value);
const statusLabel: Record<string, string> = {
  not_configured: "Pa konfigurim", pending: "Në pritje", test: "TEST",
  certified: "E certifikuar", suspended: "Pezulluar",
  unregistered: "Pa regjistrim", verification_pending: "Verifikim në pritje",
  certificate_pending: "Certifikatë në pritje", active: "Aktiv",
  revoked: "Revokuar",
};
const statusTone = (value: string) => {
  if (["active", "certified", "accepted"].includes(value)) return "good";
  if (["pending", "test", "verification_pending", "certificate_pending"].includes(value)) return "warn";
  if (["suspended", "revoked", "rejected"].includes(value)) return "bad";
  return "neutral";
};
const inputStyle: React.CSSProperties = {
  width: "100%", minWidth: 0, border: "1px solid #dfe7e2", borderRadius: 10,
  padding: "11px 12px", background: "#fff", color: "#18251f",
};

export default function ProviderDashboard({
  role, userEmail, businesses, posDevices, settings, loadError,
}: {
  role: string; userEmail: string; businesses: ProviderBusiness[];
  posDevices: ProviderPos[]; settings: ProviderSettings | null; loadError: string;
}) {
  const [search, setSearch] = useState("");
  const [config, setConfig] = useState<ProviderSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const filteredBusinesses = businesses.filter((business) =>
    [business.trade_name, business.legal_name, business.municipality]
      .filter(Boolean).join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );
  const activePos = posDevices.filter((pos) => pos.status === "active").length;
  const testPos = posDevices.filter((pos) => pos.environment === "test").length;
  const productionPos = posDevices.filter((pos) => pos.environment === "production").length;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) return;
    setSaving(true); setError(""); setMessage("");
    const { error: saveError } = await supabase.from("fiskalo_atk_provider_settings").update({
      provider_nui: config.provider_nui?.trim() || null,
      sef_code: config.sef_code?.trim() || null,
      application_id: config.application_id ? Number(config.application_id) : null,
      solution_name: config.solution_name.trim(),
      solution_version: config.solution_version.trim(),
      certification_status: config.certification_status,
      updated_at: new Date().toISOString(),
    }).eq("singleton", true);
    setSaving(false);
    if (saveError) setError("Konfigurimi nuk u ruajt: " + saveError.message);
    else setMessage("Konfigurimi i ofruesit u ruajt.");
  }

  return (
    <div className="provider-shell">
      <aside className="provider-sidebar">
        <Link href="/provider" className="provider-logo"><span>F</span><strong>fiskalo</strong><small>PROVIDER</small></Link>
        <div className="provider-nav-label">HAPËSIRA E OFRUESIT</div>
        <a className="provider-nav-item active" href="#overview"><LayoutDashboard size={17}/> Përmbledhja</a>
        <a className="provider-nav-item" href="#businesses"><Building2 size={17}/> Bizneset <span>{businesses.length}</span></a>
        <a className="provider-nav-item" href="#devices"><Cpu size={17}/> POS instalimet <span>{posDevices.length}</span></a>
        <button className="provider-nav-item" onClick={() => setShowSettings((v) => !v)}><Settings2 size={17}/> Konfigurimi ATK</button>
        <div className="provider-sidebar-bottom">
          <div className="provider-account"><span className="provider-avatar">{userEmail.slice(0,1).toUpperCase() || "F"}</span><div><strong>{role === "provider_admin" ? "Administrator" : role === "provider_support" ? "Mbështetje" : "Përputhshmëri"}</strong><small>{userEmail}</small></div></div>
          <button type="button" className="provider-signout" onClick={signOut}>Dil nga llogaria</button>

        </div>
      </aside>

      <main className="provider-main" id="overview">
        <header className="provider-topbar"><div><span className="provider-eyebrow">MENAXHIM I PLATFORMËS</span><h1>Qendra e ofruesit</h1></div><div className="provider-top-actions"><Link href="/app" className="provider-workspace-link">Hap bizneset <ArrowUpRight size={14}/></Link><span className="provider-live"><i/> Hapësira e ofruesit</span><span className="provider-user-chip">{userEmail}</span></div></header>
        <section className="provider-welcome"><div><span className="provider-eyebrow">PANELI I OFRUESIT</span><h2>Kontrollo Fiskalo nga një vend.</h2><p>Menaxho bizneset kliente, instalimet POS dhe konfigurimin e softuerit fiskal.</p></div><div className="provider-welcome-mark"><ShieldCheck size={42}/><span>Qasje e ndarë</span></div></section>

        {loadError && <div className="provider-alert bad"><CircleAlert size={17}/> Nuk u ngarkuan të gjitha të dhënat: {loadError}</div>}
        <section className="provider-stats">
          <article><span className="provider-stat-icon"><Store size={19}/></span><small>Biznese kliente</small><strong>{moneyless(businesses.length)}</strong><em>Organizata të regjistruara</em></article>
          <article><span className="provider-stat-icon"><Cpu size={19}/></span><small>Instalime POS</small><strong>{moneyless(posDevices.length)}</strong><em>{testPos} TEST · {productionPos} PRODUCTION</em></article>
          <article><span className="provider-stat-icon"><CheckCircle2 size={19}/></span><small>POS aktivë</small><strong>{moneyless(activePos)}</strong><em>Instalime me status aktiv</em></article>
          <article><span className="provider-stat-icon"><Activity size={19}/></span><small>Certifikimi</small><strong className="provider-stat-status">{statusLabel[config?.certification_status ?? "not_configured"]}</strong><em>{config?.production_enabled ? "Prodhimi i aktivizuar" : "Vetëm ambienti TEST"}</em></article>
        </section>

        <section className="provider-panel" id="businesses">
          <div className="provider-panel-heading"><div><span className="provider-eyebrow">KLIENTËT</span><h3>Bizneset në Fiskalo</h3><p>Çdo biznes ka organizatën, degët dhe POS-et e veta.</p></div><label className="provider-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kërko biznes ose qytet…"/></label></div>
          <div className="provider-table-wrap"><table className="provider-table"><thead><tr><th>Biznesi</th><th>Komuna</th><th>Fiskalizimi</th><th>POS</th></tr></thead><tbody>
            {filteredBusinesses.map((business) => {
              const devices = posDevices.filter((pos) => pos.organization_id === business.id);
              return <tr key={business.id}><td><strong>{business.trade_name || business.legal_name}</strong><small>{business.legal_name}</small></td><td>{business.municipality}</td><td><span className={"provider-status " + statusTone(business.fiscalization_status)}>{statusLabel[business.fiscalization_status] ?? business.fiscalization_status}</span></td><td>{devices.length} pajisje <small>{devices.filter((device) => device.status === "active").length} aktive</small></td></tr>;
            })}
            {!filteredBusinesses.length && <tr><td colSpan={4} className="provider-empty">Nuk u gjet asnjë biznes me këtë kërkim.</td></tr>}
          </tbody></table></div>
        </section>

        <section className="provider-panel" id="devices">
          <div className="provider-panel-heading"><div><span className="provider-eyebrow">PAJISJET</span><h3>Instalimet POS</h3><p>Shiko ambientin dhe statusin e secilit instalim pa përzier të dhënat e bizneseve.</p></div><span className="provider-count">{posDevices.length} gjithsej</span></div>
          <div className="provider-device-grid">{posDevices.slice(0,8).map((pos) => {
            const business = businesses.find((item) => item.id === pos.organization_id);
            return <article key={pos.id}><div className="provider-device-top"><span className="provider-device-icon"><Cpu size={18}/></span><span className={"provider-status " + statusTone(pos.status)}>{statusLabel[pos.status] ?? pos.status}</span></div><strong>{pos.label}</strong><small>{business?.trade_name || business?.legal_name || "Biznes"}</small><div className="provider-device-foot"><span>{pos.environment.toUpperCase()}</span><span>{pos.last_seen_at ? "Aktivitet: " + new Date(pos.last_seen_at).toLocaleString("sq-XK") : "Pa aktivitet të regjistruar"}</span></div></article>;
          })}{!posDevices.length && <p className="provider-empty">Nuk ka instalime POS.</p>}</div>
        </section>

        {showSettings && <section className="provider-panel provider-settings" id="settings"><div className="provider-panel-heading"><div><span className="provider-eyebrow">VETËM OFRUESI</span><h3>Konfigurimi ATK i Fiskalo</h3><p>Application ID dhe kodi i zgjidhjes i përkasin softuerit, jo biznesit klient.</p></div><span className="provider-lock"><ShieldCheck size={16}/> {role === "provider_admin" ? "Administrator" : "Vetëm lexim"}</span></div>
          {config ? <form onSubmit={saveSettings} className="provider-settings-grid">
            <label>NUI i ofruesit<input style={inputStyle} value={config.provider_nui ?? ""} onChange={(e) => setConfig({...config,provider_nui:e.target.value})} disabled={role !== "provider_admin"}/></label>
            <label>Application ID<input style={inputStyle} inputMode="numeric" value={config.application_id ?? ""} onChange={(e) => setConfig({...config,application_id:e.target.value ? Number(e.target.value) : null})} disabled={role !== "provider_admin"}/></label>
            <label>Kodi i zgjidhjes (SEF)<input style={inputStyle} value={config.sef_code ?? ""} onChange={(e) => setConfig({...config,sef_code:e.target.value})} disabled={role !== "provider_admin"}/></label>
            <label>Emri i softuerit<input style={inputStyle} value={config.solution_name} onChange={(e) => setConfig({...config,solution_name:e.target.value})} disabled={role !== "provider_admin"}/></label>
            <label>Versioni<input style={inputStyle} value={config.solution_version} onChange={(e) => setConfig({...config,solution_version:e.target.value})} disabled={role !== "provider_admin"}/></label>
            <label>Statusi i certifikimit<select style={inputStyle} value={config.certification_status} onChange={(e) => setConfig({...config,certification_status:e.target.value})} disabled={role !== "provider_admin"}><option value="not_applied">Nuk është aplikuar</option><option value="testing">Në testim</option><option value="submitted">Dërguar për certifikim</option><option value="certified">E certifikuar</option><option value="suspended">Pezulluar</option></select></label>
            <div className="provider-toggle" role="note"><ShieldCheck size={16}/> Prodhimi mbetet i çaktivizuar në këtë version. Aktivizimi kërkon integrim dhe certifikim zyrtar të veçantë nga ATK.</div>
            {role === "provider_admin" && <button className="provider-primary" disabled={saving}>{saving ? "Duke ruajtur…" : "Ruaj konfigurimin"}</button>}
          </form> : <div className="provider-alert">Nuk ke qasje për të lexuar konfigurimin e ofruesit.</div>}
          {(error || message) && <p className={"provider-feedback " + (error ? "bad" : "good")}>{error || message}</p>}
        </section>}
        <footer className="provider-footer">Fiskalo · Hapësira e sigurt e ofruesit · Të dhënat e bizneseve mbeten të ndara sipas organizatës.</footer>
      </main>
    </div>
  );
}
