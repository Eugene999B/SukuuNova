"use client";

import type { CSSProperties } from "react";
import { Atom, BookOpenText, BrainCircuit, Coins, Compass, Gamepad2, HeartPulse, Keyboard, MapPinned, Rocket, Sparkles } from "lucide-react";
import { ARCADE_AGE_MOTION, arcadeExperienceForGame, type ArcadeExperienceIcon } from "@/lib/arcade-experience";

type AgeBand = "age_4_5" | "age_6_8" | "age_9_11" | "age_12_14" | "age_15_18";

type Props = {
  gameKey: string;
  gameName: string;
  category: string;
  subject: string;
  ageBand: AgeBand | null;
  questionIndex: number;
  questionCount: number;
  answeredCount: number;
  hasAnswer: boolean;
};

const ICONS: Record<ArcadeExperienceIcon, typeof Rocket> = {
  rocket: Rocket,
  book: BookOpenText,
  atom: Atom,
  map: MapPinned,
  keyboard: Keyboard,
  brain: BrainCircuit,
  heart: HeartPulse,
  coins: Coins,
  compass: Compass,
  gamepad: Gamepad2,
};

export default function ArcadeMotionWorld({ gameKey, gameName, category, subject, ageBand, questionIndex, questionCount, answeredCount, hasAnswer }: Props) {
  const experience = arcadeExperienceForGame(gameKey, category, subject);
  const age = ARCADE_AGE_MOTION[ageBand ?? "age_6_8"];
  const progress = questionCount ? Math.max(3, Math.min(97, ((questionIndex + (hasAnswer ? .72 : .18)) / questionCount) * 100)) : 3;
  const completion = questionCount ? Math.min(100, Math.round((answeredCount / questionCount) * 100)) : 0;
  const objects = experience.objects.slice(0, age.density);
  const Icon = ICONS[experience.icon];

  return <section
    className={`arcade-motion-world is-${experience.key} motion-${experience.motion} age-${ageBand ?? "age_6_8"} ${hasAnswer ? "has-answer" : ""}`}
    style={{ "--motion-scale": age.scale, "--runner-x": `${progress}%`, "--motion-duration": `${age.duration}s` } as CSSProperties}
    aria-label={`${gameName} animated learning world`}
  >
    <div className="arcade-motion-sky" aria-hidden="true">
      <span className="arcade-motion-orbit orbit-one"/><span className="arcade-motion-orbit orbit-two"/><span className="arcade-motion-orbit orbit-three"/>
      <span className="arcade-motion-horizon"/><span className="arcade-motion-beam beam-one"/><span className="arcade-motion-beam beam-two"/>
      {objects.map((object, index) => <span
        className="arcade-motion-object"
        key={`${gameKey}-${object}-${index}`}
        style={{ "--object-i": index, "--object-delay": `${-(index * 1.47)}s`, "--object-y": `${12 + ((index * 17) % 64)}%` } as CSSProperties}
      >{object}</span>)}
      <div className="arcade-motion-beacon"><Sparkles size={16}/><span>Next checkpoint</span></div>
    </div>

    <div className="arcade-motion-meta">
      <div className="arcade-motion-world-name"><span><Icon size={18}/></span><div><strong>{experience.label}</strong><small>{age.label} · {age.pace} motion · {gameName}</small></div></div>
      <div className="arcade-motion-readout"><span>Mission progress</span><strong>{completion}%</strong></div>
    </div>

    <div className="arcade-motion-track" aria-hidden="true">
      <div className="arcade-motion-track-line"><i style={{ width: `${completion}%` }}/></div>
      <div className="arcade-motion-runner"><span><Icon size={22}/></span><i/></div>
      <div className="arcade-motion-checkpoint start"><Compass size={13}/></div>
      <div className="arcade-motion-checkpoint finish">★</div>
    </div>

    <div className="arcade-motion-foot">
      <span>Stage {questionIndex + 1}/{Math.max(1, questionCount)}</span>
      <span>{hasAnswer ? "Your move powered the world forward" : "Solve the task to move the world forward"}</span>
    </div>

    <style>{`
      .arcade-motion-world{position:relative;overflow:hidden;min-height:252px;border:1px solid var(--sn-line);border-radius:24px;background:linear-gradient(155deg,var(--sn-guardian-tint),var(--sn-surface) 52%,var(--sn-surface-2));box-shadow:var(--sn-shadow-sm);isolation:isolate}
      .arcade-motion-sky{position:absolute;inset:0;overflow:hidden;pointer-events:none}.arcade-motion-sky:before{content:"";position:absolute;inset:auto -12% -70px;height:150px;border-radius:50% 50% 0 0;background:var(--sn-surface-2);border-top:1px solid var(--sn-line);transform:rotate(-2deg)}
      .arcade-motion-horizon{position:absolute;left:-5%;right:-5%;bottom:74px;height:34px;border-top:1px solid var(--sn-line);border-radius:50%;opacity:.55}.arcade-motion-beam{position:absolute;top:-30%;width:1px;height:180%;background:linear-gradient(transparent,var(--sn-guardian-accent),transparent);opacity:.12;transform:rotate(26deg)}.arcade-motion-beam.beam-one{left:28%}.arcade-motion-beam.beam-two{right:24%;transform:rotate(-31deg)}
      .arcade-motion-orbit{position:absolute;border:1px dashed var(--sn-line);border-radius:50%;opacity:.7;animation:arcade-world-spin 18s linear infinite}.orbit-one{width:190px;height:190px;right:-44px;top:-78px}.orbit-two{width:106px;height:106px;right:-5px;top:-38px;animation-direction:reverse;animation-duration:13s}.orbit-three{width:280px;height:280px;left:-190px;bottom:-170px;animation-duration:24s}
      .arcade-motion-object{position:absolute;z-index:1;left:-72px;top:var(--object-y);display:grid;place-items:center;min-width:42px;height:42px;padding:0 9px;border:1px solid var(--sn-line);border-radius:14px;background:var(--sn-surface);box-shadow:0 8px 18px color-mix(in srgb,var(--sn-ink) 9%,transparent);font-size:13px;font-weight:950;letter-spacing:-.03em;color:var(--sn-guardian-accent);transform:scale(var(--motion-scale));animation:arcade-object-flight calc(var(--motion-duration) + var(--object-i)*.52s) linear infinite;animation-delay:var(--object-delay)}
      .arcade-motion-object:nth-of-type(2n){border-radius:999px}.arcade-motion-object:nth-of-type(3n){animation-direction:reverse;left:auto;right:-72px}.arcade-motion-object:nth-of-type(4n){height:34px;min-width:34px;font-size:10px;opacity:.82}
      .arcade-motion-beacon{position:absolute;right:20px;bottom:58px;z-index:2;display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;border:1px solid var(--sn-line);background:var(--sn-surface);color:var(--sn-guardian-accent);font-size:9px;font-weight:900;animation:arcade-beacon 1.8s ease-in-out infinite}
      .arcade-motion-meta{position:relative;z-index:3;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:17px 18px}.arcade-motion-world-name{display:flex;align-items:center;gap:10px}.arcade-motion-world-name>span{display:grid;place-items:center;width:40px;height:40px;border-radius:13px;background:var(--sn-surface);border:1px solid var(--sn-line);color:var(--sn-guardian-accent);box-shadow:var(--sn-shadow-sm)}.arcade-motion-world-name strong,.arcade-motion-world-name small{display:block}.arcade-motion-world-name strong{font-size:12px}.arcade-motion-world-name small{margin-top:3px;color:var(--sn-muted);font-size:8.5px;text-transform:uppercase;letter-spacing:.07em}.arcade-motion-readout{text-align:right}.arcade-motion-readout span,.arcade-motion-readout strong{display:block}.arcade-motion-readout span{font-size:8px;color:var(--sn-muted);text-transform:uppercase;font-weight:800}.arcade-motion-readout strong{margin-top:3px;font-size:17px}
      .arcade-motion-track{position:absolute;z-index:4;left:18px;right:18px;bottom:42px;height:54px}.arcade-motion-track-line{position:absolute;left:14px;right:14px;top:30px;height:8px;border:1px solid var(--sn-line);border-radius:999px;background:var(--sn-surface);overflow:hidden}.arcade-motion-track-line i{display:block;height:100%;border-radius:inherit;background:var(--sn-guardian-accent);transition:width 520ms cubic-bezier(.22,.9,.26,1)}
      .arcade-motion-runner{position:absolute;left:var(--runner-x);top:0;transform:translateX(-50%);transition:left 650ms cubic-bezier(.18,.9,.22,1.25);filter:drop-shadow(0 8px 12px color-mix(in srgb,var(--sn-ink) 18%,transparent))}.arcade-motion-runner>span{position:relative;z-index:2;display:grid;place-items:center;width:46px;height:46px;border:2px solid var(--sn-guardian-accent);border-radius:16px;background:var(--sn-surface);color:var(--sn-guardian-accent);transform:rotate(-4deg);animation:arcade-runner-float 1.4s ease-in-out infinite}.arcade-motion-runner>i{position:absolute;left:7px;right:7px;bottom:-7px;height:6px;border-radius:50%;background:color-mix(in srgb,var(--sn-ink) 15%,transparent);filter:blur(2px);animation:arcade-shadow 1.4s ease-in-out infinite}.arcade-motion-world.has-answer .arcade-motion-runner>span{animation:arcade-runner-boost .5s cubic-bezier(.2,1.5,.35,1),arcade-runner-float 1.4s .5s ease-in-out infinite}
      .arcade-motion-checkpoint{position:absolute;top:23px;display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:var(--sn-surface);border:1px solid var(--sn-line);font-size:9px;color:var(--sn-muted)}.arcade-motion-checkpoint.start{left:2px}.arcade-motion-checkpoint.finish{right:2px;color:var(--sn-guardian-accent)}.arcade-motion-foot{position:absolute;z-index:4;left:18px;right:18px;bottom:12px;display:flex;justify-content:space-between;gap:12px;color:var(--sn-muted);font-size:8.5px;font-weight:750}
      .motion-race .arcade-motion-sky:before{height:116px;border-radius:0;transform:skewY(-2deg);background:repeating-linear-gradient(90deg,var(--sn-surface-2) 0 58px,var(--sn-surface) 58px 60px)}.motion-race .arcade-motion-object{animation-name:arcade-object-race}.motion-race .arcade-motion-runner>span{border-radius:50% 18px 18px 50%}
      .motion-city .arcade-motion-sky:before{height:126px;border-radius:0;background:repeating-linear-gradient(90deg,var(--sn-surface-2) 0 42px,var(--sn-line) 42px 44px,var(--sn-surface) 44px 76px)}.motion-city .arcade-motion-horizon{height:65px;border-radius:0;border-top-style:dashed}.motion-city .arcade-motion-object:nth-of-type(2n){border-radius:8px}
      .motion-lab .arcade-motion-orbit{border-style:solid}.motion-lab .arcade-motion-object{border-radius:50%;animation-name:arcade-object-lab}.motion-lab .arcade-motion-sky:after{content:"";position:absolute;right:10%;top:34%;width:92px;height:92px;border:1px solid var(--sn-line);border-radius:50%;box-shadow:inset 0 0 0 18px color-mix(in srgb,var(--sn-guardian-accent) 6%,transparent)}
      .motion-map .arcade-motion-sky:after{content:"";position:absolute;left:9%;right:9%;bottom:72px;height:62px;border:1px dashed var(--sn-line);border-radius:50%;transform:skewX(-18deg)}.motion-map .arcade-motion-object{animation-name:arcade-object-map}
      .motion-build .arcade-motion-object{animation-name:arcade-object-build}.motion-build .arcade-motion-sky:after{content:"";position:absolute;left:25%;right:25%;bottom:78px;height:74px;background:linear-gradient(90deg,transparent 47%,var(--sn-line) 48% 52%,transparent 53%);opacity:.4}
      .motion-pulse .arcade-motion-runner>span{border-radius:50%}.motion-pulse .arcade-motion-object{animation-name:arcade-object-pulse}.motion-orbit .arcade-motion-object{animation-name:arcade-object-orbit;border-radius:50%}
      @keyframes arcade-world-spin{to{transform:rotate(360deg)}}
      @keyframes arcade-object-flight{0%{transform:translateX(0) translateY(0) rotate(-5deg) scale(var(--motion-scale));opacity:0}8%{opacity:.9}48%{transform:translateX(calc(50vw + 120px)) translateY(-12px) rotate(5deg) scale(var(--motion-scale));opacity:.95}92%{opacity:.9}100%{transform:translateX(calc(100vw + 180px)) translateY(8px) rotate(-4deg) scale(var(--motion-scale));opacity:0}}
      @keyframes arcade-object-race{0%{transform:translateX(0) scale(var(--motion-scale));opacity:0}10%{opacity:1}100%{transform:translateX(calc(100vw + 190px)) scale(var(--motion-scale));opacity:0}}
      @keyframes arcade-object-lab{0%{transform:translate(0,0) scale(var(--motion-scale));opacity:.1}35%{transform:translate(42vw,38px) rotate(120deg) scale(var(--motion-scale));opacity:.9}70%{transform:translate(68vw,-28px) rotate(240deg) scale(var(--motion-scale));opacity:.75}100%{transform:translate(calc(100vw + 160px),10px) rotate(360deg) scale(var(--motion-scale));opacity:0}}
      @keyframes arcade-object-map{0%{transform:translate(0,24px) rotate(-8deg) scale(var(--motion-scale));opacity:0}45%{transform:translate(48vw,-18px) rotate(4deg) scale(var(--motion-scale));opacity:1}100%{transform:translate(calc(100vw + 170px),22px) rotate(8deg) scale(var(--motion-scale));opacity:0}}
      @keyframes arcade-object-build{0%{transform:translate(0,-50px) rotate(-12deg) scale(var(--motion-scale));opacity:0}35%{transform:translate(35vw,22px) rotate(2deg) scale(var(--motion-scale));opacity:1}70%{transform:translate(70vw,-8px) rotate(-2deg) scale(var(--motion-scale));opacity:1}100%{transform:translate(calc(100vw + 150px),30px) scale(var(--motion-scale));opacity:0}}
      @keyframes arcade-object-pulse{0%,100%{transform:translateX(0) scale(calc(var(--motion-scale)*.86));opacity:0}15%{opacity:.8}50%{transform:translateX(55vw) scale(calc(var(--motion-scale)*1.18));opacity:1}85%{opacity:.8}100%{transform:translateX(calc(100vw + 160px)) scale(calc(var(--motion-scale)*.86));opacity:0}}
      @keyframes arcade-object-orbit{0%{transform:translate(0,0) rotate(0) scale(var(--motion-scale));opacity:0}20%{opacity:.9}50%{transform:translate(54vw,-34px) rotate(180deg) scale(var(--motion-scale));opacity:1}100%{transform:translate(calc(100vw + 180px),28px) rotate(360deg) scale(var(--motion-scale));opacity:0}}
      @keyframes arcade-runner-float{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-5px) rotate(2deg)}}@keyframes arcade-shadow{0%,100%{transform:scaleX(.9);opacity:.55}50%{transform:scaleX(.68);opacity:.28}}@keyframes arcade-runner-boost{0%{transform:translateX(-8px) scale(.9) rotate(-8deg)}55%{transform:translateX(8px) scale(1.12) rotate(5deg)}100%{transform:translateX(0) scale(1)}}@keyframes arcade-beacon{0%,100%{transform:translateY(0);opacity:.75}50%{transform:translateY(-5px);opacity:1}}
      @media(max-width:650px){.arcade-motion-world{min-height:232px}.arcade-motion-meta{padding:14px}.arcade-motion-readout{display:none}.arcade-motion-foot{left:14px;right:14px;display:block}.arcade-motion-foot span:last-child{display:none}.arcade-motion-track{left:14px;right:14px}.arcade-motion-object{transform:scale(calc(var(--motion-scale)*.9))}}
      @media(prefers-reduced-motion:reduce){.arcade-motion-orbit,.arcade-motion-object,.arcade-motion-beacon,.arcade-motion-runner>span,.arcade-motion-runner>i{animation:none!important}.arcade-motion-object{display:none}.arcade-motion-runner,.arcade-motion-track-line i{transition:none}.arcade-motion-runner>span{transform:none}}
    `}</style>
  </section>;
}

export function ArcadeWorldLegend() {
  return <div className="arcade-world-legend" aria-label="Arcade learning universe"><span><Rocket size={13}/> Mathematics</span><span><BookOpenText size={13}/> Literacy</span><span><Atom size={13}/> Science</span><span><MapPinned size={13}/> World</span><span><Keyboard size={13}/> Computing</span><span><BrainCircuit size={13}/> Logic</span><span><Coins size={13}/> Life skills</span></div>;
}
