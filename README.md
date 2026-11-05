# Flygkoll – Digitalt besluts- och uppdragsstöd för drönarpiloter

Flygkoll är en webbapplikation utvecklad för drönarpiloter, företag och organisationer som utför drönaroperationer i Sverige. Systemet underlättar planering, säkerhet och regelefterlevnad inför varje flygning samt samlar all operativ administration på ett ställe.

### Vad är sidan till för?

Inför varje flygning med drönare kräver Transportstyrelsens och EASA:s regelverk att piloten kontrollerar luftrum, väderförhållanden, tillfälliga restriktioner och lokala föreskrifter. Att manuellt samla in underlag från olika myndigheter tar tid och ökar risken att restriktioner förbises.

Flygkoll sammanställer och automatiserar detta på några sekunder:
- **Automatisk flygbriefing**: Ange operationsområde och radie – Flygkoll hämtar och analyserar samtidigt officiella data från LFV, SMHI och Naturvårdsverket och ger en tydlig status (**OK**, **Försiktighet** eller **Tillstånd krävs**).
- **Vägledning och föreskrifter**: Visar direkt vad som gäller om området berörs av kontrollzoner (CTR), flygplatser, helikopterplatser, restriktionsområden, NOTAM eller skyddade naturområden (naturreservat och nationalparker), inklusive direktlänkar för tillståndsansökan eller dispens.
- **Väder- och säkerhetsunderlag**: Vindprofiler på 10, 80 och 120 m, byvindar, molnbas, sikt, officiella SMHI-varningar, sol- och skymningstider, Kp-index (solaktivitet) samt GPS-störningsaktivitet.
- **Operativ administration**: Digital loggbok för piloter och besättning, hantering av drönarflotta med serviceintervall och underhållslogg, anpassningsbara checklistor före/efter flygning samt organisationsstöd med medlemmar och standardzoner.

## Kom igång

Kräver Node.js 20+ (testat med 22).

```bash
npm install
npm run build
TZ=Europe/Stockholm npm start          # http://localhost:3000
```

Första kontot som registreras blir administratör för organisationen.
Fler användare kan bjudas in under **Organisation** eller registrera sig direkt via registreringssidan
(öppen registrering kan vid behov stängas med miljövariabeln `FLYGKOLL_OPEN_SIGNUP=0`).

All data ligger i SQLite-filen `data/flygkoll.db` (ändra med `FLYGKOLL_DB=/sökväg/fil.db`).
Långsamma kartdata från Naturvårdsverket cachas i `data/cache/` i 7 dagar.

### Säkerhetskopiering (SQLite WAL-läge)

Eftersom databasen körs i WAL-läge (`PRAGMA journal_mode = WAL`) kan en enkel filkopiering av `flygkoll.db` leda till inkonsekvent data om en skrivning pågår. Använd därför SQLites inbyggda säkra online-backup:

```bash
sqlite3 data/flygkoll.db ".backup 'data/flygkoll-backup-$(date +%F).db'"
```

