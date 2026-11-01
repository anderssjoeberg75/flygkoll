"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeBriefingNature } from "@/app/(app)/briefings/actions";

/** Pollar tills Naturvårdsverkets data är hämtad och laddar sedan om briefingen. */
export function NatureRefresher({ briefingId }: { briefingId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"waiting" | "gave-up">("waiting");

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      attempt++;
      try {
        const { done } = await completeBriefingNature(briefingId);
        if (cancelled) return;
        if (done) return router.refresh();
      } catch {
        /* försök igen */
      }
      if (attempt >= 20) return setState("gave-up");
      timer = setTimeout(tick, 10_000);
    };
    timer = setTimeout(tick, 5_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [briefingId, router]);

  return (
    <div className="notice n-info no-print" role="status" style={{ marginBottom: 16 }}>
      <strong>Skyddade områden laddas</strong>
      {state === "waiting"
        ? "Naturvårdsverkets data hämtas i bakgrunden. Sidan uppdateras automatiskt när den är klar."
        : "Naturvårdsverket svarar inte just nu. Försök med Uppdatera om en stund."}
    </div>
  );
}
