"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Crown, Gem, LogOut, Shield, Sparkles, Zap } from "lucide-react";
import {
  wordKingdomFocusChain,
  wordKingdomGateDamage,
  wordKingdomManaReward,
  wordKingdomRegionForCheckpoint,
  wordKingdomThreatDurationMs,
  wordKingdomWardRecovery,
  type WordKingdomRegion,
} from "@/lib/word-kingdom-mission";
import "./word-kingdom.css";

type KingdomQuestion = { id: string; prompt: string; options: string[] };
type KingdomLearningPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type KingdomRound = {
  id: string;
  difficulty: number;
  answers: string[];
  questions: KingdomQuestion[];
  learningPlan?: KingdomLearningPlan | null;
};
type Props = {
  learnerName: string;
  round: KingdomRound;
  onComplete: (answers: string[]) => void;
  onExit: (answers: string[]) => void;
};

const REALMS: Record<NonNullable<KingdomRound["learningPlan"]>["worldKey"], string> = {
  "aurora-causeway": "Aurora Wordlands",
  "meteor-foundry": "Ember Lexicon Realm",
  "prism-canyon": "Prism Grammar Vale",
  "nova-citadel": "Crown Citadel",
};
const REGION_LABELS: Record<WordKingdomRegion, string> = {
  "whispering-woods": "Whispering Woods",
  "lexicon-forge": "Lexicon Forge",
  "grammar-keep": "Grammar Keep",
  "crown-citadel": "Crown Citadel",
};

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

