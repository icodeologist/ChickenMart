"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Plus, Printer, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PaymentMethod = "CASH" | "UPI" | "NET_BANKING";
type SalePaymentMethod = PaymentMethod | "CREDIT";
type Customer = { id: string; name: string; phone: string | null; address: string | null };
type ChickenType = { id: string; name: string };
type Account = { id: string; type: "CASH" | "BANK" };
type CreditSale = {
  id: string;
  customerId: string;
  customer: string;
  soldAt: string;
  chickenType: string;
  quantityKg: string;
  unitPrice: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  paymentMethod: string | null;
  status: "OPEN" | "PARTIALLY_COLLECTED" | "COLLECTED";
};
type PageData = { customers: Customer[]; chickenTypes: ChickenType[]; accounts: Account[]; sales: CreditSale[] };
type SaleForm = { soldAt: string; chickenTypeId: string; quantityKg: string; unitPrice: string; paidAmount: string; paymentMethod: SalePaymentMethod };
type PaymentForm = { sale: CreditSale; paidAt: string; amount: string; paymentMethod: PaymentMethod };

const today = () => new Date().toISOString().slice(0, 10);
const blankSale = (): SaleForm => ({ soldAt: today(), chickenTypeId: "", quantityKg: "", unitPrice: "", paidAmount: "0", paymentMethod: "CASH" });
const fieldClass = "h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const money = (value: string) => `₹${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;

