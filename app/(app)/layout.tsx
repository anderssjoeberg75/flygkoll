import { requireUser, displayName } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { Logo } from "@/components/Logo";
import { logout } from "../(auth)/actions";

const ROLE: Record<string, string> = { admin: "Administratör", pilot: "Pilot", viewer: "Läsare" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          {user.logo_url ? <img src={user.logo_url} alt="" width={30} height={30} style={{ borderRadius: 8, objectFit: "cover" }} /> : <Logo />}
          Flygkoll
        </div>
        <Nav isAdmin={user.role === "admin"} />
        <div className="user">
          <div className="name">{displayName(user)}</div>
          <div className="small muted">{user.org_name} · {ROLE[user.role] ?? user.role}</div>
          <form action={logout} style={{ marginTop: 10 }}>
            <button className="btn secondary small" style={{ width: "100%" }}>Logga ut</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
