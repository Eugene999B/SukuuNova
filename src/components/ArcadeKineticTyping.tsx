"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Gauge, Keyboard, Sparkles, Zap } from "lucide-react";

type AgeBand = "age_4_5" | "age_6_8" | "age_9_11" | "age_12_14" | "age_15_18";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ageBand: AgeBand | null;
  gameKey: string;
};

const AGE_TARGET: Record<AgeBand, number> = {
  age_4_5: 6,
  age_6_8: 10,
  age_9_11: 16,
  age_12_14: 22,
  age_15_18: 30,
};

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export default function ArcadeKineticTyping({ value, onChange, disabled = false, ageBand, gameKey }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastTypedAt, setLastTypedAt] = useState<number | null>(null);
  const band = ageBand ?? "age_6_8";
  const target = AGE_TARGET[band];
  const laneProgress = Math.max(2, Math.min(100, (value.length / target) * 100));
  const elapsedMinutes = startedAt ? Math.max((Date.now() - startedAt) / 60000, 1 / 600) : 0;
  const cpm = startedAt ? Math.round(value.length / elapsedMinutes) : 0;
  const last = value.slice(-1).toUpperCase();
  const motionActive = Boolean(lastTypedAt && Date.now() - lastTypedAt < 850);
  const title = gameKey === "spelling-sprint" ? "Spelling runway" : "Keyboard flight trainer";
  const helper = gameKey === "spelling-sprint"
    ? "Type the answer yourself. The runner reacts to your keystrokes, but correctness is scored only after the mission is submitted."
    : "Build keyboard fluency while the Nova runner responds to every character. Autocomplete and spell-check remain off.";

  const keyboard = useMemo(() => KEY_ROWS.map((row) => row.split("")), []);

  const change = (next: string) => {
    if (!startedAt && next.length) setStartedAt(Date.now());
    if (!next.length) setStartedAt(null);
    setLastTypedAt(Date.now());
    onChange(next);
  };

  return <div className={`kinetic-typing ${motionActive ? "is-moving" : ""}`} style={{ "--typing-progress": `${laneProgress}%` } as CSSProperties}>
    <header><div><span><Keyboard size={17}/></span><div><strong>{title}</strong><small>{band.replace("age_", "Age ").replace("_", "–")} adaptive practice</small></div></div><div className="kinetic-readout"><Gauge size={14}/><strong>{cpm}</strong><span>chars/min</span></div></header>

    <div className="kinetic-road" aria-hidden="true">
      <i className="lane lane-one"/><i className="lane lane-two"/><i className="lane lane-three"/>
      <div className="kinetic-runner"><span><Zap size={18}/></span><b/></div>
      <div className="kinetic-gate"><Sparkles size={14}/></div>
      <span className="kinetic-stream one">A</span><span className="kinetic-stream two">7</span><span className="kinetic-stream three">?</span><span className="kinetic-stream four">GO</span>
    </div>

    <label className="kinetic-input"><span>Type your answer</span><input
      value={value}
      disabled={disabled}
      maxLength={160}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      onChange={(event) => change(event.target.value)}
      autoFocus
    /></label>

    <div className="kinetic-keyboard" aria-label="Visual keyboard guide">{keyboard.map((row, rowIndex) => <div key={rowIndex}>{row.map((key) => <span key={key} className={last === key ? "active" : ""}>{key}</span>)}</div>)}</div>
    <p>{helper}</p>

    <style>{`
      .kinetic-typing{display:grid;gap:14px;margin:18px 0;padding:18px;border:2px solid var(--sn-line);border-radius:20px;background:linear-gradient(145deg,var(--sn-surface-2),var(--sn-guardian-tint));box-shadow:0 7px 0 var(--sn-line);overflow:hidden}.kinetic-typing header{display:flex;align-items:center;justify-content:space-between;gap:14px}.kinetic-typing header>div:first-child{display:flex;align-items:center;gap:9px}.kinetic-typing header>div:first-child>span{display:grid;place-items:center;width:36px;height:36px;border:1px solid var(--sn-line);border-radius:11px;background:var(--sn-surface);color:var(--sn-guardian-accent)}.kinetic-typing header strong,.kinetic-typing header small{display:block}.kinetic-typing header strong{font-size:12px}.kinetic-typing header small{margin-top:2px;color:var(--sn-muted);font-size:8px;text-transform:uppercase;letter-spacing:.06em}.kinetic-readout{display:grid!important;grid-template-columns:auto auto auto;gap:5px!important;align-items:center;color:var(--sn-muted);font-size:8px!important}.kinetic-readout strong{color:var(--sn-ink);font-size:14px!important}.kinetic-readout svg{color:var(--sn-guardian-accent)}
      .kinetic-road{position:relative;height:116px;overflow:hidden;border:1px solid var(--sn-line);border-radius:16px;background:linear-gradient(180deg,var(--sn-surface),var(--sn-surface-2))}.kinetic-road:before{content:"";position:absolute;left:0;right:0;bottom:0;height:62px;background:linear-gradient(90deg,var(--sn-surface-2),var(--sn-surface));border-top:1px solid var(--sn-line);transform:perspective(180px) rotateX(20deg);transform-origin:bottom}.kinetic-road .lane{position:absolute;left:-20%;right:-20%;bottom:17px;height:2px;background:repeating-linear-gradient(90deg,var(--sn-line) 0 22px,transparent 22px 42px);animation:kinetic-lane 1.6s linear infinite}.kinetic-road .lane-two{bottom:34px;animation-duration:1.35s}.kinetic-road .lane-three{bottom:51px;animation-duration:1.1s}
      .kinetic-runner{position:absolute;z-index:4;left:var(--typing-progress);bottom:28px;transform:translateX(-50%);transition:left 260ms cubic-bezier(.2,.9,.2,1.25)}.kinetic-runner>span{display:grid;place-items:center;width:43px;height:43px;border:2px solid var(--sn-guardian-accent);border-radius:14px;background:var(--sn-surface);color:var(--sn-guardian-accent);box-shadow:0 7px 14px color-mix(in srgb,var(--sn-ink) 12%,transparent);animation:kinetic-hover 1.3s ease-in-out infinite}.kinetic-runner>b{position:absolute;left:9px;right:9px;bottom:-8px;height:5px;border-radius:50%;background:color-mix(in srgb,var(--sn-ink) 15%,transparent);filter:blur(2px)}.kinetic-typing.is-moving .kinetic-runner>span{animation:kinetic-punch .34s cubic-bezier(.22,1.5,.36,1),kinetic-hover 1.3s .34s ease-in-out infinite}.kinetic-gate{position:absolute;right:14px;bottom:23px;z-index:3;display:grid;place-items:center;width:39px;height:48px;border:2px dashed var(--sn-guardian-accent);border-bottom:0;border-radius:18px 18px 0 0;color:var(--sn-guardian-accent);animation:kinetic-gate 1.7s ease-in-out infinite}
      .kinetic-stream{position:absolute;top:14px;display:grid;place-items:center;min-width:30px;height:30px;padding:0 6px;border:1px solid var(--sn-line);border-radius:9px;background:var(--sn-surface);color:var(--sn-guardian-accent);font-size:9px;font-weight:900;animation:kinetic-stream 6s linear infinite}.kinetic-stream.one{left:-40px}.kinetic-stream.two{left:-40px;top:48px;animation-delay:-1.4s}.kinetic-stream.three{left:-40px;top:28px;animation-delay:-3s}.kinetic-stream.four{left:-40px;top:70px;animation-delay:-4.5s}
      .kinetic-input{display:grid;gap:6px}.kinetic-input>span{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--sn-guardian-accent)}.kinetic-input input{width:100%;min-height:58px;box-sizing:border-box;padding:13px 15px;border:2px solid var(--sn-line);border-radius:13px;background:var(--sn-surface);color:var(--sn-ink);font:inherit;font-size:21px;font-weight:800;letter-spacing:.025em;outline:none;transition:border-color 160ms ease,box-shadow 160ms ease,transform 160ms ease}.kinetic-input input:focus{border-color:var(--sn-guardian-accent);box-shadow:0 5px 0 var(--sn-guardian-accent);transform:translateY(-2px)}
      .kinetic-keyboard{display:grid;gap:5px;padding:10px;border:1px solid var(--sn-line);border-radius:13px;background:var(--sn-surface)}.kinetic-keyboard>div{display:flex;justify-content:center;gap:4px}.kinetic-keyboard span{display:grid;place-items:center;width:27px;height:25px;border:1px solid var(--sn-line);border-radius:6px;background:var(--sn-surface-2);font-size:8px;font-weight:800;transition:transform 100ms ease,background 100ms ease,border-color 100ms ease}.kinetic-keyboard span.active{transform:translateY(2px) scale(.94);border-color:var(--sn-guardian-accent);background:var(--sn-guardian-tint);color:var(--sn-guardian-accent)}.kinetic-typing>p{margin:0;color:var(--sn-muted);font-size:10px;line-height:1.6}
      @keyframes kinetic-lane{to{transform:translateX(42px)}}@keyframes kinetic-hover{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-4px) rotate(2deg)}}@keyframes kinetic-punch{0%{transform:translateX(-5px) scale(.9)}55%{transform:translateX(7px) scale(1.12)}100%{transform:translateX(0) scale(1)}}@keyframes kinetic-gate{0%,100%{opacity:.65;transform:scale(.96)}50%{opacity:1;transform:scale(1.04)}}@keyframes kinetic-stream{0%{transform:translateX(0);opacity:0}8%{opacity:.8}90%{opacity:.8}100%{transform:translateX(calc(100vw + 120px));opacity:0}}
      @media(max-width:620px){.kinetic-typing{padding:14px}.kinetic-readout{display:none!important}.kinetic-keyboard span{width:23px;height:23px;font-size:7px}.kinetic-road{height:104px}}
      @media(prefers-reduced-motion:reduce){.kinetic-road .lane,.kinetic-runner>span,.kinetic-gate,.kinetic-stream{animation:none!important}.kinetic-runner{transition:none}.kinetic-input input,.kinetic-keyboard span{transition:none}.kinetic-stream{display:none}}
    `}</style>
  </div>;
}
