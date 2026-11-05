"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  line_subtotal: number;
  line_vat: number;
};

type Props = {
  invoiceId: string;
  total: number;
  kind: "cancel" | "return";
  invoiceNumber: string;
  couponId: string;
  transactionId: string;
  items: InvoiceItem[];
};

const money = (value: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(value);

export default function AdjustmentRequestForm(props: Props) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(props.items.map((item) => [item.id, props.kind === "cancel" ? String(item.quantity) : "0"]))
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState(false);

  const selectedItems = useMemo(() => props.items.flatMap((item) => {
    const quantity = Number(quantities[item.id] || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return [];
    const ratio = quantity / Number(item.quantity);
    const net = Math.round(Number(item.line_subtotal) * ratio * 100) / 100;
    const vat = Math.round(Number(item.line_vat) * ratio * 100) / 100;
    return [{ invoice_item_id: item.id, quantity, net, vat, total: net + vat, remaining: Number(item.quantity) }];
  }), [props.items, quantities]);
  const amount = Math.round(selectedItems.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  const quantityInvalid = selectedItems.some((item) => item.quantity > item.remaining) ||
    selectedItems.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItems.length || quantityInvalid || amount <= 0) {
      setMessage("Zgjidh sasi valide për artikujt që po kthehen.");
      return;
    }
    if (props.kind === "cancel" && (selectedItems.length !== props.items.length ||
      selectedItems.some((item) => item.quantity !== item.remaining) || Math.abs(amount - props.total) > 0.01)) {
      setMessage("Anulimi duhet të përfshijë të gjithë artikujt dhe vlerën e plotë të faturës.");
      return;
    }
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("fiskalo_create_invoice_adjustment_v2", {
      target_invoice: props.invoiceId,
      adjustment_kind: props.kind,
      target_items: selectedItems.map(({ invoice_item_id, quantity }) => ({ invoice_item_id, quantity })),
      adjustment_reason: reason.trim(),
    });
    if (error || !data) {
      setMessage(error?.message || "Kërkesa nuk u ruajt.");
      setBusy(false);
      return;
    }
    setCreated(true);
    setMessage("Kërkesa dhe sasitë e artikujve u regjistruan me evidencë auditimi. Ende nuk është dërguar në ATK dhe shitja origjinale mbetet e pranuar.");
    setBusy(false);
  }

  return <form onSubmit={submit} style={{display:"grid",gap:14}}>
    <div style={{padding:13,borderRadius:10,background:"#f5f7fa",fontSize:12,lineHeight:1.7}}>
      <strong>Fatura {props.invoiceNumber}</strong><br/>
      Kuponi origjinal ATK: {props.couponId}<br/>
      Transaksioni origjinal ATK: {props.transactionId}<br/>
      Vlera origjinale: {money(props.total)}
    </div>
    <div style={{display:"grid",gap:8}}>
      <strong style={{fontSize:13}}>{props.kind === "cancel" ? "Artikujt për anulim" : "Zgjidh artikujt dhe sasitë për kthim"}</strong>
      {props.items.map((item) => <label key={item.id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 112px",gap:10,alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--line)",fontSize:12}}>
        <span><strong>{item.description}</strong><br/><span style={{color:"var(--muted)"}}>Sasia origjinale: {item.quantity} · Vlera: {money(Number(item.line_subtotal)+Number(item.line_vat))}</span></span>
        <span style={{display:"grid",gap:4}}>Sasia
          <input aria-label={"Sasia për " + item.description} required={props.kind === "cancel"} type="number" min={props.kind === "cancel" ? item.quantity : 0} max={item.quantity} step="0.001"
            value={quantities[item.id]} readOnly={props.kind === "cancel"}
            onChange={(event) => setQuantities((current) => ({...current,[item.id]:event.target.value}))}
            style={{width:"100%",padding:9,border:"1px solid var(--line)",borderRadius:8,fontSize:14}}/>
        </span>
      </label>)}
    </div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderTop:"1px solid var(--line)"}}>
      <span style={{fontSize:13,fontWeight:700}}>{props.kind === "cancel" ? "Vlera e anulimit" : "Vlera e kthimit"}</span>
      <strong style={{fontSize:22}}>{money(amount)}</strong>
    </div>
    {props.kind === "cancel" && <p style={{margin:0,fontSize:12,color:"var(--muted)"}}>Anulimi përfshin të gjitha linjat dhe vlerën e plotë të faturës origjinale.</p>}
    <label style={{display:"grid",gap:6,fontSize:13,fontWeight:700}}>
      Arsyeja
      <textarea required minLength={3} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}
        placeholder="Shëno arsyen e anulimit ose kthimit..." rows={3}
        style={{padding:12,border:"1px solid var(--line)",borderRadius:9,font:"inherit",resize:"vertical"}}/>
    </label>
    <div style={{padding:12,border:"1px solid #d7a64a",borderRadius:9,background:"#fff9eb",fontSize:12,lineHeight:1.6}}>
      <strong>Status fiskal:</strong> Kjo ruan kërkesën dhe sasitë e sakta të artikujve në Fiskalo. Nuk dërgon ende kupon anulimi/kthimi në ATK; mos e trajto si korrigjim fiskal të përfunduar.
    </div>
    <button disabled={busy || created || !reason.trim() || !selectedItems.length || amount <= 0 || quantityInvalid} type="submit"
      style={{border:0,borderRadius:9,padding:"12px 16px",background:"var(--brand)",color:"white",fontWeight:800,cursor:"pointer"}}>
      {busy ? "Duke ruajtur..." : created ? "Kërkesa u regjistrua" : props.kind === "cancel" ? "Regjistro anulimin" : "Regjistro kthimin"}
    </button>
    {message && <p role="status" style={{margin:0,fontSize:12,color:created?"#26734d":"#a33f36"}}>{message}</p>}
  </form>;
}
