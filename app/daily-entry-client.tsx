"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Context = { chickenTypes: { id: string; name: string }[]; suppliers: { id: string; name: string }[] };
type Entry = { chickenTypeId: string; birdCount: string; quantityKg: string; unitCost: string; suggestedSellRate: string };
const blank = (): Entry => ({ chickenTypeId: "", birdCount: "", quantityKg: "", unitCost: "", suggestedSellRate: "" });
const select = "h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-900";

export default function DailyEntryClient() {
  const [date, setDate] = useState("");
  const [data, setData] = useState<Context>();
  const [supplierId, setSupplierId] = useState("");
  const [entry, setEntry] = useState<Entry>(blank());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDate(new Date().toISOString().slice(0, 10)); }, []);
  useEffect(() => {
    if (!date) return;
    fetch(`/api/accounting/daily-entry-context?date=${date}`).then((response) => response.json()).then(setData).catch(() => setError("Could not load entry form."));
  }, [date]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!supplierId || Object.values(entry).some((value) => !value)) { setError("Fill every field."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/accounting/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `receipt-${crypto.randomUUID()}`, receiptNumber: `WEB-${Date.now()}`, supplierId, receivedAt: `${date}T18:00:00.000Z`, paidAmount: "0", items: [{ ...entry, birdCount: Number(entry.birdCount) }] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setEntry(blank()); setNotice("Chicken added.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not add chicken."); }
    finally { setSaving(false); }
  }

  const update = (key: keyof Entry, value: string) => setEntry({ ...entry, [key]: value });

  return <main className="min-h-screen bg-[#f7f5f1] pb-16 text-stone-900"><div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6"><header className="flex justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">Chicken Mart</p><h1 className="mt-1 text-3xl font-bold">Chicken received</h1></div><label className="text-xs font-bold uppercase text-stone-500">Date<Input type="date" value={date} onChange={(event) => setDate(event.target.value)}/></label></header>{error && <p className="rounded-xl bg-rose-50 p-3 text-rose-800">{error}</p>}{notice && <p className="rounded-xl bg-emerald-50 p-3 text-emerald-800">{notice}</p>}{!data ? <p className="flex gap-2 py-10 text-stone-500"><Loader2 className="animate-spin"/>Loading…</p> : <Card><form onSubmit={submit} className="space-y-5 p-4 sm:p-6"><label className="grid gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 text-xs font-bold uppercase tracking-wide text-emerald-800">Supplier<select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className={`${select} border-emerald-300 text-base`}><option value="">Choose supplier</option>{data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[760px]"><thead className="bg-stone-100 text-left text-xs font-bold uppercase text-stone-600"><tr><th className="p-3">Chicken type</th><th className="p-3">Birds</th><th className="p-3">Weight</th><th className="p-3">Purchase ₹/kg</th><th className="p-3">Selling ₹/kg</th></tr></thead><tbody><tr className="bg-white"><td className="p-3"><select required value={entry.chickenTypeId} onChange={(event) => update("chickenTypeId", event.target.value)} className={`${select} min-w-48 border-emerald-300 bg-emerald-50 font-bold`}><option value="">Choose chicken</option>{data.chickenTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></td><InputCell value={entry.birdCount} onChange={(value) => update("birdCount", value)} mode="numeric"/><InputCell value={entry.quantityKg} onChange={(value) => update("quantityKg", value)} mode="decimal"/><InputCell value={entry.unitCost} onChange={(value) => update("unitCost", value)} mode="decimal"/><InputCell value={entry.suggestedSellRate} onChange={(value) => update("suggestedSellRate", value)} mode="decimal"/></tr></tbody></table></div><Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 animate-spin" size={16}/>}Add chicken</Button></form></Card>}</div></main>;
}

function InputCell({ value, onChange, mode }: { value: string; onChange: (value: string) => void; mode: "numeric" | "decimal" }) {
  return <td className="p-3"><Input required inputMode={mode} value={value} onChange={(event) => onChange(event.target.value)} /></td>;
}
