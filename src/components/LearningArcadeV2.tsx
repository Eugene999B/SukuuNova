"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Award, BookOpenCheck, CheckCircle2, ChevronRight, Coins, Gamepad2, Gift, Medal, RefreshCw, Rocket, Search, Sparkles, Star, Trophy, WandSparkles, Zap } from "lucide-react";
import { ArcadePhysicsChoice, ArcadePhysicsOrder, ArcadePhysicsTyped } from "./ArcadePhysicsControls";
import { ArcadePhysicsGrid, ArcadePhysicsMap, ArcadePhysicsMemory, ArcadePhysicsSimulation } from "./ArcadeWorldControls";
import ArcadeMotionWorld, { ArcadeWorldLegend } from "./ArcadeMotionWorld";
import ArcadeKineticTyping from "./ArcadeKineticTyping";
import ArcadeMovingChoice from "./ArcadeMovingChoice";
import { chooseVariedArcadeMissions } from "@/lib/arcade-recommendations";
import "./learning-arcade-v3.css";

type AgeBand = "age_4_5" | "age_6_8" | "age_9_11" | "age_12_14" | "age_15_18";
type QuestionKind = "choice" | "match" | "sort" | "classify" | "path" | "build" | "typed" | "choice_plus" | "match_plus" | "sort_plus" | "grid" | "map" | "memory" | "simulation";
type Scene = { boardTitle?: string; x?: number; y?: number; cells?: string[]; meterLabels?: string[]; cue?: string };
type Child = { id: string; name: string; classId: string | null; class: { name: string; level: string | null } | null };
type Progress = { game: string; rounds: number; xp: number; level: number; accuracy: number | null; badges: string[] };
type Game = { gameKey: string; name: string; category: string; subject: string; description: string; symbol: string; engine: string; ageBands: AgeBand[]; standardBands: string[]; difficultyMin: number; difficultyMax: number; roundLengths: number[]; defaultRoundLength: number; timerPolicy: string; timedChallengesEnabled: boolean; live: boolean; enabled: boolean; eligible: boolean; dailyGuidanceRounds: number | null; curriculumTags: string[] };
type Overview = { children: Child[]; selected: Child | null; progress: Progress[]; streak: number; recent: Array<{ id: string; game: string; correct: number; stars: number; difficulty: number; xp: number; score: number; roundLength: number }>; catalog: Game[]; standardBand: string | null; recommendedAgeBand: AgeBand | null; allowedAgeBands: AgeBand[] };
type Question = { id: string; kind: QuestionKind; prompt: string; options: string[]; scene?: Scene; answer?: string; explanation?: string; correct?: boolean };
type Round = { id: string; studentId: string; game: string; difficulty: number; status: string; answers: string[]; correct: number | null; xp: number; stars: number; ageBand: AgeBand | null; standardBand: string | null; engine: string; roundLength: number; score: number | null; challengeMode: boolean; questions: Question[] };
type Leaderboard = { game: string; scope: string; period: string; standardBand: string; ageBand: AgeBand; rows: Array<{ rank: number; studentId: string; displayName: string; bestScore: number; totalXp: number; rounds: number }> };

const ageLabels: Record<AgeBand, string> = { age_4_5: "Age 4–5", age_6_8: "Age 6–8", age_9_11: "Age 9–11", age_12_14: "Age 12–14", age_15_18: "Age 15–18" };
const standardLabels: Record<string, string> = { kg: "KG", basic_1_3: "Basic 1–3", basic_4_6: "Basic 4–6", jhs: "JHS", shs: "SHS" };
const engineLabel = (value: string) => value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
const gameInitials = (name: string) => name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();

async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.error ?? "Could not connect to the Learning Arcade.");
  return data;
}

function displayAnswer(value: string | undefined, kind: QuestionKind) {
  if (!value) return "—";
  if (!["sort", "build", "sort_plus"].includes(kind)) return value;
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.join(" → ") : value; }
  catch { return value; }
}

