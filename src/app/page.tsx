import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50 md:p-14">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-nova">
          Phase 0 foundation
        </p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          SukuuNova
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
          A secure multi-tenant foundation for Ghanaian schools. Choose the
          correct identity universe to continue.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link
            className="rounded-xl bg-nova px-6 py-3 text-center font-semibold text-white hover:bg-teal-800"
            href="/login/school"
          >
            School user login
          </Link>
          <Link
            className="rounded-xl border border-slate-300 px-6 py-3 text-center font-semibold hover:bg-slate-50"
            href="/login/platform"
          >
            Platform admin login
          </Link>
        </div>
        <p className="mt-8 text-sm text-slate-500">
          No academic, attendance, finance, report-card, transport, or messaging
          module is included in this foundation phase.
        </p>
      </section>
    </main>
  );
}
