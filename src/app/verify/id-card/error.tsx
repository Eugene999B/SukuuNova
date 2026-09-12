"use client";

export default function LegacyIdentityCardVerificationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-950 sm:px-6">
      <section className="mx-auto max-w-xl overflow-hidden rounded-[28px] border border-white/15 bg-white shadow-2xl">
        <header className="bg-slate-900 px-6 py-6 text-white sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">SukuuNova credential verification</p>
          <h1 className="mt-1 text-2xl font-black">INVALID / UNVERIFIED CREDENTIAL</h1>
        </header>
        <div className="p-6 sm:p-8">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900" role="alert">
            The live verification page could not be rendered safely. Do not accept this printed card as a current credential until the issuing school confirms it.
          </div>
          <button type="button" onClick={reset} className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
            Try verification again
          </button>
        </div>
      </section>
    </main>
  );
}
