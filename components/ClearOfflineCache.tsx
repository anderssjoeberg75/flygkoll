"use client";

import { useEffect } from "react";

/** Tar bort offlinesparade sidor (visas på inloggningssidan, alltså efter utloggning). */
export function ClearOfflineCache() {
  useEffect(() => {
    if (!("caches" in window)) return;
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("flygkoll-pages-")).map((k) => caches.delete(k))))
      .catch(() => undefined);
  }, []);
  return null;
}
