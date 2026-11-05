import "server-only";
import { db } from "./db";
import { displayName } from "./auth";

export function orgMembers(orgId: string) {
  const rows = db
    .prepare(
      `SELECT id, first_name, last_name, email, role,
              (CASE WHEN photo IS NOT NULL AND photo != '' THEN ('/api/avatar/' || id) ELSE NULL END) AS photo,
              license_number, license_expiry, license_classes, disabled_at
       FROM users
       WHERE org_id = ? AND (disabled_at IS NULL OR disabled_at = '')
       ORDER BY first_name, email`
    )
    .all(orgId) as {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    photo: string | null;
    license_number: string | null;
    license_expiry: string | null;
    license_classes: string;
    disabled_at: string | null;
  }[];
  return rows.map((r) => ({ ...r, name: displayName(r) }));
}

/** Inaktiverade medlemmar – visas för administratörer så att de kan återaktiveras (#36). */
export function disabledMembers(orgId: string) {
  const rows = db
    .prepare(
      `SELECT id, first_name, last_name, email, role, disabled_at FROM users
       WHERE org_id = ? AND disabled_at IS NOT NULL AND disabled_at != ''
       ORDER BY disabled_at DESC`
    )
    .all(orgId) as { id: string; first_name: string; last_name: string; email: string; role: string; disabled_at: string }[];
  return rows.map((r) => ({ ...r, name: displayName(r) }));
}
