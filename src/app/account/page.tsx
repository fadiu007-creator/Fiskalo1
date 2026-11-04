"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const field: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 13px", background: "white", color: "var(--ink)" };
const button: React.CSSProperties = { border: 0, borderRadius: 10, padding: "12px 16px", background: "var(--brand)", color: "white", fontWeight: 750, cursor: "pointer" };

export default function AccountProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const [name,setName] = useState("");
  const [phone,setPhone] = useState("");
  const [email,setEmail] = useState("");
  const [newPassword,setNewPassword] = useState("");
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({data,error}) => {
      if (!active) return;
      if (error || !data.user) setError("Nuk u lexua llogaria. Hyr përsëri.");
      else {
        setName(String(data.user.user_metadata?.display_name || data.user.user_metadata?.full_name || ""));
        setPhone(String(data.user.user_metadata?.phone || ""));
        setEmail(data.user.email || "");
      }
      setLoading(false);
    });
    return () => { active = false; };
  },[supabase]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { setError("Sesioni ka skaduar. Hyr përsëri."); setBusy(false); return; }
    const updates: { data: Record<string, unknown>; email?: string; password?: string } = {
      data: { ...(user.user_metadata || {}), display_name: name.trim(), phone: phone.trim() },
    };
    if (email.trim().toLowerCase() !== (user.email || "").toLowerCase()) updates.email = email.trim().toLowerCase();
    if (newPassword) {
      if (newPassword.length < 8) { setError("Fjalëkalimi duhet të ketë së paku 8 karaktere."); setBusy(false); return; }
      updates.password = newPassword;
    }
    const { data, error: updateError } = await supabase.auth.updateUser(updates);
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    if (data.user?.email) setEmail(data.user.email);
    setNewPassword("");
    setNotice(updates.email
      ? "Të dhënat u ruajtën. Për ndryshimin e email-it, konfirmo adresën e re përmes mesazhit që dërgohet nga Supabase."
      : "Të dhënat e profilit u ruajtën.");
  }

  return <main style={{maxWidth:760,margin:"0 auto",padding:"28px 16px 56px"}}>
    <Link href="/app" style={{color:"var(--brand)",fontWeight:750,textDecoration:"none"}}>← Kthehu te bizneset</Link>
    <h1 style={{fontSize:28,margin:"16px 0 5px"}}>Profili im</h1>
    <p style={{color:"var(--muted)",fontSize:13,margin:"0 0 20px"}}>Ndrysho të dhënat personale të llogarisë tënde. Këto të dhëna nuk ndryshojnë rolin ose qasjen në biznes.</p>
    {error && <p role="alert" style={{background:"#fff0ef",color:"#982d25",padding:12,borderRadius:9}}>{error}</p>}
    {notice && <p role="status" style={{background:"#edf7f1",color:"#155c3c",padding:12,borderRadius:9}}>{notice}</p>}
    <form onSubmit={save} style={{background:"white",border:"1px solid var(--line)",borderRadius:14,padding:18,display:"grid",gap:14}}>
      <label style={{fontSize:13,fontWeight:700}}>Emri dhe mbiemri<input required value={name} onChange={e=>setName(e.target.value)} disabled={loading} style={{...field,display:"block",marginTop:6}}/></label>
      <label style={{fontSize:13,fontWeight:700}}>Numri i telefonit<input value={phone} onChange={e=>setPhone(e.target.value)} disabled={loading} placeholder="+383…" style={{...field,display:"block",marginTop:6}}/></label>
      <label style={{fontSize:13,fontWeight:700}}>Email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={loading} style={{...field,display:"block",marginTop:6}}/></label>
      <div style={{borderTop:"1px solid var(--line)",paddingTop:14}}>
        <label style={{fontSize:13,fontWeight:700}}>Fjalëkalim i ri (opsional)<input type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} disabled={loading} placeholder="Së paku 8 karaktere" style={{...field,display:"block",marginTop:6}}/></label>
      </div>
      <button type="submit" disabled={busy||loading} style={button}>{busy?"Duke ruajtur…":"Ruaj ndryshimet"}</button>
    </form>
  </main>;
}
