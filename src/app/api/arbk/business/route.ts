import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegistryRecord = Record<string, unknown>;

function first(record: RegistryRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized", message: "Hyr në Fiskalo për të kërkuar biznesin." }, { status: 401 });
  }

  const nui = new URL(request.url).searchParams.get("nui")?.replace(/\D/g, "") ?? "";
  if (!/^\d{9}$/.test(nui)) {
    return NextResponse.json({ error: "invalid_nui", message: "NUI duhet të përmbajë 9 shifra." }, { status: 400 });
  }

  const apiKey = process.env.ARBK_ATLAS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "registry_provider_not_configured",
      message: "Kërkimi automatik është gati, por mungon çelësi ARBK Atlas në konfigurimin server-side (ARBK_ATLAS_API_KEY).",
    }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`https://api.atlas-studio.eu/v1/businesses/${encodeURIComponent(nui)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 404) {
      return NextResponse.json({ error: "business_not_found", message: "Nuk u gjet biznes me këtë NUI në regjistrin e ofruesit." }, { status: 404 });
    }
    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({ error: "registry_auth_failed", message: "Çelësi ARBK Atlas nuk është valid ose nuk ka qasje në Kosovë." }, { status: 502 });
    }
    if (response.status === 429) {
      return NextResponse.json({ error: "registry_rate_limited", message: "Është arritur kufiri i kërkimeve. Provo përsëri më vonë." }, { status: 429 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: "registry_unavailable", message: "Regjistri nuk është i qasshëm për momentin." }, { status: 502 });
    }

    const payload: unknown = await response.json();
    const candidate = (payload && typeof payload === "object" && "data" in payload)
      ? (payload as { data: unknown }).data
      : payload;
    const record = (Array.isArray(candidate) ? candidate[0] : candidate) as RegistryRecord | null;
    if (!record || typeof record !== "object") {
      return NextResponse.json({ error: "business_not_found", message: "Nuk u gjet biznes me këtë NUI." }, { status: 404 });
    }

    const returnedNui = first(record, ["nui", "unique_identification_number", "business_number", "business_id"]);
    if (returnedNui && returnedNui.replace(/\D/g, "") !== nui) {
      return NextResponse.json({ error: "registry_nui_mismatch", message: "Regjistri ktheu një biznes me NUI tjetër. Të dhënat nuk u pranuan." }, { status: 502 });
    }

    const business = {
      nui,
      legal_name: first(record, ["name", "legal_name", "business_name", "company_name"]),
      trade_name: first(record, ["trade_name", "commercial_name"]),
      fiscal_number: first(record, ["fiscal_number", "fiscal_no", "tax_number"]),
      business_type: first(record, ["business_type", "legal_form", "entity_type"]),
      business_activity: first(record, ["primary_activity", "activity", "activity_name", "activity_code"]),
      municipality: first(record, ["municipality", "municipality_name", "city"]),
      address: first(record, ["address", "full_address", "street_address"]),
      status: first(record, ["status", "business_status"]),
      registration_date: first(record, ["registration_date", "registered_at", "date_registered"]),
      source: "ARBK Atlas registry dataset",
      retrieved_at: new Date().toISOString(),
    };
    if (!business.legal_name) {
      return NextResponse.json({ error: "registry_record_incomplete", message: "Regjistri nuk ktheu emrin ligjor. Plotëso të dhënat manualisht." }, { status: 502 });
    }
    return NextResponse.json({ business });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({
      error: timedOut ? "registry_timeout" : "registry_request_failed",
      message: timedOut ? "Kërkimi në regjistër mori shumë kohë. Provo përsëri." : "Kërkimi në regjistër dështoi.",
    }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
