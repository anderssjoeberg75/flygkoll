import { requireUser, userPhotoUrl } from "@/lib/auth";
import { listDrones } from "@/lib/fleet";
import { StateForm } from "@/components/StateForm";
import { saveProfile, changePassword } from "./actions";

export default async function Settings() {
  const user = await requireUser();
  const drones = listDrones(user.org_id);
  const classes: string[] = JSON.parse(user.license_classes || "[]");
  const photo = userPhotoUrl(user);
  return (
    <>
      <div className="page-head"><div><h1>Inställningar</h1><p className="muted" style={{ margin: 0 }}>{user.email}</p></div></div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(260px,1fr)", alignItems: "start" }}>
        <StateForm action={saveProfile}>
          <h2>Profil</h2>
          <div className="row">
            {photo ? <img src={photo} alt="" width={56} height={56} style={{ borderRadius: "50%", objectFit: "cover" }} /> : (
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--accent-soft)", display: "grid", placeItems: "center", fontWeight: 700 }}>
                {(user.first_name || user.email)[0].toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1 }}><label>Profilbild (PNG/JPEG/WebP, max 400 kB)</label><input type="file" name="photo" accept="image/png,image/jpeg,image/webp,image/gif" /></div>
            {photo && <label className="row" style={{ fontWeight: 400 }}><input type="checkbox" name="remove_photo" /> Ta bort</label>}
          </div>
          <div className="grid g2">
            <div><label>Förnamn</label><input name="first_name" defaultValue={user.first_name} /></div>
            <div><label>Efternamn</label><input name="last_name" defaultValue={user.last_name} /></div>
          </div>
          <div className="grid g2">
            <div>
              <label>Standarddrönare</label>
              <select name="default_drone_id" defaultValue={user.default_drone_id ?? ""}>
                <option value="">– Ingen –</option>
                {drones.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label>Utseende</label>
              <select name="theme" defaultValue={user.theme}>
                <option value="system">Följ systemet</option>
                <option value="light">Ljust</option>
                <option value="dark">Mörkt</option>
              </select>
            </div>
          </div>
          <h2 style={{ marginTop: 10 }}>Drönarkort</h2>
          <div className="grid g2">
            <div><label>Kortnummer</label><input name="license_number" defaultValue={user.license_number ?? ""} placeholder="SWE-RP-…" /></div>
            <div><label>Giltigt till</label><input type="date" name="license_expiry" defaultValue={user.license_expiry ?? ""} /></div>
          </div>
          <div className="row">
            {["A1/A3", "A2", "STS-01", "STS-02"].map((c) => (
              <label key={c} className="row" style={{ fontWeight: 400, margin: 0 }}>
                <input type="checkbox" name={`lic_${c}`} defaultChecked={classes.includes(c)} /> {c}
              </label>
            ))}
          </div>
        </StateForm>
        <StateForm action={changePassword} submit="Byt lösenord">
          <h2>Lösenord</h2>
          <div><label>Nuvarande</label><input type="password" name="current" autoComplete="current-password" required /></div>
          <div><label>Nytt (minst 8 tecken)</label><input type="password" name="new" autoComplete="new-password" minLength={8} required /></div>
        </StateForm>
      </div>
    </>
  );
}
