"use client";

import { useMemo, useState } from "react";
import NumberBloomVNextGreybox from "./NumberBloomVNextGreybox";
import {
  applyNumberBloomAction,
  buildNumberBloomMission,
  evaluateNumberBloomState,
  parseNumberBloomAction,
  type NumberBloomMechanic,
  type NumberBloomMissionBundle,
  type NumberBloomState,
} from "@/lib/arcade-vnext/games/number-bloom/domain";
import "./number-bloom-vnext-playtest.css";

const MODES: Array<{ value: NumberBloomMechanic; label: string }> = [
  { value: "plant_count", label: "Plant Count" },
  { value: "make_bed", label: "Make the Bed" },
  { value: "compare_patches", label: "Compare Patches" },
  { value: "free_grow", label: "Free Grow" },
];

function fresh(mechanic: NumberBloomMechanic, variant: number) {
  const bundle = buildNumberBloomMission(mechanic, variant);
  return { bundle, state: bundle.initialState };
}

export default function NumberBloomVNextPlaytest() {
  const [mechanic, setMechanic] = useState<NumberBloomMechanic>("plant_count");
  const [variant, setVariant] = useState(0);
  const [session, setSession] = useState(() => fresh("plant_count", 0));
  const [reducedMotion, setReducedMotion] = useState(false);
  const [feedback, setFeedback] = useState("Greybox ready. No production session is connected.");

  const evaluation = useMemo(
    () => evaluateNumberBloomState(session.bundle.privateMission, session.state),
    [session],
  );

  const reset = (nextMechanic = mechanic, nextVariant = variant) => {
    setSession(fresh(nextMechanic, nextVariant));
    setFeedback(nextMechanic === "free_grow"
      ? "Free Grow is ungraded. Plant, water, gather, and rearrange freely."
      : "Mission reset. Construct the answer in the garden.");
  };

  const chooseMechanic = (next: NumberBloomMechanic) => {
    setMechanic(next);
    setVariant(0);
    reset(next, 0);
  };

  const chooseVariant = (next: number) => {
    setVariant(next);
    reset(mechanic, next);
  };

  const handleAction = async (actionType: string, payload: Record<string, unknown>) => {
    try {
      const action = parseNumberBloomAction(actionType, payload);
      const nextState = applyNumberBloomAction(
        session.bundle.publicMission,
        session.state,
        action,
      );
      const nextEvaluation = evaluateNumberBloomState(session.bundle.privateMission, nextState);
      setSession((current) => ({ ...current, state: nextState }));

      if (session.bundle.publicMission.mechanic === "free_grow") {
        setFeedback("Toy state changed. Nothing here is being graded.");
      } else if (nextEvaluation.demonstrated) {
        setFeedback("✓ The constructed state demonstrates the relationship.");
      } else if (nextEvaluation.misconception) {
        setFeedback(`Observed: ${nextEvaluation.misconception.replaceAll("_", " ")}. Keep the state editable.`);
      } else {
        setFeedback("State changed. Keep manipulating the garden.");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? `Rejected safely: ${error.message}` : "Rejected safely.");
    }
  };

  return (
    <section className="bloom-playtest-shell" aria-label="Number Bloom vNext local greybox playtest">
      <aside className="bloom-playtest-panel">
        <div>
          <p className="bloom-playtest-eyebrow">LOCAL GREYBOX HARNESS</p>
          <h2>Number Bloom vNext</h2>
          <p className="bloom-playtest-warning">
            Unrouted. No guardian API, database session, rewards, or production adapter registry is connected.
          </p>
        </div>

        <fieldset>
          <legend>Mechanic</legend>
          <div className="bloom-playtest-modes">
            {MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={mechanic === mode.value ? "active" : ""}
                onClick={() => chooseMechanic(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Variant</legend>
          <div className="bloom-playtest-variants">
            {[0, 1, 2].map((value) => (
              <button
                key={value}
                type="button"
                className={variant === value ? "active" : ""}
                onClick={() => chooseVariant(value)}
              >
                {value + 1}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="bloom-playtest-toggle">
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => setReducedMotion(event.target.checked)}
          />
          Reduced motion
        </label>

        <button type="button" className="bloom-playtest-reset" onClick={() => reset()}>
          Reset constructed state
        </button>

        <dl className="bloom-playtest-readout">
          <div><dt>Mechanic</dt><dd>{session.bundle.publicMission.mechanic}</dd></div>
          <div><dt>Interactions</dt><dd>{session.state.interactionCount}</dd></div>
          <div><dt>Self-corrections</dt><dd>{session.state.selfCorrections}</dd></div>
          <div><dt>Support uses</dt><dd>{session.state.supportRequests}</dd></div>
          <div><dt>Progress</dt><dd>{Math.round(evaluation.progress * 100)}%</dd></div>
          <div><dt>Demonstrated</dt><dd>{evaluation.demonstrated ? "yes" : "no"}</dd></div>
        </dl>
      </aside>

      <div className="bloom-playtest-stage">
        <NumberBloomVNextGreybox
          mission={session.bundle.publicMission}
          state={session.state}
          onAction={handleAction}
          reducedMotion={reducedMotion}
          feedback={feedback}
        />
      </div>
    </section>
  );
}

export function createNumberBloomPlaytestState(
  mechanic: NumberBloomMechanic,
  variant: number,
): { bundle: NumberBloomMissionBundle; state: NumberBloomState } {
  return fresh(mechanic, variant);
}
