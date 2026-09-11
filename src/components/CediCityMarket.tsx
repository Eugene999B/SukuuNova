"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, LogOut, Package, Receipt, ScanLine, ShoppingBasket, Sparkles, Store, Users, Wallet } from "lucide-react";
import { marketComboGain, marketPatienceDurationMs, marketQueueTrustLoss, marketRestockGain, marketScanRecovery, marketStockCost, marketTillReward } from "@/lib/cedi-city-market";
import type { CediMarketMission, CediMarketScene } from "@/lib/cedi-city-market-content";
import "./cedi-city-market.css";

type MarketQuestion = { id: string; prompt: string; options: string[]; scene?: Partial<CediMarketScene> };
type MarketPlan = {
  masteryPercent: number | null;
  supportMode: "guided" | "supported" | "independent" | "challenge";
  missionMode: "onboarding" | "recovery" | "reinforcement" | "balanced" | "stretch";
  speedScale: number;
  hazardDensity: number;
  hintStrength: 0 | 1 | 2;
  bossGate: boolean;
  worldKey: "aurora-causeway" | "meteor-foundry" | "prism-canyon" | "nova-citadel";
};
type MarketRound = { id: string; difficulty: number; answers: string[]; questions: MarketQuestion[]; learningPlan?: MarketPlan | null };
type Props = { learnerName: string; round: MarketRound; onComplete: (answers: string[]) => void; onExit: (answers: string[]) => void };

type Product = { label: string; price: string };

const missionLabels: Record<CediMarketMission, string> = {
  change: "CHANGE DESK",
  basket: "BASKET TOTAL",
  discount: "VOUCHER COUNTER",
  saving: "SAVINGS LOCK",
  budget: "BUDGET BOARD",
  profit: "TRADER DESK",
  percentage: "MARKET DAY DEAL",
  tradeoff: "SMART SPEND",
};

const fallbackCustomers = ["Ama", "Kojo", "Abena", "Kwame", "Adwoa", "Kofi"];

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

function parsePriceTag(tag: string): Product {
  const parts = tag.split(" · ");
  return { label: parts[0] || "market item", price: parts[1] || "GH₵—" };
}

