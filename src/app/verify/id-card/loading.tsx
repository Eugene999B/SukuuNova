export default function LegacyIdentityCardVerificationLoading() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-xl rounded-[28px] border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur sm:p-8" role="status" aria-live="polite">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-teal-300/40 bg-teal-300/10 text-xl text-teal-200">✓</div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">SukuuNova credential verification</p>
            <h1 className="mt-1 text-xl font-black">Checking this school ID…</h1>
          </div>
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-300">The signed verification link, issuing school, holder and current credential status are being checked against the live school record.</p>
      </div>
    </main>
  );
}
