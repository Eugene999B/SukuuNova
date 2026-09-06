import Link from "next/link";

export default function SchoolNotFound() {
  return (
    <main className="min-h-screen px-6 py-16" style={{ background: "var(--ui-bg)", color: "var(--ui-text)" }}>
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em]">School workspace</p>
        <h1 className="text-3xl font-semibold tracking-tight">This school page does not exist</h1>
        <p className="mt-3 max-w-md text-sm leading-6">
          The link may be mistyped or the page may have moved. Your school data is unchanged.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="rounded-lg px-4 py-2 text-sm font-medium">
            Open dashboard
          </Link>
          <Link href="/school/help" className="rounded-lg px-4 py-2 text-sm font-medium">
            Help & support
          </Link>
        </div>
      </div>
    </main>
  );
}
