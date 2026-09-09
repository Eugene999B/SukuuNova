"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

type ChoiceVariant = "choice" | "match" | "classify" | "path";

type ChoiceProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  variant?: ChoiceVariant;
  hint?: string;
};

type OrderProps = {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  mode: "sort" | "build";
};

type TypedProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
};

type DragState = {
  from: number;
  over: number;
  pointerId: number;
  startY: number;
  deltaY: number;
};

function parseOrder(value: string, fallback: string[]) {
  if (!value) return [...fallback];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== fallback.length || !parsed.every((item) => typeof item === "string")) return [...fallback];
    const expected = [...fallback].sort();
    const actual = [...parsed].sort();
    return actual.every((item, index) => item === expected[index]) ? parsed as string[] : [...fallback];
  } catch {
    return [...fallback];
  }
}

function moveItem(values: string[], from: number, to: number) {
  const next = [...values];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function ArcadePhysicsChoice({ options, value, onChange, disabled = false, variant = "choice", hint }: ChoiceProps) {
  const [settled, setSettled] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const select = (option: string) => {
    if (disabled) return;
    onChange(option);
    setSettled(option);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSettled(null), 360);
  };

  return <div className={`arcade-physics-choice arcade-physics-${variant}`} role="group" aria-label={hint ?? "Choose an answer"}>
    {hint ? <p className="arcade-muted arcade-physics-full">{hint}</p> : null}
    {options.map((option, index) => <button
      type="button"
      key={option}
      disabled={disabled}
      aria-pressed={value === option}
      className={`${value === option ? "chosen" : ""} ${settled === option ? "settled" : ""}`.trim()}
      onClick={() => select(option)}
      style={{ "--arcade-choice-index": index } as CSSProperties}
    >
      {variant === "path" ? <span className="arcade-path-node" aria-hidden="true">{index + 1}</span> : null}
      <span>{option}</span>
    </button>)}
    <style>{`
      .arcade-physics-choice{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0;perspective:900px}
      .arcade-physics-full{grid-column:1/-1;margin:0}
      .arcade-physics-choice button{position:relative;display:flex;align-items:center;gap:12px;min-height:64px;padding:14px 16px;text-align:left;border:2px solid var(--sn-line);border-radius:14px;background:var(--sn-surface-2);color:var(--sn-ink);font:inherit;font-size:17px;cursor:pointer;transform:translate3d(0,0,0) scale(1);box-shadow:0 1px 0 var(--sn-line);transition:transform 180ms cubic-bezier(.2,.8,.2,1.25),box-shadow 180ms ease,border-color 160ms ease,background 160ms ease;will-change:transform}
      .arcade-physics-choice button:hover:not(:disabled){transform:translate3d(0,-3px,0) scale(1.012);box-shadow:0 7px 0 var(--sn-line)}
      .arcade-physics-choice button:active:not(:disabled){transform:translate3d(0,2px,0) scale(.985);box-shadow:0 1px 0 var(--sn-line);transition-duration:70ms}
      .arcade-physics-choice button.chosen{border-color:var(--sn-guardian-accent);background:var(--sn-guardian-tint);font-weight:750;box-shadow:0 4px 0 var(--sn-guardian-accent)}
      .arcade-physics-choice button.settled{animation:arcade-choice-settle 340ms cubic-bezier(.22,1.5,.36,1)}
      .arcade-physics-classify button{text-align:center;justify-content:center}
      .arcade-physics-path{position:relative}
      .arcade-physics-path button{min-height:72px}
      .arcade-path-node{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:999px;background:var(--sn-surface);border:1px solid var(--sn-line);color:var(--sn-guardian-accent);font-weight:800;transition:transform 180ms cubic-bezier(.2,.8,.2,1.35)}
      .arcade-physics-path button:hover:not(:disabled) .arcade-path-node,.arcade-physics-path button.chosen .arcade-path-node{transform:scale(1.12) rotate(-4deg)}
      @keyframes arcade-choice-settle{0%{transform:translate3d(0,2px,0) scale(.985)}45%{transform:translate3d(0,-5px,0) scale(1.025)}72%{transform:translate3d(0,1px,0) scale(.995)}100%{transform:translate3d(0,0,0) scale(1)}}
      @media(max-width:650px){.arcade-physics-choice{grid-template-columns:1fr}.arcade-physics-full{grid-column:auto}}
      @media(prefers-reduced-motion:reduce){.arcade-physics-choice button,.arcade-path-node{transition:none}.arcade-physics-choice button:hover:not(:disabled),.arcade-physics-choice button:active:not(:disabled){transform:none;box-shadow:0 1px 0 var(--sn-line)}.arcade-physics-choice button.settled{animation:none}}
    `}</style>
  </div>;
}

