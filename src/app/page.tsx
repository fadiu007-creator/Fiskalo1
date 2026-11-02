import Link from "next/link";

const modules = [
  { title: "Produktet dhe shërbimet", description: "Katalog me çmime, kode dhe norma TVSH-je.", status: "Aktiv" },
  { title: "Faturat", description: "Krijo fatura, ruaj numërimin dhe printo dokumentet.", status: "Aktiv" },
  { title: "Klientët", description: "Mbaj të dhënat bazë të klientëve në një vend.", status: "Aktiv" },
  { title: "Shpenzimet", description: "Regjistro furnitorët, kategoritë dhe shpenzimet.", status: "Aktiv" },
  { title: "Stoku", description: "Ndiq sasitë dhe zbritjen automatike në faturim.", status: "Aktiv" },
  { title: "Ekipi dhe raportet", description: "Menaxho rolet dhe shiko përmbledhjet operative.", status: "Aktiv" },
];

export default function Home() {
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 48px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, marginBottom: 64, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--brand)", color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 21 }}>F</div>
          <strong style={{ fontSize: 23, letterSpacing: "-0.8px" }}>fiskalo</strong>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/login" style={{ color: "var(--brand)", fontWeight: 700, fontSize: 14 }}>Hyr</Link>
          <Link href="/register" style={{ background: "var(--brand)", color: "white", borderRadius: 9, padding: "11px 16px", fontWeight: 700, fontSize: 14 }}>Krijo llogari</Link>
        </nav>
      </header>

      <section style={{ marginBottom: 44 }}>
        <p style={{ color: "var(--brand)", fontWeight: 700, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase" }}>Menaxhimi i biznesit në Kosovë</p>
        <h1 style={{ fontSize: "clamp(36px, 5vw, 58px)", lineHeight: 1.06, letterSpacing: "-2.4px", maxWidth: 760, margin: "12px 0" }}>Shitjet, faturat dhe shpenzimet. Në një vend.</h1>
        <p style={{ color: "var(--muted)", fontSize: 17, maxWidth: 660, lineHeight: 1.7 }}>Fiskalo të ndihmon t’i organizosh produktet, klientët, faturat dhe shpenzimet e biznesit me qasje për ekipin tënd.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
          <Link href="/register" style={{ background: "var(--brand)", color: "white", borderRadius: 9, padding: "13px 18px", fontWeight: 700 }}>Fillo tani</Link>
          <Link href="/login" style={{ background: "white", border: "1px solid var(--line)", borderRadius: 9, padding: "13px 18px", fontWeight: 700 }}>Hyr në llogari</Link>
        </div>
      </section>

      <section style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
        <h2 style={{ fontSize: 19, margin: 0 }}>Çfarë mund të menaxhosh</h2>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>MVP</span>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {modules.map((module) => (
          <article key={module.title} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{module.title}</h3>
              <span style={{ fontSize: 10, color: "var(--brand-dark)", background: "#eaf5ef", borderRadius: 99, padding: "5px 8px", whiteSpace: "nowrap" }}>{module.status}</span>
            </div>
            <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 13, margin: "14px 0 0" }}>{module.description}</p>
          </article>
        ))}
      </section>
      <section style={{ marginTop: 36, background: "white", border: "1px solid var(--line)", borderRadius: 14, padding: 20 }}>
        <strong style={{ fontSize: 14 }}>Njoftim i rëndësishëm për fiskalizimin</strong>
        <p style={{ color: "var(--muted)", lineHeight: 1.65, fontSize: 13, marginBottom: 0 }}>Fiskalo nuk është i certifikuar ose i miratuar nga ATK. Faturat e këtij versioni janë dokumente të brendshme biznesi dhe nuk dërgohen në sistemin e fiskalizimit të ATK-së. Përdorimi për fiskalizim zyrtar do të aktivizohet vetëm pas integrimit dhe certifikimit përkatës.</p>
      </section>
      <footer style={{ marginTop: 32, borderTop: "1px solid var(--line)", paddingTop: 18, color: "var(--muted)", fontSize: 12 }}>Fiskalo · Platformë për menaxhimin e bizneseve</footer>
    </main>
  );
}
