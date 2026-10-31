# Flygkoll – egen flygbriefing för drönarpiloter

Självhostad webbapp med samma funktioner som DroneBrief: briefing på sekunder med luftrum, NOTAM,
UAS-zoner, väder, skyddade områden, Kp-index och GPS-störning – plus loggbok, flotta, checklistor och organisation.

## Kom igång

Kräver Node.js 20+ (testat med 22).

```bash
npm install
npm run build
TZ=Europe/Stockholm npm start          # http://localhost:3000
```

Första gången du öppnar sidan skapar du ett konto – det blir administratör för organisationen.
Därefter är registreringen stängd; lägg till fler användare under **Organisation**
(eller sätt `FLYGKOLL_OPEN_SIGNUP=1` för öppen registrering).

All data ligger i SQLite-filen `data/flygkoll.db` (ändra med `FLYGKOLL_DB=/sökväg/fil.db`).
Långsamma kartdata från Naturvårdsverket cachas i `data/cache/` i 7 dagar.

### Köra på servern (Ubuntu, systemd)

```ini
# /etc/systemd/system/flygkoll.service
[Unit]
Description=Flygkoll
After=network.target

[Service]
WorkingDirectory=/opt/flygkoll
Environment=NODE_ENV=production TZ=Europe/Stockholm PORT=3000
ExecStart=/usr/bin/npm start
Restart=on-failure
User=flygkoll

[Install]
WantedBy=multi-user.target
```

Kör bakom en reverse proxy med HTTPS (Caddy/nginx). Sessionskakan sätts som `Secure` i produktion;
kör du utan HTTPS på ditt LAN, sätt `FLYGKOLL_INSECURE_COOKIE=1`.

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
