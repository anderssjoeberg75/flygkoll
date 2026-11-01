"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICONS } from "./Icons";

const ITEMS: { section?: string; href: string; label: string; icon: keyof typeof ICONS; admin?: boolean }[] = [
  { href: "/", label: "Översikt", icon: "overview" },
  { href: "/briefings/new", label: "Ny briefing", icon: "plus" },
  { href: "/briefings", label: "Mina briefingar", icon: "briefings" },
  { href: "/map", label: "Luftrumskarta", icon: "map" },
  { section: "Operation", href: "/logbook", label: "Loggbok", icon: "logbook" },
  { href: "/fleet", label: "Flotta & underhåll", icon: "fleet" },
  { href: "/checklists", label: "Checklistor", icon: "checklists" },
  { section: "Kunskap", href: "/rules", label: "Drönarregler", icon: "rules" },
  { href: "/tools", label: "Verktyg", icon: "tools" },
  { section: "Konto", href: "/settings", label: "Inställningar", icon: "settings" },
  { href: "/org", label: "Organisation", icon: "org" },
];

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Huvudmeny">
      {ITEMS.filter((i) => !i.admin || isAdmin).map((i) => {
        const active = i.href === "/" ? path === "/" : path === i.href || (i.href !== "/briefings" && path.startsWith(i.href + "/")) || (i.href === "/briefings" && path.startsWith("/briefings/") && !path.startsWith("/briefings/new"));
        return (
          <div key={i.href}>
            {i.section && <div className="nav-section">{i.section}</div>}
            <Link href={i.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
              {ICONS[i.icon]}
              {i.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
