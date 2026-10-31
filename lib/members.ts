import "server-only";
import { db } from "./db";
import { displayName } from "./auth";

export function orgMembers(orgId: string) {
  const rows = db.prepare("SELECT id, first_name, last_name, email, role, photo FROM users WHERE org_id = ? ORDER BY first_name, email").all(orgId) as {
    id: string; first_name: string; last_name: string; email: string; role: string; photo: string | null;
  }[];
  return rows.map((r) => ({ ...r, name: displayName(r) }));
}
