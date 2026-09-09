"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type Scene = {
  boardTitle?: string;
  x?: number;
  y?: number;
  cells?: string[];
  meterLabels?: string[];
  cue?: string;
};

type CommonProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  scene?: Scene;
};

export function ArcadePhysicsGrid({ options, value, onChange, disabled = false, scene }: CommonProps) {
  const [pulse, setPulse] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const cells = scene?.cells?.length ? scene.cells : options;
  const pick = (cell: string) => {
    if (disabled) return;
    onChange(cell);
    setPulse(cell);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPulse(null), 360);
  };
  return <div className="world-grid-shell" role="group" aria-label="Hunt grid">
    <div className="world-grid-board" style={{ "--world-grid-columns": cells.length > 12 ? 4 : 3 } as CSSProperties}>
      {cells.map((cell, index) => <button
        type="button"
        key={`${cell}-${index}`}
        disabled={disabled}
        aria-pressed={value === cell}
        className={`${value === cell ? "chosen" : ""} ${pulse === cell ? "pulse" : ""}`.trim()}
        onClick={() => pick(cell)}
      ><span>{cell}</span></button>)}
    </div>
    <p className="arcade-muted">Scan first, then tap the target. Cells compress on contact and spring back into place.</p>
    <style>{`
      .world-grid-shell{display:grid;gap:10px;margin:20px 0}.world-grid-board{display:grid;grid-template-columns:repeat(var(--world-grid-columns),minmax(0,1fr));gap:10px;padding:14px;border:2px solid var(--sn-line);border-radius:18px;background:var(--sn-surface-2);perspective:800px}
      .world-grid-board button{aspect-ratio:1;min-height:56px;border:2px solid var(--sn-line);border-radius:14px;background:var(--sn-surface);color:var(--sn-ink);font:inherit;font-size:clamp(18px,3vw,26px);font-weight:800;cursor:pointer;box-shadow:0 5px 0 var(--sn-line);transform:translate3d(0,0,0);transition:transform 150ms cubic-bezier(.2,.9,.2,1.35),box-shadow 150ms ease,border-color 150ms ease,background 150ms ease}
      .world-grid-board button:hover:not(:disabled){transform:translateY(-3px) rotateX(3deg);box-shadow:0 8px 0 var(--sn-line)}.world-grid-board button:active:not(:disabled){transform:translateY(4px) scale(.96);box-shadow:0 1px 0 var(--sn-line)}.world-grid-board button.chosen{border-color:var(--sn-guardian-accent);background:var(--sn-guardian-tint);box-shadow:0 5px 0 var(--sn-guardian-accent)}.world-grid-board button.pulse{animation:world-grid-pop 340ms cubic-bezier(.22,1.5,.36,1)}
      @keyframes world-grid-pop{0%{transform:scale(.93)}50%{transform:scale(1.09)}100%{transform:scale(1)}}
      @media(max-width:480px){.world-grid-board{gap:7px;padding:10px}.world-grid-board button{min-height:48px}}
      @media(prefers-reduced-motion:reduce){.world-grid-board button{transition:none}.world-grid-board button:hover:not(:disabled),.world-grid-board button:active:not(:disabled){transform:none;box-shadow:0 5px 0 var(--sn-line)}.world-grid-board button.pulse{animation:none}}
    `}</style>
  </div>;
}

