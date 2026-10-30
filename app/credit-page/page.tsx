"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CreditPayment = { id: string; paidAt: string; amount: string; method: "CASH" | "UPI" | "NET_BANKING"; createdAt: string };
type Customer = { id: string; name: string; phone: string | null; address: string };
type CreditEntry = { id: string; customerName: string; description: string; amount: string; paidAmount: string; remainingAmount: string; creditedAt: string; createdAt: string; payments: CreditPayment[] };
type FormValues = { customerName: string; description: string; amount: string; creditedAt: string };
type PaymentForm = { entry: CreditEntry; amount: string; paidAt: string; paymentMethod: CreditPayment["method"] };
type PaymentEdit = { id: string; customer: string; amount: string; paidAt: string; paymentMethod: CreditPayment["method"] };
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
  const [customerSearch, setCustomerSearch] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [form, setForm] = useState<FormValues>({ customerName: "", description: "", amount: "", creditedAt: "" });
  const [customerForm, setCustomerForm] = useState<CustomerForm>({ name: "", address: "" });
  const [paymentForm, setPaymentForm] = useState<PaymentForm>();
  const [editingEntry, setEditingEntry] = useState<{ id: string; values: FormValues }>();
  const [editingPayment, setEditingPayment] = useState<PaymentEdit>();
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

  async function saveEditedEntry(event: FormEvent) {
    event.preventDefault();
    if (!editingEntry) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/customer-credit-entries", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `customer-credit-entry-edit-${crypto.randomUUID()}`, customerCreditEntryId: editingEntry.id, ...editingEntry.values, creditedAt: `${editingEntry.values.creditedAt}T18:00:00.000Z` }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not edit credit entry.");
      await loadEntries(); setEditingEntry(undefined); setNotice("Credit entry updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not edit credit entry."); }
    finally { setBusy(false); }
  }

  async function deleteEntry(entry: CreditEntry) {
    if (!window.confirm(`Delete this ${entry.customerName} credit entry? Recorded customer payments will remain in the Passbook.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/customer-credit-entries", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `customer-credit-entry-delete-${crypto.randomUUID()}`, customerCreditEntryId: entry.id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not delete credit entry.");
      await loadEntries(); setNotice("Credit entry deleted.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete credit entry."); }
    finally { setBusy(false); }
  }

  async function savePaymentEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingPayment) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/customer-credit-entry-payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `customer-payment-edit-${crypto.randomUUID()}`, customerCreditEntryPaymentId: editingPayment.id, amount: editingPayment.amount, paidAt: `${editingPayment.paidAt}T18:00:00.000Z`, paymentMethod: editingPayment.paymentMethod }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not edit customer payment.");
      await loadEntries(); setEditingPayment(undefined); setNotice("Customer payment updated in the Passbook.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not edit customer payment."); }
    finally { setBusy(false); }
  }

  async function deletePayment(entry: CreditEntry, payment: CreditPayment) {
    if (!window.confirm(`Delete the ${money(payment.amount)} payment from ${entry.customerName}? The Passbook balance will be reversed.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/customer-credit-entry-payments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `customer-payment-delete-${crypto.randomUUID()}`, customerCreditEntryPaymentId: payment.id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not delete customer payment.");
      await loadEntries(); setNotice("Customer payment deleted and Passbook balance corrected.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete customer payment."); }
    finally { setBusy(false); }
  }

  const filteredCustomers = customers.filter((customer) => customer.name.toLocaleLowerCase("en-IN").includes(customerSearch.trim().toLocaleLowerCase("en-IN")));
  const filteredEntries = entries?.filter((entry) => entry.customerName.toLocaleLowerCase("en-IN").includes(ledgerSearch.trim().toLocaleLowerCase("en-IN"))) ?? [];

  return <main className="min-h-screen bg-[#f7f5f1] p-4 text-stone-900 sm:p-6">
    <div className="w-full">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">Chicken Mart</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Customer credit</h1><p className="mt-1 text-sm text-stone-500">A simple record of money customers owe.</p></div>
        <div className="flex gap-2"><Link href="/" className="inline-flex h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 hover:bg-stone-50">Back</Link><Button type="button" onClick={() => { setError(""); setNotice(""); setCustomerForm({ name: "", address: "" }); setCustomerOpen(true); }} className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-50"><Plus size={17}/>Add customer</Button><Button type="button" onClick={() => { setError(""); setNotice(""); setCustomerSearch(""); setForm({ customerName: customers[0]?.name ?? "", description: "", amount: "", creditedAt: today() }); setFormOpen(true); }} className="gap-2"><Plus size={17}/>Add entry</Button></div>
      </header>
      {error && <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</p>}
      {notice && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{notice}</p>}
      {!entries ? <p className="flex items-center gap-2 py-12 text-stone-500"><Loader2 className="animate-spin" size={18}/>Loading entries…</p> : <><div className="mb-3 flex max-w-md items-center gap-3"><label className="flex-1"><span className="sr-only">Search customer ledger</span><Input placeholder="Search customer ledger" value={ledgerSearch} onChange={(event) => setLedgerSearch(event.target.value)}/></label>{ledgerSearch && <Button type="button" className="h-10 border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setLedgerSearch("")}>Clear</Button>}</div><Card className="overflow-hidden border-stone-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-4"><div><h2 className="font-semibold">Credit ledger</h2><p className="text-xs text-stone-500">{filteredEntries.length} {filteredEntries.length === 1 ? "entry" : "entries"}{ledgerSearch ? ` matching “${ledgerSearch}”` : ""}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Money owed to us</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
            <colgroup><col className="w-[14%]"/><col className="w-[17%]"/><col className="w-[21%]"/><col className="w-[12%]"/><col className="w-[12%]"/><col className="w-[16%]"/><col className="w-[8%]"/></colgroup>
            <thead><tr className="border-b border-stone-200 bg-stone-100/90 text-xs font-bold uppercase tracking-wide text-stone-600"><Head>Date</Head><Head>Customer</Head><Head>Description</Head><Head right>Credited</Head><Head right>Remaining</Head><Head right>Record payment</Head><Head right><span className="sr-only">Actions</span></Head></tr></thead>
            <tbody className="divide-y divide-stone-100">{filteredEntries.length ? filteredEntries.map((entry) => <tr key={entry.id} className="bg-white transition-colors hover:bg-emerald-50/50">
              <Cell muted>{new Date(entry.creditedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Cell><Cell strong>{entry.customerName}</Cell><Cell><span className="block truncate" title={entry.description}>{entry.description}</span>{entry.payments.map((payment) => <span key={payment.id} className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-700"><span className="min-w-0 flex-1 truncate">Paid {money(payment.amount)} · {new Date(payment.paidAt).toLocaleDateString("en-IN")}</span><button type="button" title="Edit customer payment" aria-label="Edit customer payment" onClick={() => setEditingPayment({ id: payment.id, customer: entry.customerName, amount: payment.amount, paidAt: payment.paidAt.slice(0, 10), paymentMethod: payment.method })} className="inline-flex size-6 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-emerald-700"><Pencil size={12}/></button><button type="button" title="Delete customer payment" aria-label="Delete customer payment" onClick={() => void deletePayment(entry, payment)} className="inline-flex size-6 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={12}/></button></span>)}</Cell><Cell right strong className="text-stone-900">{money(entry.amount)}</Cell><Cell right strong className="text-rose-700">{money(entry.remainingAmount)}</Cell>
              <Cell right><Button type="button" className="h-9 bg-emerald-700 px-3 text-xs hover:bg-emerald-800" onClick={() => { setError(""); setNotice(""); setPaymentForm({ entry, amount: "", paidAt: today(), paymentMethod: "CASH" }); }}>Record payment</Button></Cell>
              <Cell right><span className="inline-flex gap-1"><button type="button" title="Edit credit entry" aria-label="Edit credit entry" className="inline-flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-emerald-700" onClick={() => setEditingEntry({ id: entry.id, values: { customerName: entry.customerName, description: entry.description, amount: entry.amount, creditedAt: entry.creditedAt.slice(0, 10) } })}><Pencil size={15}/></button><button type="button" disabled={busy} title="Delete credit entry" aria-label="Delete credit entry" className="inline-flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40" onClick={() => void deleteEntry(entry)}><Trash2 size={15}/></button></span></Cell>
            </tr>) : <tr><td colSpan={7} className="p-14 text-center text-stone-500">{ledgerSearch ? "No customer credit records match this search." : "No unpaid customer credit remains. Add a new credit entry when needed."}</td></tr>}</tbody>
          </table>
        </div>
      </Card></>}
    </div>
    {formOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="credit-entry-title"><Card className="w-full max-w-lg rounded-b-none bg-white shadow-2xl sm:rounded-xl"><form onSubmit={addEntry}><div className="flex items-start justify-between border-b border-stone-200 px-5 py-4"><div><h2 id="credit-entry-title" className="text-xl font-bold">Add customer credit</h2><p className="mt-1 text-sm text-stone-500">Record money a customer now owes.</p></div><button type="button" onClick={() => setFormOpen(false)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={20}/></button></div><div className="grid gap-4 p-5">{customers.length ? <Field label="Search customer"><Input placeholder="Type a customer name" value={customerSearch} onChange={(event) => { const value = event.target.value; setCustomerSearch(value); const firstMatch = customers.find((customer) => customer.name.toLocaleLowerCase("en-IN").includes(value.trim().toLocaleLowerCase("en-IN"))); if (firstMatch) setForm((current) => ({ ...current, customerName: firstMatch.name })); }}/></Field> : null}{customers.length ? <Field label="Customer"><select required value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">{filteredCustomers.length ? filteredCustomers.map((customer) => <option key={customer.id} value={customer.name}>{customer.name}</option>) : <option value="" disabled>No matching customers</option>}</select></Field> : <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Add a customer first, then reopen this form.</p>}<Field label="Credit description"><Input required maxLength={200} placeholder="e.g. Chicken order" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Amount credited"><Input required min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })}/></Field><Field label="Date"><Input required type="date" value={form.creditedAt} onChange={(event) => setForm({ ...form, creditedAt: event.target.value })}/></Field></div></div><div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4"><Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !customers.length || !form.customerName}>{busy && <Loader2 className="mr-2 animate-spin" size={16}/>}Save entry</Button></div></form></Card></div>}
    {customerOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-customer-title"><Card className="w-full max-w-lg rounded-b-none bg-white shadow-2xl sm:rounded-xl"><form onSubmit={addCustomer}><div className="flex items-start justify-between border-b border-stone-200 px-5 py-4"><div><h2 id="add-customer-title" className="text-xl font-bold">Add customer</h2><p className="mt-1 text-sm text-stone-500">This name will appear in the credit entry dropdown.</p></div><button type="button" onClick={() => setCustomerOpen(false)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={20}/></button></div><div className="grid gap-4 p-5"><Field label="Name"><Input required maxLength={140} value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}/></Field><Field label="Address"><Input required maxLength={500} value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })}/></Field></div><div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4"><Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setCustomerOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 animate-spin" size={16}/>}Save customer</Button></div></form></Card></div>}
    {paymentForm && <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="record-payment-title"><Card className="w-full max-w-lg rounded-b-none bg-white shadow-2xl sm:rounded-xl"><form onSubmit={recordPayment}><div className="flex items-start justify-between border-b border-stone-200 px-5 py-4"><div><h2 id="record-payment-title" className="text-xl font-bold">Record customer payment</h2><p className="mt-1 text-sm text-stone-500">{paymentForm.entry.customerName} · {money(paymentForm.entry.remainingAmount)} remaining</p></div><button type="button" onClick={() => setPaymentForm(undefined)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={20}/></button></div><div className="grid gap-4 p-5"><div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"><span className="font-semibold">Credit:</span> {paymentForm.entry.description}</div><div className="grid gap-4 sm:grid-cols-2"><Field label="Amount received"><Input required min="0.01" max={paymentForm.entry.remainingAmount} step="0.01" inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })}/></Field><Field label="Payment date"><Input required type="date" min={paymentForm.entry.creditedAt.slice(0, 10)} value={paymentForm.paidAt} onChange={(event) => setPaymentForm({ ...paymentForm, paidAt: event.target.value })}/></Field></div><Field label="Paid through"><select required value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value as CreditPayment["method"] })} className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="NET_BANKING">Net banking</option></select></Field><p className="text-xs leading-5 text-stone-500">This collection will increase the Passbook balance. When the remaining amount reaches zero, this credit will leave the active list.</p></div><div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4"><Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setPaymentForm(undefined)}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 animate-spin" size={16}/>}Record payment</Button></div></form></Card></div>}
    {editingEntry && <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-credit-title"><Card className="w-full max-w-lg rounded-b-none bg-white shadow-2xl sm:rounded-xl"><form onSubmit={saveEditedEntry}><div className="flex items-start justify-between border-b border-stone-200 px-5 py-4"><div><h2 id="edit-credit-title" className="text-xl font-bold">Edit customer credit</h2><p className="mt-1 text-sm text-stone-500">Available only before a payment is recorded.</p></div><button type="button" onClick={() => setEditingEntry(undefined)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={20}/></button></div><div className="grid gap-4 p-5"><Field label="Customer"><select required value={editingEntry.values.customerName} onChange={(event) => setEditingEntry({ ...editingEntry, values: { ...editingEntry.values, customerName: event.target.value } })} className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100">{customers.map((customer) => <option key={customer.id} value={customer.name}>{customer.name}</option>)}</select></Field><Field label="Credit description"><Input required maxLength={200} value={editingEntry.values.description} onChange={(event) => setEditingEntry({ ...editingEntry, values: { ...editingEntry.values, description: event.target.value } })}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Amount credited"><Input required min="0.01" step="0.01" inputMode="decimal" value={editingEntry.values.amount} onChange={(event) => setEditingEntry({ ...editingEntry, values: { ...editingEntry.values, amount: event.target.value } })}/></Field><Field label="Date"><Input required type="date" value={editingEntry.values.creditedAt} onChange={(event) => setEditingEntry({ ...editingEntry, values: { ...editingEntry.values, creditedAt: event.target.value } })}/></Field></div></div><div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4"><Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setEditingEntry(undefined)}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 animate-spin" size={16}/>}Save changes</Button></div></form></Card></div>}
    {editingPayment && <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="edit-customer-payment-title"><Card className="w-full max-w-lg rounded-b-none bg-white shadow-2xl sm:rounded-xl"><form onSubmit={savePaymentEdit}><div className="flex items-start justify-between border-b border-stone-200 px-5 py-4"><div><h2 id="edit-customer-payment-title" className="text-xl font-bold">Edit customer payment</h2><p className="mt-1 text-sm text-stone-500">{editingPayment.customer} · the old Passbook movement will be reversed.</p></div><button type="button" onClick={() => setEditingPayment(undefined)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={20}/></button></div><div className="grid gap-4 p-5 sm:grid-cols-2"><Field label="Date"><Input required type="date" value={editingPayment.paidAt} onChange={(event) => setEditingPayment({ ...editingPayment, paidAt: event.target.value })}/></Field><Field label="Amount"><Input required min="0.01" step="0.01" inputMode="decimal" value={editingPayment.amount} onChange={(event) => setEditingPayment({ ...editingPayment, amount: event.target.value })}/></Field><Field label="Through"><select value={editingPayment.paymentMethod} onChange={(event) => setEditingPayment({ ...editingPayment, paymentMethod: event.target.value as CreditPayment["method"] })} className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold"><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="NET_BANKING">Net Banking</option></select></Field></div><div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4"><Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setEditingPayment(undefined)}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 animate-spin" size={16}/>}Save changes</Button></div></form></Card></div>}
  </main>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">{label}{children}</label>; }
function Head({ children, right }: { children: ReactNode; right?: boolean }) { return <th className={`px-4 py-3 text-[10px] leading-tight ${right ? "text-right" : "text-left"}`}>{children}</th>; }
function Cell({ children, right, strong, muted, className = "" }: { children: ReactNode; right?: boolean; strong?: boolean; muted?: boolean; className?: string }) { return <td className={`break-words px-4 py-3.5 ${right ? "text-right tabular-nums" : "text-left"} ${strong ? "font-bold" : ""} ${muted ? "text-stone-500" : ""} ${className}`}>{children}</td>; }