export function ArcadePhysicsOrder({ items, value, onChange, disabled = false, mode }: OrderProps) {
  const signature = useMemo(() => JSON.stringify(items), [items]);
  const [order, setOrder] = useState(() => parseOrder(value, items));
  const [drag, setDrag] = useState<DragState | null>(null);
  const [settledIndex, setSettledIndex] = useState<number | null>(null);
  const rows = useRef<Array<HTMLLIElement | null>>([]);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrder(parseOrder(value, items));
    setDrag(null);
  }, [value, signature]);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const commit = (next: string[], index?: number) => {
    setOrder(next);
    onChange(JSON.stringify(next));
    if (typeof index === "number") {
      setSettledIndex(index);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => setSettledIndex(null), 380);
    }
  };

  const nudge = (position: number, direction: -1 | 1) => {
    const target = position + direction;
    if (disabled || target < 0 || target >= order.length) return;
    const next = [...order];
    [next[position], next[target]] = [next[target], next[position]];
    commit(next, target);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ from: index, over: index, pointerId: event.pointerId, startY: event.clientY, deltaY: 0 });
  };

  const continueDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    setDrag((current) => {
      if (!current || event.pointerId !== current.pointerId) return current;
      let over = current.over;
      let nearest = Number.POSITIVE_INFINITY;
      rows.current.forEach((node, index) => {
        if (!node || index === current.from) return;
        const rect = node.getBoundingClientRect();
        const distance = Math.abs(event.clientY - (rect.top + rect.height / 2));
        if (distance < nearest) {
          nearest = distance;
          over = index;
        }
      });
      return { ...current, over, deltaY: event.clientY - current.startY };
    });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { from, over } = drag;
    setDrag(null);
    if (from === over) {
      setSettledIndex(from);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => setSettledIndex(null), 320);
      return;
    }
    commit(moveItem(order, from, over), over);
  };

  const cancelDrag = () => setDrag(null);
  const dragTilt = drag ? Math.max(-2.4, Math.min(2.4, drag.deltaY / 65)) : 0;

  return <div className="arcade-physics-order" role="group" aria-label={mode === "build" ? "Build the answer by arranging tiles" : "Arrange the items in the correct order"}>
    <p className="arcade-muted">Drag a tile by its grip and release it near the new position. Keyboard and arrow-button controls work too.</p>
    <ol className="arcade-physics-order-list">
      {order.map((item, position) => {
        const dragging = drag?.from === position;
        const target = Boolean(drag && drag.from !== drag.over && drag.over === position);
        const style = dragging ? {
          transform: `translate3d(0, ${drag.deltaY}px, 0) rotate(${dragTilt}deg) scale(1.035)`,
        } : undefined;
        return <li
          ref={(node) => { rows.current[position] = node; }}
          key={item}
          data-physics-index={position}
          className={`${dragging ? "dragging" : ""} ${target ? "drop-target" : ""} ${settledIndex === position ? "settled" : ""}`.trim()}
          style={style}
        >
          <strong>{position + 1}</strong>
          <span className="arcade-physics-tile-text">{item}</span>
          <div className="arcade-physics-order-actions">
            <button type="button" disabled={disabled || position === 0} aria-label={`Move ${item} up`} onClick={() => nudge(position, -1)}>↑</button>
            <button type="button" disabled={disabled || position === order.length - 1} aria-label={`Move ${item} down`} onClick={() => nudge(position, 1)}>↓</button>
            <button
              type="button"
              className="arcade-drag-grip"
              disabled={disabled}
              aria-label={`Drag ${item}`}
              title="Drag to reorder"
              onPointerDown={(event) => beginDrag(event, position)}
              onPointerMove={continueDrag}
              onPointerUp={finishDrag}
              onPointerCancel={cancelDrag}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") { event.preventDefault(); nudge(position, -1); }
                if (event.key === "ArrowDown") { event.preventDefault(); nudge(position, 1); }
              }}
            >⠿</button>
          </div>
        </li>;
      })}
    </ol>
    <p className="arcade-physics-order-state" aria-live="polite">{value ? "Order saved for this task." : "Move at least one tile or confirm the starting order."}</p>
    {!value ? <button type="button" className="arcade-primary" disabled={disabled} onClick={() => commit(order, 0)}>Confirm this starting order</button> : null}
    <style>{`
      .arcade-physics-order{margin:20px 0;display:grid;gap:12px}.arcade-physics-order-list{list-style:none;padding:0;margin:0;display:grid;gap:9px;position:relative}
      .arcade-physics-order-list li{position:relative;z-index:1;display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 12px;border:2px solid var(--sn-line);border-radius:14px;background:var(--sn-surface-2);box-shadow:0 2px 0 var(--sn-line);transform:translate3d(0,0,0);transition:transform 260ms cubic-bezier(.22,1.25,.36,1),box-shadow 180ms ease,border-color 160ms ease,background 160ms ease;will-change:transform}
      .arcade-physics-order-list li>strong{display:grid;place-items:center;width:32px;height:32px;border-radius:999px;background:var(--sn-guardian-tint);color:var(--sn-guardian-accent)}
      .arcade-physics-order-list li.dragging{z-index:10;border-color:var(--sn-guardian-accent);box-shadow:0 14px 0 var(--sn-line);transition:none}.arcade-physics-order-list li.drop-target{border-color:var(--sn-guardian-accent);background:var(--sn-guardian-tint);transform:scale(.985)}
      .arcade-physics-order-list li.settled{animation:arcade-tile-snap 360ms cubic-bezier(.22,1.55,.36,1)}
      .arcade-physics-tile-text{font-size:16px;line-height:1.35;overflow-wrap:anywhere}.arcade-physics-order-actions{display:flex;gap:6px}.arcade-physics-order-actions button{min-width:44px;padding:8px 10px}.arcade-drag-grip{font-size:21px;cursor:grab;touch-action:none;user-select:none}.arcade-drag-grip:active{cursor:grabbing}
      .arcade-physics-order-state{margin:0;font-size:12px;color:var(--sn-muted)}
      @keyframes arcade-tile-snap{0%{transform:scale(.97)}45%{transform:scale(1.025)}72%{transform:scale(.995)}100%{transform:scale(1)}}
      @media(max-width:650px){.arcade-physics-order-list li{grid-template-columns:36px minmax(0,1fr)}.arcade-physics-order-actions{grid-column:2;justify-content:flex-end}.arcade-physics-order-actions button{flex:0 0 44px}}
      @media(prefers-reduced-motion:reduce){.arcade-physics-order-list li{transition:none}.arcade-physics-order-list li.dragging{transform:none!important;box-shadow:0 2px 0 var(--sn-line)}.arcade-physics-order-list li.drop-target{transform:none}.arcade-physics-order-list li.settled{animation:none}}
    `}</style>
  </div>;
}

