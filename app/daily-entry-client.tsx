"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Supplier = { id: string; name: string };
type Context = {
  chickenTypes: { id: string; code: string; name: string }[];
  suppliers: Supplier[];
};
type Entry = {
  chickenTypeId: string;
  birdCount: string;
  quantityKg: string;
  unitCost: string;
  suggestedSellRate: string;
};

const blank = (): Entry => ({
  chickenTypeId: "",
  birdCount: "",
  quantityKg: "",
  unitCost: "",
  suggestedSellRate: "",
});
const select = "h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-900";
const standardChickenTypes = [
  { code: "BROILER", name: "Broiler" },
  { code: "TYSON", name: "Tyson" },
  { code: "LINE_CHICKEN", name: "Layer Chicken" },
] as const;

async function getContext(date: string): Promise<Context> {
  const response = await fetch(`/api/accounting/daily-entry-context?date=${date}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load entry form.");
  return result;
}

export default function DailyEntryClient() {
  const [date, setDate] = useState("");
  const [data, setData] = useState<Context>();
  const [supplierId, setSupplierId] = useState("");
  const [entry, setEntry] = useState<Entry>(blank());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState("");
  const [addingChickenType, setAddingChickenType] = useState(false);
  const [chickenTypeCode, setChickenTypeCode] = useState("");
  const [chickenTypeSaving, setChickenTypeSaving] = useState(false);

  useEffect(() => {
    setDate(new Date().toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    if (!date) return;
    let active = true;
    setData(undefined);
    setError("");
    getContext(date)
      .then((context) => { if (active) setData(context); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load entry form."); });
    return () => { active = false; };
  }, [date]);

  async function addSupplier() {
    const name = supplierName.trim();
    if (!name) {
      setError("Enter the supplier name.");
      return;
    }

    setSupplierSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/accounting/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `supplier-${crypto.randomUUID()}`, name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not add supplier.");

      const supplier: Supplier = { id: result.id, name: result.name };
      setData((current) => current ? {
        ...current,
        suppliers: [...current.suppliers.filter((item) => item.id !== supplier.id), supplier]
          .sort((left, right) => left.name.localeCompare(right.name)),
      } : current);
      setSupplierId(supplier.id);
      setSupplierName("");
      setAddingSupplier(false);
      setNotice(`${supplier.name} added and selected.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add supplier.");
    } finally {
      setSupplierSaving(false);
    }
  }

  function startSupplierEdit() {
    const supplier = data?.suppliers.find((item) => item.id === supplierId);
    if (!supplier) return;
    setAddingSupplier(false);
    setEditingSupplierId(supplier.id);
    setSupplierName(supplier.name);
    setError("");
  }

  async function editSelectedSupplier() {
    const name = supplierName.trim();
    if (!editingSupplierId || !name) {
      setError("Enter the supplier name.");
      return;
    }
    setSupplierSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/accounting/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `supplier-edit-${crypto.randomUUID()}`, supplierId: editingSupplierId, name }),
      });
      const result = await response.json() as Supplier & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not edit supplier.");
      setData((current) => current ? { ...current, suppliers: current.suppliers.map((item) => item.id === result.id ? { id: result.id, name: result.name } : item).sort((left, right) => left.name.localeCompare(right.name)) } : current);
      setEditingSupplierId("");
      setSupplierName("");
      setNotice("Supplier updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not edit supplier.");
    } finally {
      setSupplierSaving(false);
    }
  }

  async function removeSelectedSupplier() {
    const supplier = data?.suppliers.find((item) => item.id === supplierId);
    if (!supplier || !window.confirm(`Delete supplier ${supplier.name}?`)) return;
    setSupplierSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/accounting/suppliers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `supplier-delete-${crypto.randomUUID()}`, supplierId: supplier.id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not delete supplier.");
      setData((current) => current ? { ...current, suppliers: current.suppliers.filter((item) => item.id !== supplier.id) } : current);
      setSupplierId("");
      setEditingSupplierId("");
      setSupplierName("");
      setNotice(`${supplier.name} deleted.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete supplier.");
    } finally {
      setSupplierSaving(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!supplierId || Object.values(entry).some((value) => !value)) {
      setError("Fill every field.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/accounting/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: `receipt-${crypto.randomUUID()}`,
          receiptNumber: `WEB-${Date.now()}`,
          supplierId,
          receivedAt: `${date}T18:00:00.000Z`,
          paidAmount: "0",
          items: [{ ...entry, birdCount: Number(entry.birdCount) }],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setEntry(blank());
      setNotice("Chicken added.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add chicken.");
    } finally {
      setSaving(false);
    }
  }

  async function addChickenType() {
    const choice = standardChickenTypes.find((type) => type.code === chickenTypeCode);
    if (!choice) {
      setError("Choose a chicken type.");
      return;
    }

    setChickenTypeSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/accounting/chicken-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `chicken-type-${crypto.randomUUID()}`, ...choice }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not add chicken type.");

      const refreshed = await getContext(date);
      setData(refreshed);
      setEntry((current) => ({ ...current, chickenTypeId: result.id }));
      setChickenTypeCode("");
      setAddingChickenType(false);
      setNotice(`${choice.name} added and selected.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add chicken type.");
    } finally {
      setChickenTypeSaving(false);
    }
  }

  const update = (key: keyof Entry, value: string) => setEntry({ ...entry, [key]: value });

  return (
    <main className="min-h-screen bg-[#f7f5f1] p-4 pb-16 text-stone-900 sm:p-6 sm:pb-16">
      <div className="w-full space-y-6">
        <header className="flex justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">Chicken Mart</p>
            <h1 className="mt-1 text-3xl font-bold">Chicken received</h1>
          </div>
          <label className="text-xs font-bold uppercase text-stone-500">
            Date
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </header>

        {error && <p className="rounded-xl bg-rose-50 p-3 text-rose-800">{error}</p>}
        {notice && <p className="rounded-xl bg-emerald-50 p-3 text-emerald-800">{notice}</p>}

        {!data ? (
          <p className="flex gap-2 py-10 text-stone-500"><Loader2 className="animate-spin" />Loading…</p>
        ) : (
          <Card>
            <form onSubmit={submit} className="space-y-5 p-4 sm:p-6">
              <div className="grid gap-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="supplier" className="text-xs font-bold uppercase tracking-wide text-emerald-800">Supplier</label>
                  <button
                    type="button"
                    onClick={() => { setAddingSupplier((current) => !current); setEditingSupplierId(""); setSupplierName(""); setError(""); }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950"
                  >
                    <Plus size={15} /> New supplier
                  </button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                  <select
                    id="supplier"
                    required
                    value={supplierId}
                    onChange={(event) => { setSupplierId(event.target.value); setEditingSupplierId(""); setSupplierName(""); }}
                    className={`${select} border-emerald-300 text-base`}
                  >
                    <option value="">Choose supplier</option>
                    {data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                  <button type="button" title="Edit supplier" aria-label="Edit supplier" disabled={!supplierId || supplierSaving} onClick={startSupplierEdit} className="inline-flex size-10 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"><Pencil size={17}/></button>
                  <button type="button" title="Delete supplier" aria-label="Delete supplier" disabled={!supplierId || supplierSaving} onClick={() => void removeSelectedSupplier()} className="inline-flex size-10 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={17}/></button>
                </div>

                {addingSupplier && (
                  <div className="grid gap-2 rounded-lg border border-emerald-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto]">
                    <Input
                      autoFocus
                      maxLength={140}
                      placeholder="Supplier name"
                      value={supplierName}
                      onChange={(event) => setSupplierName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addSupplier();
                        }
                      }}
                    />
                    <Button type="button" disabled={supplierSaving} onClick={() => void addSupplier()}>
                      {supplierSaving && <Loader2 className="mr-2 animate-spin" size={16} />}
                      Save supplier
                    </Button>
                    <button
                      type="button"
                      disabled={supplierSaving}
                      onClick={() => { setAddingSupplier(false); setSupplierName(""); }}
                      className="h-10 px-3 text-sm font-semibold text-stone-600 hover:text-stone-900 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {editingSupplierId && (
                  <div className="grid gap-2 rounded-lg border border-emerald-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto]">
                    <Input autoFocus maxLength={140} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void editSelectedSupplier(); } }}/>
                    <Button type="button" disabled={supplierSaving} onClick={() => void editSelectedSupplier()}>{supplierSaving && <Loader2 className="mr-2 animate-spin" size={16}/>}Save</Button>
                    <button type="button" title="Cancel edit" aria-label="Cancel edit" disabled={supplierSaving} onClick={() => { setEditingSupplierId(""); setSupplierName(""); }} className="inline-flex size-10 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-50"><X size={18}/></button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[760px] table-fixed">
                  <colgroup><col className="w-[28%]"/><col className="w-[14%]"/><col className="w-[18%]"/><col className="w-[20%]"/><col className="w-[20%]"/></colgroup>
                  <thead className="bg-stone-100 text-left text-xs font-bold uppercase text-stone-600">
                    <tr>
                      <th className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span>Chicken type</span>
                          <button
                            type="button"
                            onClick={() => { setAddingChickenType((current) => !current); setError(""); }}
                            className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-bold normal-case tracking-normal text-emerald-800 hover:text-emerald-950"
                          >
                            <Plus size={14} /> New type
                          </button>
                        </div>
                      </th>
                      <th className="p-3">Birds</th>
                      <th className="p-3">Weight</th>
                      <th className="p-3">Purchase ₹/kg</th>
                      <th className="p-3">Selling ₹/kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="p-3">
                        <select
                          required
                          value={entry.chickenTypeId}
                          onChange={(event) => update("chickenTypeId", event.target.value)}
                          className={`${select} min-w-48 border-emerald-300 bg-emerald-50 font-bold`}
                        >
                          <option value="">Choose chicken</option>
                          {data.chickenTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                        </select>
                        {addingChickenType && (
                          <div className="mt-2 grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                            <select
                              value={chickenTypeCode}
                              onChange={(event) => setChickenTypeCode(event.target.value)}
                              className={select}
                            >
                              <option value="">Choose standard type</option>
                              {standardChickenTypes
                                .filter((choice) => !data.chickenTypes.some((type) => type.code === choice.code))
                                .map((choice) => <option key={choice.code} value={choice.code}>{choice.name}</option>)}
                            </select>
                            <Button type="button" disabled={chickenTypeSaving} onClick={() => void addChickenType()}>
                              {chickenTypeSaving && <Loader2 className="mr-2 animate-spin" size={16} />}
                              Add type
                            </Button>
                          </div>
                        )}
                      </td>
                      <InputCell value={entry.birdCount} onChange={(value) => update("birdCount", value)} mode="numeric" />
                      <InputCell value={entry.quantityKg} onChange={(value) => update("quantityKg", value)} mode="decimal" />
                      <InputCell value={entry.unitCost} onChange={(value) => update("unitCost", value)} mode="decimal" />
                      <InputCell value={entry.suggestedSellRate} onChange={(value) => update("suggestedSellRate", value)} mode="decimal" />
                    </tr>
                  </tbody>
                </table>
              </div>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 animate-spin" size={16} />}
                Add chicken
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}

function InputCell({ value, onChange, mode }: { value: string; onChange: (value: string) => void; mode: "numeric" | "decimal" }) {
  return <td className="p-3"><Input required inputMode={mode} value={value} onChange={(event) => onChange(event.target.value)} /></td>;
}
