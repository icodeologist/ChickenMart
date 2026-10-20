import Link from "next/link";
import { BookOpen, ClipboardList, CreditCard, LayoutDashboard, PlusCircle, Users } from "lucide-react";

export function MainNav() {
  return (
    <nav className="sticky top-0 z-30 border-b border-stone-200 bg-[#fdfcf9]/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight text-stone-900">
          Chikken<span className="text-emerald-700">Mart</span>
        </Link>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900">
            <LayoutDashboard size={17} />
            <span>Admin</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900">
            <PlusCircle size={17} />
            <span className="hidden sm:inline">Add Chicken</span>
            <span className="sm:hidden">Add</span>
          </Link>
          <Link href="/view" className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
            <ClipboardList size={17} />
            <span className="hidden sm:inline">View Entries</span>
            <span className="sm:hidden">View</span>
          </Link>
          <Link href="/credit-line" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900">
            <CreditCard size={17} />
            <span className="hidden sm:inline">Credit Line</span>
            <span className="sm:hidden">Credit</span>
          </Link>
          <Link href="/credit-page" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900">
            <Users size={17} />
            <span className="hidden sm:inline">Customer Credit</span>
            <span className="sm:hidden">Customers</span>
          </Link>
          <Link href="/passbook" className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-900">
            <BookOpen size={17} />
            <span className="hidden sm:inline">Passbook</span>
            <span className="sm:hidden">Book</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
