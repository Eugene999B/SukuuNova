"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BatteryCharging, Bot, Bug, Cpu, Flame, LogOut, Play, Wrench } from "lucide-react";
import { codeBotsCycleDurationMs, codeBotsDebugRecovery, codeBotsEfficiencyChain, codeBotsFactoryZoneForCheckpoint, codeBotsOverheatDamage, codeBotsPowerReward, codeBotsZoneLabel } from "@/lib/codebots-mission";
import "./codebots-factory.css";

type CodeBotsScene = { cue?: string; meterLabels?: string[] };
type CodeBotsQuestion = { id: string; prompt: string; options: string[]; scene?: CodeBotsScene };
type CodeBotsPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type CodeBotsRound = {
  id: string;
  difficulty: number;
  answers: string[];
  questions: CodeBotsQuestion[];
  learningPlan?: CodeBotsPlan | null;
};
type Props = {
  learnerName: string;
  round: CodeBotsRound;
  onComplete: (answers: string[]) => void;
  onExit: (answers: string[]) => void;
};

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

export default function CodeBotsFactory({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const deployRef = useRef<() => void>(() => undefined);
  const debugRef = useRef<() => void>(() => undefined);
  const startedRef = useRef(Date.now());
  const [checkpoint, setCheckpoint] = useState(() => initialCheckpoint(round.answers, round.questions.length));
  const [program, setProgram] = useState<string[]>([]);
  const [heat, setHeat] = useState(0);
  const [integrity, setIntegrity] = useState(100);
  const [power, setPower] = useState(3);
  const [chain, setChain] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [message, setMessage] = useState("Build the command rack in the order the bot should execute it.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const plan = round.learningPlan;
  const question = round.questions[checkpoint];
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const zone = codeBotsFactoryZoneForCheckpoint(checkpoint, boss);
  const duration = useMemo(() => codeBotsCycleDurationMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"), [round.difficulty, plan?.speedScale, plan?.supportMode]);
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const available = question?.options.filter((option) => !program.includes(option)) ?? [];
  const focusCue = question?.scene?.meterLabels?.join(" · ") || "sequence · logic · testing";

  useEffect(() => {
    startedRef.current = Date.now();
    setHeat(0);
    setProgram([]);
    if (checkpoint < round.questions.length) setMessage(boss ? "Logic Core build: assemble the final program under pressure." : "Command rack cleared. Build the next bot program.");
  }, [checkpoint, boss, round.questions.length]);

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
        const damage = codeBotsOverheatDamage(100, plan?.hazardDensity ?? 0.9, boss);
        setIntegrity((value) => Math.max(25, value - damage));
        startedRef.current = Date.now() - Math.round(duration * 0.45);
        setHeat(45);
        setMessage(`Cooling cycle triggered in ${codeBotsZoneLabel(zone)}. Factory integrity absorbed ${damage}% pressure.`);
      } else {
        setHeat(Math.min(100, (elapsed / duration) * 100));
      }
    }, 110);
    return () => window.clearInterval(timer);
  }, [boss, checkpoint, duration, plan?.hazardDensity, round.questions.length, zone]);

  const appendCommand = (command: string) => {
    if (pulse || !question) return;
    setProgram((current) => current.includes(command) ? current : [...current, command]);
  };

  const removeCommand = (index: number) => {
    if (pulse) return;
    setProgram((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const debugPulse = () => {
    if (power < 1 || pulse || !question) return;
    setPower((value) => Math.max(0, value - 1));
    setHeat((value) => codeBotsDebugRecovery(value, plan?.hintStrength ?? 0));
    startedRef.current = Date.now() - Math.round((codeBotsDebugRecovery(heat, plan?.hintStrength ?? 0) / 100) * duration);
    setMessage(`Debug pulse: focus on ${focusCue}. It slows the line but never reveals command order.`);
  };
  debugRef.current = debugPulse;

  const deployBot = () => {
    if (!question || pulse || completedRef.current || program.length !== question.options.length) return;
    answersRef.current[checkpoint] = JSON.stringify(program);
    const reward = codeBotsPowerReward(heat, program.length);
    const nextChain = codeBotsEfficiencyChain(chain, heat);
    setPower((value) => Math.min(8, value + reward));
    setChain(nextChain);
    setPulse(true);
    setMessage(`${codeBotsZoneLabel(zone)} bot deployed. ${reward ? `Recovered ${reward} power.` : "Program sealed for secure grading."}`);
    window.setTimeout(() => {
      setPulse(false);
      setCheckpoint((value) => value + 1);
    }, 520);
  };
  deployRef.current = deployBot;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key >= "1" && event.key <= "9") {
        const index = Number(event.key) - 1;
        const command = available[index];
        if (command) appendCommand(command);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setProgram((current) => current.slice(0, -1));
      } else if (event.key.toLowerCase() === "d") {
        debugRef.current();
      } else if (event.key === "Enter") {
        event.preventDefault();
        deployRef.current();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  return <section className="codebots-shell" aria-label={`CodeBots Factory for ${learnerName}`}>
    <header className="codebots-bar">
      <div className="codebots-brand"><span><Bot size={23}/></span><div><strong>CODEBOTS · LOGIC FACTORY</strong><small>{plan?.supportMode ?? "adaptive"} build · command order stays yours</small></div></div>
      <button type="button" className="codebots-exit" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button>
    </header>

    <div className="codebots-hud">
      <div><Wrench size={16}/><strong>{integrity}%</strong><span>factory integrity</span></div>
      <div><BatteryCharging size={16}/><strong>{power}</strong><span>debug power</span></div>
      <div><Flame size={16}/><strong>{Math.round(heat)}%</strong><span>line heat</span></div>
      <div><Cpu size={16}/><strong>{checkpoint}/{round.questions.length}</strong><span>bots deployed</span></div>
    </div>

    <div className={`codebots-stage ${pulse ? "pulse" : ""}`}>
      <div className="codebots-factory" aria-hidden="true">
        <div className="codebots-rail"><i/><i/><i/><i/><i/></div>
        <div className="codebots-bot" style={{ left: `${12 + progress * 0.7}%` }}><Bot size={30}/><span>{boss ? "CORE" : `B${checkpoint + 1}`}</span></div>
        <div className="codebots-zone"><Cpu size={18}/><strong>{codeBotsZoneLabel(zone)}</strong><small>{boss ? "Boss build" : `Efficiency chain ×${chain}`}</small></div>
      </div>

      {question ? <div className="codebots-console">
        <div className="codebots-console-head"><div><span>{boss ? "LOGIC CORE · FINAL BUILD" : `BUILD ${checkpoint + 1} / ${round.questions.length}`}</span><strong>{question.scene?.cue ?? "Assemble the executable command sequence."}</strong></div><Cpu size={22}/></div>
        <h2>{question.prompt}</h2>
        <div className="codebots-workbench">
          <div><header><span>COMMAND PALETTE</span><small>Tap or press 1–9</small></header><div className="codebots-palette">{available.map((command, index) => <button type="button" key={command} onClick={() => appendCommand(command)} disabled={pulse}><b>{index + 1}</b><span>{command}</span></button>)}</div></div>
          <div><header><span>PROGRAM RACK</span><small>Tap a command to remove it</small></header><ol className="codebots-program">{program.length ? program.map((command, index) => <li key={`${index}-${command}`}><button type="button" onClick={() => removeCommand(index)} disabled={pulse}><b>{index + 1}</b><span>{command}</span></button></li>) : <li className="empty">Build the bot program here…</li>}</ol></div>
        </div>
        <div className="codebots-actions"><button type="button" className="codebots-deploy" onClick={deployBot} disabled={pulse || program.length !== question.options.length}><Play size={16} fill="currentColor"/>{program.length === question.options.length ? (pulse ? "Deploying…" : "Deploy bot") : `${question.options.length - program.length} commands remaining`}</button><button type="button" className="codebots-debug" onClick={debugPulse} disabled={power < 1 || pulse}><Bug size={16}/>Debug pulse · 1</button></div>
        <div className="codebots-status" aria-live="polite"><span>{message}</span><small>1–9 add · Backspace undo · D debug · Enter deploy</small></div>
      </div> : <div className="codebots-console codebots-finished"><Bot size={42}/><strong>FACTORY RUN COMPLETE</strong><span>Uploading bot programs for secure execution review…</span></div>}

      <div className="codebots-heat"><span>Conveyor heat</span><i><b style={{ width: `${heat}%` }}/></i><strong>{Math.round(heat)}%</strong></div>
    </div>

    <footer className="codebots-footer"><span>Factory progress {progress}%</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Logic profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span></footer>
  </section>;
}
