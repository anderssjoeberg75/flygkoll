import type { AreaHit, Severity } from "./briefing";

export type AreaDetails = {
  title: string;
  typeLabel: string;
  severity: Severity;
  severityLabel: string;
  badgeClass: string;
  isPermitRequired: boolean;
  isProtectedNature: boolean;
  whyProtected: string;
  howToComply: string[];
  permitUrl: string | null;
  permitLabel: string;
  permitAuthority: string;
  infoUrl: string | null;
  infoLabel: string;
  links: { title: string; url: string; description?: string }[];
  metadata: { label: string; value: string }[];
};

const COUNTY_SLUGS: Record<string, string> = {
  blekinge: "blekinge",
  dalarna: "dalarna",
  gotland: "gotland",
  gävleborg: "gavleborg",
  halland: "halland",
  jämtland: "jamtland",
  jönköping: "jonkoping",
  kalmar: "kalmar",
  kronoberg: "kronoberg",
  norrbotten: "norrbotten",
  skåne: "skane",
  stockholm: "stockholm",
  södermanland: "sodermanland",
  uppsala: "uppsala",
  värmland: "varmland",
  västerbotten: "vasterbotten",
  västernorrland: "vasternorrland",
  västmanland: "vastmanland",
  "västra götaland": "vastra-gotaland",
  örebro: "orebro",
  östergötland: "ostergotland",
};

function getCountySlug(countyStr?: unknown): string | null {
  if (!countyStr) return null;
  const s = String(countyStr).toLowerCase().replace(/län\s*$/, "").trim();
  for (const [k, slug] of Object.entries(COUNTY_SLUGS)) {
    if (s.includes(k)) return slug;
  }
  return null;
}

const AIRPORTS: Record<string, { name: string; icao: string; operator: string; permitUrl?: string; infoUrl?: string }> = {
  ESTA: { name: "Ängelholm Helsingborg flygplats", icao: "ESTA", operator: "ACR / Ängelholm Helsingborg Airport", permitUrl: "https://www.lfv.se/dronare" },
  ESMS: { name: "Malmö Airport (Sturup)", icao: "ESMS", operator: "Swedavia / LFV", permitUrl: "https://www.swedavia.se/om-swedavia/dronare/" },
  ESSA: { name: "Stockholm Arlanda Airport", icao: "ESSA", operator: "Swedavia / LFV", permitUrl: "https://www.swedavia.se/om-swedavia/dronare/" },
  ESSB: { name: "Stockholm Bromma Airport", icao: "ESSB", operator: "Swedavia / LFV", permitUrl: "https://www.swedavia.se/om-swedavia/dronare/" },
  ESGG: { name: "Göteborg Landvetter Airport", icao: "ESGG", operator: "Swedavia / LFV", permitUrl: "https://www.swedavia.se/om-swedavia/dronare/" },
  ESGP: { name: "Göteborg Säve", icao: "ESGP", operator: "Säve flygplats", permitUrl: "https://www.lfv.se/dronare" },
  ESMK: { name: "Kristianstad Österlen Airport", icao: "ESMK", operator: "Kristianstad flygplats / ACR", permitUrl: "https://www.lfv.se/dronare" },
  ESMT: { name: "Halmstad City Airport", icao: "ESMT", operator: "Halmstad flygplats", permitUrl: "https://www.lfv.se/dronare" },
  ESMQ: { name: "Kalmar Öland Airport", icao: "ESMQ", operator: "Kalmar flygplats / ACR", permitUrl: "https://www.lfv.se/dronare" },
  ESMX: { name: "Växjö Småland Airport", icao: "ESMX", operator: "Växjö flygplats / ACR", permitUrl: "https://www.lfv.se/dronare" },
  ESGJ: { name: "Jönköping Airport", icao: "ESGJ", operator: "Jönköping flygplats / ACR", permitUrl: "https://www.lfv.se/dronare" },
  ESKN: { name: "Stockholm Skavsta", icao: "ESKN", operator: "Skavsta flygplats / ACR", permitUrl: "https://www.lfv.se/dronare" },
  ESOW: { name: "Stockholm Västerås flygplats", icao: "ESOW", operator: "Västerås flygplats", permitUrl: "https://www.lfv.se/dronare" },
  ESSP: { name: "Norrköping flygplats", icao: "ESSP", operator: "Norrköping flygplats / ACR", permitUrl: "https://www.lfv.se/dronare" },
  ESOE: { name: "Örebro Airport", icao: "ESOE", operator: "Örebro flygplats", permitUrl: "https://www.lfv.se/dronare" },
  ESOK: { name: "Karlstad Airport", icao: "ESOK", operator: "Karlstad flygplats / ACR", permitUrl: "https://www.lfv.se/dronare" },
  ESNN: { name: "Sundsvall Timrå Airport", icao: "ESNN", operator: "Sundsvall flygplats / LFV", permitUrl: "https://www.lfv.se/dronare" },
  ESNZ: { name: "Åre Östersund Airport", icao: "ESNZ", operator: "Swedavia / LFV", permitUrl: "https://www.swedavia.se/om-swedavia/dronare/" },
  ESNU: { name: "Umeå Airport", icao: "ESNU", operator: "Swedavia / LFV", permitUrl: "https://www.swedavia.se/om-swedavia/dronare/" },
  ESPA: { name: "Luleå Kallax Airport", icao: "ESPA", operator: "Swedavia / Försvarsmakten", permitUrl: "https://www.swedavia.se/om-swedavia/dronare/" },
  ESNQ: { name: "Kiruna Airport", icao: "ESNQ", operator: "Swedavia / LFV", permitUrl: "https://www.swedavia.se/om-swedavia/dronare/" },
  ESSV: { name: "Visby Airport", icao: "ESSV", operator: "Swedavia / LFV", permitUrl: "https://www.swedavia.se/om-swedavia/dronare/" },
  ESDF: { name: "Ronneby Airport", icao: "ESDF", operator: "Swedavia / Försvarsmakten", permitUrl: "https://www.swedavia.se/om-swedavia/dronare/" },
  ESNX: { name: "Arvidsjaur flygplats", icao: "ESNX", operator: "Arvidsjaur flygplats", permitUrl: "https://www.lfv.se/dronare" },
  ESNL: { name: "Lycksele flygplats", icao: "ESNL", operator: "Lycksele flygplats", permitUrl: "https://www.lfv.se/dronare" },
  ESNG: { name: "Gällivare Lapland Airport", icao: "ESNG", operator: "Gällivare flygplats", permitUrl: "https://www.lfv.se/dronare" },
};

