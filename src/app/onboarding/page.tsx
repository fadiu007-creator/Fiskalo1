"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type BusinessForm = {
  legal_name: string; trade_name: string; nui: string; fiscal_number: string;
  business_type: string; business_activity: string; municipality: string;
  address: string; phone: string; email: string; vat_registered: boolean;
  arbk_verified_nui?: string; arbk_retrieved_at?: string;
  arbk_business_status?: string; arbk_registration_date?: string;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState<BusinessForm>({
    legal_name: "", trade_name: "", nui: "", fiscal_number: "", business_type: "",
    business_activity: "", municipality: "", address: "", phone: "", email: "", vat_registered: false,
  });
  const [busy, setBusy] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState("");
  const [lookupMessage, setLookupMessage] = useState("");
  const [registryLoaded, setRegistryLoaded] = useState(false);

  function update<K extends keyof BusinessForm>(key: K, value: BusinessForm[K]) {
    setForm((current) => key === "nui"
      ? { ...current, nui: value as string, arbk_verified_nui: undefined, arbk_retrieved_at: undefined, arbk_business_status: undefined, arbk_registration_date: undefined }
      : { ...current, [key]: value });
    if (key === "nui") {
      setRegistryLoaded(false);
      setLookupMessage("");
    }
  }

  async function lookupBusiness() {
    const nui = form.nui.replace(/\D/g, "");
    if (!/^\d{9}$/.test(nui)) {
      setLookupMessage("Shkruaj NUI me 9 shifra para kërkimit.");
      return;
    }
    setLookingUp(true);
    setLookupMessage("");
    try {
      const response = await fetch(`/api/arbk/business?nui=${encodeURIComponent(nui)}`, { cache: "no-store" });
      const result = await response.json() as {
        business?: {
          nui: string; legal_name: string; trade_name: string; fiscal_number: string;
          business_type: string; business_activity: string; municipality: string;
          address: string; status: string; registration_date: string; retrieved_at: string;
        };
        message?: string;
      };
      if (!response.ok || !result.business) throw new Error(result.message || "Kërkimi në regjistër dështoi.");
      const business = result.business;
      setForm((current) => ({
        ...current,
        nui: business.nui,
        legal_name: business.legal_name || current.legal_name,
        trade_name: business.trade_name || current.trade_name,
        fiscal_number: business.fiscal_number || current.fiscal_number,
        business_type: business.business_type || current.business_type,
        business_activity: business.business_activity || current.business_activity,
        municipality: business.municipality || current.municipality,
        address: business.address || current.address,
        arbk_verified_nui: business.nui,
        arbk_retrieved_at: business.retrieved_at,
        arbk_business_status: business.status,
        arbk_registration_date: business.registration_date,
      }));
      setRegistryLoaded(true);
      setLookupMessage("Të dhënat u gjetën. Kontrolloji dhe konfirmoji para ruajtjes.");
    } catch (err) {
      setRegistryLoaded(false);
      setLookupMessage(err instanceof Error ? err.message : "Kërkimi në regjistër dështoi.");
    } finally {
      setLookingUp(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Sesioni ka skaduar. Hyr përsëri.");
      if (registryLoaded && form.arbk_verified_nui !== form.nui) {
        throw new Error("NUI ka ndryshuar. Kërko përsëri të dhënat e biznesit.");
      }
      const { data: organizationId, error: orgError } = await supabase.rpc("fiskalo_create_organization", { payload: form });
      if (orgError) throw orgError;
      router.replace(`/app/${organizationId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regjistrimi i biznesit dështoi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
      <Link href="/app" style={{ color: "var(--brand)", fontWeight: 700 }}>← Kthehu te bizneset</Link>
      <h1 style={{ fontSize: 32 }}>Regjistro biznesin</h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>Shkruaj NUI dhe kërko të dhënat e regjistruara. Kontrolloji para se ta ruash biznesin.</p>
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16, background: "white", padding: 24, border: "1px solid var(--line)", borderRadius: 16 }}>
        <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
          <Field label="NUI" required value={form.nui} onChange={(v) => update("nui", v.replace(/\D/g, "").slice(0, 9))} />
          <button type="button" disabled={lookingUp || form.nui.length !== 9} onClick={lookupBusiness} style={{ border: 0, borderRadius: 9, background: "var(--brand)", color: "white", padding: "12px 16px", fontWeight: 700, minHeight: 43 }}>
            {lookingUp ? "Duke kërkuar..." : "Kërko në ARBK"}
          </button>
        </div>
        {lookupMessage && <p role="status" style={{ gridColumn: "1 / -1", color: registryLoaded ? "#176b43" : "var(--muted)", fontSize: 13, margin: 0 }}>{lookupMessage}</p>}
        {registryLoaded && <p style={{ gridColumn: "1 / -1", background: "#f2f7f4", padding: 10, borderRadius: 8, fontSize: 12, color: "#245b3d", margin: 0 }}>Burimi: ARBK Atlas (regjistër i të dhënave). Të dhënat janë kopjuar nga ofruesi; kjo nuk përbën certifikim zyrtar nga ARBK.</p>}
        <Field label="Emri ligjor i biznesit" required value={form.legal_name} onChange={(v) => update("legal_name", v)} />
        <Field label="Emri tregtar" value={form.trade_name} onChange={(v) => update("trade_name", v)} />
        <Field label="Numri fiskal" value={form.fiscal_number} onChange={(v) => update("fiscal_number", v)} />
        <Field label="Forma e biznesit" value={form.business_type} onChange={(v) => update("business_type", v)} />
        <Field label="Veprimtaria" value={form.business_activity} onChange={(v) => update("business_activity", v)} />
        <Field label="Komuna" required value={form.municipality} onChange={(v) => update("municipality", v)} />
        <Field label="Adresa" value={form.address} onChange={(v) => update("address", v)} />
        <Field label="Telefoni" value={form.phone} onChange={(v) => update("phone", v)} />
        <Field label="Email i biznesit" type="email" value={form.email} onChange={(v) => update("email", v)} />
        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
          <input type="checkbox" checked={form.vat_registered} onChange={(e) => update("vat_registered", e.target.checked)} />
          Biznesi është i regjistruar për TVSH
        </label>
        {error && <p role="alert" style={{ color: "#a12b2b", gridColumn: "1 / -1", fontSize: 13 }}>{error}</p>}
        <button disabled={busy} type="submit" style={{ gridColumn: "1 / -1", border: 0, borderRadius: 9, background: "var(--brand)", color: "white", padding: 13, fontWeight: 700 }}>{busy ? "Duke ruajtur..." : "Konfirmo dhe ruaj biznesin"}</button>
      </form>
    </main>
  );
}

function Field({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return (
    <label style={{ display: "grid", gap: 7, fontSize: 13, fontWeight: 600 }}>
      {label}
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 9, padding: "12px 13px" }} />
    </label>
  );
}
