"use client";

import { useMemo, useState } from "react";
import {
  createBlackoutProtocolState,
  deployCyberAnalyst,
  dispatchSubstationRepair,
  poweredDemandMw,
  setServiceNetworkIsolation,
  setServicePowered,
  stepBlackoutProtocol,
  type BlackoutProtocolState,
  type CrisisStepReport,
} from "@/lib/game-engine/blackout-protocol";
import styles from "./blackout-protocol.module.css";

const outcomeCopy = {
  "resilient-recovery": "Critical services stayed resilient. The city absorbs the incident without a major cascade.",
  "strained-recovery": "The city recovers, but service damage and public disruption remain significant.",
  "system-cascade": "A critical system collapses or damage compounds beyond safe recovery. Try a different load/cyber response sequence.",
} as const;

export function BlackoutProtocolPrototype() {
  const [state, setState] = useState<BlackoutProtocolState>(() => createBlackoutProtocolState());
  const [lastReport, setLastReport] = useState<CrisisStepReport | null>(null);
  const demand = poweredDemandMw(state);
  const overload = Math.max(0, demand - state.availableCapacityMw);
  const recentLog = useMemo(() => [...state.log].reverse().slice(0, 9), [state.log]);

  const reset = () => {
    setState(createBlackoutProtocolState());
    setLastReport(null);
  };

  const advance = () => {
    const report = stepBlackoutProtocol(state);
    setState(report.state);
    setLastReport(report);
  };

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Real-time systems crisis prototype</p>
            <h1 className={styles.title}>Blackout Protocol</h1>
            <p className={styles.subtitle}>
              The West substation has failed while suspicious control traffic is moving through the city network. Keep essential services alive with limited capacity, one cyber analyst and two repair teams. There is no question screen: electricity, networking and prioritisation are the game.
            </p>
          </div>
          <button type="button" className={styles.button} onClick={reset}>Reset crisis</button>
        </header>

        <section className={styles.metrics} aria-label="Crisis metrics">
          <div className={styles.metric}><span>Crisis turn</span><strong>{state.tick}/{state.maxTicks}</strong></div>
          <div className={styles.metric}><span>Powered demand</span><strong className={overload > 0 ? styles.warning : styles.safe}>{demand} MW</strong></div>
          <div className={styles.metric}><span>Grid capacity</span><strong>{state.availableCapacityMw} MW</strong></div>
          <div className={styles.metric}><span>Headroom</span><strong className={overload > 0 ? styles.warning : styles.safe}>{state.availableCapacityMw - demand} MW</strong></div>
          <div className={styles.metric}><span>Public trust</span><strong>{Math.round(state.publicTrust)}%</strong></div>
          <div className={styles.metric}><span>Repair teams</span><strong>{state.repairTeams}</strong></div>
          <div className={styles.metric}><span>Cyber analysts</span><strong>{state.cyberAnalysts}</strong></div>
        </section>

        <div className={styles.commandBar}>
          <button
            type="button"
            className={styles.button}
            disabled={Boolean(state.outcome) || state.substationRepairTicksRemaining !== null || state.repairTeams <= 0 || state.availableCapacityMw >= state.baseCapacityMw}
            onClick={() => setState((current) => dispatchSubstationRepair(current))}
          >
            Dispatch substation repair {state.substationRepairTicksRemaining !== null ? `(${state.substationRepairTicksRemaining} turns left)` : ""}
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={Boolean(state.outcome) || state.cyberContained || state.cyberAnalysts <= 0}
            onClick={() => setState((current) => deployCyberAnalyst(current))}
          >
            {state.cyberContained ? "Cyber spread contained" : "Deploy cyber analyst"}
          </button>
          <button type="button" className={styles.primaryButton} disabled={Boolean(state.outcome)} onClick={advance}>
            Advance one crisis turn →
          </button>
        </div>

        {lastReport ? (
          <div className={styles.commandBar} aria-live="polite">
            <span className={styles.badge}>{lastReport.overloadMw > 0 ? `${lastReport.overloadMw} MW overload` : "Grid inside capacity"}</span>
            {lastReport.newlyCyberAffected ? <span className={`${styles.badge} ${styles.badgeDanger}`}>Cyber spread: {lastReport.newlyCyberAffected}</span> : null}
            {lastReport.substationRestored ? <span className={`${styles.badge} ${styles.badgeGood}`}>Substation restored</span> : null}
            <span className={styles.badge}>Trust {lastReport.trustDelta >= 0 ? "+" : ""}{lastReport.trustDelta.toFixed(1)}</span>
          </div>
        ) : null}

        {state.outcome ? (
          <section className={styles.outcome} aria-live="polite">
            <h2>{state.outcome.replaceAll("-", " ")}</h2>
            <p>{outcomeCopy[state.outcome]}</p>
          </section>
        ) : null}

        <div className={styles.layout}>
          <section className={styles.services} aria-label="City services">
            {state.services.map((service) => (
              <article className={styles.service} key={service.id}>
                <div className={styles.serviceHeader}>
                  <div>
                    <h2>{service.name}</h2>
                    <div className={styles.serviceMeta}>
                      <span className={styles.badge}>{service.demandMw} MW</span>
                      <span className={styles.badge}>Priority {service.criticality}/3</span>
                    </div>
                  </div>
                  <strong>{Math.round(service.health)}%</strong>
                </div>
                <div className={styles.healthTrack} aria-label={`${service.name} health ${Math.round(service.health)} percent`}>
                  <div className={styles.healthFill} style={{ width: `${service.health}%` }} />
                </div>
                <div className={styles.statuses}>
                  <span className={`${styles.badge} ${service.powered ? styles.badgeGood : styles.badgeDanger}`}>{service.powered ? "Powered" : "Load shed"}</span>
                  {service.cyberAffected ? <span className={`${styles.badge} ${styles.badgeDanger}`}>Cyber affected</span> : <span className={styles.badge}>Network clean</span>}
                  {service.networkIsolated ? <span className={styles.badge}>Network isolated</span> : null}
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={Boolean(state.outcome)}
                    onClick={() => setState((current) => setServicePowered(current, service.id, !service.powered))}
                  >
                    {service.powered ? "Shed load" : "Restore power"}
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={Boolean(state.outcome)}
                    onClick={() => setState((current) => setServiceNetworkIsolation(current, service.id, !service.networkIsolated))}
                  >
                    {service.networkIsolated ? "Reconnect network" : "Isolate network"}
                  </button>
                </div>
              </article>
            ))}
          </section>

          <aside className={styles.logPanel}>
            <h2>Operations log</h2>
            <ul className={styles.log}>
              {recentLog.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
            </ul>
          </aside>
        </div>
      </div>
    </main>
  );
}
