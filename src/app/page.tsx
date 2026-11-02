const modules = [
  { title: "Shitjet", description: "Regjistro shitje dhe ndiq qarkullimin.", status: "Në përgatitje" },
  { title: "Faturat", description: "Krijo dhe menaxho faturat e biznesit.", status: "Në përgatitje" },
  { title: "Produktet", description: "Menaxho artikujt, shërbimet dhe TVSH-në.", status: "Në përgatitje" },
  { title: "Stoku", description: "Përcjell hyrjet, daljet dhe gjendjen e stokut.", status: "Në përgatitje" },
  { title: "Shpenzimet", description: "Regjistro shpenzimet dhe furnitorët.", status: "Në përgatitje" },
  { title: "Raportet", description: "Përmbledhje për shitjet dhe tatimet.", status: "Në përgatitje" },
];

export default function Home() {
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px 28px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, marginBottom: 56 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--brand)", color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 21 }}>F</div>
          <strong style={{ fontSize: 23, letterSpacing: "-0.8px" }}>fiskalo</strong>
        </div>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Platformë për biznese në Kosovë</span>
      </header>

      <section style={{ marginBottom: 38 }}>
        <p style={{ color: "var(--brand)", fontWeight: 700, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase" }}>Menaxhimi i biznesit</p>
        <h1 style={{ fontSize: "clamp(34px, 5vw, 52px)", lineHeight: 1.08, letterSpacing: "-2px", maxWidth: 700, margin: "12px 0" }}>Biznesi yt, nën kontroll.</h1>
        <p style={{ color: "var(--muted)", fontSize: 17, maxWidth: 650, lineHeight: 1.7 }}>Shitjet, faturat, produktet dhe raportet — të organizuara në një platformë të vetme.</p>
      </section>

      <section style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Modulet e platformës</h2>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>Versioni fillestar</span>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {modules.map((module) => (
          <article key={module.title} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>{module.title}</h3>
              <span style={{ fontSize: 10, color: "var(--brand-dark)", background: "#eaf5ef", borderRadius: 99, padding: "5px 8px", whiteSpace: "nowrap" }}>{module.status}</span>
            </div>
            <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 13, margin: "14px 0 0" }}>{module.description}</p>
          </article>
        ))}
      </section>
      <footer style={{ marginTop: 48, borderTop: "1px solid var(--line)", paddingTop: 20, color: "var(--muted)", fontSize: 12 }}>
        Fiskalo nuk është ende i certifikuar nga ATK. Funksionalitetet e fiskalizimit aktivizohen vetëm pas integrimit dhe certifikimit përkatës.
      </footer>
    </main>
  );
}
