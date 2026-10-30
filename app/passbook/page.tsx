"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PassbookEntry = {
  id: string;
  occurredAt: string;
  recordedAt: string;
  supplier: string | null;
  customer: string | null;
  chickenType: string | null;
  description: string;
  entryType: "PURCHASE" | "PAYMENT" | "CUSTOMER_CREDIT" | "CUSTOMER_PAYMENT" | "MANUAL";
  paymentMethod: "CASH" | "UPI" | "NET_BANKING" | null;
  manualPaymentType: "HARD_CASH" | "UPI" | "CREDIT" | "EXPENSE" | null;
  manualAmount: string;
  customerCreditAmount: string;
  customerPaymentAmount: string;
  debitAmount: string;
  creditAmount: string;
  runningBalance: string;
};

type PassbookData = {
  entries: PassbookEntry[];
  totalPurchases: string;
  totalPayments: string;
  totalHardCash: string;
  totalUpi: string;
  totalCredit: string;
  totalExpenses: string;
  totalCustomerCollections: string;
  customerOutstanding: string;
  supplierOutstanding: string;
  todayCredit: string;
  balance: string;
  pagination: { page: number; pageSize: number; totalEntries: number; totalPages: number };
};

type NewEntry = {
  date: string;
  description: string;
  amount: string;
  paymentType: "HARD_CASH" | "UPI" | "CREDIT" | "EXPENSE";
};
type PaymentCorrection = { kind: "SUPPLIER" | "CUSTOMER"; id: string; date: string; amount: string; method: "CASH" | "UPI" | "NET_BANKING" };

type Period = "ALL" | "DAY" | "WEEK" | "MONTH";
type SortOrder = "RECENT" | "OLDEST" | "HIGHEST";

function formatMoney(value: string | undefined) {
  if (typeof value !== "string") return "₹0.00";
  const [wholePart = "0", decimalPart = ""] = value.split(".");
  const negative = wholePart.startsWith("-");
  const digits = negative ? wholePart.slice(1) : wholePart;
  const grouped = new Intl.NumberFormat("en-IN").format(BigInt(digits || "0"));
  return `${negative ? "-" : ""}₹${grouped}.${decimalPart.padEnd(2, "0").slice(0, 2)}`;
}

function isNegative(value: string | undefined) {
  return value?.startsWith("-") ?? false;
}

function isPassbookData(value: unknown): value is PassbookData {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.entries)) return false;
  if (!record.pagination || typeof record.pagination !== "object") return false;
  const pagination = record.pagination as Record<string, unknown>;
  if (![pagination.page, pagination.pageSize, pagination.totalEntries, pagination.totalPages].every((value) => typeof value === "number")) return false;
  if (![record.totalPurchases, record.totalPayments, record.totalHardCash, record.totalUpi, record.totalCredit, record.totalExpenses, record.totalCustomerCollections, record.customerOutstanding, record.supplierOutstanding, record.todayCredit, record.balance].every((amount) => typeof amount === "string")) return false;
  return record.entries.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const row = entry as Record<string, unknown>;
    return typeof row.id === "string"
      && typeof row.occurredAt === "string"
      && typeof row.recordedAt === "string"
      && (typeof row.supplier === "string" || row.supplier === null)
      && (typeof row.customer === "string" || row.customer === null)
      && typeof row.description === "string"
      && (row.entryType === "PURCHASE" || row.entryType === "PAYMENT" || row.entryType === "CUSTOMER_CREDIT" || row.entryType === "CUSTOMER_PAYMENT" || row.entryType === "MANUAL")
      && typeof row.manualAmount === "string"
      && typeof row.customerCreditAmount === "string"
      && typeof row.customerPaymentAmount === "string"
      && typeof row.debitAmount === "string"
      && typeof row.creditAmount === "string"
      && typeof row.runningBalance === "string";
  });
}

