"use client";

import { useState, useEffect } from "react";
import type { AreaHit } from "@/lib/briefing";
import { SEVERITY_LABEL } from "@/lib/format";
import { getAreaDetails, type AreaDetails } from "@/lib/area-info";

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 4 }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="14" x2="21" y2="3"></line>
    </svg>
  );
}

export function AffectedAreasTable({ hits }: { hits: AreaHit[] }) {
  const [selectedHit, setSelectedHit] = useState<AreaHit | null>(null);

  // Stäng med ESC-tangenten
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedHit(null);
    }
    if (selectedHit) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [selectedHit]);

  const permission = hits.filter((h) => h.severity !== "info");
  const info = hits.filter((h) => h.severity === "info");

  const details: AreaDetails | null = selectedHit ? getAreaDetails(selectedHit) : null;

  function showOnMap(h: AreaHit) {
    window.dispatchEvent(
      new CustomEvent("flygkoll:highlight-area", {
        detail: { name: h.name, layer: h.layer },
      })
    );
    const el = document.getElementById("briefing-map");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <>
      {permission.length === 0 ? (
        <div className="notice n-info">
          <strong>Inga särskilda områden</strong>
          Operationsområdet överlappar inga restriktions-, kontroll- eller skyddsområden i datakällorna.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="affected-areas-table">
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Område</th>
                <th>Typ</th>
                <th>Status</th>
                <th>Höjd</th>
                <th style={{ minWidth: 260 }}>Vad gäller</th>
                <th style={{ width: 90, textAlign: "right" }}>Info</th>
              </tr>
            </thead>
            <tbody>
              {permission.map((h, i) => {
                const det = getAreaDetails(h);
                const isProtectedText = /skyddat område/i.test(h.rule);
                const isNpText = /nationalpark/i.test(h.rule);

                return (
                  <tr key={i} className="area-row">
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelectedHit(h)}
                        className="area-title-btn"
                        title="Klicka för information om området och föreskrifter"
                      >
                        <strong>{h.name}</strong>
                      </button>
                      {h.validity && <div className="small muted">{h.validity}</div>}
                    </td>
                    <td className="small">{h.layerLabel}</td>
                    <td>
                      {h.severity === "permission" && det.permitUrl ? (
                        <a
                          href={det.permitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="badge b-danger link-badge"
                          title={`Klicka för att ansöka om tillstånd hos ${det.permitAuthority} (öppnas i ny flik)`}
                        >
                          Tillstånd krävs <ExternalIcon />
                        </a>
                      ) : (
                        <span className={`badge ${SEVERITY_LABEL[h.severity]?.cls ?? "b-warn"}`}>
                          {SEVERITY_LABEL[h.severity]?.text ?? h.severity}
                        </span>
                      )}
                    </td>
                    <td className="small" style={{ whiteSpace: "nowrap" }}>
                      {h.lower || h.upper ? `${h.lower || "GND"} – ${h.upper || "–"}` : "–"}
                    </td>
                    <td className="small">
                      <div className="rule-content">
                        {isProtectedText ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setSelectedHit(h)}
                              className="nature-link-btn"
                              title="Klicka här för att se varför området är skyddat och vad som gäller för drönarflygning"
                            >
                              🌿 Skyddat område ℹ
                            </button>
                            {" "}
                            {h.rule.replace(/^Skyddat område\s*[–-]?\s*/i, "")}
                          </>
                        ) : isNpText ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setSelectedHit(h)}
                              className="nature-link-btn np-badge"
                              title="Klicka här för att se nationalparkens regler"
                            >
                              🌲 Nationalpark ℹ
                            </button>
                            {" "}
                            {h.rule.replace(/^Nationalpark\s*[–-]?\s*/i, "")}
                          </>
                        ) : (
                          h.rule
                        )}
                      </div>

                      {/* Snabblänkar direkt i tabellen */}
                      <div className="row small" style={{ marginTop: 6, gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => showOnMap(h)}
                          className="sub-link"
                          style={{ color: "var(--accent)", fontWeight: 600 }}
                          title="Fokusera och markera detta område på kartan ovan"
                        >
                          🗺️ Visa på kartan
                        </button>
                        {det.infoUrl && (
                          <a
                            href={det.infoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sub-link"
                            title="Öppna officiella föreskrifter och karta hos Naturvårdsverket"
                          >
                            Föreskrifter & karta <ExternalIcon />
                          </a>
                        )}
                        {det.permitUrl && (
                          <a
                            href={det.permitUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="sub-link highlight"
                            title={`Ansök om tillstånd/dispens hos ${det.permitAuthority}`}
                          >
                            {h.severity === "permission" ? "Sök tillstånd" : "Sök dispens"} <ExternalIcon />
                          </a>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", verticalAlign: "middle" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedHit(h)}
                        className="btn secondary small info-btn"
                        title="Visa varför området är skyddat och hur du undviker fel"
                      >
                        ℹ Detaljer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {info.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>
            {info.length} informationsområden (Natura 2000, tillåtande zoner)
          </summary>
          <ul className="small" style={{ marginTop: 8, paddingLeft: 20 }}>
            {info.map((h, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => setSelectedHit(h)}
                  className="text-link"
                  style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", color: "var(--accent)" }}
                >
                  <strong>{h.name}</strong> – {h.layerLabel}
                </button>
                {h.rule && <span className="muted"> ({h.rule})</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Modal för fördjupad information och regler */}
      {selectedHit && details && (
        <div className="modal-backdrop" onClick={() => setSelectedHit(null)}>
          <div className="modal-box card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="spread modal-header" style={{ marginBottom: 16 }}>
              <div>
                <div className="row small muted" style={{ gap: 6, marginBottom: 4 }}>
                  <span className={`badge ${details.badgeClass}`}>{details.severityLabel}</span>
                  <span>{details.typeLabel}</span>
                </div>
                <h2 id="modal-title" style={{ margin: 0, fontSize: "1.3rem" }}>
                  {details.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHit(null)}
                className="btn secondary small close-btn"
                aria-label="Stäng dialog"
                style={{ fontSize: "1.1rem", padding: "4px 10px" }}
              >
                ✕
              </button>
            </div>

            <div className="stack" style={{ gap: 16 }}>
              {/* Varför är området skyddat */}
              <div className="info-section">
                <h3 className="section-title">
                  {details.isProtectedNature ? "🌿 Varför är området skyddat?" : "🛡️ Varför har området restriktioner?"}
                </h3>
                <p style={{ margin: 0, lineHeight: 1.6 }}>{details.whyProtected}</p>
              </div>

              {/* Vad gäller för drönarpiloten (för att inte göra fel) */}
              <div className="info-section caution-box">
                <h3 className="section-title" style={{ color: "var(--warn)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>⚠️</span> Vad gäller för drönarpiloten? (Så gör du rätt)
                </h3>
                <ul className="guidance-list">
                  {details.howToComply.map((rule, idx) => (
                    <li key={idx}>{rule}</li>
                  ))}
                </ul>
              </div>

              {/* Tillstånd & Länkar */}
              <div className="info-section">
                <h3 className="section-title">🔗 Tillstånd, dispens & officiell information</h3>
                <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      showOnMap(selectedHit);
                      setSelectedHit(null);
                    }}
                    className="btn secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    title="Zooma in och markera området på kartan"
                  >
                    🗺️ Visa på kartan
                  </button>
                  {details.permitUrl && (
                    <a
                      href={details.permitUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{ textDecoration: "none" }}
                    >
                      {details.permitLabel} <ExternalIcon />
                    </a>
                  )}
                  {details.infoUrl && (
                    <a
                      href={details.infoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn secondary"
                      style={{ textDecoration: "none" }}
                    >
                      {details.infoLabel} <ExternalIcon />
                    </a>
                  )}
                </div>

                {details.links.length > 0 && (
                  <div className="links-sublist" style={{ marginTop: 12 }}>
                    {details.links.map((link, idx) => (
                      <div key={idx} style={{ marginBottom: 6 }} className="small">
                        <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
                          {link.title} <ExternalIcon />
                        </a>
                        {link.description && <span className="muted"> – {link.description}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Metadata / Fakta */}
              {details.metadata.length > 0 && (
                <div className="info-section facts-box">
                  <h3 className="section-title" style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                    Fakta om området
                  </h3>
                  <div className="grid g2 small" style={{ gap: "6px 16px" }}>
                    {details.metadata.map((item, idx) => (
                      <div key={idx}>
                        <span className="muted">{item.label}: </span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="spread" style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <span className="small muted">
                Källa: {selectedHit.layer === "NR" || selectedHit.layer === "NP" || selectedHit.layer === "N2000" ? "Naturvårdsverket (Naturvårdsregistret)" : "LFV DAIM / Transportstyrelsen"}
              </span>
              <button type="button" onClick={() => setSelectedHit(null)} className="btn secondary small">
                Stäng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
