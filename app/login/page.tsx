"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Drumstick, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not sign in.");
      router.replace("/admin");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f5f1] p-4 text-stone-900">
      <section className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_18px_55px_rgba(41,37,36,0.09)] sm:p-8">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-700 text-white shadow-lg shadow-emerald-900/15">
          <Drumstick size={29} />
        </div>
        <div className="mt-5 text-center">
          <p className="text-sm font-black uppercase tracking-[.18em] text-emerald-700">Chicken Mart</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Admin access</h1>
          <p className="mt-1 text-sm text-stone-500">Sign in with the private admin account.</p>
        </div>

        <form onSubmit={login} className="mt-7 grid gap-4">
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">
            Username
            <Input
              required
              autoFocus
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Admin username"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-600">
            Password
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={17} />
              <Input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pl-10"
                placeholder="Shop password"
              />
            </div>
          </label>
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-800">{error}</p>}
          <Button type="submit" disabled={busy} className="h-11 w-full">
            {busy && <Loader2 className="mr-2 animate-spin" size={17} />}
            Sign in
          </Button>
        </form>
      </section>
    </main>
  );
}