export default function CustomerCreditPage() {
  const [data, setData] = useState<PageData>();
  const [customerId, setCustomerId] = useState("");
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", address: "" });
  const [saleForm, setSaleForm] = useState<SaleForm>(blankSale());
  const [paymentForm, setPaymentForm] = useState<PaymentForm>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const loadData = useCallback(async () => {
    const response = await fetch("/api/accounting/customer-credit-page");
    const result = await response.json() as PageData & { error?: string };
    if (!response.ok) throw new Error(result.error || "Could not load customer credit.");
    setData(result);
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/accounting/customer-credit-page").then(async (response) => {
      const result = await response.json() as PageData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load customer credit.");
      if (active) {
        setData(result);
        setCustomerId(result.customers[0]?.id ?? "");
      }
    }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);

  const selectedCustomer = data?.customers.find((customer) => customer.id === customerId);
  const customerSales = useMemo(() => data?.sales.filter((sale) => sale.customerId === customerId) ?? [], [data, customerId]);

  function accountIdFor(method: PaymentMethod) {
    return data?.accounts.find((account) => account.type === (method === "CASH" ? "CASH" : "BANK"))?.id;
  }

  async function createCustomer(event: FormEvent) {
    event.preventDefault();
    setBusy("customer"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/credit-customers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `credit-customer-${crypto.randomUUID()}`, ...customerForm }),
      });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not create customer.");
      await loadData();
      if (result.id) setCustomerId(result.id);
      setCustomerForm({ name: "", phone: "", address: "" });
      setNotice("Customer created.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create customer."); }
    finally { setBusy(""); }
  }

  async function recordSale(event: FormEvent) {
    event.preventDefault();
    if (!customerId) return;
    setBusy("sale"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/customer-credit-sales", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `customer-credit-sale-${crypto.randomUUID()}`,
          customerId,
          soldAt: `${saleForm.soldAt}T18:00:00.000Z`,
          chickenTypeId: saleForm.chickenTypeId,
          quantityKg: saleForm.quantityKg,
          unitPrice: saleForm.unitPrice,
          paidAmount: saleForm.paymentMethod === "CREDIT" ? "0" : saleForm.paidAmount || "0",
          paymentMethod: saleForm.paymentMethod,
          ...(saleForm.paymentMethod === "CREDIT" ? {} : { accountId: accountIdFor(saleForm.paymentMethod) }),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not record sale.");
      await loadData();
      setSaleForm(blankSale());
      setNotice("Customer sale recorded.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not record sale."); }
    finally { setBusy(""); }
  }

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    if (!paymentForm) return;
    setBusy("payment"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/accounting/customer-credit-payments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `customer-credit-payment-${crypto.randomUUID()}`,
          creditSaleId: paymentForm.sale.id,
          paidAt: `${paymentForm.paidAt}T18:00:00.000Z`,
          amount: paymentForm.amount,
          paymentMethod: paymentForm.paymentMethod,
          accountId: accountIdFor(paymentForm.paymentMethod),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not record payment.");
      await loadData();
      setPaymentForm(undefined);
      setNotice("Customer payment recorded.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not record payment."); }
    finally { setBusy(""); }
  }

  return (
    <main className="min-h-screen bg-[#f7f5f1] p-4 text-stone-900 sm:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6 print:hidden">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">Chikken Mart</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Customer credit</h1>
          <p className="mt-1 text-sm text-stone-500">Record customer sales and money they still owe.</p>
        </header>

        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">{error}</p>}
        {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">{notice}</p>}

        {!data ? <p className="flex items-center gap-2 py-12 text-stone-500"><Loader2 className="animate-spin" size={18}/>Loading customer credit…</p> : <>
          <Card className="border-stone-200 p-5 shadow-sm">
            <div className="mb-4"><h2 className="text-lg font-bold">Create customer</h2><p className="text-sm text-stone-500">Add the customer once, then record their sales below.</p></div>
            <form onSubmit={createCustomer} className="grid gap-4 md:grid-cols-[1fr_1fr_1.5fr_auto] md:items-end">
              <Field label="Customer name"><Input required value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })}/></Field>
              <Field label="Phone number"><Input required inputMode="tel" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })}/></Field>
              <Field label="Address"><Input required value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })}/></Field>
              <Button type="submit" disabled={Boolean(busy)}>{busy === "customer" ? <Loader2 className="animate-spin" size={16}/> : <Plus size={16}/>}<span className="ml-2">Create</span></Button>
            </form>
          </Card>

          <Card className="overflow-hidden border-stone-200 shadow-sm">
            <div className="border-b border-stone-200 bg-white p-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(220px,320px)_1fr_auto] sm:items-end">
                <Field label="Select customer">
                  <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={fieldClass}>
                    <option value="">Choose customer</option>
                    {data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </Field>
                {selectedCustomer && <p className="pb-2 text-sm text-stone-500"><span className="font-semibold text-stone-800">{selectedCustomer.phone}</span> · {selectedCustomer.address}</p>}
                <Button type="button" disabled={!selectedCustomer} onClick={() => window.print()} className="gap-2"><Printer size={16}/>Print statement</Button>
              </div>
            </div>

            {customerId ? <>
              <form onSubmit={recordSale} className="grid gap-4 border-b border-stone-200 bg-stone-50/70 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Sale date"><Input required type="date" value={saleForm.soldAt} onChange={(event) => setSaleForm({ ...saleForm, soldAt: event.target.value })}/></Field>
                <Field label="Product"><select required value={saleForm.chickenTypeId} onChange={(event) => setSaleForm({ ...saleForm, chickenTypeId: event.target.value })} className={fieldClass}><option value="">Choose chicken</option>{data.chickenTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field>
                <Field label="Quantity (kg)"><Input required inputMode="decimal" value={saleForm.quantityKg} onChange={(event) => setSaleForm({ ...saleForm, quantityKg: event.target.value })}/></Field>
                <Field label="Price / kg"><Input required inputMode="decimal" value={saleForm.unitPrice} onChange={(event) => setSaleForm({ ...saleForm, unitPrice: event.target.value })}/></Field>
                <Field label="Paid now"><Input required inputMode="decimal" disabled={saleForm.paymentMethod === "CREDIT"} value={saleForm.paymentMethod === "CREDIT" ? "0" : saleForm.paidAmount} onChange={(event) => setSaleForm({ ...saleForm, paidAmount: event.target.value })}/></Field>
                <Field label="Payment method"><SalePaymentSelect value={saleForm.paymentMethod} onChange={(paymentMethod) => setSaleForm({ ...saleForm, paymentMethod, ...(paymentMethod === "CREDIT" ? { paidAmount: "0" } : {}) })}/></Field>
                <div className="flex items-end lg:col-span-2"><Button type="submit" disabled={Boolean(busy)}>{busy === "sale" && <Loader2 className="mr-2 animate-spin" size={16}/>}Record sale</Button></div>
              </form>

              <div className="hidden lg:block">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup><col className="w-[8%]"/><col className="w-[13%]"/><col className="w-[11%]"/><col className="w-[8%]"/><col className="w-[9%]"/><col className="w-[10%]"/><col className="w-[9%]"/><col className="w-[10%]"/><col className="w-[10%]"/><col className="w-[12%]"/></colgroup>
                  <thead><tr className="border-b border-stone-200 bg-stone-100/90 text-xs font-bold uppercase tracking-wide text-stone-600"><Head>Date</Head><Head>Customer</Head><Head>Product</Head><Head right>Quantity</Head><Head right>Price/Kg</Head><Head right>Total</Head><Head right>Paid</Head><Head right>Remaining</Head><Head>Through</Head><Head right>Action</Head></tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {customerSales.length ? customerSales.map((sale, index) => <tr key={sale.id} className={`${index % 2 ? "bg-stone-50/60" : "bg-white"} hover:bg-emerald-50/50`}><Cell muted>{new Date(sale.soldAt).toLocaleDateString("en-IN")}</Cell><Cell strong>{sale.customer}</Cell><Cell>{sale.chickenType}</Cell><Cell right>{sale.quantityKg} kg</Cell><Cell right>{money(sale.unitPrice)}</Cell><Cell right strong>{money(sale.totalAmount)}</Cell><Cell right className="font-semibold text-emerald-700">{money(sale.paidAmount)}</Cell><Cell right strong className={sale.status === "COLLECTED" ? "text-emerald-700" : "text-rose-700"}>{money(sale.remainingAmount)}</Cell><Cell>{formatMethod(sale.paymentMethod)}</Cell><Cell right><button type="button" disabled={sale.status === "COLLECTED"} onClick={() => setPaymentForm({ sale, paidAt: today(), amount: "", paymentMethod: "CASH" })} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:bg-stone-200 disabled:text-stone-500"><WalletCards size={14}/>{sale.status === "COLLECTED" ? "Paid" : "Add payment"}</button></Cell></tr>) : <tr><td colSpan={10} className="p-12 text-center text-stone-500">No sales recorded for this customer.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-stone-200 lg:hidden">
                {customerSales.length ? customerSales.map((sale) => <article key={sale.id} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold text-stone-900">{sale.chickenType}</p><p className="mt-1 text-xs text-stone-500">{new Date(sale.soldAt).toLocaleDateString("en-IN")} · {sale.quantityKg} kg at {money(sale.unitPrice)}/kg</p></div><p className="shrink-0 text-lg font-extrabold tabular-nums">{money(sale.totalAmount)}</p></div>
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-stone-50 p-3 text-xs"><div><p className="text-stone-500">Paid</p><p className="mt-1 font-bold text-emerald-700">{money(sale.paidAmount)}</p></div><div><p className="text-stone-500">Remaining</p><p className={`mt-1 font-bold ${sale.status === "COLLECTED" ? "text-emerald-700" : "text-rose-700"}`}>{money(sale.remainingAmount)}</p></div><div><p className="text-stone-500">Through</p><p className="mt-1 font-bold">{formatMethod(sale.paymentMethod)}</p></div></div>
                  <button type="button" disabled={sale.status === "COLLECTED"} onClick={() => setPaymentForm({ sale, paidAt: today(), amount: "", paymentMethod: "CASH" })} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:bg-stone-200 disabled:text-stone-500"><WalletCards size={14}/>{sale.status === "COLLECTED" ? "Paid" : "Add payment"}</button>
                </article>) : <p className="p-12 text-center text-stone-500">No sales recorded for this customer.</p>}
              </div>
            </> : <p className="p-12 text-center text-stone-500">Create or select a customer to record sales.</p>}
          </Card>
        </>}

        {paymentForm && <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="customer-payment-title"><Card className="w-full max-w-lg rounded-b-none bg-white shadow-2xl sm:rounded-xl"><form onSubmit={recordPayment}><div className="flex justify-between border-b border-stone-200 px-5 py-4"><div><h2 id="customer-payment-title" className="text-xl font-bold">Add customer payment</h2><p className="mt-1 text-sm text-stone-500">Remaining {money(paymentForm.sale.remainingAmount)}</p></div><button type="button" onClick={() => setPaymentForm(undefined)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100" aria-label="Close"><X size={20}/></button></div><div className="grid gap-4 p-5 sm:grid-cols-2"><Field label="Date"><Input required type="date" value={paymentForm.paidAt} onChange={(event) => setPaymentForm({ ...paymentForm, paidAt: event.target.value })}/></Field><Field label="Payment method"><PaymentSelect value={paymentForm.paymentMethod} onChange={(paymentMethod) => setPaymentForm({ ...paymentForm, paymentMethod })}/></Field><Field label="Amount"><Input required inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })}/></Field></div><div className="flex justify-end gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4"><Button type="button" className="border border-stone-300 bg-white text-stone-700 shadow-none hover:bg-stone-100" onClick={() => setPaymentForm(undefined)}>Cancel</Button><Button type="submit" disabled={Boolean(busy)}>{busy === "payment" && <Loader2 className="mr-2 animate-spin" size={16}/>}Save payment</Button></div></form></Card></div>}
      </div>
      {data && selectedCustomer && <CustomerCreditPrint customer={selectedCustomer} sales={customerSales}/>} 
    </main>
  );
}

function PaymentSelect({ value, onChange }: { value: PaymentMethod; onChange: (value: PaymentMethod) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as PaymentMethod)} className={fieldClass}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="NET_BANKING">Net Banking</option></select>;
}
function SalePaymentSelect({ value, onChange }: { value: SalePaymentMethod; onChange: (value: SalePaymentMethod) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as SalePaymentMethod)} className={fieldClass}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="NET_BANKING">Net Banking</option><option value="CREDIT">Credit</option></select>;
}
function formatMethod(method: string | null) { if (!method) return "Not paid"; return method.split(" + ").map((part) => part === "NET_BANKING" ? "Net Banking" : part === "CASH" ? "Cash" : "UPI").join(" + "); }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">{label}{children}</label>; }
function Head({ children, right }: { children: ReactNode; right?: boolean }) { return <th className={`px-2 py-3 text-[10px] leading-tight ${right ? "text-right" : "text-left"}`}>{children}</th>; }
function Cell({ children, right, strong, muted, className = "" }: { children: ReactNode; right?: boolean; strong?: boolean; muted?: boolean; className?: string }) { return <td className={`break-words px-2 py-3 text-xs ${right ? "text-right tabular-nums" : "text-left"} ${strong ? "font-bold" : ""} ${muted ? "text-stone-500" : ""} ${className}`}>{children}</td>; }

function CustomerCreditPrint({ customer, sales }: { customer: Customer; sales: CreditSale[] }) {
  return <section className="credit-print-sheet hidden bg-white text-black print:block">
    <div className="mb-5 border-b-2 border-black pb-3"><h1 className="text-2xl font-bold">ChickenMart - Avin</h1><div className="mt-3 grid grid-cols-3 gap-4 text-sm"><p><strong>Customer:</strong> {customer.name}</p><p><strong>Phone:</strong> {customer.phone || "—"}</p><p><strong>Address:</strong> {customer.address || "—"}</p></div></div>
    <table className="w-full table-fixed border-collapse text-[10px]"><colgroup><col className="w-[10%]"/><col className="w-[15%]"/><col className="w-[9%]"/><col className="w-[10%]"/><col className="w-[12%]"/><col className="w-[12%]"/><col className="w-[12%]"/><col className="w-[12%]"/><col className="w-[8%]"/></colgroup><thead><tr>{["Date", "Chicken Type", "Weight", "Price/Kg", "Total", "Paid", "Remaining", "Payment Method", "Status"].map((label) => <th key={label} className="border border-black bg-stone-100 px-2 py-2 text-left font-bold">{label}</th>)}</tr></thead><tbody>{sales.length ? sales.map((sale) => <tr key={sale.id}><PrintCell>{new Date(sale.soldAt).toLocaleDateString("en-IN")}</PrintCell><PrintCell>{sale.chickenType}</PrintCell><PrintCell>{sale.quantityKg} kg</PrintCell><PrintCell>{money(sale.unitPrice)}</PrintCell><PrintCell>{money(sale.totalAmount)}</PrintCell><PrintCell>{money(sale.paidAmount)}</PrintCell><PrintCell>{money(sale.remainingAmount)}</PrintCell><PrintCell>{formatMethod(sale.paymentMethod)}</PrintCell><PrintCell>{sale.status === "COLLECTED" ? "Paid" : sale.status === "PARTIALLY_COLLECTED" ? "Partial" : "Unpaid"}</PrintCell></tr>) : <tr><td colSpan={9} className="border border-black p-8 text-center">No credit sales recorded for this customer.</td></tr>}</tbody></table>
  </section>;
}
function PrintCell({ children }: { children: ReactNode }) { return <td className="border border-black px-2 py-2 align-top tabular-nums">{children}</td>; }