function matchAirport(name: string, props: Record<string, unknown>) {
  const pIcao = String(props.POSITIONIN || props.POSITIONINDICATOR || "").toUpperCase().trim();
  if (pIcao && AIRPORTS[pIcao]) return AIRPORTS[pIcao];

  const upper = name.toUpperCase();
  for (const [icao, info] of Object.entries(AIRPORTS)) {
    if (upper.includes(icao)) return info;
    const coreName = info.name.toUpperCase().replace(/\s+(AIRPORT|FLYGAPLATS|CITY AIRPORT).*$/, "");
    if (upper.includes(coreName)) return info;
  }

  // Vanliga flygplatsnamn som kan matcha
  if (upper.includes("ÄNGELHOLM")) return AIRPORTS.ESTA;
  if (upper.includes("STURUP") || upper.includes("MALMÖ")) return AIRPORTS.ESMS;
  if (upper.includes("ARLANDA")) return AIRPORTS.ESSA;
  if (upper.includes("BROMMA")) return AIRPORTS.ESSB;
  if (upper.includes("LANDVETTER")) return AIRPORTS.ESGG;
  if (upper.includes("KRISTIANSTAD")) return AIRPORTS.ESMK;
  if (upper.includes("HALMSTAD")) return AIRPORTS.ESMT;

  return null;
}