export default function CediCityMarket({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const serveRef = useRef<() => void>(() => undefined);
  const scanRef = useRef<() => void>(() => undefined);
  const completedRef = useRef(false);
  const startedRef = useRef(Date.now());
  const firstCheckpoint = initialCheckpoint(round.answers, round.questions.length);
  const [checkpoint, setCheckpoint] = useState(firstCheckpoint);
  const [selected, setSelected] = useState(0);
  const [queuePressure, setQueuePressure] = useState(0);
  const [trust, setTrust] = useState(100);
  const [stock, setStock] = useState(92);
  const [till, setTill] = useState(36);
  const [scans, setScans] = useState(2);
  const [combo, setCombo] = useState(0);
  const [scanActive, setScanActive] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [message, setMessage] = useState("A customer is approaching. Read the basket, choose the correct till decision and keep the queue moving.");
  completeRef.current = onComplete;
  exitRef.current = onExit;

  const plan = round.learningPlan;
  const question = round.questions[checkpoint];
  const scene = question?.scene;
  const customer = scene?.customer || fallbackCustomers[checkpoint % fallbackCustomers.length] || "Customer";
  const avatar = scene?.avatar || "star";
  const mission = (scene?.mission || "basket") as CediMarketMission;
  const products = useMemo(() => (scene?.priceTags ?? []).map(parsePriceTag), [scene?.priceTags]);
  const basketCount = Math.max(1, scene?.basket?.length ?? products.length);
  const boss = Boolean(plan?.bossGate && checkpoint === round.questions.length - 1);
  const duration = useMemo(
    () => marketPatienceDurationMs(round.difficulty, plan?.speedScale ?? 1, plan?.supportMode ?? "independent"),
    [round.difficulty, plan?.speedScale, plan?.supportMode],
  );
  const progress = Math.round((Math.min(checkpoint, round.questions.length) / Math.max(1, round.questions.length)) * 100);
  const focusCue = scene?.cue || scene?.meterLabels?.join(" · ") || "read the basket · protect savings · check the receipt";

  useEffect(() => {
    startedRef.current = Date.now();
    setQueuePressure(0);
    setSelected(0);
    setScanActive(false);
    if (checkpoint < round.questions.length) {
      setMessage(boss ? "MARKET DAY RUSH: the final customer is at the counter. Keep the till calm and close the last sale." : `${customer} has reached the counter. Build the correct receipt before the queue pressure peaks.`);
    }
  }, [boss, checkpoint, customer, round.questions.length]);

  useEffect(() => {
    if (checkpoint >= round.questions.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        window.setTimeout(() => completeRef.current([...answersRef.current]), 460);
      }
      return;
    }
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedRef.current;
      if (elapsed >= duration) {
        const loss = marketQueueTrustLoss(100, plan?.hazardDensity ?? 0.9, boss);
        setTrust((value) => Math.max(25, value - loss));
        setCombo(0);
        startedRef.current = Date.now() - Math.round(duration * 0.48);
        setQueuePressure(48);
        setMessage(`The queue surged. Market trust absorbed ${loss}% pressure — finish the receipt and recover the rhythm.`);
      } else {
        setQueuePressure(Math.min(100, (elapsed / duration) * 100));
      }
    }, 110);
    return () => window.clearInterval(timer);
  }, [boss, checkpoint, duration, plan?.hazardDensity, round.questions.length]);

  const scanPrices = () => {
    if (!question || scans < 1 || pulse) return;
    setScans((value) => Math.max(0, value - 1));
    setQueuePressure((current) => {
      const next = marketScanRecovery(current, plan?.hintStrength ?? 0);
      startedRef.current = Date.now() - Math.round((next / 100) * duration);
      return next;
    });
    setScanActive(true);
    setMessage(`Price scan: ${focusCue}. The scanner organizes the maths clue but never reveals the receipt answer.`);
  };
  scanRef.current = scanPrices;

  const serveCustomer = () => {
    if (!question || pulse || completedRef.current) return;
    const answer = question.options[selected];
    if (!answer) return;
    answersRef.current[checkpoint] = answer;
    const reward = marketTillReward(queuePressure, round.difficulty);
    const restock = marketRestockGain(queuePressure);
    const comboGain = marketComboGain(queuePressure);
    const stockCost = marketStockCost(basketCount, round.difficulty);
    setTill((value) => Math.min(999, value + reward));
    setStock((value) => Math.max(18, Math.min(100, value - stockCost + restock)));
    setCombo((value) => Math.min(99, value + comboGain));
    if (queuePressure <= 42) setScans((value) => Math.min(5, value + 1));
    setPulse(true);
    setMessage(`${customer}'s receipt is sealed for secure review. +${reward} market credits · ${comboGain ? `combo +${comboGain}` : "steady service"}.`);
    window.setTimeout(() => {
      setPulse(false);
      setCheckpoint((value) => value + 1);
    }, 620);
  };
  serveRef.current = serveCustomer;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key >= "1" && event.key <= "4") {
        const index = Number(event.key) - 1;
        if (index < (question?.options.length ?? 0)) setSelected(index);
      } else if (key === "s") scanRef.current();
      else if (event.key === "Enter") {
        event.preventDefault();
        serveRef.current();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const queuePeople = Math.max(2, Math.min(6, 2 + Math.floor(queuePressure / 20)));

  return <section className="cedi-market-shell" aria-label={`Cedi City Market for ${learnerName}`}>
    <header className="cedi-market-bar">
      <div className="cedi-market-brand"><span><Store size={22}/></span><div><strong>CEDI CITY MARKET</strong><small>adaptive money maths · Ghana cedi · live customer simulation</small></div></div>
      <button type="button" className="cedi-market-exit" onClick={() => exitRef.current([...answersRef.current])}><LogOut size={15}/>Save & exit</button>
    </header>

    <div className="cedi-market-hud">
      <div><Users size={16}/><strong>{trust}%</strong><span>market trust</span></div>
      <div><Wallet size={16}/><strong>₵{till}</strong><span>till credits</span></div>
      <div><Package size={16}/><strong>{stock}%</strong><span>stock health</span></div>
      <div><Sparkles size={16}/><strong>x{Math.max(1, combo)}</strong><span>service chain</span></div>
    </div>

    <div className={`cedi-market-stage ${pulse ? "pulse" : ""}`}>
      <div className="cedi-market-world">
        <div className="cedi-market-skyline"><span/><span/><span/><span/><span/></div>
        <div className="cedi-market-awning"><i/><i/><i/><i/><i/><i/></div>
        <div className="cedi-market-shop-sign"><Store size={18}/><strong>NOVA CORNER</strong><small>CEDI CITY · MARKET LANE 03</small></div>
        <div className="cedi-market-shelves">
          {(products.length ? products : [{ label: "market basket", price: "GH₵—" }]).slice(0, 3).map((product, index) => <div className="cedi-market-product" key={`${product.label}-${index}`}><span><ShoppingBasket size={18}/></span><strong>{product.label}</strong><small>{product.price}</small></div>)}
        </div>
        <div className="cedi-market-counter"><div className="cedi-market-register"><Receipt size={22}/><span>SECURE TILL</span></div><div className="cedi-market-bag"><ShoppingBasket size={24}/><b>{basketCount}</b></div></div>
        <div className="cedi-market-player"><div className="cedi-market-face merchant"><span>{learnerName.trim()?.[0]?.toUpperCase() || "N"}</span></div><small>MARKET CAPTAIN</small></div>
        {question ? <div className="cedi-market-customer"><div className={`cedi-market-face customer ${avatar}`}><span>{customer[0]?.toUpperCase()}</span></div><div className="cedi-market-bubble"><small>{boss ? "MARKET DAY RUSH" : missionLabels[mission]}</small><strong>{customer}</strong><span>{scene?.wallet ? `Wallet ${`GH₵${scene.wallet}`}` : "Ready to shop"}</span></div></div> : null}
        <div className="cedi-market-queue" aria-label={`${queuePeople} customers in the visual queue`}>{Array.from({ length: queuePeople }, (_, index) => <i key={index} style={{ opacity: Math.max(.3, 1 - index * .12) }}><span>{fallbackCustomers[(checkpoint + index + 1) % fallbackCustomers.length]?.[0]}</span></i>)}</div>
        <div className="cedi-market-neon"><span>CEDI CITY</span><b>{boss ? "RUSH HOUR" : "OPEN"}</b></div>
      </div>

      {question ? <div className="cedi-market-console">
        <div className="cedi-market-console-head"><div><span>{boss ? "FINAL CHECKOUT · MARKET DAY" : `${missionLabels[mission]} · CUSTOMER ${checkpoint + 1}/${round.questions.length}`}</span><strong>{scene?.cue || "Read the market situation, calculate carefully and build the correct receipt."}</strong></div><Receipt size={23}/></div>
        <h2>{question.prompt}</h2>
        <div className="cedi-market-receipt"><div><span>Customer</span><strong>{customer}</strong></div><div><span>Basket</span><strong>{basketCount} item{basketCount === 1 ? "" : "s"}</strong></div><div><span>Mission</span><strong>{missionLabels[mission].toLowerCase()}</strong></div></div>
        <div className="cedi-market-options">{question.options.slice(0, 4).map((option, index) => <button type="button" key={`${index}-${option}`} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} disabled={pulse}><b>{index + 1}</b><span>{option}</span></button>)}</div>
        {scanActive ? <div className="cedi-market-scan"><ScanLine size={15}/><span>Scanner focus: {focusCue}</span></div> : null}
        <div className="cedi-market-actions"><button type="button" className="cedi-market-serve" onClick={serveCustomer} disabled={pulse}><Receipt size={16}/>{pulse ? "Printing receipt…" : "Serve customer"}</button><button type="button" className="cedi-market-scan-button" onClick={scanPrices} disabled={scans < 1 || pulse}><ScanLine size={16}/>Price scan · {scans}</button></div>
        <div className="cedi-market-status" aria-live="polite"><span>{message}</span><small>1–4 receipt · S scan · Enter serve</small></div>
      </div> : <div className="cedi-market-console cedi-market-finished"><Store size={46}/><strong>MARKET CLOSED · LEDGER READY</strong><span>Uploading every sealed receipt for secure maths review…</span></div>}

      <div className="cedi-market-pressure"><span><Clock size={13}/> Queue pressure</span><i><b style={{ width: `${queuePressure}%` }}/></i><strong>{Math.round(queuePressure)}%</strong></div>
    </div>

    <footer className="cedi-market-footer"><span>Market progress {progress}%</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Money-maths profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span><span>{plan?.supportMode ?? "adaptive"} support</span></footer>
  </section>;
}