export default function WordKingdom({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const completedRef = useRef(false);
  const sealRef = useRef<() => void>(() => undefined);
  const wardRef = useRef<() => void>(() => undefined);
  const startedRef = useRef(Date.now());
  const [checkpoint, setCheckpoint] = useState(() => initialCheckpoint(round.answers, round.questions.length));
  const [selected, setSelected] = useState(0);
  const [threat, setThreat] = useState(0);
  const [integrity, setIntegrity] = useState(100);
  const [mana, setMana] = useState(2);
  const [focusChain, setFocusChain] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [message, setMessage] = useState("Choose a rune before the shadow reaches the castle gate.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const plan = round.learningPlan;
  const question = round.questions[checkpoint];
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const region = wordKingdomRegionForCheckpoint(checkpoint, boss);
  const realm = plan ? REALMS[plan.worldKey] : "Nova Wordlands";
  const duration = useMemo(
    () => wordKingdomThreatDurationMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"),
    [round.difficulty, plan?.speedScale, plan?.supportMode],
  );
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);

  useEffect(() => {
    startedRef.current = Date.now();
    setThreat(0);
    setSelected(0);
    if (checkpoint < round.questions.length) {
      setMessage(boss ? "The Shadow Scribe guards the Crown. Seal the final rune." : `Enter ${REGION_LABELS[region]} and choose the rune that unlocks the path.`);
    }
  }, [checkpoint, boss, region, round.questions.length]);

  useEffect(() => {
    if (checkpoint >= round.questions.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        window.setTimeout(() => completeRef.current([...answersRef.current]), 500);
      }
      return;
    }
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedRef.current;
      setThreat(Math.min(100, (elapsed / duration) * 100));
    }, 90);
    return () => window.clearInterval(timer);
  }, [checkpoint, duration, round.questions.length]);

  const castWard = () => {
    if (mana < 2 || pulse || checkpoint >= round.questions.length) return;
    const recovered = wordKingdomWardRecovery(integrity, threat);
    setMana((value) => Math.max(0, value - 2));
    setIntegrity(recovered.integrity);
    setThreat(recovered.threat);
    startedRef.current = Date.now() - (recovered.threat / 100) * duration;
    setMessage("Word Ward cast. The shadow is pushed back and the gate is reinforced.");
  };
  wardRef.current = castWard;

  const sealRune = () => {
    if (!question || pulse || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    const nextChain = wordKingdomFocusChain(focusChain, threat);
    const damage = wordKingdomGateDamage(threat, plan?.hazardDensity ?? 0.9, boss);
    const reward = wordKingdomManaReward(threat, nextChain);
    answersRef.current[checkpoint] = answer;
    setIntegrity((value) => Math.max(15, value - damage));
    setMana((value) => Math.min(9, value + reward));
    setFocusChain(nextChain);
    setPulse(true);
    setMessage(reward > 1 ? "Swift rune sealed — bonus mana gathered." : "Rune sealed. The kingdom path is shifting ahead.");
    window.setTimeout(() => {
      setPulse(false);
      setCheckpoint((value) => value + 1);
    }, 560);
  };
  sealRef.current = sealRune;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const optionCount = round.questions[checkpoint]?.options.length ?? 0;
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < optionCount) setSelected(index);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelected((value) => optionCount ? (value - 1 + optionCount) % optionCount : 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelected((value) => optionCount ? (value + 1) % optionCount : 0);
      } else if (event.key === "Enter") {
        event.preventDefault();
        sealRef.current();
      } else if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        wardRef.current();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [checkpoint, round.questions]);

  return <section className="word-kingdom-shell" aria-label={`Word Kingdom quest for ${learnerName}`}>
    <header className="word-kingdom-bar">
      <div className="word-kingdom-brand"><span><Crown size={22}/></span><div><strong>WORD KINGDOM</strong><small>{realm} · {plan?.supportMode ?? "adaptive"} language quest</small></div></div>
      <button type="button" className="word-kingdom-exit" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button>
    </header>

    <div className="word-kingdom-hud">
      <div><Shield size={16}/><strong>{integrity}%</strong><span>castle gate</span></div>
      <div><Gem size={16}/><strong>{mana}</strong><span>word mana</span></div>
      <div><Zap size={16}/><strong>x{focusChain}</strong><span>focus chain</span></div>
      <div><BookOpen size={16}/><strong>{checkpoint}/{round.questions.length}</strong><span>runes sealed</span></div>
    </div>

    <div className={`word-kingdom-stage ${pulse ? "pulse" : ""}`}>
      <div className="word-kingdom-sky" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
      <div className="word-kingdom-world" aria-hidden="true">
        <div className="word-kingdom-castle"><i/><i/><i/><b><Crown size={23}/></b></div>
        <div className="word-kingdom-road"><span className="word-kingdom-shadow" style={{ left: `${Math.min(91, 5 + threat * 0.86)}%` }}><Sparkles size={22}/></span></div>
        <div className="word-kingdom-threat"><span>Shadow advance</span><i><b style={{ width: `${threat}%` }}/></i><strong>{Math.round(threat)}%</strong></div>
      </div>

      {question ? <div className="word-kingdom-console">
        <div className="word-kingdom-console-head"><div><span>{boss ? "CROWN BOSS" : `${REGION_LABELS[region].toUpperCase()} · RUNE ${checkpoint + 1}`}</span><strong>{boss ? "Defeat the Shadow Scribe" : "Unlock the kingdom path"}</strong></div><BookOpen size={24}/></div>
        <h2>{question.prompt}</h2>
        <div className="word-kingdom-runes">{question.options.slice(0, 4).map((option, index) => <button type="button" className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} key={`${index}-${option}`} disabled={pulse}><b>{index + 1}</b><span>{option}</span><i aria-hidden="true">✦</i></button>)}</div>
        <div className="word-kingdom-actions"><button type="button" className="word-kingdom-seal" onClick={sealRune} disabled={pulse}><Sparkles size={17}/>{pulse ? "Sealing…" : "Seal selected rune"}</button><button type="button" className="word-kingdom-ward" onClick={castWard} disabled={mana < 2 || pulse}><Shield size={16}/>Word Ward · 2 mana</button></div>
        <div className="word-kingdom-status"><span>{message}</span><small>1–4 choose · ← → move · Enter seals · W casts ward</small></div>
      </div> : <div className="word-kingdom-console word-kingdom-finished"><Crown size={40}/><strong>THE CROWN IS SAFE</strong><span>Sending your sealed runes to the Royal Archive for secure grading…</span></div>}
    </div>

    <footer className="word-kingdom-footer"><span>Quest progress {progress}%</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Language profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span><span>Academic correctness is revealed only after the quest.</span></footer>
  </section>;
}
