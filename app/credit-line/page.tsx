"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Printer, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { summarizeSupplierPayments } from "@/lib/accounting/supplier-credit-summary";

type Supplier = { id: string; name: string };

type Receipt = {
  id: string;
  payableId: string;
  receivedAt: string;
  supplierId: string;
  supplier: string;
  chickenType: string;
  birdCount: number;
  quantityKg: string;
  purchaseRate: string;
  averageKgPerBird: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  paymentMethod: string | null;
  status: "OPEN" | "PARTIALLY_PAID" | "PAID";
};

type SupplierPayment = {
  supplierId: string;
  paidAt: string;
  paymentAmount: string;
  method: "CASH" | "UPI" | "NET_BANKING";
};
type PaymentHistory = { id: string; supplierId: string; supplier: string; paidAt: string; amount: string; method: string };

const money = (value: string) => {
  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return `₹${value}`;
  const grouped = new Intl.NumberFormat("en-IN").format(BigInt(match[2]));
  return `${match[1]}₹${grouped}.${(match[3] ?? "").padEnd(2, "0")}`;
};

function paise(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return BigInt(0);
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function rupees(value: bigint) {
  return money(`${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, "0")}`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export default function CreditLinePage() {
  const [rows, setRows] = useState<Receipt[]>();
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [payment, setPayment] = useState<SupplierPayment>();
  const [saving, setSaving] = useState(false);

  const loadRows = useCallback(async () => {
    const response = await fetch("/api/accounting/supplier-credit-lines");
    if (!response.ok) throw new Error("Could not load credit entries.");
    setRows(await response.json() as Receipt[]);
  }, []);
  const loadPaymentHistory = useCallback(async () => {
    const response = await fetch("/api/accounting/supplier-payment-history");
    if (!response.ok) throw new Error("Could not load supplier payments.");
    setPaymentHistory(await response.json() as PaymentHistory[]);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/accounting/supplier-credit-lines").then(async (response) => {
        if (!response.ok) throw new Error("Could not load credit entries.");
        return response.json() as Promise<Receipt[]>;
      }),
      fetch("/api/accounting/credit-line-suppliers").then(async (response) => {
        if (!response.ok) throw new Error("Could not load suppliers.");
        return response.json() as Promise<Supplier[]>;
      }),
      fetch("/api/accounting/supplier-payment-history").then(async (response) => {
        if (!response.ok) return [] as PaymentHistory[];
        return response.json() as Promise<PaymentHistory[]>;
      }),
    ]).then(([loadedRows, loadedSuppliers, loadedPayments]) => {
      if (!active) return;
      const creditSupplierMap = new Map<string, Supplier>();
      for (const supplier of loadedSuppliers) {
        if (["KSP", "NPF"].includes(supplier.name.trim().toUpperCase())) creditSupplierMap.set(supplier.id, supplier);
      }
      for (const row of loadedRows) {
        if (["KSP", "NPF"].includes(row.supplier.trim().toUpperCase())) creditSupplierMap.set(row.supplierId, { id: row.supplierId, name: row.supplier });
      }
      const creditSuppliers = [...creditSupplierMap.values()].sort((left, right) => left.name.localeCompare(right.name));
      setRows(loadedRows);
      setPaymentHistory(loadedPayments);
      setSuppliers(creditSuppliers);
      setSupplierId(creditSuppliers.find((supplier) => supplier.name.trim().toUpperCase() === "KSP")?.id ?? creditSuppliers[0]?.id ?? "");
    }).catch((reason: Error) => {
      if (active) setError(reason.message);
    });

    return () => { active = false; };
  }, []);

  function startPayment() {
    setError("");
    setNotice("");
    setPayment({ supplierId: supplierId || suppliers[0]?.id || "", paidAt: new Date().toISOString().slice(0, 10), paymentAmount: "", method: "CASH" });
  }

  function printStatement() {
    if (!selectedSupplier) return;
    const supplierName = selectedSupplier.name.trim().toUpperCase();
    const supplierRows = rows?.filter((row) => row.supplier.trim().toUpperCase() === supplierName) ?? [];
    const supplierPayments = paymentHistory.filter((entry) => entry.supplier.trim().toUpperCase() === supplierName);
    const uniqueBills = new Map(supplierRows.map((row) => [row.payableId, row]));
    const totalPurchases = [...uniqueBills.values()].reduce((total, row) => total + paise(row.totalAmount), BigInt(0));
    const totalPaid = supplierPayments.reduce((total, entry) => total + paise(entry.amount), BigInt(0));
    const outstanding = totalPurchases - totalPaid;
    const statement = `<!doctype html><html><head><title>${escapeHtml(selectedSupplier.name)} supplier statement</title><style>
      *{box-sizing:border-box}body{margin:0;color:#000;font-family:Arial,sans-serif;font-size:12px}main{max-width:900px;margin:0 auto;padding:34px 38px}.header{border-bottom:3px solid #000;padding-bottom:18px;margin-bottom:22px}.brand{font-size:25px;font-weight:800;letter-spacing:.02em}.address{margin-top:5px;color:#000;font-size:13px}.title{margin-top:24px;font-size:20px;font-weight:700}.meta{display:flex;justify-content:space-between;margin:18px 0 20px;padding:12px 14px;background:#f5f5f5;border:1px solid #000}.meta strong{display:block;margin-top:4px;font-size:15px}.section{margin-top:22px}.section h2{font-size:14px;margin:0 0 8px;border-bottom:1px solid #000;padding-bottom:7px}table{width:100%;border-collapse:collapse}th{background:#f0f0f0;color:#000;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em}th,td{padding:8px 7px;border-bottom:1px solid #000}td.num,th.num{text-align:right}.summary{margin:25px 0 0 auto;width:330px;border:1px solid #000}.summary div{display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #000}.summary div:last-child{border:0;background:#f0f0f0;font-size:15px;font-weight:800;color:#000} @media print{main{padding:0}.no-print{display:none}}
    </style></head><body><main><div class="header"><div class="brand">Chikken Mart</div><div class="address">Hardware Complex, Hirebyle, 577121</div><div class="title">Supplier Account Statement</div></div><div class="meta"><div>Supplier<strong>${escapeHtml(selectedSupplier.name)}</strong></div><div>Statement date<strong>${new Date().toLocaleDateString("en-IN")}</strong></div></div><div class="section"><h2>Purchases</h2><table><thead><tr><th>Date</th><th>Chicken</th><th class="num">Birds</th><th class="num">Total weight</th><th class="num">Average weight</th><th class="num">Rate/kg</th><th class="num">Amount</th></tr></thead><tbody>${supplierRows.map((row) => `<tr><td>${new Date(row.receivedAt).toLocaleDateString("en-IN")}</td><td>${escapeHtml(row.chickenType)}</td><td class="num">${row.birdCount}</td><td class="num">${escapeHtml(row.quantityKg)} kg</td><td class="num">${escapeHtml(row.averageKgPerBird)} kg</td><td class="num">${money(row.purchaseRate)}</td><td class="num">${money(row.totalAmount)}</td></tr>`).join("") || '<tr><td colspan="7">No purchases recorded.</td></tr>'}</tbody></table></div><div class="section"><h2>Payments</h2><table><thead><tr><th>Date</th><th>Method</th><th class="num">Amount paid</th></tr></thead><tbody>${supplierPayments.map((entry) => `<tr><td>${new Date(entry.paidAt).toLocaleDateString("en-IN")}</td><td>${escapeHtml(formatMethod(entry.method))}</td><td class="num">${money(entry.amount)}</td></tr>`).join("") || '<tr><td colspan="3">No payments recorded.</td></tr>'}</tbody></table></div><div class="summary"><div><span>Total purchases</span><strong>${rupees(totalPurchases)}</strong></div><div><span>Total paid</span><strong>${rupees(totalPaid)}</strong></div><div><span>Amount payable to supplier</span><strong>${rupees(outstanding)}</strong></div></div></main><script>window.onload=()=>window.print();</script></body></html>`;
    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) { setError("Please allow pop-ups to print the statement."); return; }
    printWindow.document.write(statement);
    printWindow.document.close();
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault();
    if (!payment) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/accounting/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `supplier-payment-batch-${crypto.randomUUID()}`,
          supplierId: payment.supplierId,
          paidAt: `${payment.paidAt}T18:00:00.000Z`,
          paymentAmount: payment.paymentAmount || "0",
          paymentMethod: payment.method,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not record payment.");
      await loadRows();
      await loadPaymentHistory();
      setPayment(undefined);
      setNotice("Payment recorded and passbook updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record payment.");
    } finally {
      setSaving(false);
    }
  }

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
  const filteredRows = useMemo(
    () => rows?.filter((row) => row.supplier.trim().toUpperCase() === (selectedSupplier?.name ?? "").trim().toUpperCase()) ?? [],
    [rows, selectedSupplier],
  );
  const paymentSummaries = useMemo(() => summarizeSupplierPayments(rows ?? []), [rows]);
  const selectedSummary = paymentSummaries.find((summary) => summary.supplier.trim().toUpperCase() === (suppliers.find((supplier) => supplier.id === payment?.supplierId)?.name ?? "").trim().toUpperCase());

  return (
    <main className="min-h-screen bg-[#f7f5f1] p-4 text-stone-900 sm:p-6">
      <div className="w-full">
        <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">Chicken Mart</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Credit line</h1>
            <p className="mt-1 text-sm text-stone-500">Track supplier payments and remaining balances.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid min-w-52 gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">Supplier<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            <div className="flex gap-2">
              <Button type="button" onClick={printStatement} disabled={!selectedSupplier} className="h-11 border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100"><Printer size={16}/>Print statement</Button>
              <Button type="button" onClick={startPayment} disabled={!suppliers.length} className="h-11"><WalletCards size={16}/>Record payment</Button>
            </div>
          </div>
        </header>

        {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</p>}
        {notice && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
        {!rows ? (
          <p className="flex items-center gap-2 py-12 text-stone-500"><Loader2 className="animate-spin" size={18}/>Loading entries…</p>
        ) : (<>
          <section className="mb-5 grid gap-4 sm:grid-cols-2" aria-label="Supplier payments pending">
            {paymentSummaries.map((summary) => <Card key={summary.supplier} className="border-emerald-200 bg-emerald-50 px-5 py-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-emerald-700">{summary.supplier} payment to make</p>
              <p className="mt-2 text-3xl font-extrabold tabular-nums text-emerald-950">{money(summary.amount)}</p>
              <p className="mt-2 text-sm text-emerald-800">{summary.pendingInvoices ? `${summary.pendingInvoices} pending ${summary.pendingInvoices === 1 ? "entry" : "entries"} still need payment.` : `Nothing is currently payable to ${summary.supplier}.`}</p>
            </Card>)}
          </section>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="overflow-hidden border-stone-200 shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4">
              <div>
                <h2 className="font-semibold">{selectedSupplier?.name ?? "Supplier"} entries</h2>
                <p className="text-xs text-stone-500">{filteredRows.length} {filteredRows.length === 1 ? "entry" : "entries"}</p>
              </div>
            </div>
            <div className="overflow-x-auto xl:overflow-visible">
              <table className="w-full min-w-[1180px] border-collapse text-sm xl:min-w-0 xl:table-fixed">
                <colgroup><col className="w-[8%]"/><col className="w-[9%]"/><col className="w-[10%]"/><col className="w-[6%]"/><col className="w-[9%]"/><col className="w-[10%]"/><col className="w-[10%]"/><col className="w-[11%]"/><col className="w-[9%]"/><col className="w-[10%]"/><col className="w-[8%]"/></colgroup>
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-100/90 text-xs font-bold uppercase tracking-wide text-stone-600">
                    <Head>Date</Head>
                    <Head>Supplier</Head>
                    <Head>Chicken</Head>
                    <Head right>Birds</Head>
                    <Head right>Bought / kg</Head>
                    <Head right>Total Weight</Head>
                    <Head right>Average Weight</Head>
                    <Head right>Total Amount</Head>
                    <Head right>Paid</Head>
                    <Head right>Remaining</Head>
                    <Head>Through</Head>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredRows.length ? filteredRows.map((row, index) => (
                    <tr key={row.id} className={`${index % 2 ? "bg-stone-50/60" : "bg-white"} transition-colors hover:bg-emerald-50/50`}>
                      <Cell muted>{new Date(row.receivedAt).toLocaleDateString("en-IN")}</Cell>
                      <Cell><span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800">{row.supplier}</span></Cell>
                      <Cell strong>{row.chickenType}</Cell>
                      <Cell right>{row.birdCount}</Cell>
                      <Cell right strong>{money(row.purchaseRate)}</Cell>
                      <Cell right>{row.quantityKg} kg</Cell>
                      <Cell right>{row.averageKgPerBird} kg</Cell>
                      <Cell right strong>{money(row.totalAmount)}</Cell>
                      <Cell right className="font-semibold text-emerald-700">{money(row.paidAmount)}</Cell>
                      <Cell right strong className={row.status === "PAID" ? "text-emerald-700" : "text-rose-700"}>{money(row.remainingAmount)}</Cell>
                      <Cell><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-700">{formatMethod(row.paymentMethod)}</span></Cell>
                    </tr>
                  )) : (
                    <tr><td colSpan={11} className="p-12 text-center text-stone-500">No entries for {selectedSupplier?.name ?? "this supplier"} yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="overflow-hidden border-stone-200 shadow-sm">
            <div className="border-b border-stone-200 bg-white px-5 py-4">
              <h2 className="font-semibold">Supplier payments</h2>
              <p className="text-xs text-stone-500">Payments recorded from the button above</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-stone-200 bg-stone-100/90 text-left text-[11px] font-bold uppercase tracking-wide text-stone-600"><th className="px-4 py-3">Date</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Through</th></tr></thead>
                <tbody className="divide-y divide-stone-100">
                  {paymentHistory.filter((payment) => ["KSP", "NPF"].includes(payment.supplier.trim().toUpperCase())).map((payment) => <tr key={payment.id} className="bg-white"><td className="whitespace-nowrap px-4 py-3 text-xs text-stone-500">{new Date(payment.paidAt).toLocaleDateString("en-IN")}</td><td className="px-4 py-3 text-xs font-bold">{payment.supplier}</td><td className="px-4 py-3 text-right text-xs font-bold tabular-nums text-emerald-700">{money(payment.amount)}</td><td className="px-4 py-3 text-xs">{formatMethod(payment.method)}</td></tr>)}
                  {!paymentHistory.length && <tr><td colSpan={4} className="p-10 text-center text-sm text-stone-500">No supplier payments recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          </div>
        </>)}

        {payment && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="payment-title">
            <Card className="w-full max-w-lg rounded-b-none border-stone-200 bg-white shadow-2xl sm:rounded-xl">
              <form onSubmit={savePayment}>
                <div className="flex items-start justify-between border-b border-stone-200 px-5 py-4">
                  <div>
                    <h2 id="payment-title" className="text-xl font-bold">Record payment</h2>
                    <p className="mt-1 text-sm text-stone-500">{suppliers.find((supplier) => supplier.id === payment.supplierId)?.name ?? "Supplier"} · Total owed {money(selectedSummary?.amount ?? "0")}</p>
                  </div>
                  <button type="button" onClick={() => setPayment(undefined)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close payment form"><X size={20}/></button>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label="Supplier"><select required value={payment.supplierId} onChange={(event) => updatePayment("supplierId", event.target.value)} className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
                  <Field label="Date"><Input required type="date" value={payment.paidAt} onChange={(event) => updatePayment("paidAt", event.target.value)}/></Field>
                  <Field label="Paid through">
                    <select value={payment.method} onChange={(event) => updatePayment("method", event.target.value as SupplierPayment["method"])} className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="NET_BANKING">Net Banking</option>
                    </select>
                  </Field>
                  <Field label="Payment amount"><Input required inputMode="decimal" placeholder="0.00" max={selectedSummary?.amount} value={payment.paymentAmount} onChange={(event) => updatePayment("paymentAmount", event.target.value)}/></Field>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-stone-500">Payment cannot exceed the invoice balance.</p>
                  </div>
                </div>
                <div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4">
                  <Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setPayment(undefined)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 animate-spin" size={16}/>}Save payment</Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </main>
  );

  function updatePayment(key: keyof SupplierPayment, value: string) {
    setPayment((current) => current ? { ...current, [key]: value } as SupplierPayment : current);
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