export function getAreaDetails(hit: AreaHit): AreaDetails {
  const layer = hit.layer;
  const props = hit.props || {};
  const isProtectedNature = layer === "NR" || layer === "NP" || layer === "N2000" || /naturreservat|nationalpark|landskapsbild|naturvård/i.test(hit.layerLabel);
  const isPermitRequired = hit.severity === "permission";

  let title = hit.name;
  let typeLabel = hit.layerLabel || layer;
  let severityLabel = hit.severity === "permission" ? "Tillstånd krävs" : hit.severity === "caution" ? "Försiktighet" : "Info";
  let badgeClass = hit.severity === "permission" ? "b-danger" : hit.severity === "caution" ? "b-warn" : "b-info";

  let whyProtected = "";
  const howToComply: string[] = [];
  let permitUrl: string | null = null;
  let permitLabel = "Sök tillstånd ↗";
  let permitAuthority = "";
  let infoUrl: string | null = null;
  let infoLabel = "Läs mer ↗";
  const links: { title: string; url: string; description?: string }[] = [];
  const metadata: { label: string; value: string }[] = [];

  // Grundläggande metadata
  if (hit.lower || hit.upper) {
    metadata.push({ label: "Höjdgränser", value: `${hit.lower || "GND"} – ${hit.upper || "Obegränsad"}` });
  }
  if (hit.validity) {
    metadata.push({ label: "Giltighetstid", value: hit.validity });
  }

  // ---------- 1. RWY5K (5 km-zon runt bana) ----------
  if (layer === "RWY5K") {
    const airport = matchAirport(hit.name, props);
    permitAuthority = airport ? `${airport.name} (${airport.operator})` : "Flygplatsens flygtrafikledning (TWR/ATS)";
    permitUrl = airport?.permitUrl || "https://www.lfv.se/dronare";
    permitLabel = airport ? `Sök tillstånd för ${airport.name} ↗` : "Sök tillstånd hos flygtrafikledningen / LFV ↗";
    infoUrl = "https://www.transportstyrelsen.se/dronare";
    infoLabel = "Transportstyrelsens drönarregler ↗";

    whyProtected =
      "5 km-zonen runt en start- och landningsbana är upprättad för flygsäkerheten. Flygplan och helikoptrar flyger på mycket låg höjd under start, inflygning och landning. En kollision med en drönare i dessa faser kan leda till en allvarlig flygolycka.";

    howToComply.push(
      "Inom 5 km från banan råder generellt förbud mot flygning i öppen kategori utan särskilt tillstånd från flygtrafikledningen (om inte en tillåtande geografisk UAS-zon finns på platsen).",
      `Kontakta kontrolltornet (TWR) i god tid innan flygningen för att ansöka om tillstånd och klarering.`,
      "Följ alltid flygtrafikledningens anvisningar och håll ständig uppsikt samt beredskap på telefon/radio.",
      "Landa omedelbart om bemannad flygtrafik eller ambulanshelikopter närmar sig."
    );

    links.push(
      { title: "LFV Flyga drönare & tillstånd", url: "https://www.lfv.se/dronare", description: "Instruktioner och kontaktuppgifter för flygning i kontrollerat luftrum och vid flygplatser." },
      { title: "LFV Drönarkartan", url: "https://daim.lfv.se/echarts/dronechart/", description: "Officiell karta över Sveriges luftrum och UAS-zoner." },
      { title: "Transportstyrelsen Drönare", url: "https://www.transportstyrelsen.se/dronare", description: "Övergripande regler, behörigheter och lagkrav." }
    );

    if (airport) {
      metadata.push({ label: "Flygplats", value: airport.name });
      metadata.push({ label: "ICAO-kod", value: airport.icao });
      metadata.push({ label: "Operatör/Tjänst", value: airport.operator });
    }
  }

  // ---------- 2. CTR (Kontrollzon) ----------
  else if (layer === "CTR") {
    const airport = matchAirport(hit.name, props);
    permitAuthority = airport ? `${airport.name} (Flygtrafikledningen)` : "Flygtrafikledningen (LFV / ACR)";
    permitUrl = airport?.permitUrl || "https://www.lfv.se/dronare";
    permitLabel = "Sök tillstånd hos flygtrafikledningen / LFV ↗";
    infoUrl = "https://daim.lfv.se/echarts/dronechart/";
    infoLabel = "LFV Drönarkartan ↗";

    whyProtected =
      "Kontrollzon (CTR) är kontrollerat luftrum runt flygplatser där bemannad flygtrafik leds av flygtrafikledningen för att säkerställa separation och flygsäkerhet.";

    howToComply.push(
      "Utanför 5 km-zonerna från banan får du i öppen kategori flyga upp till max 50 m över marken utan tillstånd.",
      "Om du vill flyga högre än 50 m (upp till normala 120 m) krävs tillstånd och klarering från kontrolltornet (TWR).",
      "Inom 5 km från banan krävs alltid tillstånd oavsett flyghöjd.",
      "Håll god uppsikt efter bemannad flygtrafik och väj alltid."
    );

    links.push(
      { title: "LFV Flyga drönare", url: "https://www.lfv.se/dronare", description: "Klarering och tillstånd för flygning i kontrollzon." },
      { title: "LFV Drönarkartan", url: "https://daim.lfv.se/echarts/dronechart/", description: "Interaktiv luftrumskarta med zonbegränsningar." },
      { title: "Transportstyrelsen Drönare", url: "https://www.transportstyrelsen.se/dronare", description: "Regler för flygning i öppen och specifik kategori." }
    );

    if (airport) {
      metadata.push({ label: "Flygplats", value: airport.name });
      metadata.push({ label: "ICAO-kod", value: airport.icao });
    }
  }

  // ---------- 3. NR & NP (Naturreservat, Nationalpark, Landskapsbildsskydd) ----------
  else if (layer === "NR" || layer === "NP") {
    const isNp = layer === "NP" || /nationalpark/i.test(String(props.kind || hit.name));
    const nvrid = String(props.nvrid || props.NVRID || "").trim();
    const countySlug = getCountySlug(props.county || props.LAN);
    const authority = String(props.authority || props.FORVALTARE || "").trim();
    const municipality = String(props.municipality || props.KOMMUN || "").trim();
    const county = String(props.county || props.LAN || "").trim();

    permitAuthority = authority || (county ? `Länsstyrelsen i ${county}` : "Länsstyrelsen");
    permitUrl = countySlug ? `https://www.lansstyrelsen.se/${countySlug}` : "https://www.lansstyrelsen.se/";
    permitLabel = isNp ? "Sök dispens hos Nationalparksförvaltningen / Länsstyrelsen ↗" : "Ansök om dispens hos Länsstyrelsen ↗";

    if (nvrid) {
      infoUrl = `https://skyddadnatur.naturvardsverket.se/sknat/?nvrid=${nvrid}`;
      infoLabel = "Föreskrifter & karta hos Naturvårdsverket (Skyddad Natur) ↗";
    } else {
      infoUrl = isNp ? "https://www.sverigesnationalparker.se/" : "https://skyddadnatur.naturvardsverket.se/";
      infoLabel = isNp ? "Sveriges Nationalparker ↗" : "Naturvårdsverket Skyddad Natur ↗";
    }

    if (isNp) {
      whyProtected =
        "Nationalparker representerar Sveriges finaste och mest skyddsvärda naturarv. Skyddet är det starkaste i svensk lag och syftar till att bevara ett större sammanhängande område i dess naturliga tillstånd.";
      howToComply.push(
        "I nästan alla svenska nationalparker är det enligt föreskrifterna STRIKT FÖRBJUDET att starta, landa eller flyga drönare utan skriftlig dispens.",
        "Förbudet finns för att förhindra stress och störning av vilda djur och häckande fåglar, samt för att skydda tystnaden och naturupplevelsen för besökare.",
        "Att flyga i strid med föreskrifterna är straffbart enligt Miljöbalken (7 kap.) och kan leda till böter eller åtal.",
        "Dispens beviljas restriktivt (oftast endast för forskning, naturvård eller samhällsnytta, sällan för nöjesflygning)."
      );
    } else {
      whyProtected =
        "Området är skyddat med stöd av Miljöbalken (7 kap.) för att bevara biologisk mångfald, värdefulla natur- och kustmiljöer, sällsynta arter, fågelliv, geologiska formationer eller unika landskapsbilder och friluftsliv.";
      howToComply.push(
        "Många naturreservat och landskapsbildsskyddsområden har särskilda föreskrifter som FÖRBJUDER start, landning eller flygning med obemannade luftfartyg (drönare) eller störande motordrivna anordningar.",
        "Att flyga i strid med reservatsföreskrifterna är ett lagbrott enligt Miljöbalken och kan medföra böter.",
        "Klicka på länken till Naturvårdsverket (Skyddad Natur) nedan för att läsa de exakta föreskrifterna och beslutet för just detta område.",
        "Om drönarförbud råder måste du i god tid ansöka om dispens hos Länsstyrelsen (eller kommunen vid kommunalt reservat) innan du flyger.",
        "Även om drönare inte uttryckligen nämns är det alltid förbjudet att störa vilda djur och fåglar (särskilt under häckningsperioden mars–augusti)."
      );
    }

    if (nvrid) {
      links.push({
        title: "Skyddad Natur (Naturvårdsverket)",
        url: `https://skyddadnatur.naturvardsverket.se/sknat/?nvrid=${nvrid}`,
        description: "Officiella föreskrifter, syfte, bevarandeplan och kartgränser för detta reservat.",
      });
    }
    links.push({
      title: county ? `Länsstyrelsen i ${county}` : "Länsstyrelsen",
      url: permitUrl,
      description: "Här ansöker du om dispens från reservatsföreskrifter eller kontaktar naturvårdsförvaltaren.",
    });
    if (isNp) {
      links.push({
        title: "Sveriges Nationalparker",
        url: "https://www.sverigesnationalparker.se/",
        description: "Information och kontaktuppgifter för Sveriges nationalparker.",
      });
    }

    if (props.kind || props.SKYDDSTYP) metadata.push({ label: "Skyddsform", value: String(props.kind || props.SKYDDSTYP) });
    if (authority) metadata.push({ label: "Förvaltare", value: authority });
    if (municipality) metadata.push({ label: "Kommun", value: municipality });
    if (county) metadata.push({ label: "Län", value: county });
    if (nvrid) metadata.push({ label: "NVR-ID", value: nvrid });
    if (props.status || props.BESLUTSSTATUS) metadata.push({ label: "Status", value: String(props.status || props.BESLUTSSTATUS) });
    if (props.iucn || props.IUCNKATEGORI) metadata.push({ label: "IUCN-kategori", value: String(props.iucn || props.IUCNKATEGORI) });
  }

  // ---------- 4. N2000 (Natura 2000) ----------
  else if (layer === "N2000") {
    permitAuthority = "Länsstyrelsen";
    permitUrl = "https://www.lansstyrelsen.se/";
    permitLabel = "Länsstyrelsen ↗";
    infoUrl = "https://skyddadnatur.naturvardsverket.se/";
    infoLabel = "Naturvårdsverket ↗";

    whyProtected =
      "Natura 2000 är Europeiska unionens nätverk av skyddade områden för att säkerställa överlevnaden för Europas mest värdefulla och hotade arter och livsmiljöer.";

    howToComply.push(
      "Undvik störning av känsliga arter och fåglar, särskilt under häckningstid (mars–augusti).",
      "Om verksamheten riskerar att väsentligt påverka miljön krävs tillstånd eller anmälan om samråd enligt Miljöbalken (12 kap. 6 §) hos Länsstyrelsen.",
      "Håll säkerhetsavstånd till fågelkolonier, sälar och betesdjur."
    );

    links.push(
      { title: "Naturvårdsverket: Natura 2000", url: "https://www.naturvardsverket.se/amnesomraden/skyddad-natur/olika-former-av-naturskydd/natura-2000/", description: "Information om bevarandemål och regler." },
      { title: "Länsstyrelsen", url: "https://www.lansstyrelsen.se/", description: "Tillsynsmyndighet för Natura 2000." }
    );
  }

  // ---------- 5. RSTA (Restriktionsområden, R-områden) ----------
  else if (layer === "RSTA") {
    permitAuthority = "Transportstyrelsen / Försvarsmakten";
    permitUrl = "https://www.transportstyrelsen.se/dronare";
    permitLabel = "Transportstyrelsen Drönare ↗";
    infoUrl = "https://aro.lfv.se/";
    infoLabel = "LFV AROWeb (AIP) ↗";

    const comment = String(props.COMMENT_2 || props.comment || "");
    whyProtected =
      comment ||
      "Restriktionsområde (R-område) upprättat av regeringen eller Transportstyrelsen av hänsyn till allmän ordning, säkerhet eller militär verksamhet (t.ex. skjutfält, kärnkraftverk, fågelskydd, fängelser).";

    howToComply.push(
      "Flygning i restriktionsområde är förbjuden utan särskilt tillstånd från den myndighet som råder över området.",
      "Kontrollera gällande villkor i AIP / AIP SUP och ansök om tillstånd hos behörig myndighet i god tid.",
      "Militära restriktionsområden kan innebära skarpskjutning eller lågflygande stridsflyg."
    );

    links.push(
      { title: "Transportstyrelsen", url: "https://www.transportstyrelsen.se/dronare", description: "Information om restriktionsområden och dispensansökningar." },
      { title: "LFV AROWeb", url: "https://aro.lfv.se/", description: "Svensk AIP med fullständiga villkor för restriktionsområden." }
    );
  }

  // ---------- 6. UAS (Geografiska UAS-zoner) ----------
  else if (layer === "UAS") {
    permitAuthority = "Transportstyrelsen / Zonförvaltaren";
    permitUrl = "https://daim.lfv.se/echarts/dronechart/";
    permitLabel = "LFV Drönarkartan ↗";
    infoUrl = "https://www.transportstyrelsen.se/dronare";
    infoLabel = "Transportstyrelsen ↗";

    const reason = String(props.reason || props.message || "");
    whyProtected =
      reason || "Geografisk UAS-zon inrättad enligt EU-förordning 2019/947 för att underlätta, begränsa eller utesluta drönarflygning.";

    howToComply.push(
      "Läs zonens särskilda villkor noggrant.",
      hit.severity === "permission"
        ? "Denna zon kräver tillstånd eller är förbjuden för civil drönarflygning. Tillstånd måste sökas hos zonansvarig innan start."
        : "Följ zonens begränsningar gällande maxhöjd och utrustningskrav."
    );

    links.push({ title: "LFV Drönarkartan", url: "https://daim.lfv.se/echarts/dronechart/", description: "Information om zonvillkor och geometri." });
  }

  // ---------- 7. SUP / NOTAM ----------
  else if (layer === "SUP" || layer === "NOTAM") {
    permitAuthority = "LFV / Luftfartskontoret";
    permitUrl = "https://aro.lfv.se/";
    permitLabel = "LFV AROWeb ↗";
    infoUrl = "https://aro.lfv.se/";
    infoLabel = "LFV AROWeb ↗";

    whyProtected = hit.rule || "Tillfälligt område eller varning utfärdad via AIP SUP eller NOTAM för specifik aktivitet.";
    howToComply.push(
      "Kontrollera tidpunkter och höjder för området.",
      "Om området är aktivt under ditt flygfönster måste du följa angivna restriktioner eller invänta att aktiviteten upphör."
    );

    links.push({ title: "LFV AROWeb", url: "https://aro.lfv.se/", description: "Aktuella NOTAM och AIP SUP." });
  }

  // ---------- 8. TIZ / ATZ / HKP1K ----------
  else {
    permitAuthority = "Flygplatschefen / Flygtrafikledningen";
    permitUrl = "https://www.lfv.se/dronare";
    permitLabel = "LFV Drönare ↗";
    infoUrl = "https://www.transportstyrelsen.se/dronare";
    infoLabel = "Transportstyrelsen ↗";

    whyProtected = hit.rule || "Trafikzon eller helikopterplats där bemannad luftfart förekommer på låg höjd.";
    howToComply.push(
      "Håll låg flyghöjd och god uppsikt i alla riktningar.",
      "Vid helikopterplats: Var beredd att omedelbart avbryta flygningen och landa vid helikopterljud – ambulanshelikoptrar flyger akut utan förvarning."
    );

    links.push(
      { title: "LFV Drönare", url: "https://www.lfv.se/dronare", description: "Allmän information om flygning nära flygplatser och helikopterplatser." },
      { title: "Transportstyrelsen", url: "https://www.transportstyrelsen.se/dronare", description: "Drönarregler i Sverige." }
    );
  }

  return {
    title,
    typeLabel,
    severity: hit.severity,
    severityLabel,
    badgeClass,
    isPermitRequired,
    isProtectedNature,
    whyProtected,
    howToComply,
    permitUrl,
    permitLabel,
    permitAuthority,
    infoUrl,
    infoLabel,
    links,
    metadata,
  };
}
