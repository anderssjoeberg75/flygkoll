"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { section?: string; href: string; label: string; icon: string; admin?: boolean }[] = [
  { href: "/", label: "Översikt", icon: "◧" },
  { href: "/briefings/new", label: "Ny briefing", icon: "＋" },
  { href: "/briefings", label: "Mina briefingar", icon: "☰" },
  { href: "/map", label: "Luftrumskarta", icon: "◎" },
  { section: "Operation", href: "/logbook", label: "Loggbok", icon: "✎" },
  { href: "/fleet", label: "Flotta & underhåll", icon: "✈" },
  { href: "/checklists", label: "Checklistor", icon: "☑" },
  { section: "Kunskap", href: "/rules", label: "Drönarregler", icon: "§" },
  { href: "/tools", label: "Verktyg", icon: "⌖" },
  { section: "Konto", href: "/settings", label: "Inställningar", icon: "⚙" },
  { href: "/org", label: "Organisation", icon: "⌂" },
];

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {ITEMS.filter((i) => !i.admin || isAdmin).map((i) => {
        const active = i.href === "/" ? path === "/" : path === i.href || (i.href !== "/briefings" && path.startsWith(i.href + "/")) || (i.href === "/briefings" && path.startsWith("/briefings/") && !path.startsWith("/briefings/new"));
        return (
          <div key={i.href}>
            {i.section && <div className="nav-section">{i.section}</div>}
            <Link href={i.href} className={active ? "active" : ""}>
              <span aria-hidden style={{ width: 16, textAlign: "center" }}>{i.icon}</span>
              {i.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
