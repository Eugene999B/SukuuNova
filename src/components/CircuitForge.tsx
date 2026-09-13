"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BatteryCharging, Bolt, Cable, CircuitBoard, Gauge, Lightbulb, LogOut, RotateCcw, ScanLine, ShieldCheck, Sparkles, TriangleAlert, Zap } from "lucide-react";
import { circuitForgeChargeGain, circuitForgeComboGain, circuitForgeFaultDamage, circuitForgeFuseRecovery, circuitForgeScanRecovery, circuitForgeStabilityGain, circuitForgeWindowMs } from "@/lib/circuit-forge";
import type { CircuitForgeScene } from "@/lib/circuit-forge-content";
import "./circuit-forge.css";

type Question = { id: string; prompt: string; options: string[]; scene?: unknown };
type Plan = { masteryPercent: number | null; supportMode: "guided" | "supported" | "independent" | "challenge"; missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch"; speedScale: number; hazardDensity: number; hintStrength: 0 | 1 | 2; bossGate: boolean; worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel" };
type Round = { id: string; difficulty: number; answers: string[]; questions: Question[]; learningPlan?: Plan | null };
type Props = { learnerName: string; round: Round; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };
type WireNode = "source" | "switch" | "return" | `load-${number}`;

const firstOpen = (answers: string[], length: number) => {
  const index = answers.findIndex((answer) => !answer.trim());
  return index < 0 ? length : index;
};

