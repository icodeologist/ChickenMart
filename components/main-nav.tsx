"use client";

import Link from "next/link";
import { Bird, BookOpen, ClipboardList, CreditCard, LayoutDashboard, PlusCircle, Swords, Users } from "lucide-react";
import { usePathname } from "next/navigation";

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
        <Link href="/" aria-label="Chicken Mart home" className="group flex shrink-0 items-center gap-2.5">
          <span className="relative grid size-10 place-items-center transition-transform duration-300 group-hover:-translate-y-0.5">
            <span className="absolute inset-1 rotate-45 rounded-[11px] bg-emerald-700 shadow-[0_5px_16px_rgba(4,120,87,0.24)]" />
            <span className="absolute inset-[7px] rotate-45 rounded-[7px] border border-emerald-300/70" />
            <Swords size={25} strokeWidth={1.5} className="relative text-emerald-200" />
            <span className="absolute grid size-6 place-items-center rounded-full bg-emerald-700 ring-1 ring-emerald-300">
              <Bird size={15} strokeWidth={2.4} className="text-white" />
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
