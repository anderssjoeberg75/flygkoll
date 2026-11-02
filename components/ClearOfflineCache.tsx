"use client";

import { useEffect } from "react";

/**
 * Tar bort offlinesparade sidor. Visas på inloggnings- och registreringssidan, dit man kommer efter
 * utloggning eller när sessionen gått ut, så att nästa person på enheten inte kan läsa dem (#26).
 */
export function ClearOfflineCache() {
  useEffect(() => {
    navigator.serviceWorker?.controller?.postMessage({ type: "clear" });
    if (!("caches" in window)) return;
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k === "flygkoll-v1" || k.startsWith("flygkoll-pages-")).map((k) => caches.delete(k))))
      .catch(() => undefined);
  }, []);
  return null;
}
