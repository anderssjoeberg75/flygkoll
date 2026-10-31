import { requireUser } from "@/lib/auth";
import { RulesWizard } from "@/components/RulesWizard";

export default async function Rules() {
  await requireUser();
  return (
    <>
      <div className="page-head"><div><h1>Drönarregler</h1><p className="muted" style={{ margin: 0 }}>Förenklad vägledning enligt (EU) 2019/947 för svenska förhållanden.</p></div></div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,3fr) minmax(260px,2fr)", alignItems: "start" }}>
        <RulesWizard />
        <div className="card small">
          <h2>Snabbfakta</h2>
          <ul>
            <li>Max 120 m över marken i öppen kategori.</li>
            <li>Registrera dig som operatör hos Transportstyrelsen om drönaren väger ≥ 250 g eller har kamera.</li>
            <li>Inom 5 km från en flygplats bana krävs tillstånd om inte en UAS-zon säger annat.</li>
            <li>I kontrollzon (CTR) utanför 5 km-zonen: max 50 m utan tillstånd från flygtrafikledningen.</li>
            <li>R-områden kräver tillstånd. D-områden: kontakta ansvarig.</li>
            <li>Skyddsobjekt får inte fotograferas eller överflygas utan tillstånd.</li>
            <li>Nationalparker och många naturreservat förbjuder drönare – kontrollera föreskrifterna.</li>
            <li>Mörkerflygning i öppen kategori kräver grönt blinkande ljus.</li>
          </ul>
          <p className="muted">Detta är vägledning, inte juridisk rådgivning. Kontrollera alltid Transportstyrelsens aktuella regler.</p>
        </div>
      </div>
    </>
  );
}
