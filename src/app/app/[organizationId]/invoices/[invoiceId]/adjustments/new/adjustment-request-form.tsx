"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  invoiceId: string;
  total: number;
  kind: "cancel" | "return";
  invoiceNumber: string;
  couponId: string;
  transactionId: string;
};

const money = (value: number) => new Intl.NumberFormat("sq-XK", { style: "currency", currency: "EUR" }).format(value);

export default function AdjustmentRequestForm(props: Props) {
  const [amount, setAmount] = useState(props.kind === "cancel" ? props.total.toFixed(2) : "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("fiskalo_create_invoice_adjustment", {
      target_invoice: props.invoiceId,
      adjustment_kind: props.kind,
      target_amount: Number(amount),
      adjustment_reason: reason.trim(),
    });
    if (error || !data) {
      setMessage(error?.message || "Kërkesa nuk u ruajt.");
      setBusy(false);
      return;
    }
    setCreated(true);
    setMessage("Kërkesa u regjistrua me evidencë auditimi. Ende nuk është dërguar në ATK dhe nuk e anulon apo kthen shitjen.");
    setBusy(false);
  }

  return <form onSubmit={submit} style={{display:"grid",gap:14}}>
    <div style={{padding:13,borderRadius:10,background:"#f5f7fa",fontSize:12,lineHeight:1.7}}>
      <strong>Fatura {props.invoiceNumber}</strong><br/>
      Kuponi origjinal ATK: {props.couponId}<br/>
      Transaksioni origjinal ATK: {props.transactionId}<br/>
      Vlera origjinale: {money(props.total)}
    </div>
    <label style={{display:"grid",gap:6,fontSize:13,fontWeight:700}}>
      {props.kind === "cancel" ? "Shuma për anulim (€)" : "Shuma për kthim (€)"}
      <input required type="number" min="0.01" max={props.total} step="0.01" value={amount}
        readOnly={props.kind === "cancel"} onChange={event=>setAmount(event.target.value)}
        style={{padding:12,border:"1px solid var(--line)",borderRadius:9,fontSize:16}}/>
    </label>
    {props.kind === "cancel" && <p style={{margin:0,fontSize:12,color:"var(--muted)"}}>Anulimi kërkon shumën e plotë të faturës origjinale.</p>}
    <label style={{display:"grid",gap:6,fontSize:13,fontWeight:700}}>
      Arsyeja
      <textarea required minLength={3} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}
        placeholder="Shëno arsyen e anulimit ose kthimit..." rows={3}
        style={{padding:12,border:"1px solid var(--line)",borderRadius:9,font:"inherit",resize:"vertical"}}/>
    </label>
    <div style={{padding:12,border:"1px solid #d7a64a",borderRadius:9,background:"#fff9eb",fontSize:12,lineHeight:1.6}}>
      <strong>Veprim i rëndësishëm:</strong> Kjo krijon kërkesë të gjurmueshme në Fiskalo. Nuk dërgon kupon anulimi/kthimi në ATK. Deri në implementimin dhe verifikimin e plotë të protokollit për këto dokumente, mos e trajto kërkesën si anulim fiskal të përfunduar.
    </div>
    <button disabled={busy || created || !reason.trim() || Number(amount)<=0} type="submit"
      style={{border:0,borderRadius:9,padding:"12px 16px",background:"var(--brand)",color:"white",fontWeight:800,cursor:"pointer"}}>
      {busy ? "Duke ruajtur..." : created ? "Kërkesa u regjistrua" : props.kind === "cancel" ? "Regjistro kërkesën për anulim" : "Regjistro kërkesën për kthim"}
    </button>
    {message && <p role="status" style={{margin:0,fontSize:12,color:created?"#26734d":"#a33f36"}}>{message}</p>}
  </form>;
}