export function ArcadePhysicsMap({ options, value, onChange, disabled = false, scene }: CommonProps) {
  const [settled, setSettled] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const choose = (option: string) => {
    if (disabled) return;
    onChange(option);
    setSettled(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSettled(false), 520);
  };
  const x = Math.max(8, Math.min(92, scene?.x ?? 50));
  const y = Math.max(10, Math.min(90, scene?.y ?? 50));
  return <div className="world-map-shell" role="group" aria-label={scene?.boardTitle ?? "Map label challenge"}>
    <div className="world-map-board">
      <span className="world-map-title">{scene?.boardTitle ?? "Schematic map"}</span>
      <div className="world-map-grid" aria-hidden="true" />
      <div className="world-map-marker" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true"><span /></div>
      {value ? <div className={`world-map-label ${settled ? "settled" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}><span>{value}</span></div> : null}
    </div>
    <div className="world-map-options">{options.map((option) => <button type="button" key={option} disabled={disabled} className={value === option ? "chosen" : ""} aria-pressed={value === option} onClick={() => choose(option)}>{option}</button>)}</div>
    <p className="arcade-muted">Choose a label and watch it lock onto the marked location. This board is a learning schematic, not a survey map.</p>
    <style>{`
      .world-map-shell{display:grid;gap:12px;margin:20px 0}.world-map-board{position:relative;min-height:300px;overflow:hidden;border:2px solid var(--sn-line);border-radius:20px;background:linear-gradient(145deg,var(--sn-guardian-tint),var(--sn-surface-2));box-shadow:inset 0 -10px 0 var(--sn-line)}.world-map-title{position:absolute;z-index:3;left:14px;top:12px;padding:6px 9px;border:1px solid var(--sn-line);border-radius:999px;background:var(--sn-surface);font-size:11px;font-weight:800}.world-map-grid{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(25% - 1px),var(--sn-line) 25%),repeating-linear-gradient(0deg,transparent 0,transparent calc(25% - 1px),var(--sn-line) 25%);opacity:.35}.world-map-marker{position:absolute;z-index:4;width:34px;height:34px;transform:translate(-50%,-100%);filter:drop-shadow(0 5px 0 var(--sn-line))}.world-map-marker:before{content:"";position:absolute;inset:0;border:10px solid var(--sn-guardian-accent);border-radius:50% 50% 50% 0;transform:rotate(-45deg)}.world-map-marker span{position:absolute;z-index:2;left:12px;top:12px;width:10px;height:10px;border-radius:50%;background:var(--sn-surface)}
      .world-map-label{position:absolute;z-index:5;transform:translate(-50%,12px);max-width:180px}.world-map-label span{display:block;padding:8px 11px;border-radius:10px;background:var(--sn-surface);border:2px solid var(--sn-guardian-accent);font-size:12px;font-weight:800;box-shadow:0 5px 0 var(--sn-line)}.world-map-label.settled{animation:world-label-lock 480ms cubic-bezier(.22,1.55,.36,1)}
      .world-map-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}.world-map-options button{min-height:54px;padding:11px 14px;border:2px solid var(--sn-line);border-radius:12px;background:var(--sn-surface-2);color:var(--sn-ink);font:inherit;cursor:pointer;box-shadow:0 3px 0 var(--sn-line);transition:transform 150ms cubic-bezier(.2,.9,.2,1.3),box-shadow 150ms ease,border-color 150ms ease}.world-map-options button:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 0 var(--sn-line)}.world-map-options button:active:not(:disabled){transform:translateY(2px) scale(.98);box-shadow:0 1px 0 var(--sn-line)}.world-map-options button.chosen{border-color:var(--sn-guardian-accent);background:var(--sn-guardian-tint);font-weight:800}
      @keyframes world-label-lock{0%{transform:translate(-50%,50px) scale(.7);opacity:.2}55%{transform:translate(-50%,6px) scale(1.08);opacity:1}100%{transform:translate(-50%,12px) scale(1)}}
      @media(max-width:600px){.world-map-board{min-height:250px}.world-map-options{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){.world-map-label.settled{animation:none}.world-map-options button{transition:none}.world-map-options button:hover:not(:disabled),.world-map-options button:active:not(:disabled){transform:none;box-shadow:0 3px 0 var(--sn-line)}}
    `}</style>
  </div>;
}

export function ArcadePhysicsMemory({ options, value, onChange, disabled = false }: CommonProps) {
  const [revealed, setRevealed] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const touch = (option: string, index: number) => {
    if (disabled) return;
    if (revealed === index) {
      onChange(option);
      setRevealed(null);
      if (timer.current) clearTimeout(timer.current);
      return;
    }
    setRevealed(index);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRevealed(null), 1200);
  };
  return <div className="world-memory-shell" role="group" aria-label="Memory card challenge">
    <p className="arcade-muted">Tap a card to reveal it. Tap the same revealed card again to lock your answer before it flips back.</p>
    <div className="world-memory-grid">{options.map((option, index) => {
      const open = revealed === index || value === option;
      return <button type="button" key={option} disabled={disabled} aria-pressed={value === option} aria-label={open ? `${option}. ${value === option ? "Selected" : "Tap again to choose"}` : `Hidden card ${index + 1}`} className={`${open ? "open" : ""} ${value === option ? "chosen" : ""}`.trim()} onClick={() => touch(option, index)}>
        <span className="world-memory-inner"><span className="world-memory-back">{index + 1}</span><span className="world-memory-front">{option}</span></span>
      </button>;
    })}</div>
    <style>{`
      .world-memory-shell{display:grid;gap:10px;margin:20px 0}.world-memory-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;perspective:1000px}.world-memory-grid>button{min-height:110px;padding:0;border:0;background:transparent;cursor:pointer;perspective:800px}.world-memory-inner{position:relative;display:block;width:100%;height:110px;transform-style:preserve-3d;transition:transform 460ms cubic-bezier(.2,.75,.2,1.18)}.world-memory-grid>button.open .world-memory-inner{transform:rotateY(180deg)}.world-memory-back,.world-memory-front{position:absolute;inset:0;display:grid;place-items:center;padding:12px;border:2px solid var(--sn-line);border-radius:16px;backface-visibility:hidden;box-shadow:0 6px 0 var(--sn-line);font-weight:800}.world-memory-back{background:var(--sn-guardian-tint);color:var(--sn-guardian-accent);font-size:30px}.world-memory-front{transform:rotateY(180deg);background:var(--sn-surface);color:var(--sn-ink);font-size:17px}.world-memory-grid>button.chosen .world-memory-front{border-color:var(--sn-guardian-accent);box-shadow:0 6px 0 var(--sn-guardian-accent)}
      @media(prefers-reduced-motion:reduce){.world-memory-inner{transition:none}.world-memory-grid>button.open .world-memory-inner{transform:none}.world-memory-grid>button.open .world-memory-back{display:none}.world-memory-front{transform:none;display:none}.world-memory-grid>button.open .world-memory-front{display:grid}}
    `}</style>
  </div>;
}

export function ArcadePhysicsSimulation({ options, value, onChange, disabled = false, scene }: CommonProps) {
  const chosenIndex = Math.max(0, options.indexOf(value));
  const hasChoice = Boolean(value);
  const trackPercent = options.length > 1 ? (chosenIndex / (options.length - 1)) * 100 : 50;
  return <div className="world-sim-shell" role="group" aria-label="Decision simulation">
    <div className="world-sim-console">
      <div><span className="arcade-kicker">SIMULATION CUE</span><p>{scene?.cue ?? "Choose the action that best balances the situation."}</p></div>
      <div className="world-sim-meters" aria-hidden="true">{(scene?.meterLabels ?? ["Input", "Decision", "Outcome"]).map((label, index) => <div key={label}><span>{label}</span><i><b style={{ transform: `scaleX(${hasChoice ? 0.35 + (((chosenIndex + index) % options.length) / Math.max(1, options.length - 1)) * 0.65 : 0.25})` }} /></i></div>)}</div>
      <div className="world-sim-track" aria-hidden="true"><span className={hasChoice ? "active" : ""} style={{ left: `${hasChoice ? trackPercent : 50}%` }} /></div>
    </div>
    <div className="world-sim-options">{options.map((option, index) => <button type="button" key={option} disabled={disabled} aria-pressed={value === option} className={value === option ? "chosen" : ""} onClick={() => onChange(option)}><strong>{index + 1}</strong><span>{option}</span></button>)}</div>
    <p className="arcade-muted">The console reacts to your decision; the learning explanation and correctness stay hidden until the round is finished.</p>
    <style>{`
      .world-sim-shell{display:grid;gap:12px;margin:20px 0}.world-sim-console{display:grid;gap:16px;padding:18px;border:2px solid var(--sn-line);border-radius:18px;background:var(--sn-surface-2);box-shadow:inset 0 -6px 0 var(--sn-line)}.world-sim-console p{margin:5px 0 0}.world-sim-meters{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.world-sim-meters div{display:grid;gap:6px}.world-sim-meters span{font-size:11px;font-weight:800;color:var(--sn-muted)}.world-sim-meters i{display:block;height:12px;border:1px solid var(--sn-line);border-radius:999px;overflow:hidden;background:var(--sn-surface)}.world-sim-meters b{display:block;width:100%;height:100%;transform-origin:left;background:var(--sn-guardian-accent);transition:transform 420ms cubic-bezier(.22,1.25,.36,1)}.world-sim-track{position:relative;height:12px;margin:12px 10px 2px;border-radius:999px;background:var(--sn-line)}.world-sim-track span{position:absolute;top:50%;width:34px;height:34px;border-radius:50%;border:3px solid var(--sn-surface);background:var(--sn-muted);box-shadow:0 4px 0 var(--sn-line);transform:translate(-50%,-50%);transition:left 460ms cubic-bezier(.22,1.5,.36,1),background 160ms ease}.world-sim-track span.active{background:var(--sn-guardian-accent)}
      .world-sim-options{display:grid;grid-template-columns:1fr 1fr;gap:10px}.world-sim-options button{display:flex;gap:10px;align-items:center;min-height:64px;padding:12px 14px;border:2px solid var(--sn-line);border-radius:14px;background:var(--sn-surface);color:var(--sn-ink);font:inherit;text-align:left;cursor:pointer;box-shadow:0 4px 0 var(--sn-line);transition:transform 150ms cubic-bezier(.2,.9,.2,1.3),box-shadow 150ms ease,border-color 150ms ease}.world-sim-options button strong{display:grid;place-items:center;flex:0 0 32px;height:32px;border-radius:50%;background:var(--sn-guardian-tint);color:var(--sn-guardian-accent)}.world-sim-options button:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 0 var(--sn-line)}.world-sim-options button:active:not(:disabled){transform:translateY(3px) scale(.985);box-shadow:0 1px 0 var(--sn-line)}.world-sim-options button.chosen{border-color:var(--sn-guardian-accent);background:var(--sn-guardian-tint);font-weight:700;box-shadow:0 4px 0 var(--sn-guardian-accent)}
      @media(max-width:600px){.world-sim-options{grid-template-columns:1fr}.world-sim-meters{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){.world-sim-meters b,.world-sim-track span,.world-sim-options button{transition:none}.world-sim-options button:hover:not(:disabled),.world-sim-options button:active:not(:disabled){transform:none;box-shadow:0 4px 0 var(--sn-line)}}
    `}</style>
  </div>;
}
