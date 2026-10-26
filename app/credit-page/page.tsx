"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CreditPayment = { id: string; paidAt: string; amount: string; method: "CASH" | "UPI" | "NET_BANKING"; createdAt: string };
type Customer = { id: string; name: string; phone: string | null; address: string };
type CreditEntry = { id: string; customerName: string; description: string; amount: string; paidAmount: string; remainingAmount: string; creditedAt: string; createdAt: string; payments: CreditPayment[] };
type FormValues = { customerName: string; description: string; amount: string; creditedAt: string };
type PaymentForm = { entry: CreditEntry; amount: string; paidAt: string; paymentMethod: CreditPayment["method"] };
type CustomerForm = { name: string; address: string };
const today = () => new Date().toISOString().slice(0, 10);
function money(value: string) {
  const [wholePart = "0", decimalPart = ""] = value.split(".");
  const negative = wholePart.startsWith("-");
  const digits = negative ? wholePart.slice(1) : wholePart;
  const grouped = new Intl.NumberFormat("en-IN").format(BigInt(digits || "0"));
  return `${negative ? "-" : ""}₹${grouped}.${decimalPart.padEnd(2, "0").slice(0, 2)}`;
}
function moneyInPaise(value: string) {
  const [wholePart = "0", decimalPart = ""] = value.split(".");
  return BigInt(wholePart || "0") * BigInt(100) + BigInt(decimalPart.padEnd(2, "0").slice(0, 2) || "0");
}

