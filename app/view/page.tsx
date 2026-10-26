"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Receipt = {
  id: string;
  receivedAt: string;
  supplierId: string;
  supplier: string;
  chickenTypeId: string;
  chickenType: string;
  birdCount: number;
  quantityKg: string;
  purchaseRate: string;
  totalAmount: string;
  averageKgPerBird: string;
  wastageKg: string;
  meatKg: string;
  sellingRate: string;
  salesAmount: string;
  profit: string;
  paidAmount: string;
  remainingAmount: string;
};

type EntryContext = {
  chickenTypes: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
};

type EditEntry = {
  date: string;
  supplierId: string;
  chickenTypeId: string;
  birdCount: string;
  quantityKg: string;
  unitCost: string;
  suggestedSellRate: string;
};

const selectClass = "h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

const money = (value: string) => `₹${new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value))}`;

export default function ReceivedChickenView() {
  const [rows, setRows] = useState<Receipt[]>();
  const [entryContext, setEntryContext] = useState<EntryContext>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{ id: string; values: EditEntry }>();
  const [busyId, setBusyId] = useState("");

  const loadRows = useCallback(async () => {
    const response = await fetch("/api/accounting/recent-receipts");
    if (!response.ok) throw new Error("Could not load chicken.");
    setRows(await response.json() as Receipt[]);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/accounting/recent-receipts").then(async (response) => {
        if (!response.ok) throw new Error("Could not load chicken.");
        return response.json() as Promise<Receipt[]>;
      }),
      fetch(`/api/accounting/daily-entry-context?date=${new Date().toISOString().slice(0, 10)}`).then(async (response) => {
        if (!response.ok) throw new Error("Could not load edit options.");
        return response.json() as Promise<EntryContext>;
      }),
    ]).then(([loadedRows, loadedContext]) => {
      if (!active) return;
      setRows(loadedRows);
      setEntryContext(loadedContext);
    }).catch((reason: Error) => {
      if (active) setError(reason.message);
    });
    return () => { active = false; };
  }, [loadRows]);

  function beginEdit(row: Receipt) {
    setError("");
    setNotice("");
    setEditing({
      id: row.id,
      values: {
        date: row.receivedAt.slice(0, 10),
        supplierId: row.supplierId,
        chickenTypeId: row.chickenTypeId,
        birdCount: String(row.birdCount),
        quantityKg: row.quantityKg,
        unitCost: row.purchaseRate,
        suggestedSellRate: row.sellingRate,
      },
    });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusyId(editing.id);
    setError("");
    try {
      const response = await fetch("/api/accounting/receipts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `receipt-edit-${crypto.randomUUID()}`,
          itemId: editing.id,
          supplierId: editing.values.supplierId,
          receivedAt: `${editing.values.date}T18:00:00.000Z`,
          chickenTypeId: editing.values.chickenTypeId,
          birdCount: Number(editing.values.birdCount),
          quantityKg: editing.values.quantityKg,
          unitCost: editing.values.unitCost,
          suggestedSellRate: editing.values.suggestedSellRate,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update chicken.");
      await loadRows();
      setEditing(undefined);
      setNotice("Chicken entry updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update chicken.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5f1] p-4 text-stone-900 sm:p-6">
      <div className="w-full">
        <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">Chicken Mart</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Received chicken</h1>
            <p className="mt-1 text-sm text-stone-500">Purchase, usable meat, expected sales, and profit in one view.</p>
          </div>
          <Link href="/" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800">
            <Plus size={17} /> Add chicken
          </Link>
        </header>

        {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</p>}
        {notice && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
        {!rows ? (
          <p className="flex items-center gap-2 py-12 text-stone-500"><Loader2 className="animate-spin" size={18}/>Loading entries…</p>
        ) : (
          <Card className="overflow-hidden border-stone-200 shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
              <div>
                <h2 className="font-semibold">Purchase entries</h2>
                <p className="text-xs text-stone-500">{rows.length} recent {rows.length === 1 ? "entry" : "entries"}</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Backend calculated</span>
            </div>
            <div className="hidden xl:block">
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup><col className="w-[7%]"/><col className="w-[9%]"/><col className="w-[9%]"/><col className="w-[4%]"/><col className="w-[6%]"/><col className="w-[6%]"/><col className="w-[5%]"/><col className="w-[5%]"/><col className="w-[5%]"/><col className="w-[5%]"/><col className="w-[8%]"/><col className="w-[8%]"/><col className="w-[7%]"/><col className="w-[11%]"/><col className="w-[5%]"/></colgroup>
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-100/90 text-xs font-bold uppercase tracking-wide text-stone-600">
                    <Head>Date</Head>
                    <Head>Supplier</Head>
                    <Head>Chicken Type</Head>
                    <Head right>Birds</Head>
                    <Head right>Total Weight</Head>
                    <Head right>Average Weight</Head>
                    <Head right accent>Buy/Kg</Head>
                    <Head right accent>Sell/Kg</Head>
                    <Head right>Wastage</Head>
                    <Head right>Meat</Head>
                    <Head right>Total Amount</Head>
                    <Head right>Sales Amount</Head>
                    <Head right>Profit</Head>
                    <Head right>Payment</Head>
                    <Head right>Actions</Head>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.length ? rows.map((row, index) => (
                    <tr key={row.id} className={`${index % 2 ? "bg-stone-50/60" : "bg-white"} transition-colors hover:bg-emerald-50/50`}>
                      <Cell muted>{new Date(row.receivedAt).toLocaleDateString("en-IN")}</Cell>
                      <Cell><span title={row.supplier} className="block max-w-full truncate rounded-md bg-emerald-50 px-1.5 py-1 font-bold text-emerald-800">{row.supplier}</span></Cell>
                      <Cell strong><span title={row.chickenType} className="block truncate">{row.chickenType}</span></Cell>
                      <Cell right>{row.birdCount}</Cell>
                      <Cell right>{row.quantityKg} kg</Cell>
                      <Cell right>{row.averageKgPerBird} kg</Cell>
                      <Cell right className="bg-amber-50/60 font-semibold">{money(row.purchaseRate)}</Cell>
                      <Cell right className="bg-emerald-50/60 font-semibold text-emerald-800">{money(row.sellingRate)}</Cell>
                      <Cell right className="text-amber-700">{row.wastageKg} kg</Cell>
                      <Cell right strong>{row.meatKg} kg</Cell>
                      <Cell right strong>{money(row.totalAmount)}</Cell>
                      <Cell right strong>{money(row.salesAmount)}</Cell>
                      <Cell right strong className={Number(row.profit) >= 0 ? "text-emerald-700" : "text-rose-700"}>{money(row.profit)}</Cell>
                      <Cell right><PaymentStatus row={row}/></Cell>
                      <Cell right>
                        <div className="flex justify-end gap-1">
                          <button type="button" title="Edit entry" aria-label="Edit entry" onClick={() => beginEdit(row)} disabled={Boolean(busyId)} className="inline-flex size-6 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"><Pencil size={12}/></button>
                        </div>
                      </Cell>
                    </tr>
                  )) : (
                    <tr><td colSpan={15} className="p-12 text-center text-stone-500">No chicken added yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-stone-200 xl:hidden">
              {rows.length ? rows.map((row) => <article key={row.id} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="max-w-full truncate rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800" title={row.supplier}>{row.supplier}</span><time className="text-xs font-semibold text-stone-500">{new Date(row.receivedAt).toLocaleDateString("en-IN")}</time></div><h3 className="mt-2 font-bold text-stone-900">{row.chickenType}</h3></div><div className="shrink-0 text-right"><p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Profit</p><p className={`mt-1 text-lg font-extrabold tabular-nums ${Number(row.profit) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{money(row.profit)}</p></div></div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-stone-50 p-4 sm:grid-cols-3 lg:grid-cols-5"><Detail label="Birds" value={String(row.birdCount)}/><Detail label="Total weight" value={`${row.quantityKg} kg`}/><Detail label="Average" value={`${row.averageKgPerBird} kg`}/><Detail label="Wastage" value={`${row.wastageKg} kg`} warn/><Detail label="Meat" value={`${row.meatKg} kg`}/><Detail label="Buy/kg" value={money(row.purchaseRate)}/><Detail label="Sell/kg" value={money(row.sellingRate)} good/><Detail label="Purchase total" value={money(row.totalAmount)}/><Detail label="Paid" value={money(row.paidAmount)} good/><Detail label="Remaining" value={money(row.remainingAmount)} warn={hasAmount(row.remainingAmount)}/><Detail label="Expected sales" value={money(row.salesAmount)} good/></div>
                <div className="mt-3"><button type="button" onClick={() => beginEdit(row)} disabled={Boolean(busyId)} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white text-xs font-bold text-stone-700 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"><Pencil size={14}/>Edit</button></div>
              </article>) : <p className="p-12 text-center text-stone-500">No chicken added yet.</p>}
            </div>
          </Card>
        )}

        {editing && entryContext && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-entry-title">
            <Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-b-none border-stone-200 bg-white shadow-2xl sm:rounded-xl">
              <form onSubmit={saveEdit}>
                <div className="flex items-start justify-between border-b border-stone-200 px-5 py-4">
                  <div><h2 id="edit-entry-title" className="text-xl font-bold">Edit chicken entry</h2><p className="mt-1 text-sm text-stone-500">Calculated table values update after saving.</p></div>
                  <button type="button" onClick={() => setEditing(undefined)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close edit form"><X size={20}/></button>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <EditField label="Date"><Input required type="date" value={editing.values.date} onChange={(event) => setEditValue("date", event.target.value)}/></EditField>
                  <EditField label="Supplier"><select required className={selectClass} value={editing.values.supplierId} onChange={(event) => setEditValue("supplierId", event.target.value)}>{entryContext.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></EditField>
                  <EditField label="Chicken type"><select required className={selectClass} value={editing.values.chickenTypeId} onChange={(event) => setEditValue("chickenTypeId", event.target.value)}>{entryContext.chickenTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></EditField>
                  <EditField label="Birds"><Input required inputMode="numeric" value={editing.values.birdCount} onChange={(event) => setEditValue("birdCount", event.target.value)}/></EditField>
                  <EditField label="Weight (kg)"><Input required inputMode="decimal" value={editing.values.quantityKg} onChange={(event) => setEditValue("quantityKg", event.target.value)}/></EditField>
                  <EditField label="Purchase ₹/kg"><Input required inputMode="decimal" value={editing.values.unitCost} onChange={(event) => setEditValue("unitCost", event.target.value)}/></EditField>
                  <EditField label="Selling ₹/kg"><Input required inputMode="decimal" value={editing.values.suggestedSellRate} onChange={(event) => setEditValue("suggestedSellRate", event.target.value)}/></EditField>
                </div>
                <div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4">
                  <Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setEditing(undefined)}>Cancel</Button>
                  <Button type="submit" disabled={Boolean(busyId)}>{busyId && <Loader2 className="mr-2 animate-spin" size={16}/>}Save changes</Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </main>
  );

  function setEditValue(key: keyof EditEntry, value: string) {
    setEditing((current) => current ? { ...current, values: { ...current.values, [key]: value } } : current);
  }
}

function EditField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">{label}{children}</label>;
}

function Head({ children, right, accent }: { children: ReactNode; right?: boolean; accent?: boolean }) {
  return <th className={`px-2 py-3 text-xs leading-tight ${right ? "text-right" : "text-left"} ${accent ? "bg-emerald-100/60 text-emerald-800" : ""}`}>{children}</th>;
}

function Cell({ children, right, strong, muted, className = "" }: { children: ReactNode; right?: boolean; strong?: boolean; muted?: boolean; className?: string }) {
  return <td className={`min-w-0 overflow-hidden whitespace-nowrap px-2 py-3.5 text-sm ${right ? "text-right tabular-nums" : "text-left"} ${strong ? "font-bold" : ""} ${muted ? "text-stone-500" : ""} ${className}`}>{children}</td>;
}

function Detail({ label, value, good, warn }: { label: string; value: string; good?: boolean; warn?: boolean }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</p><p className={`mt-1 truncate text-sm font-bold tabular-nums ${good ? "text-emerald-700" : warn ? "text-amber-700" : "text-stone-800"}`} title={value}>{value}</p></div>;
}

function PaymentStatus({ row }: { row: Receipt }) {
  if (hasAmount(row.remainingAmount)) return <div className="flex flex-col items-end gap-0.5"><span className="font-bold text-rose-700">Due {money(row.remainingAmount)}</span><span className="text-[10px] text-stone-400">Paid {money(row.paidAmount)}</span></div>;
  return <span className="rounded-md bg-emerald-50 px-1.5 py-1 text-[11px] font-bold text-emerald-800">Paid</span>;
}

function hasAmount(value: string) {
  return !/^0(?:\.0+)?$/.test(value);
}
