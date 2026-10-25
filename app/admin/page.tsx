"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, Drumstick, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type BalanceRow = { id: string; name: string; phone?: string | null; amount: string };
type Activity = {
  id: string;
  occurredAt: string;
  recordedAt: string;
  party: string | null;
  description: string;
  entryType: "PURCHASE" | "PAYMENT" | "CUSTOMER_CREDIT" | "CUSTOMER_PAYMENT" | "MANUAL";
  paymentMethod: "CASH" | "UPI" | "NET_BANKING" | null;
  amount: string;
  direction: "IN" | "OUT" | "NEUTRAL";
};
type Overview = {
  moneyAvailable: string;
  customerOutstanding: string;
  supplierOutstanding: string;
  estimatedPurchaseCost: string;
  estimatedSales: string;
  estimatedProfit: string;
  meatLast30Days: string;
  averageMeatPerDay: string;
  meatWindowStart: string;
  meatWindowEnd: string;
  suppliersPendingCount: number;
  customersOwing: BalanceRow[];
  suppliersOwed: BalanceRow[];
  recentActivity: Activity[];
};

function formatMoney(value: string) {
  const [wholePart = "0", decimalPart = ""] = value.split(".");
  const negative = wholePart.startsWith("-");
  const digits = negative ? wholePart.slice(1) : wholePart;
  const grouped = new Intl.NumberFormat("en-IN").format(BigInt(digits || "0"));
  return `${negative ? "-" : ""}₹${grouped}.${decimalPart.padEnd(2, "0").slice(0, 2)}`;
}

function formatKg(value: string) {
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(Number(value))} kg`;
}

async function fetchOverview() {
  const response = await fetch("/api/accounting/admin-overview", { cache: "no-store" });
  const result = await response.json() as Overview & { error?: string };
  if (!response.ok) throw new Error(result.error || "Could not load the admin overview.");
  return result;
}

export default function AdminPage() {
  const [data, setData] = useState<Overview>();
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setData(await fetchOverview());
  }, []);

  useEffect(() => {
    let active = true;
    void fetchOverview().then((result) => { if (active) setData(result); }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);

  return <main className="min-h-screen bg-[#f7f5f1] px-4 py-6 text-stone-900 sm:px-6 lg:py-8">
    <div className="w-full">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-bold uppercase tracking-[.16em] text-emerald-700">ChickenMart - Avin</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Admin overview</h1><p className="mt-1 text-sm text-stone-500">What the shop has, owes, and needs to collect.</p></div>
        <button type="button" onClick={() => { setError(""); setData(undefined); void load().catch((reason: Error) => setError(reason.message)); }} className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50"><RefreshCw size={16}/>Refresh</button>
      </header>

      {error ? <Card className="border-rose-200 bg-rose-50 p-6"><p className="font-bold text-rose-900">Could not load the overview</p><p className="mt-1 text-sm text-rose-700">{error}</p><Button className="mt-4" onClick={() => { setData(undefined); void load().catch((reason: Error) => setError(reason.message)); }}>Try again</Button></Card>
        : !data ? <div className="flex items-center gap-2 py-20 text-sm font-medium text-stone-500"><Loader2 className="animate-spin" size={18}/>Loading shop position…</div>
          : <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Shop position">
              <Position label="Money we have" value={data.moneyAvailable} note="Current Passbook balance" tone="money" href="/passbook"/>
              <Position label="Total estimated profit" value={data.estimatedProfit} note={`${formatMoney(data.estimatedSales)} expected sales − ${formatMoney(data.estimatedPurchaseCost)} purchase cost`} tone="profit" href="/view"/>
              <Position label="Customers owe us" value={data.customerOutstanding} note={`${data.customersOwing.length} customer${data.customersOwing.length === 1 ? "" : "s"} with balance`} tone="customer" href="/credit-page"/>
              <Position label="We owe suppliers" value={data.supplierOutstanding} note={`${data.suppliersPendingCount} supplier${data.suppliersPendingCount === 1 ? "" : "s"} with payment pending`} tone="supplier" href="/credit-line"/>
            </section>

            <Card className="mt-3 border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm sm:px-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white"><Drumstick size={20}/></span>
                  <div className="min-w-0"><p className="font-bold text-emerald-950">30-day meat estimate</p><p className="mt-0.5 text-xs text-emerald-800">{new Date(data.meatWindowStart).toLocaleDateString("en-IN")} – {new Date(data.meatWindowEnd).toLocaleDateString("en-IN")} · purchase estimate</p></div>
                </div>
                <div className="grid grid-cols-2 gap-5 sm:flex sm:items-center sm:gap-7">
                  <div><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Average / day</p><p className="mt-0.5 text-xl font-extrabold tabular-nums text-emerald-950">{formatKg(data.averageMeatPerDay)}</p></div>
                  <div className="border-l border-emerald-200 pl-5 sm:pl-7"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">30-day total</p><p className="mt-0.5 text-xl font-extrabold tabular-nums text-emerald-950">{formatKg(data.meatLast30Days)}</p></div>
                </div>
              </div>
            </Card>

            <section className="mt-5 grid gap-5 lg:grid-cols-2">
              <DueList title="Customer credit to collect" rows={data.customersOwing} empty="No customer credit is outstanding." href="/credit-page" kind="customer"/>
              <DueList title="Supplier payments pending" rows={data.suppliersOwed} empty="No supplier payments are pending." href="/credit-line" kind="supplier"/>
            </section>

            <Card className="mt-5 overflow-hidden border-stone-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-200 px-4 py-4 sm:px-5"><div><h2 className="font-bold">Latest Passbook activity</h2><p className="mt-0.5 text-xs text-stone-500">Newest entries by the time they were recorded</p></div><Link href="/passbook" className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:text-emerald-900">Open Passbook<ArrowRight size={15}/></Link></div>
              {data.recentActivity.length ? <div className="divide-y divide-stone-100">{data.recentActivity.map((entry) => <div key={entry.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 sm:px-5">
                <span className={`inline-flex size-9 items-center justify-center rounded-full ${entry.direction === "IN" ? "bg-emerald-100 text-emerald-700" : entry.direction === "OUT" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{entry.direction === "IN" ? <ArrowDownLeft size={17}/> : entry.direction === "OUT" ? <ArrowUpRight size={17}/> : <BookOpen size={16}/>}</span>
                <div className="min-w-0"><p className="truncate text-sm font-bold text-stone-900" title={entry.description}>{entry.description}</p><p className="mt-0.5 truncate text-xs text-stone-500">{entry.party || activityLabel(entry)} · {new Date(entry.recordedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</p></div>
                <div className="text-right"><p className={`font-extrabold tabular-nums ${entry.direction === "IN" ? "text-emerald-700" : entry.direction === "OUT" ? "text-rose-700" : "text-amber-700"}`}>{entry.direction === "IN" ? "+" : entry.direction === "OUT" ? "−" : ""}{formatMoney(entry.amount)}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-400">{entry.direction === "NEUTRAL" ? "Credit owed" : entry.direction === "IN" ? "Money in" : "Money out"}</p></div>
              </div>)}</div> : <p className="px-5 py-12 text-center text-sm text-stone-500">No Passbook activity yet.</p>}
            </Card>
          </>}
    </div>
  </main>;
}

