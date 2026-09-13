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
const keypad = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "C", "0", "⌫"] as const;

function initialCheckpoint(answers: string[], length: number) {
  const first = answers.findIndex((answer) => !answer.trim());
  return first < 0 ? length : first;
}

function parsePriceTag(tag: string): Product {
  const parts = tag.split(" · ");
  return { label: parts[0] || "market item", price: parts[1] || "GH₵—" };
}

function parseMoney(value: string) {
  const digits = value.replace(/[^0-9-]/g, "");
  const amount = Number.parseInt(digits, 10);
  return Number.isFinite(amount) ? Math.max(0, amount) : null;
}

function money(amount: number) {
  return `GH₵${Math.max(0, Math.round(amount))}`;
}

export default function CediCityMarket({ learnerName, round, onComplete, onExit }: Props) {
  const answersRef = useRef([...round.answers]);
  const completeRef = useRef(onComplete);
  const exitRef = useRef(onExit);
  const serveRef = useRef<() => void>(() => undefined);
  const scanRef = useRef<() => void>(() => undefined);
  const keyRef = useRef<(key: string) => void>(() => undefined);
  const completedRef = useRef(false);
  const startedRef = useRef(Date.now());
  const firstCheckpoint = initialCheckpoint(round.answers, round.questions.length);
  const [checkpoint, setCheckpoint] = useState(firstCheckpoint);
  const [registerInput, setRegisterInput] = useState("");
  const [queuePressure, setQueuePressure] = useState(0);
  const [trust, setTrust] = useState(100);
  const [stock, setStock] = useState(92);
  const [till, setTill] = useState(36);
  const [scans, setScans] = useState(2);
  const [combo, setCombo] = useState(0);
  const [scanActive, setScanActive] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [receiptFlash, setReceiptFlash] = useState<"idle" | "reject" | "print">("idle");
  const [message, setMessage] = useState("A customer is approaching. Read the basket, calculate the transaction, then key the amount into the till.");
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
  const enteredAmount = registerInput ? Number.parseInt(registerInput, 10) : null;
  const enteredMoney = enteredAmount === null || Number.isNaN(enteredAmount) ? "" : money(enteredAmount);
  const matchedOption = question?.options.find((option) => parseMoney(option) === enteredAmount) ?? null;

  useEffect(() => {
    startedRef.current = Date.now();
    setQueuePressure(0);
    setRegisterInput("");
    setScanActive(false);
    setReceiptFlash("idle");
    if (checkpoint < round.questions.length) {
      setMessage(boss ? "MARKET DAY RUSH: calculate the final transaction and key the amount into the register before the queue peaks." : `${customer} has reached the counter. Work out the transaction and enter the amount yourself.`);
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
        setMessage(`The queue surged. Market trust absorbed ${loss}% pressure — finish the calculation and key the receipt amount.`);
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
    setMessage(`Price scan: ${focusCue}. The scanner organises the maths clue but never calculates the receipt for you.`);
  };
  scanRef.current = scanPrices;

  const pressRegisterKey = (key: string) => {
    if (!question || pulse) return;
    setReceiptFlash("idle");
    if (key === "C") {
      setRegisterInput("");
      setMessage("Till cleared. Recalculate the transaction from the basket and customer details.");
      return;
    }
    if (key === "⌫") {
      setRegisterInput((value) => value.slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key)) return;
    setRegisterInput((value) => {
      if (value.length >= 6) return value;
      if (value === "0") return key;
      return `${value}${key}`;
    });
  };
  keyRef.current = pressRegisterKey;

  const serveCustomer = () => {
    if (!question || pulse || completedRef.current) return;
    if (!registerInput || enteredAmount === null || Number.isNaN(enteredAmount)) {
      setReceiptFlash("reject");
      setMessage("The till is blank. Calculate the transaction and enter a cedi amount before printing the receipt.");
      return;
    }
    if (!matchedOption) {
      setReceiptFlash("reject");
      setQueuePressure((value) => Math.min(100, value + 6));
      setCombo(0);
      setMessage(`${enteredMoney} fails the transaction audit. Check the arithmetic and re-enter the amount. Queue pressure +6.`);
      return;
    }
    answersRef.current[checkpoint] = matchedOption;
    const reward = marketTillReward(queuePressure, round.difficulty);
    const restock = marketRestockGain(queuePressure);
    const comboGain = marketComboGain(queuePressure);
    const stockCost = marketStockCost(basketCount, round.difficulty);
    setTill((value) => Math.min(999, value + reward));
    setStock((value) => Math.max(18, Math.min(100, value - stockCost + restock)));
    setCombo((value) => Math.min(99, value + comboGain));
    if (queuePressure <= 42) setScans((value) => Math.min(5, value + 1));
    setPulse(true);
    setReceiptFlash("print");
    setMessage(`${customer}'s ${enteredMoney} receipt is sealed for secure review. +${reward} market credits · ${comboGain ? `combo +${comboGain}` : "steady service"}.`);
    window.setTimeout(() => {
      setPulse(false);
      setCheckpoint((value) => value + 1);
    }, 620);
  };
  serveRef.current = serveCustomer;

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (/^\d$/.test(event.key)) keyRef.current(event.key);
      else if (event.key === "Backspace") {
        event.preventDefault();
        keyRef.current("⌫");
      } else if (key === "c" || event.key === "Escape") keyRef.current("C");
      else if (key === "s") scanRef.current();
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
      <div className="cedi-market-brand"><span><Store size={22}/></span><div><strong>CEDI CITY MARKET</strong><small>adaptive money maths · Ghana cedi · live till simulation</small></div></div>
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
        <div className={`cedi-market-counter ${receiptFlash}`}><div className="cedi-market-register"><Receipt size={22}/><div><span>SECURE TILL</span><strong>{registerInput ? `GH₵${registerInput}` : "GH₵—"}</strong></div></div><div className="cedi-market-bag"><ShoppingBasket size={24}/><b>{basketCount}</b></div></div>
        <div className="cedi-market-player"><div className="cedi-market-face merchant"><span>{learnerName.trim()?.[0]?.toUpperCase() || "N"}</span></div><small>MARKET CAPTAIN</small></div>
        {question ? <div className="cedi-market-customer"><div className={`cedi-market-face customer ${avatar}`}><span>{customer[0]?.toUpperCase()}</span></div><div className="cedi-market-bubble"><small>{boss ? "MARKET DAY RUSH" : missionLabels[mission]}</small><strong>{customer}</strong><span>{scene?.wallet ? `Wallet GH₵${scene.wallet}` : "Ready to shop"}</span></div></div> : null}
        <div className="cedi-market-queue" aria-label={`${queuePeople} customers in the visual queue`}>{Array.from({ length: queuePeople }, (_, index) => <i key={index} style={{ opacity: Math.max(.3, 1 - index * .12) }}><span>{fallbackCustomers[(checkpoint + index + 1) % fallbackCustomers.length]?.[0]}</span></i>)}</div>
        <div className="cedi-market-neon"><span>CEDI CITY</span><b>{boss ? "RUSH HOUR" : "OPEN"}</b></div>
      </div>

      {question ? <div className="cedi-market-console">
        <div className="cedi-market-console-head"><div><span>{boss ? "FINAL CHECKOUT · MARKET DAY" : `${missionLabels[mission]} · CUSTOMER ${checkpoint + 1}/${round.questions.length}`}</span><strong>{scene?.cue || "Read the market situation, calculate carefully and key the amount into the till."}</strong></div><Receipt size={23}/></div>
        <h2>{question.prompt}</h2>
        <div className="cedi-market-receipt"><div><span>Customer</span><strong>{customer}</strong></div><div><span>Basket</span><strong>{basketCount} item{basketCount === 1 ? "" : "s"}</strong></div><div><span>Mission</span><strong>{missionLabels[mission].toLowerCase()}</strong></div></div>

        <div className="cedi-market-register-panel">
          <div className={`cedi-market-display ${receiptFlash}`} aria-live="polite"><span>AMOUNT TO PRINT</span><strong><small>GH₵</small>{registerInput || "0"}</strong><i>{receiptFlash === "reject" ? "CHECK CALCULATION" : receiptFlash === "print" ? "RECEIPT SEALED" : "ENTER AMOUNT"}</i></div>
          <div className="cedi-market-keypad" aria-label="Cash register keypad">{keypad.map((key) => <button type="button" key={key} className={key === "C" || key === "⌫" ? "utility" : "digit"} onClick={() => pressRegisterKey(key)} disabled={pulse} aria-label={key === "⌫" ? "Backspace" : key === "C" ? "Clear register" : `Enter ${key}`}>{key}</button>)}</div>
          <div className="cedi-market-tape"><div><Receipt size={15}/><span>LIVE TILL TAPE</span></div>{products.length ? products.slice(0, 3).map((product, index) => <p key={`${product.label}-tape-${index}`}><span>{product.label}</span><b>{product.price}</b></p>) : <p><span>Transaction</span><b>{missionLabels[mission]}</b></p>}<p className="wallet-line"><span>Customer wallet</span><b>{scene?.wallet ? `GH₵${scene.wallet}` : "—"}</b></p><small>Calculate independently. The till validates the transaction, not the correct answer.</small></div>
        </div>

        {scanActive ? <div className="cedi-market-scan"><ScanLine size={15}/><span>Scanner focus: {focusCue}</span></div> : null}
        <div className="cedi-market-actions"><button type="button" className="cedi-market-serve" onClick={serveCustomer} disabled={pulse || !registerInput}><Receipt size={16}/>{pulse ? "Printing receipt…" : "Print & serve"}</button><button type="button" className="cedi-market-scan-button" onClick={scanPrices} disabled={scans < 1 || pulse}><ScanLine size={16}/>Price scan · {scans}</button></div>
        <div className="cedi-market-status" aria-live="polite"><span>{message}</span><small>0–9 keypad · Backspace edit · C clear · S scan · Enter print</small></div>
      </div> : <div className="cedi-market-console cedi-market-finished"><Store size={46}/><strong>MARKET CLOSED · LEDGER READY</strong><span>Uploading every sealed receipt for secure maths review…</span></div>}

      <div className="cedi-market-pressure"><span><Clock size={13}/> Queue pressure</span><i><b style={{ width: `${queuePressure}%` }}/></i><strong>{Math.round(queuePressure)}%</strong></div>
    </div>

    <footer className="cedi-market-footer"><span>Market progress {progress}%</span><span>{plan?.masteryPercent === null || plan?.masteryPercent === undefined ? "Money-maths profile calibrating" : `Recent mastery ${plan.masteryPercent}%`}</span><span>{plan?.supportMode ?? "adaptive"} support</span></footer>
  </section>;
}
