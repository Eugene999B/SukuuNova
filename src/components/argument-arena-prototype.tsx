"use client";

import { useMemo, useState } from "react";
import {
  ARENA_EVIDENCE,
  ARENA_REASONING,
  ARENA_REBUTTALS,
  createArgumentArenaState,
  currentArenaChallenge,
  playArenaMove,
  type ArenaAudience,
  type ArenaSide,
  type ArgumentArenaState,
} from "@/lib/game-engine/argument-arena";
import styles from "./last-harvest.module.css";

const OUTCOME_COPY = {
  "arena-champion": "Your case stayed relevant, varied and responsive under pressure. You did more than collect facts—you connected them and answered objections.",
  "persuasive-case": "Your position remained persuasive across the match, though a stronger evidence mix or rebuttal choice could make it harder to attack.",
  "narrow-loss": "The case was competitive, but one or two weak links gave the opponent enough room to edge ahead. Replay from the other side or audience.",
  "rethink-case": "The chain relied too much on weak relevance, repeated evidence or incomplete rebuttals. Rebuild the case rather than hunting for a single magic answer.",
} as const;

export function ArgumentArenaPrototype() {
  const [state, setState] = useState<ArgumentArenaState>(() => createArgumentArenaState());
  const [evidenceId, setEvidenceId] = useState(ARENA_EVIDENCE[0].id);
  const [reasoningId, setReasoningId] = useState(ARENA_REASONING[0].id);
  const [rebuttalId, setRebuttalId] = useState(ARENA_REBUTTALS[0].id);
  const challenge = currentArenaChallenge(state);
  const latest = state.exchanges[state.exchanges.length - 1] ?? null;
  const used = useMemo(() => new Set(state.evidenceUsed), [state.evidenceUsed]);

  const reset = (side: ArenaSide = state.side, audience: ArenaAudience = state.audience) => {
    setState(createArgumentArenaState(side, audience));
    setEvidenceId(ARENA_EVIDENCE[0].id);
    setReasoningId(ARENA_REASONING[0].id);
    setRebuttalId(ARENA_REBUTTALS[0].id);
  };

  const play = () => {
    setState((current) => playArenaMove(current, evidenceId, reasoningId, rebuttalId));
  };

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Competitive persuasion prototype</p>
            <h1 className={styles.title}>Argument Arena</h1>
            <p className={styles.subtitle}>
              Build a claim under pressure by combining evidence, reasoning and a rebuttal. There is no universal best card: relevance changes with your side, objections change by round, repeated evidence weakens the case, and the audience changes what sounds persuasive.
            </p>
          </div>
          <button type="button" className={styles.button} onClick={() => reset()}>Reset match</button>
        </header>

        <section className={styles.outcome}>
          <h2>Motion</h2>
          <p>{state.topic}</p>
        </section>

        <div className={styles.toolbar}>
          {(["support", "oppose"] as ArenaSide[]).map((side) => (
            <button type="button" key={side} className={`${styles.button} ${state.side === side ? styles.cropActive : ""}`} onClick={() => reset(side, state.audience)}>
              {side === "support" ? "Support motion" : "Oppose motion"}
            </button>
          ))}
          {(["students", "teachers", "community"] as ArenaAudience[]).map((audience) => (
            <button type="button" key={audience} className={`${styles.button} ${state.audience === audience ? styles.cropActive : ""}`} onClick={() => reset(state.side, audience)}>
              Audience: {audience}
            </button>
          ))}
        </div>

        <section className={styles.metrics} aria-label="Debate score">
          <div className={styles.metric}><span>Round</span><strong>{state.round}/{state.maxRounds}</strong></div>
          <div className={styles.metric}><span>Your case</span><strong>{state.score}</strong></div>
          <div className={styles.metric}><span>Opponent</span><strong>{state.opponentScore}</strong></div>
          <div className={styles.metric}><span>Sources used</span><strong>{new Set(state.evidenceUsed).size}/{ARENA_EVIDENCE.length}</strong></div>
        </section>

        {!state.outcome ? (
          <section className={styles.weekReport} aria-live="polite">
            <strong>Opponent challenge:</strong>
            <span>{challenge.prompt}</span>
          </section>
        ) : (
          <section className={styles.outcome}>
            <h2>{state.outcome.replaceAll("-", " ")}</h2>
            <p>{OUTCOME_COPY[state.outcome]}</p>
          </section>
        )}

        <section className={styles.field}>
          <div className={styles.fieldHeader}>
            <h2>1. Evidence</h2>
            <span>Choose a source because it helps this side—not because it merely sounds impressive.</span>
          </div>
          <div className={styles.cropButtons}>
            {ARENA_EVIDENCE.map((evidence) => (
              <button
                type="button"
                key={evidence.id}
                disabled={Boolean(state.outcome)}
                className={`${styles.cropButton} ${evidenceId === evidence.id ? styles.cropActive : ""}`}
                onClick={() => setEvidenceId(evidence.id)}
              >
                <span>{evidence.title}{used.has(evidence.id) ? " · used" : ""}</span>
                <small>{evidence.summary} · {evidence.source}</small>
              </button>
            ))}
          </div>
        </section>

        <div className={styles.layout}>
          <section className={styles.field}>
            <div className={styles.fieldHeader}>
              <h2>2. Reasoning link</h2>
              <span>Explain why the evidence matters instead of dropping a fact and moving on.</span>
            </div>
            <div className={styles.cropButtons}>
              {ARENA_REASONING.map((reasoning) => (
                <button type="button" key={reasoning.id} disabled={Boolean(state.outcome)} className={`${styles.cropButton} ${reasoningId === reasoning.id ? styles.cropActive : ""}`} onClick={() => setReasoningId(reasoning.id)}>
                  <span>{reasoning.label}</span>
                  <small>{reasoning.description}</small>
                </button>
              ))}
            </div>
          </section>

          <aside className={styles.logPanel}>
            <h2>3. Rebuttal</h2>
            <div className={styles.cropButtons}>
              {ARENA_REBUTTALS.map((rebuttal) => (
                <button type="button" key={rebuttal.id} disabled={Boolean(state.outcome)} className={`${styles.cropButton} ${rebuttalId === rebuttal.id ? styles.cropActive : ""}`} onClick={() => setRebuttalId(rebuttal.id)}>
                  <span>{rebuttal.label}</span>
                  <small>{rebuttal.description}</small>
                </button>
              ))}
            </div>
            <button type="button" className={styles.primaryButton} disabled={Boolean(state.outcome)} onClick={play}>Deliver argument →</button>
          </aside>
        </div>

        {latest ? (
          <section className={styles.field} aria-live="polite">
            <div className={styles.fieldHeader}>
              <h2>Round {latest.round} analysis</h2>
              <span>You {latest.playerPoints} · Opponent {latest.opponentPoints}</span>
            </div>
            <section className={styles.metrics}>
              {Object.entries(latest.breakdown).map(([label, value]) => (
                <div className={styles.metric} key={label}><span>{label.replaceAll("Fit", " fit")}</span><strong>{value}</strong></div>
              ))}
            </section>
            <ul className={styles.log}>
              {latest.feedback.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