Alternativt kan verktyg som [Litestream](https://litestream.io/) användas för kontinuerlig automatisk replikering till S3/molnlagring.

### Köra på servern (Ubuntu, systemd)

```ini
# /etc/systemd/system/flygkoll.service
[Unit]
Description=Flygkoll
After=network.target

[Service]
WorkingDirectory=/opt/flygkoll
Environment=NODE_ENV=production TZ=Europe/Stockholm PORT=3000 FLYGKOLL_TRUST_PROXY=1
ExecStart=/usr/bin/npm start
Restart=on-failure
User=flygkoll

[Install]
WantedBy=multi-user.target
```

Kör bakom en reverse proxy med HTTPS (Caddy/nginx). Sessionskakan sätts som `Secure` i produktion;
kör du utan HTTPS på ditt LAN, sätt `FLYGKOLL_INSECURE_COOKIE=1`.

Felaktiga inloggningar spärras per e-post (30 försök/15 min, oavsett adress) och – när klientens adress är känd –
även per e-post och IP (10/15 min) och per IP (50/15 min). Spärrarna lagras i databasen och gäller även efter omstart.

Klientens adress läses från `X-Forwarded-For` **bara** om du anger att appen står bakom en betrodd reverse proxy:

```bash
FLYGKOLL_TRUST_PROXY=1   # antal proxies framför appen (oftast 1)
```

Utan variabeln ignoreras `X-Forwarded-For`/`X-Real-IP` helt, eftersom vem som helst kan skicka dem. Då gäller bara
spärren per e-post och en gemensam gräns för nya registreringar. Med variabeln används den adress som den betrodda
proxyn själv har lagt till (längst till höger), så headern måste sättas av proxyn: Caddy gör det automatiskt; i nginx
`proxy_set_header X-Forwarded-For $remote_addr;` (skriver över) eller `$proxy_add_x_forwarded_for` (lägger till sist).
Exponera inte appens port direkt mot internet när `FLYGKOLL_TRUST_PROXY` är satt.

Säkerhet i korthet: lösenord måste vara minst 10 tecken och inte vara vanliga eller innehålla e-postadressen.
Appen skickar en strikt Content-Security-Policy och laddar inga resurser från tredje part förutom kartplattor –
typsnitten följer med appen. Offlinesparade sidor i webbläsaren raderas vid utloggning.

## Datakällor (hämtas server-side, parallellt)

| Data | Källa | Endpoint |
|---|---|---|
| CTR, TIZ, ATZ, R-/D-områden | LFV DAIM | `daim.lfv.se/geoserver/wfs` – lager `mais:CTR`, `mais:TIZ`, `mais:ATZ`, `mais:RSTA`, `mais:DNGA` |
| 5 km-zoner, helikopterplatser | LFV DAIM | `DAIM_TOPO:RWY5K`, `DAIM_TOPO:HKP1K` |
| Tillfälliga områden (AIP SUP) | LFV DAIM | `DAIM_TOPO:SUP` filtrerat på tid |
| NOTAM | LFV DAIM | `dynais:NOTAM` filtrerat på tid, cirklar från koordinat + radie |
| Geografiska UAS-zoner (ED-318) | LFV Drönarkartan | `daim.lfv.se/echarts/dronechart/data/uas_zones_ED318.json` |
| Prognos per timme | SMHI | `opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/...` |
| Vädervarningar | SMHI | `opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json` |
| Vindprofil 10/80/120 m | Open-Meteo | `api.open-meteo.com/v1/forecast` |
| Nationalparker, naturreservat, NVO | Naturvårdsverket | `geodata.naturvardsverket.se/naturvardsregistret/wfs` |
| Natura 2000 | Naturvårdsverket | `geodata.naturvardsverket.se/n2000/wfs` |
| Kp-index | NOAA SWPC | `services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json` |
| GPS-störning | GPSJam (ADS-B) | `gpsjam.org/data/<datum>-h3_4.csv` |
| Sol upp/ned | lokal beräkning | `suncalc` |
| Platssökning | OpenStreetMap Nominatim | `nominatim.openstreetmap.org` |

LFV-data är öppet tillgänglig men licensvillkoren för kommersiell användning kräver avtal med LFV.
För eget bruk är det samma data som Drönarkartan visar.

## Funktioner

- **Briefing**: plats via karta/sök/position/standardzon, radie 100 m–10 km, start + flygfönster, drönare.
  Status (OK / Försiktighet / Tillstånd krävs), max flyghöjd, vind mot egna gul/röd-gränser, molnbas,
  sol, driftmeddelanden, SMHI-varningar, berörda områden med regler, NOTAM, vindprofil, 24 h prognos,
  datakällstatus, KML-export, PDF (utskrift), dela inom org, uppdatera/ny nu, spara som standardzon.
- **Luftrumskarta** över hela Sverige.
- **Loggbok**: manuellt, med besättning (observatör, uppdragsledare, sensoroperatör m.fl.),
  CSV-import/export, import av flygloggar (CSV från Airdata, DJI Flight Log Viewer, FlightReader, Litchi)
  med flygspår, höjd- och batterigraf.
- **Flotta**: drönare med klass/MTOM, serviceintervall i dagar och/eller flygtimmar, arbetstyper,
  underhållshistorik, flygningar per luftfartyg.
- **Checklistor**: före/efter flygning och daglig kontroll, redigerbara, drönarspecifika, sparade genomgångar.
- **Organisation**: medlemmar och roller, logotyp, vindgränser, standardzoner, statistik.
- **Regelguide** (öppen/specifik kategori) och **VLOS/BVLOS-kalkylator**.

## Inte med (än)

- Direktläsning av DJI:s krypterade `.txt`-loggar via USB – kräver DJI:s nyckel-API. Konvertera till CSV först.
- Skyddsobjekt (sekretessbelagda, finns inte som öppen data).
- SORA/STS-arbetsflöden.

Briefingen är ett beslutsstöd och ersätter inte officiella källor eller tillstånd.
