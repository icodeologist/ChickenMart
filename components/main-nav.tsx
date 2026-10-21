"use client";

import Link from "next/link";
import { BookOpen, ClipboardList, CreditCard, LayoutDashboard, PlusCircle, Swords, Users } from "lucide-react";
import { usePathname } from "next/navigation";

function RawChickenLegIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path d="m9 14.2-3.7 3.9" stroke="#ecfdf5" strokeWidth="2.7" strokeLinecap="round" />
      <path d="M5.5 17.5c-.9-.7-2.2-.2-2.3.9-.1 1 .9 1.7 1.8 1.3.1 1 1.3 1.5 2.1.9.9-.7.5-2-.5-2.3" fill="#ecfdf5" />
      <path
        d="M8.1 14.9C5.6 12.8 5 9.2 6.7 6.5c2-3.3 6.7-4.4 9.9-2.1 3 2.1 3.5 6.4 1 9.1-2.4 2.6-6.7 3.7-9.5 1.4Z"
        fill="#6ee7b7"
        stroke="#d1fae5"
        strokeWidth="1.1"
      />
      <path d="M9.1 7.6c1.6-2.1 4.9-2.7 7-.9" stroke="#a7f3d0" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="14.8" cy="7.2" rx="1.5" ry=".8" transform="rotate(32 14.8 7.2)" fill="#fff" opacity=".48" />
    </svg>
  );
}

const links = [
  { href: "/admin", label: "Admin", mobileLabel: "Admin", icon: LayoutDashboard },
  { href: "/", label: "Add Chicken", mobileLabel: "Add", icon: PlusCircle },
  { href: "/view", label: "View Entries", mobileLabel: "View", icon: ClipboardList },
  { href: "/credit-line", label: "Credit Line", mobileLabel: "Credit", icon: CreditCard },
  { href: "/credit-page", label: "Customer Credit", mobileLabel: "Customers", icon: Users },
  { href: "/passbook", label: "Passbook", mobileLabel: "Book", icon: BookOpen },
] as const;

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-30 border-b border-stone-200 bg-[#fdfcf9]/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/admin" aria-label="Chicken Mart admin" className="group flex shrink-0 items-center gap-2.5">
          <span className="relative grid size-10 place-items-center transition-transform duration-300 group-hover:-translate-y-0.5">
            <span className="absolute inset-1 rotate-45 rounded-[11px] bg-emerald-700 shadow-[0_5px_16px_rgba(4,120,87,0.24)]" />
            <span className="absolute inset-[7px] rotate-45 rounded-[7px] border border-emerald-300/70" />
            <Swords size={25} strokeWidth={1.5} className="relative text-emerald-200" />
            <span className="absolute grid size-7 place-items-center rounded-full bg-emerald-700 ring-1 ring-emerald-300">
              <RawChickenLegIcon />
            </span>
          </span>
          <span className="text-[1.05rem] font-black leading-none tracking-[-0.035em] text-stone-900 sm:text-lg">
            Chicken <span className="text-emerald-700">Mart</span>
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          {links.map(({ href, label, mobileLabel, icon: Icon }) => {
            const isActive = pathname === href;

            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-emerald-700 text-white hover:bg-emerald-800"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                }`}
              >
                <Icon size={17} />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{mobileLabel}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
