"use client";

import { useEffect } from "react";
import { saveRun } from "@/app/(app)/checklists/actions";

const KEY = "flygkoll:pendingRuns";
type PendingRun = { checklistId: string; droneId: string | null; checked: number[]; briefingId: string | null };

function read(): PendingRun[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as PendingRun[];
  } catch {
    return [];
  }
}

function write(runs: PendingRun[]) {
  try {
    if (runs.length) localStorage.setItem(KEY, JSON.stringify(runs));
    else localStorage.removeItem(KEY);
  } catch {
    /* lagring blockerad */
  }
}

/** Lägger en checklistgenomgång i kö när den inte kunde skickas (t.ex. utan täckning i fält). */
export function queueRun(run: PendingRun) {
  write([...read(), run]);
}

/** Skickar köade checklistgenomgångar när webbläsaren är online. Monteras i appens layout. */
export function PendingRunsSync() {
  useEffect(() => {
    let busy = false;
    const flush = async () => {
      if (busy || !navigator.onLine) return;
      busy = true;
      const left: PendingRun[] = [];
      for (const r of read()) {
        try {
          await saveRun(r.checklistId, r.droneId, r.checked, r.briefingId);
        } catch {
          left.push(r);
        }
      }
      write(left);
      busy = false;
    };
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
  return null;
}
