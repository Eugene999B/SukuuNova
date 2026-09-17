"use client";

import { useMemo, useState } from "react";
import {
  HARVEST_CROPS,
  canAdvanceHarvestWeek,
  compostHarvestField,
  createLastHarvestState,
  irrigateHarvestField,
  plantHarvestField,
  protectHarvestField,
  stepLastHarvest,
  type HarvestWeekReport,
  type LastHarvestState,
  type WeatherPatternId,
} from "@/lib/game-engine/last-harvest";
import styles from "./last-harvest.module.css";

const WEATHER_LABELS: Record<WeatherPatternId, string> = {
  mixed: "Mixed season",
  dry: "Dry season",
  stormy: "Stormy season",
};

const OUTCOME_COPY = {
  "regenerative-harvest": "You protected both this harvest and the productive capacity of the soil. The farm enters the next season with options.",
  "profitable-but-fragile": "The harvest pays, but depleted soil makes the next season riskier. Short-term output created a long-term cost.",
  "survival-season": "The community gets through the season, but yield or cash reserves are too thin for a comfortable recovery.",
  "failed-harvest": "Yield and reserves fall below a sustainable level. Replay with a different crop mix and intervention strategy.",
} as const;

export function LastHarvestPrototype() {
  const [state, setState] = useState<LastHarvestState>(() => createLastHarvestState());
  const [lastReport, setLastReport] = useState<HarvestWeekReport | null>(null);
  const recentLog = useMemo(() => [...state.log].reverse().slice(0, 8), [state.log]);
  const plannedFields = state.fields.filter((field) => field.cropId !== null).length;
  const averageFertility = state.fields.reduce((sum, field) => sum + field.soilFertility, 0) / state.fields.length;

  const resetForWeather = (weather: WeatherPatternId) => {
    setState(createLastHarvestState(weather));
    setLastReport(null);
  };

  const advance = () => {
    const report = stepLastHarvest(state);
    setState(report.state);
    setLastReport(report);
  };

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Seasonal strategy prototype</p>
            <h1 className={styles.title}>The Last Harvest</h1>
            <p className={styles.subtitle}>
              Run three fields across an eight-week season. Crop biology, rainfall, soil fertility, pests and a limited budget interact over time. The goal is not simply the biggest harvest—it is to finish with enough food, money and soil health to survive the next season too.
            </p>
          </div>
          <div className={styles.toolbar}>
            {(Object.keys(WEATHER_LABELS) as WeatherPatternId[]).map((pattern) => (
              <button type="button" className={`${styles.button} ${state.weatherPattern === pattern ? styles.cropActive : ""}`} key={pattern} onClick={() => resetForWeather(pattern)}>
                {WEATHER_LABELS[pattern]}
              </button>
            ))}
          </div>
        </header>

        <section className={styles.metrics} aria-label="Season metrics">
          <div className={styles.metric}><span>Week</span><strong>{state.week}/{state.maxWeeks}</strong></div>
          <div className={styles.metric}><span>Budget</span><strong>{state.budget} cr</strong></div>
          <div className={styles.metric}><span>Fields planned</span><strong>{plannedFields}/3</strong></div>
          <div className={styles.metric}><span>Average fertility</span><strong>{averageFertility.toFixed(0)}%</strong></div>
          <div className={styles.metric}><span>Harvest</span><strong>{state.totalYieldCrates || "—"} crates</strong></div>
          <div className={styles.metric}><span>Revenue</span><strong>{state.harvestRevenue || "—"} cr</strong></div>
        </section>

        <div className={styles.toolbar}>
          <button type="button" className={styles.primaryButton} disabled={!canAdvanceHarvestWeek(state)} onClick={advance}>
            {state.week === 0 ? "Start season" : state.week < state.maxWeeks ? "Advance one week →" : "Season complete"}
          </button>
          {state.week === 0 && plannedFields < 3 ? <span className={styles.badge}>Plan all three fields first</span> : null}
          <span className={styles.badge}>{WEATHER_LABELS[state.weatherPattern]}</span>
        </div>

        {lastReport && lastReport.fieldNotes.length ? (
          <section className={styles.weekReport} aria-live="polite">
            <strong>Week {state.week} report</strong>
            <span>Rainfall index {(lastReport.rainfall * 100).toFixed(0)}%</span>
            <span>Pest pressure {(lastReport.pestPressure * 100).toFixed(0)}%</span>
          </section>
        ) : null}

        {state.outcome ? (
          <section className={styles.outcome}>
            <h2>{state.outcome.replaceAll("-", " ")}</h2>
            <p>{OUTCOME_COPY[state.outcome]}</p>
          </section>
        ) : null}

        <div className={styles.layout}>
          <section className={styles.fields} aria-label="Farm fields">
            {state.fields.map((field) => {
              const crop = field.cropId ? HARVEST_CROPS[field.cropId] : null;
              return (
                <article className={styles.field} key={field.id}>
                  <div className={styles.fieldHeader}>
                    <h2>{field.name}</h2>
                    <span>{crop ? `${crop.name} · water need ${(crop.waterNeed * 100).toFixed(0)}% · resilience ${(crop.resilience * 100).toFixed(0)}%` : "Unplanned field"}</span>
                  </div>

                  <div className={styles.cropButtons} aria-label={`Crop choice for ${field.name}`}>
                    {Object.values(HARVEST_CROPS).map((option) => (
                      <button
                        type="button"
                        key={option.id}
                        disabled={state.week !== 0 || Boolean(state.outcome)}
                        className={`${styles.cropButton} ${field.cropId === option.id ? styles.cropActive : ""}`}
                        onClick={() => setState((current) => plantHarvestField(current, field.id, option.id))}
                      >
                        <span>{option.name}</span>
                        <small>{option.seedCost} cr · base {option.baseYieldCrates} crates</small>
                      </button>
                    ))}
                  </div>

                  <div className={styles.fieldMetrics}>
                    {[
                      { label: "Health", value: field.health },
                      { label: "Moisture", value: field.moisture },
                      { label: "Soil fertility", value: field.soilFertility },
                    ].map((metric) => (
                      <div className={styles.fieldMetric} key={metric.label}>
                        <div className={styles.fieldMetricLabel}><span>{metric.label}</span><strong>{metric.value.toFixed(0)}%</strong></div>
                        <div className={styles.track}><div className={styles.fill} style={{ width: `${Math.max(0, Math.min(100, metric.value))}%` }} /></div>
                      </div>
                    ))}
                  </div>

                  <div className={styles.statuses}>
                    {field.irrigatedThisWeek ? <span className={styles.badge}>Irrigated</span> : null}
                    {field.compostedThisWeek ? <span className={styles.badge}>Composted</span> : null}
                    {field.protectedThisWeek ? <span className={styles.badge}>Protected</span> : null}
                  </div>

                  <div className={styles.actions}>
                    <button type="button" className={styles.button} disabled={!field.cropId || field.irrigatedThisWeek || state.budget < 32 || Boolean(state.outcome)} onClick={() => setState((current) => irrigateHarvestField(current, field.id))}>Irrigate · 32</button>
                    <button type="button" className={styles.button} disabled={!field.cropId || field.compostedThisWeek || state.budget < 44 || Boolean(state.outcome)} onClick={() => setState((current) => compostHarvestField(current, field.id))}>Compost · 44</button>
                    <button type="button" className={styles.button} disabled={!field.cropId || field.protectedThisWeek || state.budget < 28 || Boolean(state.outcome)} onClick={() => setState((current) => protectHarvestField(current, field.id))}>Pest cover · 28</button>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className={styles.logPanel}>
            <h2>Farm journal</h2>
            <ul className={styles.log}>
              {recentLog.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
            </ul>
          </aside>
        </div>
      </div>
    </main>
  );
}
