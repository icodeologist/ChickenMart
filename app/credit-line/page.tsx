"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Supplier = { id: string; name: string };
type Account = { id: string; type: "CASH" | "BANK" };

type Receipt = {
  id: string;
  payableId: string;
  receivedAt: string;
  supplierId: string;
  supplier: string;
  chickenType: string;
  birdCount: number;
  quantityKg: string;
  averageKgPerBird: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  paymentMethod: string | null;
  status: "OPEN" | "PARTIALLY_PAID" | "PAID";
};

type Settlement = {
  row: Receipt;
  paidAt: string;
  paymentAmount: string;
  method: "CASH" | "UPI" | "NET_BANKING";
};

const money = (value: string) => `₹${new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value))}`;

export default function CreditLinePage() {
  const [rows, setRows] = useState<Receipt[]>();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settlement, setSettlement] = useState<Settlement>();
  const [saving, setSaving] = useState(false);

  const loadRows = useCallback(async () => {
    const response = await fetch("/api/accounting/supplier-credit-lines");
    if (!response.ok) throw new Error("Could not load credit entries.");
    setRows(await response.json() as Receipt[]);
  }, []);

  useEffect(() => {
    let active = true;
    const today = new Date().toISOString().slice(0, 10);

    void Promise.all([
      fetch("/api/accounting/supplier-credit-lines").then(async (response) => {
        if (!response.ok) throw new Error("Could not load credit entries.");
        return response.json() as Promise<Receipt[]>;
      }),
      fetch(`/api/accounting/daily-entry-context?date=${today}`).then(async (response) => {
        if (!response.ok) throw new Error("Could not load suppliers.");
        return response.json() as Promise<{ suppliers: Supplier[]; accounts: Account[] }>;
      }),
    ]).then(([loadedRows, context]) => {
      if (!active) return;
      const creditSuppliers = context.suppliers.filter((supplier) => supplier.name === "KSP" || supplier.name === "NPF");
      setRows(loadedRows);
      setSuppliers(creditSuppliers);
      setAccounts(context.accounts);
      setSupplierId(creditSuppliers.find((supplier) => supplier.name === "KSP")?.id ?? creditSuppliers[0]?.id ?? "");
    }).catch((reason: Error) => {
      if (active) setError(reason.message);
    });

    return () => { active = false; };
  }, []);

  function startSettlement(row: Receipt) {
    setError("");
    setNotice("");
    setSettlement({ row, paidAt: new Date().toISOString().slice(0, 10), paymentAmount: "", method: "CASH" });
  }

  async function saveSettlement(event: FormEvent) {
    event.preventDefault();
    if (!settlement) return;
    const accountType = settlement.method === "CASH" ? "CASH" : "BANK";
    const accountId = accounts.find((account) => account.type === accountType)?.id;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/accounting/supplier-settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `supplier-settlement-${crypto.randomUUID()}`,
          payableId: settlement.row.payableId,
          paidAt: `${settlement.paidAt}T18:00:00.000Z`,
          accountId,
          paymentAmount: settlement.paymentAmount || "0",
          paymentMethod: settlement.method,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not record payment.");
      await loadRows();
      setSettlement(undefined);
      setNotice("Payment record updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record payment.");
    } finally {
      setSaving(false);
    }
  }

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
  const filteredRows = useMemo(
    () => rows?.filter((row) => row.supplierId === supplierId) ?? [],
    [rows, supplierId],
  );

  return (
    <main className="min-h-screen bg-[#f7f5f1] p-4 text-stone-900 sm:p-6">
      <div className="w-full">
        <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">Chicken Mart</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Credit line</h1>
            <p className="mt-1 text-sm text-stone-500">Track supplier payments and remaining balances.</p>
          </div>
          <label className="grid min-w-52 gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">
            Supplier
            <select
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            >
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
        </header>

        {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</p>}
        {notice && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
        {!rows ? (
          <p className="flex items-center gap-2 py-12 text-stone-500"><Loader2 className="animate-spin" size={18}/>Loading entries…</p>
        ) : (
          <Card className="overflow-hidden border-stone-200 shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
              <div>
                <h2 className="font-semibold">{selectedSupplier?.name ?? "Supplier"} entries</h2>
                <p className="text-xs text-stone-500">{filteredRows.length} {filteredRows.length === 1 ? "entry" : "entries"}</p>
              </div>
            </div>
            <div className="overflow-x-auto xl:overflow-visible">
              <table className="w-full min-w-[1080px] border-collapse text-sm xl:min-w-0 xl:table-fixed">
                <colgroup><col className="w-[8%]"/><col className="w-[8%]"/><col className="w-[10%]"/><col className="w-[5%]"/><col className="w-[8%]"/><col className="w-[9%]"/><col className="w-[11%]"/><col className="w-[8%]"/><col className="w-[10%]"/><col className="w-[8%]"/><col className="w-[15%]"/></colgroup>
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-100/90 text-xs font-bold uppercase tracking-wide text-stone-600">
                    <Head>Date</Head>
                    <Head>Supplier</Head>
                    <Head>Chicken Type</Head>
                    <Head right>Birds</Head>
                    <Head right>Total Weight</Head>
                    <Head right>Average Weight</Head>
                    <Head right>Total Amount</Head>
                    <Head right>Paid</Head>
                    <Head right>Remaining</Head>
                    <Head>Through</Head>
                    <Head right>Action</Head>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredRows.length ? filteredRows.map((row, index) => (
                    <tr key={row.id} className={`${index % 2 ? "bg-stone-50/60" : "bg-white"} transition-colors hover:bg-emerald-50/50`}>
                      <Cell muted>{new Date(row.receivedAt).toLocaleDateString("en-IN")}</Cell>
                      <Cell><span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800">{row.supplier}</span></Cell>
                      <Cell strong>{row.chickenType}</Cell>
                      <Cell right>{row.birdCount}</Cell>
                      <Cell right>{row.quantityKg} kg</Cell>
                      <Cell right>{row.averageKgPerBird} kg</Cell>
                      <Cell right strong>{money(row.totalAmount)}</Cell>
                      <Cell right className="font-semibold text-emerald-700">{money(row.paidAmount)}</Cell>
                      <Cell right strong className={row.status === "PAID" ? "text-emerald-700" : "text-rose-700"}>{money(row.remainingAmount)}</Cell>
                      <Cell><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-700">{formatMethod(row.paymentMethod)}</span></Cell>
                      <Cell right>
                        <button type="button" disabled={row.status === "PAID"} onClick={() => startSettlement(row)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500">
                          <WalletCards size={14}/>{row.status === "PAID" ? "Paid" : "Record payment"}
                        </button>
                      </Cell>
                    </tr>
                  )) : (
                    <tr><td colSpan={11} className="p-12 text-center text-stone-500">No entries for {selectedSupplier?.name ?? "this supplier"} yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {settlement && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="payment-title">
            <Card className="w-full max-w-lg rounded-b-none border-stone-200 bg-white shadow-2xl sm:rounded-xl">
              <form onSubmit={saveSettlement}>
                <div className="flex items-start justify-between border-b border-stone-200 px-5 py-4">
                  <div>
                    <h2 id="payment-title" className="text-xl font-bold">Record payment</h2>
                    <p className="mt-1 text-sm text-stone-500">{settlement.row.supplier} · Remaining {money(settlement.row.remainingAmount)}</p>
                  </div>
                  <button type="button" onClick={() => setSettlement(undefined)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close payment form"><X size={20}/></button>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label="Date"><Input required type="date" value={settlement.paidAt} onChange={(event) => updateSettlement("paidAt", event.target.value)}/></Field>
                  <Field label="Paid through">
                    <select value={settlement.method} onChange={(event) => updateSettlement("method", event.target.value as Settlement["method"])} className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="NET_BANKING">Net Banking</option>
                    </select>
                  </Field>
                  <Field label="Payment amount"><Input required inputMode="decimal" placeholder="0.00" value={settlement.paymentAmount} onChange={(event) => updateSettlement("paymentAmount", event.target.value)}/></Field>
                </div>
                <div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4">
                  <Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setSettlement(undefined)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 animate-spin" size={16}/>}Save payment</Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </main>
  );

  function updateSettlement(key: keyof Omit<Settlement, "row">, value: string) {
    setSettlement((current) => current ? { ...current, [key]: value } as Settlement : current);
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">{label}{children}</label>;
}

function formatMethod(method: string | null) {
  if (!method) return "Not paid";
  return method.split(" + ").map((part) => part === "NET_BANKING" ? "Net Banking" : part === "CASH" ? "Cash" : "UPI").join(" + ");
}

function Head({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={`px-2 py-3 text-[11px] leading-tight ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

function Cell({ children, right, strong, muted, className = "" }: { children: ReactNode; right?: boolean; strong?: boolean; muted?: boolean; className?: string }) {
  return <td className={`overflow-hidden text-ellipsis whitespace-nowrap px-2 py-3 text-xs ${right ? "text-right tabular-nums" : "text-left"} ${strong ? "font-bold" : ""} ${muted ? "text-stone-500" : ""} ${className}`}>{children}</td>;
}
