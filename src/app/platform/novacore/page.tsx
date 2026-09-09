import { AppShell } from "@/components/AppShell";
import { requirePlatformSession } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/platform-permissions";
import { NOVACORE_ALGORITHMS } from "@/lib/novacore/registry";

const STATUS_LABEL: Record<string, string> = {
  production: "Production",
  beta: "Beta",
  shadow: "Shadow testing",
  planned: "Planned",
};

export default async function NovaCorePage() {
  const session = await requirePlatformSession();
  await requirePlatformPermission(session, "analytics.view");
  const counts = NOVACORE_ALGORITHMS.reduce<Record<string, number>>((acc, algorithm) => {
    acc[algorithm.status] = (acc[algorithm.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell
      universe="platform"
      title="NovaCore"
      subtitle="Algorithm control, safety, versioning and shadow evaluation."
      active="NovaCore"
      userName={session.name}
      role={session.role}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-4">
          {[
            ["Production", counts.production ?? 0],
            ["Beta", counts.beta ?? 0],
            ["Shadow", counts.shadow ?? 0],
            ["Planned", counts.planned ?? 0],
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <p className="text-sm text-slate-500">{label}</p>
              <strong className="mt-2 block text-3xl">{value}</strong>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">SukuuNova Intelligence & Simulation Core</p>
              <h2 className="mt-2 text-2xl font-semibold">Algorithm registry</h2>
            </div>
            <p className="max-w-xl text-sm text-slate-500">New algorithms must prove themselves in tests or shadow mode before they are allowed to change a live school decision.</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {NOVACORE_ALGORITHMS.map((algorithm) => (
              <article key={algorithm.key} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{algorithm.domain}</p>
                    <h3 className="mt-1 text-lg font-semibold">{algorithm.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">{algorithm.key} · v{algorithm.version}</p>
                  </div>
                  <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold dark:border-slate-700">{STATUS_LABEL[algorithm.status]}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{algorithm.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {algorithm.safeguards.map((item) => <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">{item}</span>)}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