export default function LearningArcadeV2() {
  const [data, setData] = useState<Overview | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [ageBand, setAgeBand] = useState<AgeBand | "">("");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [easier, setEasier] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [leaderGame, setLeaderGame] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const operation = useRef(false);
  const request = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  const refresh = async (studentId = "") => {
    const version = ++request.current;
    setLoading(true); setError("");
    try {
      const next = await api(`/api/guardian/arcade?studentId=${encodeURIComponent(studentId)}`) as Overview;
      if (version === request.current) {
        setData(next);
        setAgeBand(next.recommendedAgeBand ?? next.allowedAgeBands[0] ?? "");
        setCategory("All"); setQuery("");
      }
    } catch (loadError) {
      if (version === request.current) setError(loadError instanceof Error ? loadError.message : "Could not load the Learning Arcade.");
    } finally { if (version === request.current) setLoading(false); }
  };

  useEffect(() => { void refresh(); return () => { request.current += 1; }; }, []);
  useEffect(() => { heading.current?.focus(); }, [index, round?.id, round?.status]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Could not save your progress."); }
    finally { operation.current = false; setBusy(false); }
  };

  const open = async (body: unknown) => run(async () => {
    const next = await api("/api/guardian/arcade", body) as Round;
    setRound(next); setAnswers(next.answers); setIndex(0); setDirty(false); setLeaderGame(null); setLeaderboard(null);
  });

  const save = async (finish: boolean, close = false) => run(async () => {
    if (!round) return;
    const next = await api("/api/guardian/arcade", { action: "save", roundId: round.id, answers, finish }) as Round;
    setRound(close ? null : next); setDirty(false);
    setMessage(finish ? `Mission complete — ${next.xp} XP earned.` : "Progress saved. You can continue later.");
    if (finish || close) await refresh(round.studentId);
  });

  const choose = (value: string) => {
    setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? value : answer));
    setDirty(true); setMessage("");
  };
  const back = () => { if (round?.status === "in_progress") void save(false, true); else { setRound(null); setMessage(""); } };

  const totalXp = useMemo(() => data?.progress.reduce((sum, item) => sum + item.xp, 0) ?? 0, [data?.progress]);
  const totalRounds = useMemo(() => data?.progress.reduce((sum, item) => sum + item.rounds, 0) ?? 0, [data?.progress]);
  const novaCoins = Math.floor(totalXp / 10) + (data?.recent.reduce((sum, item) => sum + item.stars * 2, 0) ?? 0);
  const badges = useMemo(() => Array.from(new Set((data?.progress ?? []).flatMap((item) => item.badges))).filter(Boolean), [data?.progress]);
  const categories = useMemo(() => ["All", ...Array.from(new Set((data?.catalog ?? []).map((game) => game.category))).sort()], [data?.catalog]);
  const liveCount = data?.catalog.filter((game) => game.live && game.enabled).length ?? 0;
  const eligible = useMemo(() => {
    if (!data || !ageBand) return [];
    const text = query.trim().toLowerCase();
    return data.catalog.filter((game) => game.live && game.enabled && game.eligible && game.ageBands.includes(ageBand) && (!data.standardBand || game.standardBands.includes(data.standardBand)) && (category === "All" || game.category === category) && (!text || `${game.name} ${game.subject} ${game.category} ${game.description} ${game.curriculumTags.join(" ")}`.toLowerCase().includes(text)));
  }, [data, ageBand, category, query]);
  const missions = useMemo(() => chooseVariedArcadeMissions(eligible, data?.progress ?? [], data?.recent ?? [], 3), [eligible, data?.progress, data?.recent]);

  const current = round?.questions[index];
  const complete = round?.status === "completed";
  const answered = answers.filter((answer) => answer.trim()).length;
  const unfinished = answers.some((answer) => !answer.trim());
  const roundGame = data?.catalog.find((game) => game.gameKey === round?.game);

  const renderQuestion = (question: Question) => {
    if (["sort", "build", "sort_plus"].includes(question.kind)) return <ArcadePhysicsOrder items={question.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} mode={question.kind === "build" ? "build" : "sort"}/>;
    if (question.kind === "typed") {
      if (["keyboard-ninja", "spelling-sprint"].includes(round?.game ?? "")) return <ArcadeKineticTyping value={answers[index] ?? ""} onChange={choose} disabled={busy} ageBand={round?.ageBand ?? null} gameKey={round?.game ?? ""}/>;
      return <ArcadePhysicsTyped value={answers[index] ?? ""} onChange={choose} disabled={busy} label="Type your answer"/>;
    }
    if (question.kind === "grid") return <ArcadePhysicsGrid options={question.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} scene={question.scene}/>;
    if (question.kind === "map") return <ArcadePhysicsMap options={question.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} scene={question.scene}/>;
    if (question.kind === "memory") return <ArcadePhysicsMemory options={question.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} scene={question.scene}/>;
    if (question.kind === "simulation") return <ArcadePhysicsSimulation options={question.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} scene={question.scene}/>;
    if (question.kind === "path") return <ArcadePhysicsChoice options={question.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} variant="path" hint="Choose the route that solves the challenge."/>;
    if (question.kind === "match" || question.kind === "match_plus") return <ArcadePhysicsChoice options={question.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} variant="match" hint="Find the strongest match."/>;
    if (question.kind === "classify") return <ArcadePhysicsChoice options={question.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} variant="classify" hint="Place the item in the correct group."/>;
    if ((question.kind === "choice" || question.kind === "choice_plus") && roundGame) return <ArcadeMovingChoice options={question.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} ageBand={round?.ageBand ?? null} gameKey={roundGame.gameKey} subject={roundGame.subject} rapid={roundGame.engine === "rapid_fire"}/>;
    return <ArcadePhysicsChoice options={question.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} variant="choice" hint="Choose one answer."/>;
  };

  const loadLeaderboard = async (game: Game) => {
    if (!data?.selected || !ageBand) return;
    setLeaderGame(game.gameKey); setLeaderLoading(true); setLeaderboard(null); setError("");
    try {
      const params = new URLSearchParams({ view: "leaderboard", studentId: data.selected.id, game: game.gameKey, scope: "standard", period: "weekly", ageBand });
      setLeaderboard(await api(`/api/guardian/arcade?${params.toString()}`) as Leaderboard);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load ranking."); }
    finally { setLeaderLoading(false); }
  };

  if (round) return <div className="nova3-stage">
    <header className="nova3-stage-top"><button type="button" onClick={back} disabled={busy}><ArrowLeft size={15}/>{complete ? "Back to Playroom" : "Save & leave"}</button><div><span>{roundGame?.name ?? round.game}</span><strong>{data?.selected?.name ?? "Learner"} · Level {round.difficulty} · {round.ageBand ? ageLabels[round.ageBand] : "Adaptive"}</strong></div><div className="nova3-stage-progress"><span>{complete ? round.questions.length : answered}/{round.questions.length}</span><i><b style={{ width: `${round.questions.length ? Math.round((complete ? round.questions.length : answered) / round.questions.length * 100) : 0}%` }}/></i></div></header>
    {error ? <div className="nova3-alert bad" role="alert">{error}</div> : null}
    {complete ? <main className="nova3-finish">
      <div className="nova3-confetti" aria-hidden="true"><Star/><Sparkles/><Trophy/><Star/><Sparkles/><Award/></div><span className="nova3-kicker">MISSION COMPLETE</span><h1 ref={heading} tabIndex={-1}>{round.stars === 3 ? "Brilliant run!" : round.stars === 2 ? "Strong work!" : "Mission cleared!"}</h1><p>{round.correct}/{round.roundLength} correct. Arcade practice builds mastery but never changes official school grades.</p>
      <div className="nova3-reward-row"><div><Trophy size={22}/><strong>{round.stars}/3</strong><span>Stars</span></div><div><Zap size={22}/><strong>+{round.xp}</strong><span>XP</span></div><div><Coins size={22}/><strong>+{Math.floor(round.xp / 10) + round.stars * 2}</strong><span>Nova Coins</span></div></div><button className="nova3-primary" type="button" onClick={back}>Return to Playroom <ArrowRight size={15}/></button>
      <section className="nova3-review"><h2>Mission review</h2>{round.questions.map((question, answerIndex) => <article key={question.id} className={question.correct ? "correct" : "wrong"}><span>{question.correct ? <CheckCircle2 size={15}/> : <RefreshCw size={15}/>}</span><div><strong>{question.prompt}</strong><p>Your answer: <b>{displayAnswer(round.answers[answerIndex], question.kind)}</b>{question.correct ? " · Correct" : ` · Correct answer: ${displayAnswer(question.answer, question.kind)}`}</p>{question.explanation ? <small>{question.explanation}</small> : null}</div></article>)}</section>
    </main> : current ? <main className="nova3-task">
      <ArcadeMotionWorld gameKey={round.game} gameName={roundGame?.name ?? round.game} category={roundGame?.category ?? "Learning"} subject={roundGame?.subject ?? "Learning"} ageBand={round.ageBand} questionIndex={index} questionCount={round.questions.length} answeredCount={answered} hasAnswer={Boolean(answers[index]?.trim())}/>
      <div className="nova3-task-head"><span className="nova3-kicker">TASK {index + 1} OF {round.questions.length} · {engineLabel(round.engine)}</span><h1 ref={heading} tabIndex={-1}>{current.prompt}</h1><p>{roundGame?.description}</p></div><div className="nova3-control">{renderQuestion(current)}</div>
      <footer className="nova3-task-actions"><button type="button" disabled={busy || index === 0} onClick={() => setIndex((currentIndex) => currentIndex - 1)}><ArrowLeft size={14}/>Previous</button><div><button type="button" disabled={busy || !dirty} onClick={() => void save(false)}>Save checkpoint</button>{index < round.questions.length - 1 ? <button className="nova3-primary" type="button" disabled={busy} onClick={() => setIndex((currentIndex) => currentIndex + 1)}>Next challenge<ArrowRight size={14}/></button> : <button className="nova3-primary" type="button" disabled={busy || unfinished} onClick={() => void save(true)}><Rocket size={14}/>{busy ? "Scoring…" : "Finish mission"}</button>}</div></footer>
    </main> : null}
  </div>;

  return <div className="nova3-playroom">
    <section className="nova3-hero"><div className="nova3-hero-copy"><span className="nova3-kicker">SUKUUNOVA NOVA PLAYROOM</span><h1>A whole learning universe that moves with the learner.</h1><p>Animated worlds, adaptive challenge, 64 learning games, safe rewards and age-aware practice across mathematics, literacy, science, geography, computing, logic and life skills.</p><div className="nova3-hero-actions"><Link href="/guardian"><ArrowLeft size={13}/>Family dashboard</Link>{data?.selected ? <button type="button" onClick={() => void refresh(data.selected!.id)} disabled={loading}><RefreshCw size={13}/>Refresh universe</button> : null}</div></div><div className="nova3-hero-machine" aria-hidden="true"><div className="nova3-machine-core"><Gamepad2 size={34}/><strong>{liveCount}</strong><span>LIVE WORLDS</span></div><i className="ring r1"/><i className="ring r2"/><i className="ring r3"/><span className="orb o1">A</span><span className="orb o2">7</span><span className="orb o3">⚡</span><span className="orb o4">01</span></div></section>
    <ArcadeWorldLegend/>
    {error ? <div className="nova3-alert bad" role="alert">{error}</div> : null}{message ? <div className="nova3-alert good" role="status"><Sparkles size={15}/>{message}</div> : null}
    {loading && !data ? <div className="nova3-loading"><Gamepad2 size={30}/><strong>Building your learning universe…</strong></div> : !data?.selected ? <div className="nova3-loading"><Gamepad2 size={30}/><strong>No linked learner is available for play yet.</strong></div> : <>
      <section className="nova3-playerbar"><div className="nova3-player-id"><span>{data.selected.name.slice(0, 2).toUpperCase()}</span><div><b>{data.selected.name}</b><small>{data.selected.class?.name ?? "Class not set"} · {standardLabels[data.standardBand ?? ""] ?? data.standardBand ?? "Standard not set"}</small></div></div><label>Learner<select value={data.selected.id} disabled={busy || loading} onChange={(event) => void refresh(event.target.value)}>{data.children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label><div className="nova3-wallet"><div><Zap size={15}/><strong>{totalXp}</strong><span>XP</span></div><div><Coins size={15}/><strong>{novaCoins}</strong><span>Nova Coins</span></div><div><Trophy size={15}/><strong>{data.streak}</strong><span>Day streak</span></div><div><Medal size={15}/><strong>{badges.length}</strong><span>Badges</span></div></div></section>
      <section className="nova3-mission-zone"><div className="nova3-section-head"><div><span className="nova3-kicker">TODAY’S MISSION DECK</span><h2>Three different worlds chosen for this learner</h2><p>The deck deliberately spreads subjects and interaction engines, gives weak skills sensible support and moves very recent games behind equally suitable fresh worlds.</p></div><span className="nova3-age-chip">{ageBand ? ageLabels[ageBand] : "Adaptive"}</span></div><div className="nova3-missions">{missions.map((game, missionIndex) => <MissionCard key={game.gameKey} game={game} progress={data.progress.find((item) => item.game === game.gameKey)} index={missionIndex} busy={busy} onPlay={() => void open({ action: "start", studentId: data.selected!.id, game: game.gameKey, ageBand, easier, roundLength: game.defaultRoundLength })}/>)}</div></section>
      <section className="nova3-rewards"><div><span className="nova3-kicker">REWARD VAULT</span><h2>Earn through learning, never through chance.</h2><p>Nova Coins have no cash value. Progress, badges and unlocks come from completed educational missions rather than purchases or gambling mechanics.</p></div><div className="nova3-reward-shelf"><Reward icon={<Award/>} name="Explorer Crest" threshold={50} xp={totalXp}/><Reward icon={<WandSparkles/>} name="Spark Trail" threshold={150} xp={totalXp}/><Reward icon={<Gift/>} name="Mystery Badge" threshold={300} xp={totalXp}/><Reward icon={<Trophy/>} name="Master Shelf" threshold={600} xp={totalXp}/></div></section>
      <section className="nova3-library"><div className="nova3-section-head"><div><span className="nova3-kicker">GAME UNIVERSE</span><h2>Choose a field, then enter a world</h2><p>{eligible.length} playable games match the current learner, age band and filters.</p></div></div><div className="nova3-filters"><label><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search maths, language, science, coding…"/></label><select value={ageBand} onChange={(event) => setAgeBand(event.target.value as AgeBand)}>{data.allowedAgeBands.map((age) => <option key={age} value={age}>{ageLabels[age]}{age === data.recommendedAgeBand ? " · recommended" : ""}</option>)}</select><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><label className="nova3-easier"><input type="checkbox" checked={easier} onChange={(event) => setEasier(event.target.checked)}/>Gentler next difficulty</label></div><div className="nova3-games">{eligible.map((game) => <GameCard key={game.gameKey} game={game} progress={data.progress.find((item) => item.game === game.gameKey)} busy={busy} onPlay={() => void open({ action: "start", studentId: data.selected!.id, game: game.gameKey, ageBand, easier, roundLength: game.defaultRoundLength })} onRank={() => void loadLeaderboard(game)}/>)}</div></section>
      {leaderGame ? <section className="nova3-leader"><header><div><span className="nova3-kicker">WEEKLY RANKING</span><h2>{data.catalog.find((game) => game.gameKey === leaderGame)?.name ?? leaderGame}</h2><p>Only learners in a suitable comparison band are ranked together.</p></div><button type="button" onClick={() => { setLeaderGame(null); setLeaderboard(null); }}>Close</button></header>{leaderLoading ? <div className="nova3-loading small">Loading ranking…</div> : leaderboard?.rows.length ? <div className="nova3-ranking">{leaderboard.rows.slice(0, 10).map((row) => <div key={row.studentId}><span>{row.rank}</span><strong>{row.displayName}</strong><small>{row.bestScore.toLocaleString()} score · {row.totalXp} XP · {row.rounds} rounds</small></div>)}</div> : <div className="nova3-loading small">No completed rounds are ranked here yet.</div>}</section> : null}
      <div className="nova3-bottom-grid"><section className="nova3-panel"><div className="nova3-section-head"><div><span className="nova3-kicker">RECENT MISSIONS</span><h2>Progress memory</h2></div></div>{data.recent.length ? <div className="nova3-history">{data.recent.slice(0, 6).map((item) => <button type="button" key={item.id} disabled={busy} onClick={() => void open({ action: "view", roundId: item.id })}><span>{data.catalog.find((game) => game.gameKey === item.game)?.symbol ?? "✦"}</span><div><strong>{data.catalog.find((game) => game.gameKey === item.game)?.name ?? item.game}</strong><small>{item.correct}/{item.roundLength} correct · {item.stars} stars · +{item.xp} XP</small></div><ChevronRight size={14}/></button>)}</div> : <p className="nova3-muted">Finish a mission and its review will stay here.</p>}</section><section className="nova3-panel"><div className="nova3-section-head"><div><span className="nova3-kicker">LEARNING PROFILE</span><h2>{totalRounds} completed missions</h2><p>Badges appear from real Arcade progress, not fabricated scores.</p></div><BookOpenCheck size={20}/></div><div className="nova3-badges">{badges.length ? badges.map((badge) => <span key={badge}><Medal size={13}/>{badge}</span>) : <span><Sparkles size={13}/>First badge is waiting</span>}</div></section></div>
    </>}
  </div>;
}

function MissionCard({ game, progress, index, busy, onPlay }: { game: Game; progress?: Progress; index: number; busy: boolean; onPlay: () => void }) {
  return <article className="nova3-mission"><div className="nova3-mission-rank">0{index + 1}</div><GameLogo game={game}/><div><span>{game.category} · {game.subject}</span><h3>{game.name}</h3><p>{game.description}</p><small>Level {progress?.level ?? 1} · {progress?.accuracy == null ? "New mission" : `${progress.accuracy}% accuracy`} · {engineLabel(game.engine)}</small></div><button type="button" disabled={busy} onClick={onPlay}><Rocket size={14}/>Launch</button></article>;
}
function GameCard({ game, progress, busy, onPlay, onRank }: { game: Game; progress?: Progress; busy: boolean; onPlay: () => void; onRank: () => void }) {
  return <article className="nova3-game"><div className="nova3-game-top"><GameLogo game={game}/><span>{progress?.rounds ? `LV ${progress.level}` : "NEW"}</span></div><h3>{game.name}</h3><p>{game.description}</p><div className="nova3-tags"><span>{game.category}</span><span>{engineLabel(game.engine)}</span></div><div className="nova3-game-stat"><div><strong>{progress?.accuracy == null ? "—" : `${progress.accuracy}%`}</strong><span>accuracy</span></div><div><strong>{progress?.xp ?? 0}</strong><span>XP</span></div><div><strong>{game.defaultRoundLength}</strong><span>tasks</span></div></div><footer><button type="button" className="nova3-primary" disabled={busy} onClick={onPlay}>Play <ArrowRight size={13}/></button><button type="button" disabled={busy} onClick={onRank}><Trophy size={13}/>Rank</button></footer></article>;
}
function GameLogo({ game }: { game: Game }) { return <div className="nova3-logo" title={`${game.name} game logo`}><span>{game.symbol}</span><b>{gameInitials(game.name)}</b><i>{game.engine.split("_")[0].slice(0, 3).toUpperCase()}</i></div>; }
function Reward({ icon, name, threshold, xp }: { icon: React.ReactNode; name: string; threshold: number; xp: number }) { const unlocked = xp >= threshold; return <div className={unlocked ? "unlocked" : "locked"}><i>{icon}</i><strong>{name}</strong><span>{unlocked ? "Unlocked" : `${Math.max(0, threshold - xp)} XP to unlock`}</span></div>; }
