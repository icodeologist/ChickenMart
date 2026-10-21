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
          <span className="relative grid size-11 place-items-center rounded-full border border-stone-950 bg-stone-950 shadow-[0_5px_18px_rgba(28,25,23,0.24)] transition-transform duration-300 group-hover:rotate-6">
            <span className="absolute inset-[3px] rounded-full border border-amber-300/60" />
            <Swords size={27} strokeWidth={1.5} className="text-amber-300" />
            <span className="absolute grid size-6 place-items-center rounded-full bg-stone-950 ring-1 ring-stone-700">
              <Bird size={15} strokeWidth={2.4} className="text-stone-50" />
            </span>
            <span className="absolute -right-0.5 top-0.5 size-2.5 rounded-full bg-red-600 ring-2 ring-[#fdfcf9]" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-black uppercase italic tracking-[-0.02em] text-stone-950 sm:text-lg">Chicken</span>
            <span className="mt-1 flex items-center gap-1 text-[0.56rem] font-black uppercase tracking-[0.28em] text-red-700">
              <span className="h-px w-3 bg-red-700" />
              Mart
              <span className="h-px w-3 bg-red-700" />
            </span>
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
