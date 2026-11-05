import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdjustmentRequestForm from "./adjustment-request-form";

type Props = { params: Promise<{ organizationId: string; invoiceId: string }>; searchParams: Promise<{ type?: string }> };

export default async function NewInvoiceAdjustmentPage({params,searchParams}:Props) {
  const {organizationId,invoiceId}=await params;
  const query=await searchParams;
  const kind=query.type==="return"?"return":query.type==="cancel"?"cancel":null;
  if(!kind) notFound();
  const supabase=await createClient();
  const {data:auth}=await supabase.auth.getUser();
  if(!auth.user) redirect("/login");
  const {data:membership}=await supabase.from("fiskalo_organization_users")
    .select("role").eq("organization_id",organizationId).eq("user_id",auth.user.id).maybeSingle();
  if(!membership) redirect("/app");
  if(!["owner","administrator","manager","accountant"].includes(membership.role)) redirect("/app/"+organizationId);
  const [{data:invoice},{data:fiscalDoc},{data:prior},{data:invoiceItems,error:itemError}] = await Promise.all([
    supabase.from("fiskalo_invoices").select("id,invoice_number,total,status,payment_status")
      .eq("id",invoiceId).eq("organization_id",organizationId).maybeSingle(),
    supabase.from("fiskalo_atk_fiscal_documents").select("id,coupon_id,atk_transaction_id,status,document_type")
      .eq("organization_id",organizationId).eq("source_invoice_id",invoiceId).eq("document_type","sale").eq("status","accepted").maybeSingle(),
    supabase.from("fiskalo_invoice_adjustments").select("id,adjustment_type,amount,status,reason,created_at")
      .eq("organization_id",organizationId).eq("original_invoice_id",invoiceId).order("created_at",{ascending:false}),
    supabase.from("fiskalo_invoice_items").select("id,description,quantity,line_subtotal,line_vat")
      .eq("invoice_id",invoiceId).order("id"),
  ]);
  if(!invoice) notFound();
  const priorAmount=(prior??[]).filter(row=>row.status!=="voided").reduce((sum,row)=>sum+Number(row.amount),0);
  const eligible=invoice.status==="issued"&&invoice.payment_status==="paid"&&!!fiscalDoc&&!!fiscalDoc.atk_transaction_id;
  return <main style={{maxWidth:760,margin:"0 auto",padding:"28px 18px 60px"}}>
    <Link href={"/app/"+organizationId+"/invoices/"+invoiceId} style={{color:"var(--brand)",fontWeight:750,fontSize:13}}>← Kthehu te fatura</Link>
    <h1 style={{fontSize:27,letterSpacing:"-.04em",margin:"14px 0 5px"}}>{kind==="cancel"?"Anulim i faturës":"Kthim i artikujve"}</h1>
    <p style={{fontSize:13,color:"var(--muted)",marginTop:0}}>Zgjidh artikujt dhe sasitë origjinale. Vlera dhe TVSH-ja llogariten nga linjat e faturës.</p>
    {!eligible ? <section style={{padding:16,border:"1px solid var(--line)",borderRadius:12,background:"white"}}>
      <strong>Nuk mund të krijohet kërkesa.</strong>
      <p style={{fontSize:13,color:"var(--muted)"}}>Kërkohet faturë e lëshuar dhe plotësisht e paguar, me kupon origjinal të pranuar nga ATK.</p>
    </section> : itemError || !invoiceItems?.length ? <section style={{padding:16,border:"1px solid var(--line)",borderRadius:12,background:"white"}}>
      <strong>Linjat e faturës nuk u lexuan.</strong><p style={{fontSize:13,color:"var(--muted)"}}>Nuk mund të krijohet korrigjim pa të dhënat origjinale të artikujve.</p>
    </section> : <section style={{padding:18,border:"1px solid var(--line)",borderRadius:12,background:"white"}}>
      {prior?.length ? <div style={{padding:12,background:"#f5f7fa",borderRadius:9,marginBottom:14,fontSize:12}}>
        <strong>Kërkesat paraprake</strong><br/>{prior.map(row=><div key={row.id} style={{paddingTop:6}}>{row.adjustment_type==="cancel"?"Anulim":"Kthim"} · {Number(row.amount).toFixed(2)} € · {row.status}</div>)}<br/>
        Shuma e regjistruar: {priorAmount.toFixed(2)} € / {Number(invoice.total).toFixed(2)} €
      </div>:null}
      <AdjustmentRequestForm invoiceId={invoiceId} total={Number(invoice.total)}
        kind={kind} invoiceNumber={invoice.invoice_number||invoice.id} couponId={String(fiscalDoc.coupon_id)}
        transactionId={String(fiscalDoc.atk_transaction_id)}
        items={(invoiceItems??[]).map(item=>({id:item.id,description:item.description,quantity:Number(item.quantity),line_subtotal:Number(item.line_subtotal),line_vat:Number(item.line_vat)}))}/>
    </section>}
  </main>;
}