export default function PassbookPage() {
  const router = useRouter();
  const [data, setData] = useState<PassbookData>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [newEntry, setNewEntry] = useState<NewEntry>();
  const [editingManualId, setEditingManualId] = useState("");
  const [paymentCorrection, setPaymentCorrection] = useState<PaymentCorrection>();
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState<Period>("ALL");
  const [sortOrder, setSortOrder] = useState<SortOrder>("RECENT");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;

    const query = new URLSearchParams({ v: "9", period, sort: sortOrder, page: String(page), pageSize: "25" });
    void fetch(`/api/accounting/purchase-passbook?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const result: unknown = await response.json();
        const errorMessage = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : undefined;
        if (!response.ok) throw new Error(errorMessage || "Could not load the passbook.");
        if (!isPassbookData(result)) throw new Error("The Passbook received outdated data. Refresh the page and try again.");
        return result;
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });

    return () => { active = false; };
  }, [page, period, reloadKey, sortOrder]);

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (!newEntry) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/accounting/passbook-entries", {
        method: editingManualId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `passbook-entry-${editingManualId ? "edit" : "add"}-${crypto.randomUUID()}`,
          ...(editingManualId ? { manualPassbookEntryId: editingManualId } : {}),
          entryDate: `${newEntry.date}T18:00:00.000Z`,
          description: newEntry.description,
          amount: newEntry.amount,
          paymentType: newEntry.paymentType,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save the entry.");
      setNewEntry(undefined);
      setEditingManualId("");
      setData(undefined);
      setPage(1);
      setNotice(editingManualId ? "Passbook entry updated." : "Passbook entry added.");
      setReloadKey((key) => key + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the entry.");
    } finally {
      setSaving(false);
    }
  }

  function beginManualEdit(entry: PassbookEntry) {
    setError(""); setNotice("");
    setEditingManualId(entry.id.replace(/^manual-/, ""));
    setNewEntry({ date: entry.occurredAt.slice(0, 10), description: entry.description, amount: entry.manualAmount, paymentType: entry.manualPaymentType ?? "HARD_CASH" });
  }

  async function deleteManualEntry(entry: PassbookEntry) {
    if (!window.confirm(`Delete “${entry.description}”? The related balance movement will be reversed.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/passbook-entries", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `passbook-entry-delete-${crypto.randomUUID()}`, manualPassbookEntryId: entry.id.replace(/^manual-/, "") }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not delete the passbook entry.");
      setData(undefined); setPage(1); setNotice("Passbook entry deleted."); setReloadKey((key) => key + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete the passbook entry."); }
    finally { setSaving(false); }
  }

  async function savePaymentCorrection(event: FormEvent) {
    event.preventDefault();
    if (!paymentCorrection) return;
    setSaving(true); setError(""); setNotice("");
    const customer = paymentCorrection.kind === "CUSTOMER";
    try {
      const response = await fetch(customer ? "/api/accounting/customer-credit-entry-payments" : "/api/accounting/supplier-payment-records", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `passbook-payment-edit-${crypto.randomUUID()}`, ...(customer ? { customerCreditEntryPaymentId: paymentCorrection.id } : { supplierPaymentId: paymentCorrection.id }), paidAt: `${paymentCorrection.date}T18:00:00.000Z`, amount: paymentCorrection.amount, paymentMethod: paymentCorrection.method }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not edit payment.");
      setPaymentCorrection(undefined); setData(undefined); setPage(1); setNotice("Payment updated across the app."); setReloadKey((key) => key + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not edit payment."); }
    finally { setSaving(false); }
  }

  async function deletePaymentEntry(entry: PassbookEntry, kind: "SUPPLIER" | "CUSTOMER") {
    if (!window.confirm(`Delete “${entry.description}”? Its money movement will be reversed.`)) return;
    const customer = kind === "CUSTOMER";
    const id = entry.id.replace(customer ? /^customer-credit-entry-payment-/ : /^payment-/, "");
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(customer ? "/api/accounting/customer-credit-entry-payments" : "/api/accounting/supplier-payment-records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `passbook-payment-delete-${crypto.randomUUID()}`, ...(customer ? { customerCreditEntryPaymentId: id } : { supplierPaymentId: id }) }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not delete payment.");
      setData(undefined); setPage(1); setNotice("Payment deleted and balance corrected."); setReloadKey((key) => key + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete payment."); }
    finally { setSaving(false); }
  }

  async function deletePurchaseEntry(entry: PassbookEntry) {
    if (!window.confirm(`Delete “${entry.description}”? Existing supplier payments remain as real payments.`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/receipts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `passbook-purchase-delete-${crypto.randomUUID()}`, itemId: entry.id.replace(/^purchase-/, "") }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not delete purchase.");
      setData(undefined); setPage(1); setNotice("Purchase deleted across the app."); setReloadKey((key) => key + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete purchase."); }
    finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-[#f7f5f1] p-4 text-stone-900 sm:p-6 lg:p-8">
      <div className="w-full">
        <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">Chicken Mart</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Passbook</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">Balance is actual cash and bank money from the ledger. Credit purchases change what you owe, while supplier payments always reduce the balance.</p>
          </div>
          <Button onClick={() => { setError(""); setNotice(""); setEditingManualId(""); setNewEntry({ date: new Date().toISOString().slice(0, 10), description: "", amount: "", paymentType: "HARD_CASH" }); }} className="gap-2">
            <Plus size={17} /> Add entry
          </Button>
        </header>

        {notice && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
        {error ? (
          <Card className="border-rose-200 bg-rose-50 p-6 shadow-sm">
            <p className="font-semibold text-rose-900">Could not load the passbook</p>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
            <Button className="mt-4 gap-2" onClick={() => { setError(""); setData(undefined); setReloadKey((key) => key + 1); }}>
              <RefreshCw size={16} /> Try again
            </Button>
          </Card>
        ) : !data ? (
          <div className="flex items-center gap-2 py-16 text-sm font-medium text-stone-500">
            <Loader2 className="animate-spin" size={18} /> Loading passbook…
          </div>
        ) : (
          <Card className="overflow-hidden border-stone-200 bg-white shadow-[0_18px_50px_-30px_rgba(28,25,23,.35)]">
            <div className="grid gap-5 bg-emerald-950 px-5 py-6 text-white sm:grid-cols-[1fr_auto] sm:items-end sm:px-7">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex rounded-xl bg-white/10 p-2.5 ring-1 ring-white/15">
                  <BookOpen size={22} />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Money record</p>
                  <h2 className="mt-1 text-xl font-bold">Shop passbook</h2>
                  <p className="mt-1 text-sm text-emerald-100/70">{data.pagination.totalEntries} {data.pagination.totalEntries === 1 ? "entry" : "entries"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:text-right">
                <div><p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Balance</p><p className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${isNegative(data.balance) ? "text-rose-300" : "text-white"}`}>{formatMoney(data.balance)}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wider text-rose-300">Suppliers owed</p><p className="mt-1 text-2xl font-bold tabular-nums text-rose-200 sm:text-3xl">{formatMoney(data.supplierOutstanding)}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Customers owe</p><p className="mt-1 text-2xl font-bold tabular-nums text-amber-200 sm:text-3xl">{formatMoney(data.customerOutstanding)}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wider text-sky-300">Today&apos;s credit</p><p className="mt-1 text-2xl font-bold tabular-nums text-sky-200 sm:text-3xl">{formatMoney(data.todayCredit)}</p></div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:px-6">
              <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <CalendarDays className="mr-1 shrink-0 text-stone-400" size={17} />
                {([
                  ["ALL", "All"],
                  ["DAY", "1 Day"],
                  ["WEEK", "1 Week"],
                  ["MONTH", "1 Month"],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => changePeriod(value)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition ${period === value ? "bg-emerald-700 text-white shadow-sm" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-stone-500">
                <ArrowUpDown size={16} />
                <span className="shrink-0">Sort by</span>
                <select value={sortOrder} onChange={(event) => changeSort(event.target.value as SortOrder)} className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-stone-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
                  <option value="RECENT">Recent first</option>
                  <option value="OLDEST">Oldest first</option>
                  <option value="HIGHEST">Highest transaction</option>
                </select>
              </label>
            </div>

            <div className="hidden xl:block">
              <table className="w-full table-fixed border-collapse text-xs">
                <colgroup>
                  <col className="w-[9%]" />
                  <col className="w-[7%]" />
                  <col className="w-[13%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[7%]" />
                  <col className="w-[8%]" />
                  <col className="w-[9%]" />
                  <col className="w-[12%]" />
                  <col className="w-[6%]" />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-emerald-900 bg-[#faf9f6] text-xs font-bold uppercase tracking-[.08em] text-stone-500">
                    <Head>Date</Head>
                    <Head>Party</Head>
                    <Head>Particulars</Head>
                    <Head right>Chicken Bought</Head>
                    <Head right>Payment</Head>
                    <Head right>Hard Cash</Head>
                    <Head right>UPI</Head>
                    <Head right>Credit</Head>
                    <Head right>Expenses</Head>
                    <Head right>Balance</Head>
                    <Head right><span className="sr-only">Actions</span></Head>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length ? data.entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-stone-200 last:border-b-0 hover:bg-emerald-50/50">
                      <Cell>
                        <span className="font-semibold text-stone-800">
                          {new Date(entry.occurredAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wide text-stone-400">Added {formatEntryTime(entry.recordedAt)}</span>
                      </Cell>
                      <Cell>{entry.supplier ? <PartyName name={entry.supplier} kind="supplier"/> : entry.customer ? <PartyName name={entry.customer} kind="customer"/> : <EmptyAmount />}</Cell>
                      <Cell>
                        <span className="block truncate font-semibold text-stone-800" title={entry.description}>{entry.description}</span>
                        <span className={`mt-0.5 block text-[11px] font-bold uppercase tracking-wide ${entry.entryType === "PURCHASE" ? "text-amber-600" : "text-emerald-700"}`}>
                          {entryTypeLabel(entry)}
                        </span>
                      </Cell>
                      <Cell right>{entry.entryType === "PURCHASE" ? <span className="text-sm font-bold text-amber-700">{formatMoney(entry.debitAmount)}</span> : <EmptyAmount />}</Cell>
                      <Cell right>{entry.entryType === "PAYMENT" ? <Amount value={entry.creditAmount} /> : <EmptyAmount />}</Cell>
                      <Cell right>{entry.entryType === "MANUAL" && entry.manualPaymentType === "HARD_CASH" ? <Amount value={entry.manualAmount} /> : entry.entryType === "CUSTOMER_PAYMENT" && entry.paymentMethod === "CASH" ? <Amount value={entry.customerPaymentAmount} /> : <EmptyAmount />}</Cell>
                      <Cell right>{entry.entryType === "MANUAL" && entry.manualPaymentType === "UPI" ? <Amount value={entry.manualAmount} /> : entry.entryType === "CUSTOMER_PAYMENT" && entry.paymentMethod !== "CASH" ? <Amount value={entry.customerPaymentAmount} /> : <EmptyAmount />}</Cell>
                      <Cell right>{entry.entryType === "MANUAL" && entry.manualPaymentType === "CREDIT" ? <span className="text-sm font-bold text-amber-700">{formatMoney(entry.manualAmount)}</span> : entry.entryType === "CUSTOMER_CREDIT" ? <span className="text-sm font-bold text-amber-700">{formatMoney(entry.customerCreditAmount)}</span> : <EmptyAmount />}</Cell>
                      <Cell right>{entry.entryType === "MANUAL" && entry.manualPaymentType === "EXPENSE" ? <span className="text-sm font-bold text-rose-700">{formatMoney(entry.manualAmount)}</span> : <EmptyAmount />}</Cell>
                      <Cell right><span className={`text-sm font-extrabold ${isNegative(entry.runningBalance) ? "text-rose-700" : "text-emerald-700"}`}>{formatMoney(entry.runningBalance)}</span></Cell>
                      <Cell right>{entryActions(entry)}</Cell>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={11} className="px-6 py-16 text-center">
                        <BookOpen className="mx-auto text-stone-300" size={32} />
                        <p className="mt-3 font-semibold text-stone-700">No entries in this period</p>
                        <p className="mt-1 text-sm text-stone-500">Choose a longer period or add a Passbook entry.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
                {data.entries.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-emerald-900 bg-emerald-50">
                      <td colSpan={3} className="px-2.5 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-emerald-900">Totals</td>
                      <td className="px-2.5 py-3 text-right text-xs font-extrabold tabular-nums text-amber-700">{formatMoney(data.totalPurchases)}</td>
                      <td className="px-2.5 py-3 text-right text-xs font-extrabold tabular-nums text-rose-700">{formatMoney(data.totalPayments)}</td>
                      <td className="px-2.5 py-3 text-right text-xs font-extrabold tabular-nums text-emerald-700">{formatMoney(data.totalHardCash)}</td>
                      <td className="px-2.5 py-3 text-right text-xs font-extrabold tabular-nums text-emerald-700">{formatMoney(data.totalUpi)}</td>
                      <td className="px-2.5 py-3 text-right text-xs font-extrabold tabular-nums text-amber-700">{formatMoney(data.totalCredit)}</td>
                      <td className="px-2.5 py-3 text-right text-xs font-extrabold tabular-nums text-rose-700">{formatMoney(data.totalExpenses)}</td>
                      <td className={`px-2.5 py-3 text-right text-sm font-extrabold tabular-nums ${isNegative(data.balance) ? "text-rose-700" : "text-emerald-950"}`}>{formatMoney(data.balance)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="divide-y divide-stone-200 xl:hidden">
              {data.entries.length ? data.entries.map((entry) => (
                <article key={entry.id} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <time className="text-sm font-bold text-stone-800">{new Date(entry.occurredAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</time>
                        {entry.supplier && <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">{entry.supplier}</span>}
                        {entry.customer && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">{entry.customer}</span>}
                      </div>
                      <p className="mt-2 truncate font-semibold text-stone-900">{entry.description}</p>
                      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-stone-400">Added {formatEntryTime(entry.recordedAt)} · {entryTypeLabel(entry)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{transactionLabel(entry)}</p>
                      <p className={`mt-1 text-base font-extrabold tabular-nums ${entry.entryType === "CUSTOMER_CREDIT" ? "text-amber-700" : isMoneyIn(entry) ? "text-emerald-700" : "text-rose-700"}`}>{formatMoney(transactionAmount(entry))}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2.5">
                    <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Balance</span>
                    <span className={`font-extrabold tabular-nums ${isNegative(entry.runningBalance) ? "text-rose-700" : "text-emerald-700"}`}>{formatMoney(entry.runningBalance)}</span>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">{entryActions(entry, true)}</div>
                </article>
              )) : (
                <div className="px-6 py-14 text-center">
                  <BookOpen className="mx-auto text-stone-300" size={32} />
                  <p className="mt-3 font-semibold text-stone-700">No entries in this period</p>
                  <p className="mt-1 text-sm text-stone-500">Choose a longer period or add a Passbook entry.</p>
                </div>
              )}
              {data.entries.length > 0 && (
                <div className="bg-emerald-50 p-4 sm:p-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-emerald-900">Filtered totals</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <MobileTotal label="Chicken" value={data.totalPurchases} out />
                    <MobileTotal label="Payment" value={data.totalPayments} out />
                    <MobileTotal label="Hard Cash" value={data.totalHardCash} />
                    <MobileTotal label="UPI" value={data.totalUpi} />
                    <MobileTotal label="Credit" value={data.totalCredit} out />
                    <MobileTotal label="Expenses" value={data.totalExpenses} out />
                  </div>
                </div>
              )}
            </div>
            {data.pagination.totalEntries > 0 && (
              <div className="flex flex-col gap-3 border-t border-stone-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm font-medium text-stone-500">
                  Showing {(data.pagination.page - 1) * data.pagination.pageSize + 1}–{Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalEntries)} of {data.pagination.totalEntries}
                </p>
                <div className="flex items-center gap-2">
                  <Button type="button" className="h-9 gap-1.5 border border-stone-300 bg-white px-3 text-stone-700 shadow-none hover:bg-stone-100" disabled={data.pagination.page <= 1} onClick={() => changePage(data.pagination.page - 1)}><ChevronLeft size={16}/>Previous</Button>
                  <span className="min-w-24 text-center text-sm font-bold text-stone-700">Page {data.pagination.page} of {data.pagination.totalPages}</span>
                  <Button type="button" className="h-9 gap-1.5 border border-stone-300 bg-white px-3 text-stone-700 shadow-none hover:bg-stone-100" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => changePage(data.pagination.page + 1)}>Next<ChevronRight size={16}/></Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {newEntry && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-entry-title">
            <Card className="w-full max-w-lg rounded-b-none border-stone-200 bg-white shadow-2xl sm:rounded-xl">
              <form onSubmit={saveEntry}>
                <div className="flex items-start justify-between border-b border-stone-200 px-5 py-4">
                  <div>
                    <h2 id="add-entry-title" className="text-xl font-bold">{editingManualId ? "Edit passbook entry" : "Add passbook entry"}</h2>
                    <p className="mt-1 text-sm text-stone-500">{editingManualId ? "The old money movement will be reversed and replaced safely." : "Hard Cash and UPI add money. Credit and Expenses reduce it."}</p>
                  </div>
                  <button type="button" onClick={() => { setNewEntry(undefined); setEditingManualId(""); }} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close form"><X size={20} /></button>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label="Date"><Input required type="date" value={newEntry.date} onChange={(event) => updateEntry("date", event.target.value)} /></Field>
                  <Field label="Entry type">
                    <select required value={newEntry.paymentType} onChange={(event) => updateEntry("paymentType", event.target.value as NewEntry["paymentType"])} className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
                      <option value="HARD_CASH">Hard Cash Received</option>
                      <option value="UPI">UPI Received</option>
                      <option value="CREDIT">Credit</option>
                      <option value="EXPENSE">Expense</option>
                    </select>
                  </Field>
                  <Field label="Amount"><Input required inputMode="decimal" placeholder="0.00" value={newEntry.amount} onChange={(event) => updateEntry("amount", event.target.value)} /></Field>
                  <div className="sm:col-span-2"><Field label="Details"><Input required placeholder="What was this payment for?" value={newEntry.description} onChange={(event) => updateEntry("description", event.target.value)} /></Field></div>
                </div>
                <div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4">
                  <Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => { setNewEntry(undefined); setEditingManualId(""); }}>Cancel</Button>
                  <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 animate-spin" size={16} />}{editingManualId ? "Save changes" : "Add entry"}</Button>
                </div>
              </form>
            </Card>
          </div>
        )}
        {paymentCorrection && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-payment-title">
            <Card className="w-full max-w-lg rounded-b-none border-stone-200 bg-white shadow-2xl sm:rounded-xl"><form onSubmit={savePaymentCorrection}>
              <div className="flex items-start justify-between border-b border-stone-200 px-5 py-4"><div><h2 id="edit-payment-title" className="text-xl font-bold">Edit {paymentCorrection.kind === "SUPPLIER" ? "supplier" : "customer"} payment</h2><p className="mt-1 text-sm text-stone-500">The old movement will be reversed and the balance recalculated.</p></div><button type="button" onClick={() => setPaymentCorrection(undefined)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close payment form"><X size={20}/></button></div>
              <div className="grid gap-4 p-5 sm:grid-cols-2"><Field label="Date"><Input required type="date" value={paymentCorrection.date} onChange={(event) => setPaymentCorrection({ ...paymentCorrection, date: event.target.value })}/></Field><Field label="Amount"><Input required min="0.01" step="0.01" inputMode="decimal" value={paymentCorrection.amount} onChange={(event) => setPaymentCorrection({ ...paymentCorrection, amount: event.target.value })}/></Field><Field label="Through"><select value={paymentCorrection.method} onChange={(event) => setPaymentCorrection({ ...paymentCorrection, method: event.target.value as PaymentCorrection["method"] })} className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="NET_BANKING">Net Banking</option></select></Field></div>
              <div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4"><Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setPaymentCorrection(undefined)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 animate-spin" size={16}/>}Save changes</Button></div>
            </form></Card>
          </div>
        )}
      </div>
    </main>
  );

  function entryActions(entry: PassbookEntry, mobile = false) {
    const buttonClass = mobile ? "inline-flex size-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600" : "inline-flex size-7 items-center justify-center rounded-md text-stone-500";
    const buttons = (edit: () => void, remove: () => void, label: string) => <span className="inline-flex gap-1"><button type="button" title={`Edit ${label}`} aria-label={`Edit ${label}`} onClick={edit} className={`${buttonClass} hover:bg-stone-100 hover:text-emerald-700`}><Pencil size={mobile ? 14 : 13}/></button><button type="button" title={`Delete ${label}`} aria-label={`Delete ${label}`} onClick={remove} className={`${buttonClass} hover:bg-rose-50 hover:text-rose-700`}><Trash2 size={mobile ? 14 : 13}/></button></span>;
    if (entry.entryType === "MANUAL") return buttons(() => beginManualEdit(entry), () => void deleteManualEntry(entry), "passbook entry");
    if (entry.entryType === "PURCHASE") return buttons(() => router.push(`/view?edit=${entry.id.replace(/^purchase-/, "")}`), () => void deletePurchaseEntry(entry), "purchase");
    if (entry.entryType === "PAYMENT") {
      const id = entry.id.replace(/^payment-/, "");
      return buttons(() => setPaymentCorrection({ kind: "SUPPLIER", id, date: entry.occurredAt.slice(0, 10), amount: entry.creditAmount, method: entry.paymentMethod ?? "CASH" }), () => void deletePaymentEntry(entry, "SUPPLIER"), "supplier payment");
    }
    if (entry.entryType === "CUSTOMER_PAYMENT" && entry.id.startsWith("customer-credit-entry-payment-")) {
      const id = entry.id.replace(/^customer-credit-entry-payment-/, "");
      return buttons(() => setPaymentCorrection({ kind: "CUSTOMER", id, date: entry.occurredAt.slice(0, 10), amount: entry.customerPaymentAmount, method: entry.paymentMethod ?? "CASH" }), () => void deletePaymentEntry(entry, "CUSTOMER"), "customer payment");
    }
    return mobile ? null : <span className="text-stone-300">—</span>;
  }

  function updateEntry(key: keyof NewEntry, value: string) {
    setNewEntry((current) => current ? { ...current, [key]: value } as NewEntry : current);
  }

  function changePeriod(value: Period) {
    setError("");
    setData(undefined);
    setPage(1);
    setPeriod(value);
  }

  function changeSort(value: SortOrder) {
    setError("");
    setData(undefined);
    setPage(1);
    setSortOrder(value);
  }

  function changePage(value: number) {
    setError("");
    setData(undefined);
    setPage(value);
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">{label}{children}</label>;
}

function formatEntryTime(value: string) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function Head({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-2.5 py-3 text-[10px] ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

function Cell({ children, right }: { children: ReactNode; right?: boolean }) {
  return <td className={`min-w-0 whitespace-nowrap px-2.5 py-3 ${right ? "text-right tabular-nums" : "text-left"}`}>{children}</td>;
}

function Amount({ value }: { value: string }) {
  return <span className="text-sm font-bold text-emerald-700">{formatMoney(value)}</span>;
}

function EmptyAmount() {
  return <span className="text-stone-300">—</span>;
}

function PartyName({ name, kind }: { name: string; kind: "supplier" | "customer" }) {
  return <span title={name} className={`block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-2 py-1 font-bold ${kind === "supplier" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{name}</span>;
}

function formatMethod(method: PassbookEntry["paymentMethod"]) {
  if (method === "NET_BANKING") return "Net Banking";
  if (method === "UPI") return "UPI";
  return "Cash";
}

function formatManualType(type: PassbookEntry["manualPaymentType"]) {
  if (type === "HARD_CASH") return "Hard Cash";
  if (type === "CREDIT") return "Credit";
  if (type === "EXPENSE") return "Business Expense";
  return "UPI";
}

function transactionAmount(entry: PassbookEntry) {
  if (entry.entryType === "PURCHASE") return entry.debitAmount;
  if (entry.entryType === "PAYMENT") return entry.creditAmount;
  if (entry.entryType === "CUSTOMER_CREDIT") return entry.customerCreditAmount;
  if (entry.entryType === "CUSTOMER_PAYMENT") return entry.customerPaymentAmount;
  return entry.manualAmount;
}

function transactionLabel(entry: PassbookEntry) {
  if (entry.entryType === "PURCHASE") return "Chicken Bought";
  if (entry.entryType === "PAYMENT") return "Payment";
  if (entry.entryType === "CUSTOMER_CREDIT") return "Customer Credit";
  if (entry.entryType === "CUSTOMER_PAYMENT") return "Money Received";
  if (entry.manualPaymentType === "HARD_CASH") return "Hard Cash";
  if (entry.manualPaymentType === "UPI") return "UPI";
  if (entry.manualPaymentType === "CREDIT") return "Credit";
  return "Expense";
}

function entryTypeLabel(entry: PassbookEntry) {
  if (entry.entryType === "PURCHASE") return "Chicken received";
  if (entry.entryType === "PAYMENT") return `${formatMethod(entry.paymentMethod)} payment`;
  if (entry.entryType === "CUSTOMER_CREDIT") return "Credit given to customer";
  if (entry.entryType === "CUSTOMER_PAYMENT") return `${formatMethod(entry.paymentMethod)} received from customer`;
  return formatManualType(entry.manualPaymentType);
}

function isMoneyIn(entry: PassbookEntry) {
  return entry.entryType === "CUSTOMER_PAYMENT" || entry.manualPaymentType === "HARD_CASH" || entry.manualPaymentType === "UPI";
}

function MobileTotal({ label, value, out = false }: { label: string; value: string; out?: boolean }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm ring-1 ring-stone-200/70">
      <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`mt-1 text-sm font-extrabold tabular-nums ${out ? "text-rose-700" : "text-emerald-700"}`}>{formatMoney(value)}</p>
    </div>
  );
}