export function ArcadePhysicsTyped({ value, onChange, disabled = false, label = "Type your answer" }: TypedProps) {
  return <div className="arcade-physics-typed">
    <label>
      <span>{label}</span>
      <input
        value={value}
        disabled={disabled}
        maxLength={160}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
    <p className="arcade-muted">Spell-check and autocomplete are off so the practice stays yours.</p>
    <style>{`
      .arcade-physics-typed{margin:20px 0;padding:18px;border:2px solid var(--sn-line);border-radius:16px;background:var(--sn-surface-2);transition:transform 180ms cubic-bezier(.2,.8,.2,1.2),border-color 160ms ease,box-shadow 180ms ease}
      .arcade-physics-typed:focus-within{border-color:var(--sn-guardian-accent);box-shadow:0 7px 0 var(--sn-line);transform:translateY(-2px)}.arcade-physics-typed label{display:grid;gap:9px;font-weight:700}.arcade-physics-typed input{width:100%;min-height:54px;padding:12px 14px;border:1px solid var(--sn-line);border-radius:12px;background:var(--sn-surface);color:var(--sn-ink);font:inherit;font-size:19px}.arcade-physics-typed p{margin:8px 0 0}
      @media(prefers-reduced-motion:reduce){.arcade-physics-typed{transition:none}.arcade-physics-typed:focus-within{transform:none}}
    `}</style>
  </div>;
}
