"use client";

import { useState } from "react";

type Answers = { weight?: string; cls?: string; over?: string; vlos?: string; height?: string; near?: string };

function decide(a: Answers): { cat: string; tone: "ok" | "warn" | "danger"; text: string; needs: string[] } | null {
  if (!a.weight || !a.vlos || !a.height || !a.over) return null;
  if (a.vlos === "no" || a.height === "no" || a.weight === "25+") {
    return {
      cat: "Specifik kategori",
      tone: "danger",
      text: "Flygningen ryms inte i öppen kategori. Använd ett standardscenario (STS-01/STS-02) med deklaration, en PDRA eller gör en SORA och sök operativt tillstånd hos Transportstyrelsen.",
      needs: ["Operatörsregistrering", "Driftmanual och riskbedömning", "STS-kompetensbevis eller motsvarande", "Försäkring"],
    };
  }
  if (a.over === "crowd") {
    return { cat: "Specifik kategori", tone: "danger", text: "Flygning över folksamlingar är aldrig tillåten i öppen kategori.", needs: ["SORA och operativt tillstånd"] };
  }
  if (a.weight === "<250" || a.cls === "C0") {
    return { cat: "Öppen kategori – A1", tone: "ok", text: "Du får flyga nära människor men undvik att flyga över oinblandade.", needs: ["Operatörs-ID om drönaren har kamera", "Ingen kompetenskrav för C0/<250 g (rekommenderas ändå)"] };
  }
  if (a.cls === "C1") {
    return { cat: "Öppen kategori – A1", tone: "ok", text: "Får inte avsiktligt flyga över oinblandade personer.", needs: ["Operatörs-ID", "Drönarkort A1/A3"] };
  }
  if (a.cls === "C2" && a.over === "near") {
    return { cat: "Öppen kategori – A2", tone: "warn", text: "Minst 30 m horisontellt från oinblandade (5 m i lågfartsläge).", needs: ["Operatörs-ID", "Drönarkort A2"] };
  }
  if (a.over === "near") {
    return { cat: "Öppen kategori – A3 räcker inte", tone: "danger", text: "Med denna drönare måste du hålla 150 m från bebyggelse och ha inga oinblandade i närheten. Välj en annan plats eller drönare, eller gå till specifik kategori.", needs: ["Byt plats", "Eller C1/C2-drönare", "Eller specifik kategori"] };
  }
  return { cat: "Öppen kategori – A3", tone: "ok", text: "Flyg minst 150 m från bostads-, industri-, handels- och rekreationsområden och utan oinblandade personer i området.", needs: ["Operatörs-ID", "Drönarkort A1/A3"] };
}

const Q: { k: keyof Answers; q: string; opts: [string, string][]; show?: (a: Answers) => boolean }[] = [
  { k: "weight", q: "Hur mycket väger drönaren (MTOM)?", opts: [["<250", "Under 250 g"], ["250-25", "250 g – 25 kg"], ["25+", "25 kg eller mer"]] },
  { k: "cls", q: "Vilken klassmärkning har drönaren?", opts: [["C0", "C0"], ["C1", "C1"], ["C2", "C2"], ["C3", "C3/C4"], ["none", "Ingen (äldre/oklassad)"]], show: (a) => a.weight === "250-25" },
  { k: "vlos", q: "Kommer du hela tiden att se drönaren med blotta ögat (VLOS)?", opts: [["yes", "Ja"], ["no", "Nej / delvis"]] },
  { k: "height", q: "Håller du dig under 120 m över marken?", opts: [["yes", "Ja"], ["no", "Nej"]] },
  { k: "over", q: "Hur nära människor flyger du?", opts: [["far", "Långt från människor och bebyggelse"], ["near", "Nära människor/bebyggelse"], ["crowd", "Över folksamlingar"]] },
];

export function RulesWizard() {
  const [a, setA] = useState<Answers>({});
  const res = decide(a);
  return (
    <div className="card stack">
      <h2>Vilken kategori gäller för din flygning?</h2>
      {Q.filter((q) => !q.show || q.show(a)).map((q) => (
        <div key={q.k}>
          <label>{q.q}</label>
          <div className="row">
            {q.opts.map(([v, l]) => (
              <button key={v} type="button" className={`btn small ${a[q.k] === v ? "" : "secondary"}`} onClick={() => setA({ ...a, [q.k]: v })}>{l}</button>
            ))}
          </div>
        </div>
      ))}
      {res && (
        <div className={`notice n-${res.tone === "ok" ? "info" : res.tone}`}>
          <strong>{res.cat}</strong>
          {res.text}
          <ul style={{ margin: "6px 0 0" }}>{res.needs.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
      <button type="button" className="btn secondary small" style={{ alignSelf: "start" }} onClick={() => setA({})}>Börja om</button>
    </div>
  );
}
