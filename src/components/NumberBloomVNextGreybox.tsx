"use client";

import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Droplets, RotateCcw, Volume2 } from "lucide-react";
import type {
  NumberBloomContainer,
  NumberBloomItemState,
  NumberBloomPublicMission,
  NumberBloomState,
} from "@/lib/arcade-vnext/games/number-bloom/domain";
import "./number-bloom.css";
import "./number-bloom-vnext.css";

type NumberBloomGreyboxAction = (actionType: string, payload: Record<string, unknown>) => void | Promise<void>;

type Props = {
  mission: NumberBloomPublicMission;
  state: NumberBloomState;
  onAction: NumberBloomGreyboxAction;
  disabled?: boolean;
  reducedMotion?: boolean;
  feedback?: string;
};

const OBJECT_SYMBOLS = {
  seed: "●",
  flower: "🌼",
  ladybird: "🐞",
} as const;

function itemInSlot(state: NumberBloomState, containerId: string, slot: number) {
  return state.items.find((item) => item.containerId === containerId && item.slot === slot);
}

function containerFor(mission: NumberBloomPublicMission, item: NumberBloomItemState | undefined) {
  if (!item?.containerId) return undefined;
  return mission.containers.find((container) => container.id === item.containerId);
}

function pairNumber(state: NumberBloomState, itemId: string) {
  const index = state.pairs.findIndex((pair) => pair.leftItemId === itemId || pair.rightItemId === itemId);
  return index < 0 ? null : index + 1;
}

function objectSymbol(item: NumberBloomItemState, watered: boolean) {
  if (item.kind === "seed" && watered) return "🌱";
  return OBJECT_SYMBOLS[item.kind];
}

