import "server-only";
import { db } from "./db";

/** SQL-villkor för briefingar användaren får se: egna eller delade inom organisationen (#33). */
export const VISIBLE_BRIEFING = "org_id = ? AND (user_id = ? OR shared = 1)";

/**
 * Hämtar en briefing om användaren får se den – annars undefined. Används överallt där ett
 * briefing-id kommer utifrån (formulär, länkar, sparade kopplingar) så att privata briefingar
 * (shared = 0) inte läcker till andra i organisationen.
 */
export function getAccessibleBriefing<T = { id: string }>(user: { id: string; org_id: string }, id: string | null | undefined, cols = "id"): T | undefined {
  if (!id) return undefined;
  return db.prepare(`SELECT ${cols} FROM briefings WHERE id = ? AND ${VISIBLE_BRIEFING}`).get(id, user.org_id, user.id) as T | undefined;
}
