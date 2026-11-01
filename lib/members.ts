import "server-only";
import { db } from "./db";
import { displayName } from "./auth";

export type Member = {
  id: string; first_name: string; last_name: string; email: string; role: string; has_photo: number;
  disabled_at: string | null; license_expiry: string | null; license_classes: string; name: string;
};

/** Medlemmar i organisationen. Inaktiverade tas bara med om includeDisabled är satt. */
export function orgMembers(orgId: string, includeDisabled = false): Member[] {
  const rows = db
    .prepare(
      `SELECT id, first_name, last_name, email, role, (photo IS NOT NULL) AS has_photo, disabled_at, license_expiry, license_classes
       FROM users WHERE org_id = ? ${includeDisabled ? "" : "AND disabled_at IS NULL"} ORDER BY disabled_at IS NOT NULL, first_name, email`
    )
    .all(orgId) as Omit<Member, "name">[];
  return rows.map((r) => ({ ...r, name: displayName(r) }));
}
