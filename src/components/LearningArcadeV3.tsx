"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Gamepad2, Medal, Play, RefreshCw, Rocket, Sparkles, Trophy, X, Zap } from "lucide-react";
import NovaRunner from "./NovaRunner";
import "./nova-learning-arcade.css";

type AgeBand = "age_4_5" | "age_6_8" | "age_9_11" | "age_12_14" | "age_15_18";
type Child = { id: string; name: string; classId: string | null; class: { name: string; level: string | null } | null };
type Progress = { game: string; rounds: number; xp: number; level: number; accuracy: number | null; badges: string[] };
type Overview = {
  children: Child[];
  selected: Child | null;
  progress: Progress[];
  streak: number;
  recent: Array<{ id: string; game: string; correct: number; stars: number; difficulty: number; xp: number; score: number; roundLength: number }>;
  recommendedAgeBand: AgeBand | null;
  allowedAgeBands: AgeBand[];
};
type Question = { id: string; kind?: string; prompt: string; options: string[]; answer?: string; explanation?: string; correct?: boolean };
type Round = {
  id: string;
  studentId: string;
  game: string;
  difficulty: number;
  status: string;
  answers: string[];
  correct: number | null;
  xp: number;
  stars: number;
  ageBand: AgeBand | null;
  roundLength: number;
  score: number | null;
  questions: Question[];
};
type Leaderboard = { rows: Array<{ rank: number; studentId: string; displayName: string; bestScore: number; totalXp: number; rounds: number }> };

const ageLabels: Record<AgeBand, string> = {
  age_4_5: "Age 4–5", age_6_8: "Age 6–8", age_9_11: "Age 9–11", age_12_14: "Age 12–14", age_15_18: "Age 15–18",
};

async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.error ?? "Could not connect to the Learning Arcade.");
  return data;
}