export default function NumberBloomVNextGreybox({
  mission,
  state,
  onAction,
  disabled = false,
  reducedMotion = false,
  feedback,
}: Props) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedItem = useMemo(
    () => state.items.find((item) => item.id === selectedItemId),
    [selectedItemId, state.items],
  );
  const looseItems = state.items.filter((item) => item.containerId === null);

  const send = async (actionType: string, payload: Record<string, unknown>) => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      await onAction(actionType, payload);
    } finally {
      setBusy(false);
    }
  };

  const sendPlacement = async (item: NumberBloomItemState, containerId: string, targetSlot: number) => {
    if (item.containerId === containerId && item.slot === targetSlot) return;
    await send(item.containerId === null ? "place" : "move", {
      itemId: item.id,
      containerId,
      slot: targetSlot,
    });
    setSelectedItemId(null);
  };

  const pairIfPossible = async (first: NumberBloomItemState, second: NumberBloomItemState) => {
    if (mission.mechanic !== "compare_patches") return false;
    const firstContainer = containerFor(mission, first);
    const secondContainer = containerFor(mission, second);
    if (!firstContainer?.side || !secondContainer?.side || firstContainer.side === secondContainer.side) return false;
    if (!([firstContainer.side, secondContainer.side].includes("left") && [firstContainer.side, secondContainer.side].includes("right"))) {
      return false;
    }
    const leftItemId = firstContainer.side === "left" ? first.id : second.id;
    const rightItemId = firstContainer.side === "right" ? first.id : second.id;
    await send("pair", { leftItemId, rightItemId });
    setSelectedItemId(null);
    return true;
  };

  const activateOccupiedSlot = async (item: NumberBloomItemState) => {
    if (selectedItem && selectedItem.id !== item.id && await pairIfPossible(selectedItem, item)) return;
    setSelectedItemId((current) => current === item.id ? null : item.id);
  };

  const activateSlot = async (containerId: string, targetSlot: number) => {
    const occupied = itemInSlot(state, containerId, targetSlot);
    if (occupied) {
      await activateOccupiedSlot(occupied);
      return;
    }
    if (selectedItem) await sendPlacement(selectedItem, containerId, targetSlot);
  };

  const replayInstruction = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(mission.instruction.spoken));
  };

  const startPointerDrag = (event: ReactPointerEvent<HTMLElement>, itemId: string) => {
    if (disabled || busy) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    setDragItemId(itemId);
    setSelectedItemId(itemId);
  };

  const finishPointerDrag = async (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragItemId || disabled || busy) return;
    const item = state.items.find((candidate) => candidate.id === dragItemId);
    setDragItemId(null);
    if (!item || typeof document === "undefined") return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-bloom-slot]") as HTMLElement | null;
    if (!target) return;
    const containerId = target.dataset.containerId;
    const targetSlot = Number(target.dataset.slot);
    if (!containerId || !Number.isInteger(targetSlot)) return;
    if (itemInSlot(state, containerId, targetSlot)) return;
    await sendPlacement(item, containerId, targetSlot);
  };

  const removeSelected = async () => {
    if (!selectedItem?.containerId) return;
    await send("remove", { itemId: selectedItem.id });
    setSelectedItemId(null);
  };

  const targetNumber = mission.mechanic === "plant_count"
    ? mission.targetCount
    : mission.mechanic === "make_bed"
      ? mission.targetTotal
      : null;

  const renderContainer = (container: NumberBloomContainer) => {
    const watered = state.wateredContainers.includes(container.id);
    return (
      <section
        key={container.id}
        className={`bloom-vnext-container side-${container.side ?? "center"}`}
        aria-label={`${container.side ?? "garden"} ${container.role}`}
      >
        <div className="bloom-vnext-soil" aria-hidden="true" />
        <div className="bloom-vnext-slots">
          {Array.from({ length: container.capacity }, (_, index) => {
            const item = itemInSlot(state, container.id, index);
            const paired = item ? pairNumber(state, item.id) : null;
            return (
              <button
                key={`${container.id}-${index}`}
                type="button"
                className={`bloom-vnext-slot ${item ? "occupied" : ""} ${item?.id === selectedItemId ? "selected" : ""}`}
                data-bloom-slot="true"
                data-container-id={container.id}
                data-slot={index}
                disabled={disabled || busy}
                aria-label={item
                  ? `${item.kind} in ${container.side ?? "garden"} slot ${index + 1}${paired ? `, pair ${paired}` : ""}`
                  : `empty ${container.side ?? "garden"} slot ${index + 1}`}
                onClick={() => void activateSlot(container.id, index)}
                onPointerDown={item ? (event) => startPointerDrag(event, item.id) : undefined}
              >
                {item ? (
                  <span className={`bloom-vnext-object kind-${item.kind}`} aria-hidden="true">
                    {objectSymbol(item, watered)}
                    {paired ? <small>{paired}</small> : null}
                  </span>
                ) : <span className="bloom-vnext-hole" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <section
      className="number-bloom bloom-vnext"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      aria-label="Number Bloom direct manipulation greybox"
      onPointerUp={(event) => void finishPointerDrag(event)}
      onPointerCancel={() => setDragItemId(null)}
    >
      <header className="bloom-vnext-header">
        <div>
          <span className="bloom-kicker">NUMBER BLOOM · GREYBOX</span>
          <h1>{mission.title}</h1>
        </div>
        <button type="button" className="bloom-vnext-replay" onClick={replayInstruction} aria-label="Replay instruction">
          <Volume2 size={24} aria-hidden="true" />
          <span aria-hidden="true">▶</span>
        </button>
      </header>

      <main className="bloom-vnext-play">
        <section className="bloom-vnext-goal" aria-label={mission.instruction.spoken}>
          {targetNumber !== null ? <strong aria-hidden="true">{targetNumber}</strong> : <span aria-hidden="true">👀 ↔ 🌼</span>}
          <p>{mission.instruction.spoken}</p>
        </section>

        <div className={`bloom-vnext-garden mechanic-${mission.mechanic}`}>
          {mission.containers.map(renderContainer)}
        </div>

        {mission.mechanic === "compare_patches" ? (
          <section className="bloom-vnext-relationship" aria-label="Show the relationship between the two patches">
            <button
              type="button"
              className={state.relationship === "left_more" ? "chosen" : ""}
              disabled={disabled || busy}
              aria-label="Left patch has more"
              onClick={() => void send("set_relationship", { relation: "left_more" })}
            >🐦</button>
            <button
              type="button"
              className={state.relationship === "same" ? "chosen" : ""}
              disabled={disabled || busy}
              aria-label="Both patches have the same amount"
              onClick={() => void send("set_relationship", { relation: "same" })}
            >🍃</button>
            <button
              type="button"
              className={state.relationship === "right_more" ? "chosen" : ""}
              disabled={disabled || busy}
              aria-label="Right patch has more"
              onClick={() => void send("set_relationship", { relation: "right_more" })}
            >🐦</button>
          </section>
        ) : null}

        <section className="bloom-vnext-tray" aria-label="Garden object tray">
          <div className="bloom-vnext-loose">
            {looseItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`bloom-vnext-loose-item ${selectedItemId === item.id ? "selected" : ""}`}
                disabled={disabled || busy}
                aria-label={`Loose ${item.kind}. Tap then tap a garden hole, or drag it.`}
                onClick={() => setSelectedItemId((current) => current === item.id ? null : item.id)}
                onPointerDown={(event) => startPointerDrag(event, item.id)}
              >
                <span aria-hidden="true">{objectSymbol(item, false)}</span>
              </button>
            ))}
          </div>

          <div className="bloom-vnext-tools">
            {selectedItem?.containerId ? (
              <button type="button" disabled={disabled || busy} onClick={() => void removeSelected()} aria-label="Return selected object to the tray">
                <RotateCcw size={24} aria-hidden="true" />
                <span aria-hidden="true">🧺</span>
              </button>
            ) : null}
            {mission.mechanic === "free_grow" ? mission.containers.map((container) => (
              <button
                key={`water-${container.id}`}
                type="button"
                className={state.wateredContainers.includes(container.id) ? "chosen" : ""}
                disabled={disabled || busy}
                onClick={() => void send("water", { containerId: container.id })}
                aria-label="Water this garden bed"
              >
                <Droplets size={28} aria-hidden="true" />
              </button>
            )) : null}
          </div>
        </section>

        <div className="bloom-vnext-status" aria-live="polite">
          {busy ? "Garden changing…" : feedback ?? "Touch an object, then touch a place for it."}
        </div>
      </main>
    </section>
  );
}
