import { requireUser, displayName, orgLogoUrl, canWrite } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { Logo } from "@/components/Logo";
import { logout } from "../(auth)/actions";
import { PendingRunsSync } from "@/components/PendingRunsSync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const logo = orgLogoUrl(user);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {logo ? <img src={logo} alt="" width={26} height={26} style={{ borderRadius: 6, objectFit: "cover" }} /> : <Logo />}
          Flygkoll
        </div>
        <Nav isAdmin={user.role === "admin"} />
        <div className="user">
          <div style={{ color: "#fff", fontWeight: 600 }}>{displayName(user)}</div>
          <div className="small" style={{ opacity: 0.7 }}>{user.org_name} · {user.role}</div>
          <form action={logout} style={{ marginTop: 8 }}>
            <button className="btn secondary small" style={{ color: "var(--sidebar-text)", borderColor: "rgba(255,255,255,.15)" }}>Logga ut</button>
          </form>
        </div>
      </aside>
      <main className="main">
        {!canWrite(user) && (
          <div className="notice n-info no-print" style={{ marginBottom: 16 }}>
            <strong>Läsbehörighet</strong>Du kan se organisationens data men inte ändra den. Be en administratör om pilotbehörighet.
          </div>
        )}
        {children}
      </main>
      <PendingRunsSync />
    </div>
  );
}
