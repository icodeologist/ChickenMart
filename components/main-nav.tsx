"use client";

import Link from "next/link";
import { BookOpen, ClipboardList, CreditCard, LayoutDashboard, PlusCircle, Users } from "lucide-react";
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
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight text-stone-900">
          Chikken<span className="text-emerald-700">Mart</span>
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