function Position({ label, value, note, tone, href }: { label: string; value: string; note: string; tone: "money" | "profit" | "customer" | "supplier"; href: string }) {
  const profitNegative = tone === "profit" && value.startsWith("-");
  const colors = tone === "money" ? "border-emerald-900 bg-emerald-950 text-white" : tone === "profit" ? profitNegative ? "border-rose-200 bg-rose-50 text-rose-950" : "border-emerald-200 bg-emerald-50 text-emerald-950" : tone === "customer" ? "border-amber-200 bg-amber-50 text-stone-900" : "border-rose-200 bg-rose-50 text-stone-900";
  return <Link href={href} className={`rounded-xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${colors}`}><p className={`text-xs font-bold uppercase tracking-[.12em] ${tone === "money" ? "text-emerald-300" : "text-stone-500"}`}>{label}</p><p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight">{formatMoney(value)}</p><p className={`mt-2 text-xs ${tone === "money" ? "text-emerald-100/70" : "text-stone-500"}`}>{note}</p></Link>;
}

function DueList({ title, rows, empty, href, kind }: { title: string; rows: BalanceRow[]; empty: string; href: string; kind: "customer" | "supplier" }) {
  return <Card className="overflow-hidden border-stone-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-stone-200 px-4 py-4 sm:px-5"><h2 className="font-bold">{title}</h2><Link href={href} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700">View all<ArrowRight size={15}/></Link></div>{rows.length ? <div className="divide-y divide-stone-100">{rows.slice(0, 5).map((row) => <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-bold" title={row.name}>{row.name}</p>{kind === "customer" && row.phone && <p className="mt-0.5 text-xs text-stone-500">{row.phone}</p>}</div><p className="shrink-0 font-extrabold tabular-nums text-stone-900">{formatMoney(row.amount)}</p></div>)}</div> : <p className="px-5 py-10 text-center text-sm text-stone-500">{empty}</p>}</Card>;
}

function activityLabel(entry: Activity) {
  if (entry.entryType === "PURCHASE") return "Chicken bought";
  if (entry.entryType === "PAYMENT") return "Supplier payment";
  if (entry.entryType === "CUSTOMER_CREDIT") return "Customer credit";
  if (entry.entryType === "CUSTOMER_PAYMENT") return "Customer payment";
  return "Passbook entry";
}
