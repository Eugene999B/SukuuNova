"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Crosshair, Sparkles } from "lucide-react";

type AgeBand = "age_4_5" | "age_6_8" | "age_9_11" | "age_12_14" | "age_15_18";

type Props = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ageBand: AgeBand | null;
  gameKey: string;
  subject: string;
  rapid?: boolean;
};

const SPEED: Record<AgeBand, number> = {
  age_4_5: 15,
  age_6_8: 13,
  age_9_11: 11,
  age_12_14: 10,
  age_15_18: 9,
};
const SCALE: Record<AgeBand, number> = {
  age_4_5: 1.14,
  age_6_8: 1.08,
  age_9_11: 1,
  age_12_14: .96,
  age_15_18: .93,
};

function iconFor(subject: string, gameKey: string) {
  if (/math/i.test(subject)) return gameKey.includes("number") ? "123" : gameKey.includes("percentage") ? "%" : "+";
  if (/english|literacy/i.test(subject)) return "Aa";
  if (/science|chemistry|physics/i.test(subject)) return "⚡";
  if (/geography|social|history/i.test(subject)) return "◎";
  if (/ict|comput/i.test(subject)) return "01";
  return "✦";
}

export default function ArcadeMovingChoice({ options, value, onChange, disabled = false, ageBand, gameKey, subject, rapid = false }: Props) {
  const band = ageBand ?? "age_6_8";
  const [burst, setBurst] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const select = (option: string) => {
    if (disabled) return;
    onChange(option);
    setBurst(option);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setBurst(null), 520);
  };
  const glyph = iconFor(subject, gameKey);

  return <div className={`moving-choice ${rapid ? "is-rapid" : ""}`} style={{ "--choice-scale": SCALE[band], "--choice-speed": `${SPEED[band]}s` } as CSSProperties} role="group" aria-label="Choose the correct moving learning target">
    <header><div><Crosshair size={17}/><span>{rapid ? "Skill sprint" : "Moving challenge"}</span></div><small>Targets move for playfulness, not to hide the answer. Hover, focus or use reduced-motion settings to pause them.</small></header>
    <div className="moving-choice-arena">
      <div className="moving-choice-horizon" aria-hidden="true"><i/><i/><i/><span>{glyph}</span><span>{glyph}</span><span>{glyph}</span></div>
      {options.map((option, index) => <button
        type="button"
        key={`${option}-${index}`}
        disabled={disabled}
        aria-pressed={value === option}
        onClick={() => select(option)}
        className={`${value === option ? "chosen" : ""} ${burst === option ? "burst" : ""}`.trim()}
        style={{ "--target-index": index, "--target-delay": `${-(index * 2.15)}s`, "--target-lane": `${14 + index * (72 / Math.max(1, options.length - 1))}%` } as CSSProperties}
      ><span className="moving-choice-glyph">{glyph}</span><strong>{option}</strong>{value === option ? <Sparkles size={15}/> : null}</button>)}
    </div>
    <div className="moving-choice-static-hint">Every target remains a normal keyboard-accessible answer button. Movement pauses while a target is focused.</div>
    <style>{`
      .moving-choice{display:grid;gap:10px;margin:18px 0}.moving-choice>header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.moving-choice>header>div{display:inline-flex;align-items:center;gap:7px;color:var(--sn-guardian-accent);font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.moving-choice>header small{max-width:560px;color:var(--sn-muted);font-size:8.5px;line-height:1.5;text-align:right}
      .moving-choice-arena{position:relative;min-height:330px;overflow:hidden;border:2px solid var(--sn-line);border-radius:22px;background:linear-gradient(160deg,var(--sn-guardian-tint),var(--sn-surface) 46%,var(--sn-surface-2));box-shadow:inset 0 -8px 0 var(--sn-line)}.moving-choice-horizon{position:absolute;inset:0;pointer-events:none}.moving-choice-horizon:before{content:"";position:absolute;left:-8%;right:-8%;bottom:-92px;height:180px;border-radius:50% 50% 0 0;background:var(--sn-surface-2);border-top:1px solid var(--sn-line)}.moving-choice-horizon i{position:absolute;width:230px;height:230px;border:1px dashed var(--sn-line);border-radius:50%;opacity:.58;animation:moving-orbit 20s linear infinite}.moving-choice-horizon i:nth-child(1){right:-90px;top:-105px}.moving-choice-horizon i:nth-child(2){left:-140px;bottom:-150px;animation-duration:27s;animation-direction:reverse}.moving-choice-horizon i:nth-child(3){right:20%;bottom:-180px;width:320px;height:320px;animation-duration:31s}.moving-choice-horizon>span{position:absolute;color:var(--sn-guardian-accent);font-weight:950;opacity:.08;font-size:58px;animation:moving-float 4s ease-in-out infinite}.moving-choice-horizon>span:nth-of-type(1){left:9%;top:9%}.moving-choice-horizon>span:nth-of-type(2){right:8%;top:42%;animation-delay:-1.6s}.moving-choice-horizon>span:nth-of-type(3){left:43%;bottom:2%;animation-delay:-2.7s}
      .moving-choice-arena>button{position:absolute;z-index:3;left:-250px;top:var(--target-lane);width:min(340px,43%);min-height:64px;display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 13px;border:2px solid var(--sn-line);border-radius:18px;background:color-mix(in srgb,var(--sn-surface) 96%,transparent);color:var(--sn-ink);box-shadow:0 8px 18px color-mix(in srgb,var(--sn-ink) 12%,transparent),0 4px 0 var(--sn-line);font:inherit;text-align:left;cursor:pointer;transform:translateY(-50%) scale(var(--choice-scale));animation:moving-target var(--choice-speed) linear infinite;animation-delay:var(--target-delay);will-change:transform,left;transition:border-color 150ms ease,background 150ms ease,box-shadow 150ms ease}
      .moving-choice.is-rapid .moving-choice-arena>button{animation-duration:calc(var(--choice-speed)*.84)}.moving-choice-arena>button:hover:not(:disabled),.moving-choice-arena>button:focus-visible{animation-play-state:paused;z-index:8;border-color:var(--sn-guardian-accent);outline:none;box-shadow:0 10px 24px color-mix(in srgb,var(--sn-ink) 16%,transparent),0 5px 0 var(--sn-guardian-accent)}.moving-choice-arena>button.chosen{animation-play-state:paused;z-index:9;border-color:var(--sn-guardian-accent);background:var(--sn-guardian-tint);box-shadow:0 6px 0 var(--sn-guardian-accent)}.moving-choice-arena>button.burst{animation:moving-pop .48s cubic-bezier(.2,1.55,.35,1)}.moving-choice-arena>button>strong{font-size:clamp(12px,1.7vw,16px);line-height:1.3;overflow-wrap:anywhere}.moving-choice-glyph{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:var(--sn-surface-2);border:1px solid var(--sn-line);color:var(--sn-guardian-accent);font-size:9px;font-weight:950}.moving-choice-arena>button.chosen .moving-choice-glyph{background:var(--sn-surface)}.moving-choice-arena>button>svg{color:var(--sn-guardian-accent)}
      .moving-choice-static-hint{color:var(--sn-muted);font-size:8.5px;line-height:1.45}
      @keyframes moving-target{0%{left:-250px;transform:translateY(-50%) scale(var(--choice-scale)) rotate(-1deg)}42%{transform:translateY(calc(-50% - 13px)) scale(var(--choice-scale)) rotate(1deg)}100%{left:calc(100% + 30px);transform:translateY(-50%) scale(var(--choice-scale)) rotate(-1deg)}}@keyframes moving-pop{0%{transform:translateY(-50%) scale(calc(var(--choice-scale)*.9))}52%{transform:translateY(-50%) scale(calc(var(--choice-scale)*1.12))}100%{transform:translateY(-50%) scale(var(--choice-scale))}}@keyframes moving-orbit{to{transform:rotate(360deg)}}@keyframes moving-float{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-13px) rotate(5deg)}}
      @media(max-width:700px){.moving-choice>header{display:block}.moving-choice>header small{display:block;margin-top:5px;text-align:left}.moving-choice-arena{min-height:370px}.moving-choice-arena>button{width:68%;min-height:59px}.moving-choice-horizon>span{font-size:40px}}
      @media(max-width:480px){.moving-choice-arena>button{width:78%;grid-template-columns:32px 1fr}.moving-choice-arena>button>svg{display:none}.moving-choice-glyph{width:30px;height:30px}.moving-choice-arena{min-height:390px}}
      @media(prefers-reduced-motion:reduce){.moving-choice-arena{display:grid;align-content:center;gap:9px;padding:13px;min-height:unset}.moving-choice-arena>button{position:relative;left:auto!important;top:auto!important;width:100%;transform:none!important;animation:none!important}.moving-choice-horizon{display:none}.moving-choice-arena>button.burst{animation:none}.moving-choice-arena>button:hover:not(:disabled),.moving-choice-arena>button:focus-visible,.moving-choice-arena>button.chosen{transform:none}}
    `}</style>
  </div>;
}