export default function CustomerCreditPage() {
  const [entries, setEntries] = useState<CreditEntry[]>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [form, setForm] = useState<FormValues>({ customerName: "", description: "", amount: "", creditedAt: "" });
  const [customerForm, setCustomerForm] = useState<CustomerForm>({ name: "", address: "" });
  const [paymentForm, setPaymentForm] = useState<PaymentForm>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadEntries = useCallback(async () => {
    const response = await fetch("/api/accounting/customer-credit-entries", { cache: "no-store" });
    const result = await response.json() as CreditEntry[] & { error?: string };
    if (!response.ok) throw new Error(result.error || "Could not load customer credit entries.");
    setEntries(result);
  }, []);
  const loadCustomers = useCallback(async () => {
    const response = await fetch("/api/accounting/customer-credit-customers", { cache: "no-store" });
    const result = await response.json() as Customer[] & { error?: string };
    if (!response.ok) throw new Error(result.error || "Could not load customers.");
    setCustomers(result);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void Promise.all([loadEntries(), loadCustomers()]).catch((reason: Error) => setError(reason.message));
  }, [loadEntries, loadCustomers]);

  async function addCustomer(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/credit-customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `credit-customer-${crypto.randomUUID()}`, ...customerForm }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not add customer.");
      await loadCustomers();
      setForm((current) => ({ ...current, customerName: customerForm.name.trim() }));
      setCustomerForm({ name: "", address: "" });
      setCustomerOpen(false); setNotice("Customer added.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add customer."); }
    finally { setBusy(false); }
  }

  async function addEntry(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/customer-credit-entries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `customer-credit-entry-${crypto.randomUUID()}`, ...form, creditedAt: `${form.creditedAt}T18:00:00.000Z` }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save credit entry.");
      await loadEntries();
      setForm({ customerName: "", description: "", amount: "", creditedAt: "" });
      setFormOpen(false); setNotice("Credit entry added.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save credit entry."); }
    finally { setBusy(false); }
  }

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    if (!paymentForm) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/customer-credit-entry-payments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `customer-credit-entry-payment-${crypto.randomUUID()}`,
          customerCreditEntryId: paymentForm.entry.id,
          amount: paymentForm.amount,
          paidAt: `${paymentForm.paidAt}T18:00:00.000Z`,
          paymentMethod: paymentForm.paymentMethod,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not record customer payment.");
      await loadEntries();
      const paidInFull = moneyInPaise(paymentForm.amount) === moneyInPaise(paymentForm.entry.remainingAmount);
      setPaymentForm(undefined);
      setNotice(paidInFull ? "Payment recorded in the Passbook. This credit is now fully paid." : "Partial payment recorded in the Passbook.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not record customer payment."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#f7f5f1] p-4 text-stone-900 sm:p-6">
    <div className="w-full">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">Chicken Mart</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Customer credit</h1><p className="mt-1 text-sm text-stone-500">A simple record of money customers owe.</p></div>
        <div className="flex gap-2"><Link href="/" className="inline-flex h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50">Back</Link><Button type="button" onClick={() => { setError(""); setNotice(""); setCustomerForm({ name: "", address: "" }); setCustomerOpen(true); }} className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-50"><Plus size={17}/>Add customer</Button><Button type="button" onClick={() => { setError(""); setNotice(""); setForm({ customerName: customers[0]?.name ?? "", description: "", amount: "", creditedAt: today() }); setFormOpen(true); }} className="gap-2"><Plus size={17}/>Add entry</Button></div>
      </header>
      {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</p>}
      {notice && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
      {!entries ? <p className="flex items-center gap-2 py-12 text-stone-500"><Loader2 className="animate-spin" size={18}/>Loading entries…</p> : <Card className="overflow-hidden border-stone-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4"><div><h2 className="font-semibold">Credit ledger</h2><p className="text-xs text-stone-500">{entries.length} {entries.length === 1 ? "entry" : "entries"}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Money owed to us</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] table-fixed border-collapse text-sm"><colgroup><col className="w-[15%]"/><col className="w-[18%]"/><col className="w-[22%]"/><col className="w-[14%]"/><col className="w-[14%]"/><col className="w-[17%]"/></colgroup><thead><tr className="border-b border-stone-200 bg-stone-100/90 text-xs font-bold uppercase tracking-wide text-stone-600"><Head>Date</Head><Head>Customer</Head><Head>Description</Head><Head right>Credited</Head><Head right>Remaining</Head><Head right>Record payment</Head></tr></thead><tbody className="divide-y divide-stone-100">{entries.length ? entries.map((entry) => <tr key={entry.id} className="bg-white transition-colors hover:bg-emerald-50/50"><Cell muted>{new Date(entry.creditedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Cell><Cell strong>{entry.customerName}</Cell><Cell><span className="block truncate" title={entry.description}>{entry.description}</span>{moneyInPaise(entry.paidAmount) > BigInt(0) && <span className="mt-1 block text-xs font-semibold text-emerald-700">Paid {money(entry.paidAmount)}</span>}</Cell><Cell right strong className="text-stone-900">{money(entry.amount)}</Cell><Cell right strong className="text-rose-700">{money(entry.remainingAmount)}</Cell><Cell right><Button type="button" className="h-9 bg-emerald-700 px-3 text-xs hover:bg-emerald-800" onClick={() => { setError(""); setNotice(""); setPaymentForm({ entry, amount: "", paidAt: today(), paymentMethod: "CASH" }); }}>Record payment</Button></Cell></tr>) : <tr><td colSpan={6} className="p-14 text-center text-stone-500">No unpaid customer credit remains. Add a new credit entry when needed.</td></tr>}</tbody></table></div>
      </Card>}
    </div>
    {formOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="credit-entry-title"><Card className="w-full max-w-lg rounded-b-none bg-white shadow-2xl sm:rounded-xl"><form onSubmit={addEntry}><div className="flex items-start justify-between border-b border-stone-200 px-5 py-4"><div><h2 id="credit-entry-title" className="text-xl font-bold">Add customer credit</h2><p className="mt-1 text-sm text-stone-500">Record money a customer now owes.</p></div><button type="button" onClick={() => setFormOpen(false)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={20}/></button></div><div className="grid gap-4 p-5">{customers.length ? <Field label="Customer"><select required value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">{customers.map((customer) => <option key={customer.id} value={customer.name}>{customer.name}</option>)}</select></Field> : <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Add a customer first, then reopen this form.</p>}<Field label="Credit description"><Input required maxLength={200} placeholder="e.g. Chicken order" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Amount credited"><Input required min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })}/></Field><Field label="Date"><Input required type="date" value={form.creditedAt} onChange={(event) => setForm({ ...form, creditedAt: event.target.value })}/></Field></div></div><div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4"><Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !customers.length}>{busy && <Loader2 className="mr-2 animate-spin" size={16}/>}Save entry</Button></div></form></Card></div>}
    {customerOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-customer-title"><Card className="w-full max-w-lg rounded-b-none bg-white shadow-2xl sm:rounded-xl"><form onSubmit={addCustomer}><div className="flex items-start justify-between border-b border-stone-200 px-5 py-4"><div><h2 id="add-customer-title" className="text-xl font-bold">Add customer</h2><p className="mt-1 text-sm text-stone-500">This name will appear in the credit entry dropdown.</p></div><button type="button" onClick={() => setCustomerOpen(false)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={20}/></button></div><div className="grid gap-4 p-5"><Field label="Name"><Input required maxLength={140} value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}/></Field><Field label="Address"><Input required maxLength={500} value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })}/></Field></div><div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4"><Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setCustomerOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 animate-spin" size={16}/>}Save customer</Button></div></form></Card></div>}
    {paymentForm && <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="record-payment-title"><Card className="w-full max-w-lg rounded-b-none bg-white shadow-2xl sm:rounded-xl"><form onSubmit={recordPayment}><div className="flex items-start justify-between border-b border-stone-200 px-5 py-4"><div><h2 id="record-payment-title" className="text-xl font-bold">Record customer payment</h2><p className="mt-1 text-sm text-stone-500">{paymentForm.entry.customerName} · {money(paymentForm.entry.remainingAmount)} remaining</p></div><button type="button" onClick={() => setPaymentForm(undefined)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={20}/></button></div><div className="grid gap-4 p-5"><div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"><span className="font-semibold">Credit:</span> {paymentForm.entry.description}</div><div className="grid gap-4 sm:grid-cols-2"><Field label="Amount received"><Input required min="0.01" max={paymentForm.entry.remainingAmount} step="0.01" inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })}/></Field><Field label="Payment date"><Input required type="date" min={paymentForm.entry.creditedAt.slice(0, 10)} value={paymentForm.paidAt} onChange={(event) => setPaymentForm({ ...paymentForm, paidAt: event.target.value })}/></Field></div><Field label="Paid through"><select required value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value as CreditPayment["method"] })} className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="NET_BANKING">Net banking</option></select></Field><p className="text-xs leading-5 text-stone-500">This collection will increase the Passbook balance. When the remaining amount reaches zero, this credit will leave the active list.</p></div><div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4"><Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setPaymentForm(undefined)}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 animate-spin" size={16}/>}Record payment</Button></div></form></Card></div>}
  </main>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">{label}{children}</label>; }
function Head({ children, right }: { children: ReactNode; right?: boolean }) { return <th className={`px-4 py-3 text-[10px] leading-tight ${right ? "text-right" : "text-left"}`}>{children}</th>; }
function Cell({ children, right, strong, muted, className = "" }: { children: ReactNode; right?: boolean; strong?: boolean; muted?: boolean; className?: string }) { return <td className={`break-words px-4 py-3.5 ${right ? "text-right tabular-nums" : "text-left"} ${strong ? "font-bold" : ""} ${muted ? "text-stone-500" : ""} ${className}`}>{children}</td>; }