export default function CircuitForge({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const commitRef = useRef<() => void>(() => undefined);
  const scanRef = useRef<() => void>(() => undefined);
  const fuseRef = useRef<() => void>(() => undefined);
  const connectRef = useRef<(node: WireNode) => void>(() => undefined);
  const completedRef = useRef(false);
  const startedRef = useRef(Date.now());
  const [checkpoint, setCheckpoint] = useState(firstOpen(round.answers, round.questions.length));
  const [selected, setSelected] = useState<number | null>(null);
  const [wirePath, setWirePath] = useState<WireNode[]>([]);
  const [pressure, setPressure] = useState(0);
  const [stability, setStability] = useState(82);
  const [charge, setCharge] = useState(8);
  const [combo, setCombo] = useState(0);
  const [scans, setScans] = useState(2);
  const [scanOpen, setScanOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [fuseAvailable, setFuseAvailable] = useState(true);
  const [message, setMessage] = useState("Microgrid control online. Build a complete circuit from source to return before energising the school grid.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const question = round.questions[checkpoint];
  const scene = (question?.scene ?? {}) as Partial<CircuitForgeScene>;
  const plan = round.learningPlan;
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const faultLevel = Math.max(1, Math.min(5, Number(scene.faultLevel ?? round.difficulty)));
  const clues = Array.isArray(scene.circuitTags) ? scene.circuitTags.slice(0, 3) : [];
  const duration = useMemo(() => circuitForgeWindowMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"), [round.difficulty, plan?.speedScale, plan?.supportMode]);
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const circuitClosed = wirePath.length === 4 && wirePath[0] === "source" && wirePath[1] === "switch" && wirePath[2]?.startsWith("load-") && wirePath[3] === "return";
  const energized = Boolean(question) && circuitClosed && stability > 28 && pressure < 92;

  useEffect(() => {
    startedRef.current = Date.now();
    setPressure(0);
    setSelected(null);
    setWirePath([]);
    setScanOpen(false);
    if (question) setMessage(boss ? "FINAL GRID EVENT: construct the complete protection path before the master bus trips." : `${scene.bay ?? `GRID-${checkpoint + 1}`} active · connect BATTERY → SWITCH → RESPONSE LOAD → RETURN.`);
  }, [boss, checkpoint, question, scene.bay]);

  useEffect(() => {
    if (checkpoint >= round.questions.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        window.setTimeout(() => completeRef.current([...answersRef.current]), 420);
      }
      return;
    }
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedRef.current;
      if (elapsed >= duration) {
        const damage = circuitForgeFaultDamage(100, plan?.hazardDensity ?? 0.9, boss);
        setStability((value) => Math.max(18, value - damage));
        setCombo(0);
        startedRef.current = Date.now() - Math.round(duration * 0.5);
        setPressure(50);
        setMessage(`Protection event: grid stability -${damage}. Trace the path and complete the circuit before energising.`);
      } else setPressure(Math.min(100, (elapsed / duration) * 100));
    }, 120);
    return () => window.clearInterval(timer);
  }, [boss, checkpoint, duration, plan?.hazardDensity, round.questions.length]);

  const scan = () => {
    if (!question || scans < 1 || switching) return;
    setScans((value) => Math.max(0, value - 1));
    setPressure((current) => {
      const next = circuitForgeScanRecovery(current, plan?.hintStrength ?? 0);
      startedRef.current = Date.now() - Math.round(next / 100 * duration);
      return next;
    });
    setScanOpen(true);
    setMessage(`Grid scan: ${clues.length ? clues.join(" · ") : scene.cue ?? "Trace source, path, load and return."} Diagnostic clues never reveal the graded response load.`);
  };
  scanRef.current = scan;

  const resetProtection = () => {
    if (!fuseAvailable || switching) return;
    setFuseAvailable(false);
    setStability((value) => circuitForgeFuseRecovery(value));
    setPressure((current) => Math.max(0, current - 10));
    startedRef.current = Date.now() - Math.round(Math.max(0, pressure - 10) / 100 * duration);
    setMessage("Emergency protection reset used. One reset is available per mission; rebuild the circuit carefully.");
  };
  fuseRef.current = resetProtection;

  const clearWiring = () => {
    if (switching) return;
    setWirePath([]);
    setSelected(null);
    setMessage("Wiring cleared. Start again at the battery source, then switch, response load and return.");
  };

  const registerMiswire = (instruction: string) => {
    setPressure((value) => Math.min(100, value + 7));
    setStability((value) => Math.max(18, value - 2));
    setCombo(0);
    setMessage(`Miswire detected — ${instruction}. Fault pressure +7 and stability -2.`);
  };

  const connectNode = (node: WireNode) => {
    if (!question || switching || circuitClosed) return;
    const step = wirePath.length;
    if (step === 0) {
      if (node !== "source") return registerMiswire("begin at the battery source");
      setWirePath(["source"]);
      setMessage("Source connected. Next close the control path through the switch.");
      return;
    }
    if (step === 1) {
      if (node !== "switch") return registerMiswire("the source must feed the switch next");
      setWirePath((value) => [...value, "switch"]);
      setMessage("Switch connected. Choose the response load that best solves the electrical problem.");
      return;
    }
    if (step === 2) {
      if (!node.startsWith("load-")) return registerMiswire("route the switch into one response load");
      const index = Number(node.slice(5));
      if (!Number.isInteger(index) || index < 0 || index >= question.options.length) return;
      setSelected(index);
      setWirePath((value) => [...value, node]);
      setMessage(`Response load ${index + 1} wired. Complete the loop at RETURN before energising.`);
      return;
    }
    if (step === 3) {
      if (node !== "return") return registerMiswire("the selected load must return to the source loop");
      setWirePath((value) => [...value, "return"]);
      setMessage("Circuit closed. Inspect your path, then energise and test the switch plan.");
    }
  };
  connectRef.current = connectNode;

  const commit = () => {
    if (!question || selected === null || !circuitClosed || switching || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[checkpoint] = answer;
    const stabilityGain = circuitForgeStabilityGain(pressure, round.difficulty);
    const chargeGain = circuitForgeChargeGain(faultLevel, pressure);
    const comboGain = circuitForgeComboGain(pressure);
    setStability((value) => Math.min(100, value + stabilityGain));
    setCharge((value) => Math.min(999, value + chargeGain));
    setCombo((value) => Math.min(99, value + comboGain));
    if (pressure <= 40) setScans((value) => Math.min(5, value + 1));
    setSwitching(true);
    setMessage(`Circuit energised and switch plan sealed for authoritative review. +${chargeGain} grid charge · stability +${stabilityGain}${comboGain ? ` · chain +${comboGain}` : ""}.`);
    window.setTimeout(() => {
      setSwitching(false);
      setCheckpoint((value) => value + 1);
    }, 620);
  };
  commitRef.current = commit;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "b") connectRef.current("source");
      else if (key === "s") connectRef.current("switch");
      else if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < (question?.options.length ?? 0)) connectRef.current(`load-${index}`);
      } else if (key === "r") connectRef.current("return");
      else if (key === "g") scanRef.current();
      else if (key === "f") fuseRef.current();
      else if (key === "c") clearWiring();
      else if (event.key === "Enter") {
        event.preventDefault();
        commitRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const pathHas = (node: WireNode) => wirePath.includes(node);

  return <section className="circuit-shell" aria-label={`Circuit Forge for ${learnerName}`}>
    <header className="circuit-bar"><div className="circuit-brand"><span><CircuitBoard size={22}/></span><div><strong>CIRCUIT FORGE</strong><small>school microgrid · electricity · build, wire and test</small></div></div><button type="button" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button></header>
    <div className="circuit-hud"><div><ShieldCheck size={16}/><strong>{stability}%</strong><span>grid stability</span></div><div><BatteryCharging size={16}/><strong>{charge}</strong><span>grid charge</span></div><div><Sparkles size={16}/><strong>x{Math.max(1, combo)}</strong><span>repair chain</span></div><div><ScanLine size={16}/><strong>{scans}</strong><span>grid scans</span></div></div>

    <div className="circuit-stage">
      <aside className="circuit-grid">
        <div className="circuit-sector"><small>{scene.bay ?? `GRID-${checkpoint + 1}`}</small><strong>{scene.sector ?? "School microgrid"}</strong><span>{scene.device ?? "Learning load"}</span></div>
        <div className={`circuit-builder ${energized ? "energized" : ""} step-${wirePath.length}`} role="group" aria-label="Circuit wiring board">
          <div className="circuit-flow-label"><span>BUILD PATH</span><strong>{circuitClosed ? "CLOSED LOOP" : `${wirePath.length}/4 CONNECTIONS`}</strong></div>
          <button type="button" className={`circuit-node source ${pathHas("source") ? "connected" : ""}`} onClick={() => connectNode("source")} disabled={switching}><BatteryCharging size={28}/><b>BATTERY</b><small>B · {scene.supplyV ?? 6} V</small></button>
          <button type="button" className={`circuit-node switch ${pathHas("switch") ? "connected" : ""}`} onClick={() => connectNode("switch")} disabled={switching}><Zap size={22}/><b>SWITCH</b><small>S · control</small></button>
          <div className="circuit-load-bank">{question?.options.slice(0, 4).map((option, index) => {
            const node = `load-${index}` as WireNode;
            const connected = pathHas(node);
            return <button type="button" key={`${index}-${option}`} className={`circuit-node load ${connected ? "connected" : ""}`} onClick={() => connectNode(node)} disabled={switching} aria-pressed={connected}><Lightbulb size={18}/><b>{index + 1}</b><span>{option}</span><small>{connected ? "WIRED" : "LOAD"}</small></button>;
          })}</div>
          <button type="button" className={`circuit-node return ${pathHas("return") ? "connected" : ""}`} onClick={() => connectNode("return")} disabled={switching}><Cable size={24}/><b>RETURN</b><small>R · close loop</small></button>
          <i className={`wire-link link-source-switch ${wirePath.length >= 2 ? "live" : ""}`} aria-hidden="true"/>
          <i className={`wire-link link-switch-bank ${wirePath.length >= 3 ? "live" : ""}`} aria-hidden="true"/>
          <i className={`wire-link link-bank-return ${wirePath.length >= 4 ? "live" : ""}`} aria-hidden="true"/>
        </div>
        <div className="circuit-meters"><span><Gauge size={14}/>{scene.supplyV ?? 6} V supply</span><span><Bolt size={14}/>{String(scene.mission ?? "path").toUpperCase()}</span><span><TriangleAlert size={14}/>fault {faultLevel}/5</span></div>
      </aside>

      {question ? <main className="circuit-console">
        <div className="circuit-heading"><div><span>{boss ? "MASTER BUS · FINAL GRID EVENT" : `${String(scene.mission ?? "path").toUpperCase()} · NODE ${checkpoint + 1}/${round.questions.length}`}</span><strong>{scene.cue ?? "Trace source, path, load and return."}</strong></div><CircuitBoard size={27}/></div>
        <h2>{question.prompt}</h2>
        <div className="circuit-instructions"><CircuitBoard size={18}/><div><strong>Wire the answer, don’t just select it.</strong><span>Connect battery → switch → one response load → return. A wrong connection raises fault pressure.</span></div></div>
        <div className="circuit-path-readout"><span className={wirePath.length >= 1 ? "done" : ""}>BATTERY</span><i>→</i><span className={wirePath.length >= 2 ? "done" : ""}>SWITCH</span><i>→</i><span className={wirePath.length >= 3 ? "done" : ""}>{selected === null ? "RESPONSE LOAD" : `LOAD ${selected + 1}`}</span><i>→</i><span className={wirePath.length >= 4 ? "done" : ""}>RETURN</span></div>
        {scanOpen ? <div className="circuit-scan"><ScanLine size={16}/><span>{clues.length ? clues.join(" · ") : scene.cue ?? "Trace source, path, load and return."}</span></div> : null}
        <div className="circuit-actions"><button type="button" className="circuit-commit" onClick={commit} disabled={switching || !circuitClosed}><Zap size={16}/>{switching ? "Energising circuit…" : circuitClosed ? "Energise & test" : "Complete wiring first"}</button><button type="button" onClick={clearWiring} disabled={switching || wirePath.length === 0}><RotateCcw size={16}/>Clear wiring</button><button type="button" onClick={scan} disabled={scans < 1 || switching}><ScanLine size={16}/>Grid scan · {scans}</button><button type="button" onClick={resetProtection} disabled={!fuseAvailable || switching}><ShieldCheck size={16}/>{fuseAvailable ? "Emergency reset · 1" : "Reset used"}</button></div>
        <div className="circuit-status" aria-live="polite"><span>{message}</span><small>B battery · S switch · 1–4 load · R return · G scan · C clear · F reset · Enter test</small></div>
      </main> : <main className="circuit-console circuit-finished"><CircuitBoard size={54}/><strong>MICROGRID STABLE · REVIEW READY</strong><span>Uploading sealed switch plans for authoritative science grading…</span></main>}

      <div className="circuit-pressure"><span><TriangleAlert size={13}/> Fault pressure</span><i><b style={{ width: `${pressure}%` }}/></i><strong>{Math.round(pressure)}%</strong></div>
    </div>
    <footer className="circuit-footer"><span>Grid restored {progress}%</span><span>{plan?.masteryPercent == null ? "Electrical profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span><span>{plan?.supportMode ?? "adaptive"} support</span></footer>
  </section>;
}
