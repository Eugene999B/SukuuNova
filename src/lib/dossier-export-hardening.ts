import type { PersonDossier } from "./dossier-report";

function number(value: string) {
  const parsed = Number(value.replace(/[^0-9+\-.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number) {
  return `GHS ${Math.max(0, value).toFixed(2)}`;
}

function trendLabel(valuesNewestFirst: number[]) {
  if (valuesNewestFirst.length < 6) {
    return { label: "Building history", detail: "More results are needed before a recent-performance trend is shown." };
  }
  const recent = valuesNewestFirst.slice(0, 5);
  const previous = valuesNewestFirst.slice(5, 10);
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const delta = average(recent) - average(previous);
  if (Math.abs(delta) < 2) return { label: "Stable", detail: `Recent normalized scores are ${Math.abs(delta).toFixed(1)} points from the previous window.` };
  return delta > 0
    ? { label: "Improving", detail: `Recent normalized scores are ${delta.toFixed(1)} points above the previous window.` }
    : { label: "Needs attention", detail: `Recent normalized scores are ${Math.abs(delta).toFixed(1)} points below the previous window.` };
}

function updateRow(rows: Array<[string, string]> | undefined, label: string, value: string) {
  const row = rows?.find(([name]) => name === label);
  if (row) row[1] = value;
}

/**
 * Defensive normalization at the export boundary. Operational services already validate
 * normal data entry, but dossiers must remain truthful when reading legacy/imported rows.
 */
export function hardenDossierForExport(dossier: PersonDossier): PersonDossier {
  if (dossier.kind !== "student") return dossier;

  const academic = dossier.sections.find((section) => section.title === "Academic performance history")?.table;
  const percentages: number[] = [];
  for (const row of academic?.rows ?? []) {
    const score = number(row[4] ?? "");
    const maximum = number(row[5] ?? "");
    if (score == null || maximum == null || maximum <= 0) {
      row[6] = "-";
      continue;
    }
    const percent = (score / maximum) * 100;
    percentages.push(percent);
    row[6] = `${percent.toFixed(1)}%`;
  }

  const average = percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null;
  const trend = trendLabel(percentages);
  const averageText = average == null ? "-" : `${average.toFixed(1)}%`;
  const intelligence = dossier.sections.find((section) => section.title === "Intelligence summary");
  const academicSummary = dossier.summary.find((item) => item.label === "Academic average");
  if (academicSummary) {
    academicSummary.value = averageText;
    academicSummary.hint = percentages.length ? `${percentages.length} normalized scores` : "No scores with a valid assessment maximum";
  }
  const trendSummary = dossier.summary.find((item) => item.label === "Recent trend");
  if (trendSummary) {
    trendSummary.value = trend.label;
    trendSummary.hint = trend.detail;
  }
  updateRow(intelligence?.rows, "Academic average", averageText);
  updateRow(intelligence?.rows, "Recent performance trend", trend.label);
  updateRow(intelligence?.rows, "Trend context", trend.detail);

  const finance = dossier.sections.find((section) => section.title === "Finance history")?.table;
  let billed = 0;
  let paid = 0;
  let balance = 0;
  for (const row of finance?.rows ?? []) {
    const payable = Math.max(0, number(row[3] ?? "") ?? 0);
    const netPaid = Math.max(0, number(row[4] ?? "") ?? 0);
    const outstanding = Math.max(0, payable - netPaid);
    row[3] = money(payable);
    row[4] = money(netPaid);
    row[5] = money(outstanding);
    billed += payable;
    paid += netPaid;
    balance += outstanding;
  }
  const outstandingSummary = dossier.summary.find((item) => item.label === "Outstanding fees");
  if (outstandingSummary) outstandingSummary.value = money(balance);
  updateRow(intelligence?.rows, "Net fees billed", money(billed));
  updateRow(intelligence?.rows, "Net payments", money(paid));
  updateRow(intelligence?.rows, "Outstanding balance", money(balance));

  return dossier;
}