export default function LearningArcadeV3() {
  const [data, setData] = useState<Overview | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [result, setResult] = useState<Round | null>(null);
  const [ageBand, setAgeBand] = useState<AgeBand | "">("");
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useRef(0);
  const operation = useRef(false);

  const refresh = async (studentId = "") => {
    const version = ++request.current;
    setLoading(true); setError("");
    try {
      const next = await api(`/api/guardian/arcade?studentId=${encodeURIComponent(studentId)}`) as Overview;
      if (version !== request.current) return;
      setData(next);
      setAgeBand(next.recommendedAgeBand ?? next.allowedAgeBands[0] ?? "");
    } catch (loadError) {
      if (version === request.current) setError(loadError instanceof Error ? loadError.message : "Could not load the Learning Arcade.");
    } finally { if (version === request.current) setLoading(false); }
  };

  useEffect(() => { void refresh(); return () => { request.current += 1; }; }, []);

  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The mission could not be updated."); }
    finally { operation.current = false; setBusy(false); }
  };

  const startRunner = () => run(async () => {
    if (!data?.selected || !ageBand) return;
    // Phase-one compatibility: Nova Runner consumes the proven adaptive mathematics
    // content pack while the old game UI remains retired. A later migration gives the
    // new game its own historical key after production gameplay has been validated.
    const next = await api("/api/guardian/arcade", { action: "start", studentId: data.selected.id, game: "math", ageBand, roundLength: 5 }) as Round;
    setRound(next); setResult(null); setLeaderboard(null);
  });

  const finishRunner = (answers: string[]) => run(async () => {
    if (!round) return;
    const completed = await api("/api/guardian/arcade", { action: "save", roundId: round.id, answers, finish: true }) as Round;
    setRound(null); setResult(completed); setMessage(`Mission complete — ${completed.xp} XP earned.`);
    await refresh(completed.studentId);
  });

  const exitRunner = (answers: string[]) => run(async () => {
    if (!round) return;
    await api("/api/guardian/arcade", { action: "save", roundId: round.id, answers, finish: false });
    const studentId = round.studentId;
    setRound(null); setMessage("Mission saved. Nova Runner will resume from your next Knowledge Gate.");
    await refresh(studentId);
  });

  const loadLeaderboard = () => run(async () => {
    if (!data?.selected || !ageBand) return;
    const params = new URLSearchParams({ view: "leaderboard", studentId: data.selected.id, game: "math", scope: "standard", period: "weekly", ageBand });
    setLeaderboard(await api(`/api/guardian/arcade?${params.toString()}`) as Leaderboard);
  });

  const selectedProgress = useMemo(() => data?.progress.find((item) => item.game === "math"), [data?.progress]);
  const totalXp = useMemo(() => data?.progress.reduce((sum, item) => sum + item.xp, 0) ?? 0, [data?.progress]);
  const novaCoins = Math.floor(totalXp / 10) + (data?.recent.reduce((sum, item) => sum + item.stars * 2, 0) ?? 0);

  if (round && data?.selected) return <div className="nova-arcade"><NovaRunner learnerName={data.selected.name} round={round} onComplete={(answers) => void finishRunner(answers)} onExit={(answers) => void exitRunner(answers)}/>{busy ? <div className="nova-arcade-message">Saving mission progress…</div> : null}{error ? <div className="nova-arcade-alert" role="alert">{error}</div> : null}</div>;

  if (result) return <div className="nova-finish">
    <section className="nova-finish-card">
      <div className="nova-finish-top"><div className="nova-finish-mark"><Trophy size={34}/></div><span className="nova-arcade-kicker">NOVA RUNNER · MISSION COMPLETE</span><h1>{result.stars === 3 ? "Legendary run!" : result.stars === 2 ? "Strong mission!" : "World cleared!"}</h1><p>{result.correct}/{result.roundLength} Knowledge Gates cleared correctly. The next mission will adjust to this performance.</p><div className="nova-rewards"><div><strong>{result.stars}/3</strong><span>Stars</span></div><div><strong>+{result.xp}</strong><span>XP</span></div><div><strong>{result.score ?? 0}</strong><span>Score</span></div></div></div>
      <div className="nova-result-list">{result.questions.map((question, index) => <div className={`nova-result ${question.correct ? "good" : "bad"}`} key={question.id}><div className="nova-result-icon">{question.correct ? <Check size={18}/> : <X size={18}/>}</div><div><p>{question.prompt}</p><small>{question.correct ? `Correct — ${result.answers[index]}` : `You chose ${result.answers[index] || "—"}. Answer: ${question.answer ?? "—"}. ${question.explanation ?? ""}`}</small></div></div>)}</div>
      <div className="nova-finish-actions"><button type="button" onClick={() => { setResult(null); void startRunner(); }} disabled={busy}><RefreshCw size={16}/> Play a different mission</button><button type="button" onClick={() => setResult(null)}>Back to Arcade</button></div>
    </section>
  </div>;

  return <div className="nova-arcade">
    <section className="nova-arcade-hero">
      <div className="nova-arcade-hero-copy"><span className="nova-arcade-kicker"><Sparkles size={13}/> SUKUUNOVA LEARNING ARCADE</span><h1>Learn inside the adventure.</h1><p>This is the new game foundation: movement, missions, rewards and adaptive school learning inside the gameplay itself—not a quiz dressed up as a game.</p></div>
      <div className="nova-arcade-hero-card"><div className="nova-arcade-avatar">{data?.selected?.name?.trim()?.[0]?.toUpperCase() ?? "N"}</div><div><small>PLAYER</small><strong>{data?.selected?.name ?? (loading ? "Loading learner…" : "Choose a learner")}</strong><div className="nova-arcade-stat-grid"><div><b>{selectedProgress?.level ?? 1}</b><span>Runner level</span></div><div><b>{data?.streak ?? 0}</b><span>Day streak</span></div><div><b>{novaCoins}</b><span>Nova coins</span></div></div></div></div>
    </section>

    {error ? <div className="nova-arcade-alert" role="alert">{error}</div> : null}
    {message ? <div className="nova-arcade-message">{message}</div> : null}

    <div className="nova-arcade-toolbar"><div><h2>Choose your mission</h2><p>Only experiences that meet the new game standard appear as playable.</p></div>{data?.children?.length ? <select className="nova-arcade-select" aria-label="Learner" value={data.selected?.id ?? ""} onChange={(event) => void refresh(event.target.value)} disabled={loading || busy}>{data.children.map((child) => <option key={child.id} value={child.id}>{child.name} · {child.class?.name ?? "No class"}</option>)}</select> : null}</div>

    <div className="nova-game-grid">
      <article className="nova-game-card primary"><div className="nova-game-logo">NR</div><h3>Nova Runner</h3><p>Race through an original sci-fi world. Jump hazards, collect Nova energy and enter Knowledge Gates where the mathematics changes with the learner’s level and recent play.</p><div className="nova-game-tags"><span>Mathematics</span><span>Adaptive</span><span>Runner</span><span>Keyboard + touch</span><span>5–10 min</span></div><div className="nova-game-actions"><button className="nova-play-button" type="button" onClick={() => void startRunner()} disabled={busy || loading || !data?.selected || !ageBand}><Play size={17} fill="currentColor"/>{busy ? "Preparing world…" : selectedProgress?.rounds ? "Continue Nova Runner" : "Play Nova Runner"}</button><button className="nova-rank-button" type="button" onClick={() => void loadLeaderboard()} disabled={busy || !data?.selected || !ageBand}><Medal size={16}/>Weekly ranking</button></div>{data?.allowedAgeBands?.length ? <div className="nova-game-actions"><label htmlFor="nova-age" style={{ fontSize: 12, color: "#bdd0eb", fontWeight: 800 }}>Learning band</label><select id="nova-age" className="nova-arcade-select" value={ageBand} onChange={(event) => setAgeBand(event.target.value as AgeBand)}>{data.allowedAgeBands.map((age) => <option key={age} value={age}>{ageLabels[age]}</option>)}</select></div> : null}</article>
      <article className="nova-game-card"><span className="nova-coming">IN PRODUCTION</span><div className="nova-game-logo" style={{ width: 58, height: 58, fontSize: 21 }}>TT</div><h3>TurboType</h3><p>Typing becomes a speed adventure with accuracy-based routes, troublesome-key training and racing missions.</p><div className="nova-game-ghost" aria-hidden="true"/></article>
      <article className="nova-game-card"><span className="nova-coming">IN PRODUCTION</span><div className="nova-game-logo" style={{ width: 58, height: 58, fontSize: 21 }}>AD</div><h3>AstroLab Defender</h3><p>Science decisions power shields, repair systems and defend a living space laboratory.</p><div className="nova-game-ghost" aria-hidden="true"/></article>
    </div>

    {leaderboard ? <section className="nova-arcade-panel"><div className="nova-arcade-panel-head"><div><h3>Nova Runner · Weekly school-standard ranking</h3><p>Ranking stays inside the learner’s permitted school context.</p></div><Trophy size={22}/></div><div className="nova-leaderboard">{leaderboard.rows.length ? leaderboard.rows.map((row) => <div className="nova-leader-row" key={row.studentId}><b>#{row.rank}</b><strong>{row.displayName}</strong><span>{row.bestScore} best</span><span>{row.totalXp} XP · {row.rounds} runs</span></div>) : <div className="nova-empty">No ranked missions yet. Be the first to run this week.</div>}</div></section> : null}

    <section className="nova-arcade-panel"><div className="nova-arcade-panel-head"><div><h3>What changed</h3><p>The legacy game cards are no longer the player experience. Nova Runner is the first game on the replacement runtime.</p></div><Gamepad2 size={22}/></div><div className="nova-game-tags"><span><Rocket size={12}/> real-time game loop</span><span><Zap size={12}/> adaptive difficulty</span><span>recent-question variation</span><span>touch + keyboard</span><span>save/resume</span><span>school-scoped ranking</span><span>reduced motion</span></div></section>
  </div>;
}
