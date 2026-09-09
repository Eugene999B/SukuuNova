"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArcadePhysicsChoice, ArcadePhysicsOrder, ArcadePhysicsTyped } from "./ArcadePhysicsControls";
import { ArcadePhysicsGrid, ArcadePhysicsMap, ArcadePhysicsMemory, ArcadePhysicsSimulation } from "./ArcadeWorldControls";

type AgeBand = "age_4_5" | "age_6_8" | "age_9_11" | "age_12_14" | "age_15_18";
type ArcadeQuestionKind =
  | "choice" | "match" | "sort" | "classify" | "path" | "build" | "typed"
  | "choice_plus" | "match_plus" | "sort_plus" | "grid" | "map" | "memory" | "simulation";
type ArcadeScene = { boardTitle?: string; x?: number; y?: number; cells?: string[]; meterLabels?: string[]; cue?: string };
type Child = { id: string; name: string; classId: string | null; class: { name: string; level: string | null } | null };
type Progress = { game: string; rounds: number; xp: number; level: number; accuracy: number | null; badges: string[] };
type CatalogGame = {
  gameKey: string; name: string; category: string; subject: string; description: string; symbol: string; engine: string;
  ageBands: AgeBand[]; standardBands: string[]; difficultyMin: number; difficultyMax: number; roundLengths: number[]; defaultRoundLength: number;
  timerPolicy: string; timedChallengesEnabled: boolean; live: boolean; enabled: boolean; eligible: boolean; dailyGuidanceRounds: number | null; curriculumTags: string[];
};
type Overview = {
  children: Child[]; selected: Child | null; progress: Progress[]; streak: number;
  recent: Array<{ id: string; game: string; correct: number; stars: number; difficulty: number; xp: number; score: number; roundLength: number }>;
  catalog: CatalogGame[]; standardBand: string | null; recommendedAgeBand: AgeBand | null; allowedAgeBands: AgeBand[];
};
type ArcadeQuestion = {
  id: string; kind: ArcadeQuestionKind; prompt: string; options: string[]; scene?: ArcadeScene; answer?: string; explanation?: string; correct?: boolean;
};
type Round = {
  id: string; studentId: string; game: string; difficulty: number; status: string; answers: string[]; correct: number | null; xp: number; stars: number;
  ageBand: AgeBand | null; standardBand: string | null; engine: string; roundLength: number; score: number | null; challengeMode: boolean; questions: ArcadeQuestion[];
};
type Leaderboard = {
  game: string; scope: string; period: string; standardBand: string; ageBand: AgeBand;
  rows: Array<{ rank: number; studentId: string; displayName: string; bestScore: number; totalXp: number; rounds: number }>;
};

const ageLabels: Record<AgeBand, string> = {
  age_4_5: "Age 4–5", age_6_8: "Age 6–8", age_9_11: "Age 9–11", age_12_14: "Age 12–14", age_15_18: "Age 15–18",
};
const standardLabels: Record<string, string> = { kg: "KG", basic_1_3: "Basic 1–3", basic_4_6: "Basic 4–6", jhs: "JHS", shs: "SHS" };
const engineLabel = (value: string) => value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

function displayAnswer(value: string | undefined, kind: ArcadeQuestionKind) {
  if (!value) return "—";
  if (kind !== "sort" && kind !== "build" && kind !== "sort_plus") return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join(" → ") : value;
  } catch {
    return value;
  }
}
async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.error ?? "Could not connect. Your saved progress is safe.");
  return data;
}

export default function LearningArcade() {
  const [data, setData] = useState<Overview | null>(null), [round, setRound] = useState<Round | null>(null);
  const [answers, setAnswers] = useState<string[]>([]), [index, setIndex] = useState(0), [easier, setEasier] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [dirty, setDirty] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [ageBand, setAgeBand] = useState<AgeBand | "">(""), [category, setCategory] = useState("All");
  const [leaderGame, setLeaderGame] = useState<string | null>(null), [leaderScope, setLeaderScope] = useState("standard"), [leaderPeriod, setLeaderPeriod] = useState("weekly");
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null), [leaderLoading, setLeaderLoading] = useState(false);
  const operation = useRef(false), version = useRef(0), heading = useRef<HTMLHeadingElement>(null);

  const refresh = async (studentId = "") => {
    const request = ++version.current; setLoading(true); setError(""); setLeaderGame(null); setLeaderboard(null);
    try {
      const next: Overview = await api("/api/guardian/arcade?studentId=" + encodeURIComponent(studentId));
      if (request === version.current) { setData(next); setAgeBand(next.recommendedAgeBand ?? next.allowedAgeBands[0] ?? ""); setCategory("All"); }
    } catch (loadError) {
      if (request === version.current) setError(loadError instanceof Error ? loadError.message : "Could not load progress.");
    } finally { if (request === version.current) setLoading(false); }
  };
  useEffect(() => {
    void refresh();
    const currentVersion = version.current;
    return () => { if (version.current === currentVersion) version.current++; };
  }, []);
  useEffect(() => { heading.current?.focus(); }, [index, round?.id, round?.status]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!leaderGame || !data?.selected || !ageBand) return;
    let cancelled = false; setLeaderLoading(true); setError("");
    const query = new URLSearchParams({ view: "leaderboard", studentId: data.selected.id, game: leaderGame, scope: leaderScope, period: leaderPeriod, ageBand });
    void api("/api/guardian/arcade?" + query.toString()).then((next: Leaderboard) => { if (!cancelled) setLeaderboard(next); }).catch((leaderError) => {
      if (!cancelled) setError(leaderError instanceof Error ? leaderError.message : "Could not load leaderboard.");
    }).finally(() => { if (!cancelled) setLeaderLoading(false); });
    return () => { cancelled = true; };
  }, [leaderGame, leaderScope, leaderPeriod, data?.selected?.id, ageBand]);

  const run = async (action: () => Promise<void>) => {
    if (operation.current) return; operation.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Could not save. Please try again."); }
    finally { operation.current = false; setBusy(false); }
  };
  const open = async (body: unknown) => run(async () => {
    const next: Round = await api("/api/guardian/arcade", body); setRound(next); setAnswers(next.answers); setIndex(0); setDirty(false); setLeaderGame(null); setLeaderboard(null);
  });
  const save = async (finish: boolean, close = false) => run(async () => {
    if (!round) return;
    const next: Round = await api("/api/guardian/arcade", { action: "save", roundId: round.id, answers, finish });
    setRound(close ? null : next); setDirty(false); setMessage(finish ? "Round complete. Take your time to explore the answers." : "Progress saved. You can come back whenever you like.");
    if (finish || close) await refresh(round.studentId);
  });
  const back = () => { if (round?.status === "in_progress") void save(false, true); else { setRound(null); setMessage(""); } };
  const question = round?.questions[index], complete = round?.status === "completed";
  const choose = (value: string) => { setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? value : answer)); setDirty(true); setMessage(""); };
  const selectedName = data?.children.find((child) => child.id === round?.studentId)?.name ?? data?.selected?.name ?? "";
  const catalogName = (key: string) => data?.catalog.find((item) => item.gameKey === key)?.name ?? key;
  const categories = useMemo(() => ["All", ...Array.from(new Set((data?.catalog ?? []).map((item) => item.category))).sort()], [data?.catalog]);
  const visibleGames = useMemo(() => {
    if (!data?.catalog || !ageBand) return [];
    return data.catalog.filter((item) => (category === "All" || item.category === category) && item.ageBands.includes(ageBand) && (!data.standardBand || item.standardBands.includes(data.standardBand)));
  }, [data?.catalog, data?.standardBand, ageBand, category]);
  const leaderDefinition = data?.catalog.find((item) => item.gameKey === leaderGame);
  const unfinished = answers.some((answer) => !answer.trim());

  const renderQuestion = (item: ArcadeQuestion) => {
    if (item.kind === "sort" || item.kind === "build" || item.kind === "sort_plus") return <ArcadePhysicsOrder items={item.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} mode={item.kind === "build" ? "build" : "sort"} />;
    if (item.kind === "typed") return <ArcadePhysicsTyped value={answers[index] ?? ""} onChange={choose} disabled={busy} label={round?.engine === "typed_response" ? "Type exactly what the task asks for" : "Type your answer"} />;
    if (item.kind === "grid") return <ArcadePhysicsGrid options={item.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} scene={item.scene} />;
    if (item.kind === "map") return <ArcadePhysicsMap options={item.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} scene={item.scene} />;
    if (item.kind === "memory") return <ArcadePhysicsMemory options={item.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} scene={item.scene} />;
    if (item.kind === "simulation") return <ArcadePhysicsSimulation options={item.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} scene={item.scene} />;
    if (item.kind === "path") return <ArcadePhysicsChoice options={item.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} variant="path" hint="Choose the route or door that solves the challenge." />;
    if (item.kind === "match" || item.kind === "match_plus") return <ArcadePhysicsChoice options={item.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} variant="match" hint="Find the best match." />;
    if (item.kind === "classify") return <ArcadePhysicsChoice options={item.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} variant="classify" hint="Place this item in the correct group." />;
    return <ArcadePhysicsChoice options={item.options} value={answers[index] ?? ""} onChange={choose} disabled={busy} variant="choice" hint="Choose one answer." />;
  };

  return <div className="arcade">
    <header className="arcade-hero"><div><span className="arcade-kicker">SUKUUNOVA LEARNING UNIVERSE</span><h1>Choose your level. Find a challenge. Keep growing.</h1><p>A 64-game educational catalogue organised by age, school standard and subject—with progress, rewards and fair rankings.</p></div><Link href="/guardian" onClick={(event) => { if (dirty && !window.confirm("Leave without saving your latest answers?")) event.preventDefault(); }}>Family dashboard →</Link></header>
    {error ? <p role="alert" className="arcade-alert">{error}</p> : null}{message ? <p role="status" className="arcade-message">{message}</p> : null}

    {round ? <section className="arcade-panel arcade-round-panel">
      <div className="arcade-row"><button disabled={busy} onClick={back}>← {complete ? "Back to games" : "Save & return to games"}</button><span>{selectedName} · {catalogName(round.game)} · Difficulty {round.difficulty} · {round.roundLength} tasks</span></div>
      {complete ? <><div className="arcade-complete-burst" aria-hidden="true"><span>★</span><span>★</span><span>★</span></div><h2 ref={heading} tabIndex={-1}>Round complete.</h2><p className="arcade-result">{round.correct}/{round.roundLength} correct · {round.xp} XP · {round.stars}/3 stars</p><p>{round.score ? `Leaderboard score ${round.score.toLocaleString()} · ` : ""}Practice results stay separate from official school marks.</p><div className="arcade-feedback">{round.questions.map((item, answerIndex) => <article key={item.id} data-correct={item.correct === true ? "true" : "false"}><span className="arcade-kicker">{item.kind.toUpperCase()}</span><h3>{item.prompt}</h3><p>Your answer: <strong>{displayAnswer(round.answers[answerIndex], item.kind)}</strong>{item.correct ? " ✓" : " · Correct answer: " + displayAnswer(item.answer, item.kind)}</p><p>{item.explanation}</p></article>)}</div></>
      : question ? <><p className="arcade-kicker">TASK {index + 1} OF {round.questions.length} · {answers.filter((answer) => answer.trim()).length} ANSWERED · {engineLabel(round.engine)}</p><h2 ref={heading} tabIndex={-1}>{question.prompt}</h2>{renderQuestion(question)}<div className="arcade-row arcade-round-actions"><button disabled={busy || index === 0} onClick={() => setIndex((current) => current - 1)}>Previous</button><button disabled={busy || !dirty} onClick={() => void save(false)}>Save progress</button>{index < round.questions.length - 1 ? <button className="arcade-primary" disabled={busy} onClick={() => setIndex((current) => current + 1)}>Next task →</button> : <button className="arcade-primary" disabled={busy || unfinished} onClick={() => void save(true)}>{busy ? "Saving…" : "Finish round"}</button>}</div><p className="arcade-muted">{round.challengeMode ? "Challenge mode is enabled for this round." : "No timer. You can save and pause at any point."}</p></> : null}
    </section> : <>
      <section className="arcade-panel arcade-row"><label>Choose a child<select disabled={busy || loading} value={data?.selected?.id ?? ""} onChange={(event) => { setData((current) => current ? { ...current, selected: null, progress: [], recent: [] } : current); setMessage(""); void refresh(event.target.value); }}>{data?.children.map((child) => <option key={child.id} value={child.id}>{child.name} · {child.class?.name ?? "Class not set"}</option>)}</select></label><div><strong>{loading ? "…" : data?.streak ?? 0}</strong> learning-day streak<p className="arcade-muted">Breaks are welcome. Come back when you are ready.</p></div></section>
      {loading ? <p role="status">Loading your learning universe…</p> : !data?.selected ? <section className="arcade-panel"><h2>No linked learners yet</h2><p>Ask your school to link an active learner to this guardian account.</p></section> : <>
        <section className="arcade-panel arcade-controls"><div><span className="arcade-kicker">LEARNER PROFILE</span><h2>{data.selected.name}</h2><p>{data.selected.class?.name ?? "Class not set"} · {standardLabels[data.standardBand ?? ""] ?? data.standardBand ?? "Standard not set"}</p></div><label>Choose age practice band<select value={ageBand} onChange={(event) => { setAgeBand(event.target.value as AgeBand); setLeaderGame(null); setLeaderboard(null); }}>{data.allowedAgeBands.map((age) => <option key={age} value={age}>{ageLabels[age]}{age === data.recommendedAgeBand ? " · recommended" : " · revision"}</option>)}</select></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="arcade-check"><input type="checkbox" checked={easier} onChange={(event) => setEasier(event.target.checked)} /> One step easier when adaptive difficulty allows</label></section>
        <section className="arcade-section-head"><div><span className="arcade-kicker">64-GAME CATALOGUE</span><h2>{category === "All" ? "Games for this learner" : category}</h2><p>{visibleGames.length} suitable games in this view · {data.catalog.filter((item) => item.live && item.enabled).length} learning packs live now</p></div></section>
        <div className="arcade-games">{visibleGames.map((game) => { const progress = data.progress.find((item) => item.game === game.gameKey); const canPlay = game.live && game.enabled && game.eligible; return <article className={`arcade-panel arcade-game-card ${canPlay ? "live" : "planned"}`} key={game.gameKey}><div className="arcade-card-top"><span aria-hidden="true" className="arcade-symbol">{game.symbol}</span><span className="arcade-status">{canPlay ? "LIVE" : game.live && !game.enabled ? "SCHOOL DISABLED" : "COMING SOON"}</span></div><h3>{game.name}</h3><p>{game.description}</p><div className="arcade-tags"><span>{game.category}</span><span>{engineLabel(game.engine)}</span><span>{ageBand ? ageLabels[ageBand] : "Age band"}</span></div>{game.live ? <p className="arcade-muted">Level {progress?.level ?? 1} · {progress?.xp ?? 0} XP · {progress?.rounds ?? 0} rounds · {progress?.accuracy === null || progress?.accuracy === undefined ? "No accuracy yet" : progress.accuracy + "% accuracy"}</p> : <p className="arcade-muted">Learning pack planned on the shared {engineLabel(game.engine)} engine.</p>}<details><summary>Game settings</summary><div className="arcade-settings"><span>Difficulty {game.difficultyMin}–{game.difficultyMax}</span><span>Default {game.defaultRoundLength} tasks</span><span>{game.timerPolicy === "none" ? "No timer" : game.timedChallengesEnabled ? "Timed challenge enabled" : "Timer optional by school"}</span><span>{game.standardBands.map((item) => standardLabels[item] ?? item).join(", ")}</span><span>{game.curriculumTags.join(" · ")}</span></div></details><div className="arcade-card-actions">{canPlay ? <button className="arcade-primary" disabled={busy} onClick={() => void open({ action: "start", studentId: data.selected!.id, game: game.gameKey, ageBand, easier, roundLength: game.defaultRoundLength })}>Play / resume →</button> : <button disabled>{game.live ? "Unavailable" : "Content pack coming"}</button>}{game.live ? <button disabled={busy} onClick={() => { setLeaderGame(game.gameKey); setLeaderScope("standard"); setLeaderPeriod("weekly"); }}>Leaderboard</button> : null}</div></article>; })}</div>
        {leaderGame && leaderDefinition ? <section className="arcade-panel arcade-leaderboard"><div className="arcade-row"><div><span className="arcade-kicker">GAME RANKING</span><h2>{leaderDefinition.name} leaderboard</h2><p>Privacy-safe ranking. Accuracy and suitable difficulty lead; XP breaks ties.</p></div><button onClick={() => { setLeaderGame(null); setLeaderboard(null); }}>Close</button></div><div className="arcade-row arcade-ranking-filters"><label>Ranking group<select value={leaderScope} onChange={(event) => setLeaderScope(event.target.value)}><option value="class">Class</option><option value="standard">Standard</option><option value="age">Age category</option><option value="school">Whole school</option></select></label><label>Period<select value={leaderPeriod} onChange={(event) => setLeaderPeriod(event.target.value)}><option value="weekly">This week</option><option value="monthly">This month</option><option value="all">All time</option></select></label></div>{leaderLoading ? <p role="status">Calculating ranking…</p> : leaderboard?.rows.length ? <ol className="arcade-ranking">{leaderboard.rows.map((row) => <li key={row.studentId} className={row.studentId === data.selected?.id ? "me" : ""}><strong>#{row.rank}</strong><span>{row.displayName}{row.studentId === data.selected?.id ? " · You" : ""}</span><span>{row.bestScore.toLocaleString()} pts</span><small>{row.totalXp} XP · {row.rounds} rounds</small></li>)}</ol> : <p>No completed rounds in this ranking yet. The first learner to finish can set the pace.</p>}</section> : null}
        <section className="arcade-panel"><h2>Parent progress view</h2><p>Age/standard controls suitability. Adaptive difficulty changes the depth of practice inside that suitable band—it does not silently promote a learner into older curriculum content.</p><div className="arcade-feedback">{data.progress.map((progress) => <article key={progress.game}><h3>{catalogName(progress.game)}</h3><p>{progress.accuracy === null ? "No completed rounds yet" : progress.accuracy + "% practice accuracy"}</p><p>{progress.badges.length ? progress.badges.join(" · ") : "Achievements appear as learning progresses."}</p></article>)}</div></section>
        <section className="arcade-panel"><h2>Recent learning</h2>{data.recent.length ? <ul className="arcade-history">{data.recent.map((item) => <li key={item.id}><span>{catalogName(item.game)} · {item.correct}/{item.roundLength} · {item.stars} stars · Difficulty {item.difficulty}</span><button disabled={busy} onClick={() => void open({ action: "view", roundId: item.id })}>View answers</button></li>)}</ul> : <p>Complete a round to see its learning feedback here.</p>}</section>
      </>}
    </>}
    <style>{`
      .arcade{max-width:1180px;margin:auto;display:grid;gap:20px;padding-bottom:32px;color:var(--sn-ink)}.arcade-hero,.arcade-panel{padding:24px;border:1px solid var(--sn-line);border-radius:var(--sn-radius-xl);background:var(--sn-surface)}.arcade-hero{background:linear-gradient(130deg,var(--sn-guardian-tint),var(--sn-surface));display:flex;align-items:center;justify-content:space-between;gap:24px}.arcade h1{font-size:clamp(26px,4vw,42px);line-height:1.1;margin:12px 0}.arcade h2{font-size:24px;line-height:1.35}.arcade h3{margin:12px 0 6px}.arcade p{line-height:1.6}.arcade-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--sn-guardian-accent)}.arcade a{color:var(--sn-guardian-accent)}.arcade-muted{color:var(--sn-muted);font-size:13px}.arcade-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.arcade-controls{display:grid;grid-template-columns:2fr repeat(3,minmax(150px,1fr));align-items:end;gap:16px}.arcade-games{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.arcade-feedback{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.arcade-feedback article{padding:16px;background:var(--sn-surface-2);border:2px solid var(--sn-line);border-radius:12px;overflow-wrap:anywhere}.arcade-feedback article[data-correct="true"]{border-color:var(--color-success)}.arcade-feedback article[data-correct="false"]{border-color:var(--color-danger)}.arcade-game-card{display:flex;flex-direction:column;transform:translate3d(0,0,0);transition:transform 220ms cubic-bezier(.2,.8,.2,1.2),box-shadow 220ms ease,border-color 180ms ease}.arcade-game-card.live:hover{transform:translate3d(0,-5px,0);box-shadow:0 8px 0 var(--sn-line);border-color:var(--sn-guardian-accent)}.arcade-game-card.planned{background:var(--sn-surface-2)}.arcade-card-top,.arcade-card-actions,.arcade-tags{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.arcade-card-top{justify-content:space-between}.arcade-card-actions{margin-top:auto;padding-top:14px}.arcade-tags span,.arcade-status{font-size:10px;font-weight:800;padding:5px 8px;border-radius:999px;border:1px solid var(--sn-line);background:var(--sn-surface-2)}.arcade-symbol{display:grid;place-items:center;width:56px;height:56px;font-size:24px;border-radius:16px;background:var(--sn-guardian-tint);color:var(--sn-guardian-accent);overflow:hidden;transition:transform 220ms cubic-bezier(.2,.8,.2,1.4)}.arcade-game-card.live:hover .arcade-symbol{transform:rotate(-5deg) scale(1.08)}.arcade button,.arcade select{font:inherit;min-height:44px;padding:10px 16px;border-radius:10px;border:1px solid var(--sn-line);background:var(--sn-surface-2);color:var(--sn-ink)}.arcade button{cursor:pointer;transition:transform 120ms ease}.arcade button:active:not(:disabled){transform:translateY(1px) scale(.985)}.arcade button:disabled{opacity:.55;cursor:not-allowed}.arcade .arcade-primary{background:var(--sn-guardian-accent);color:var(--color-surface);font-weight:700}.arcade select{display:block;margin-top:6px;max-width:100%}.arcade label{font-size:14px}.arcade-check{display:flex;gap:8px;align-items:center;padding-bottom:10px}.arcade-check input{width:18px;height:18px}.arcade details{margin-top:10px}.arcade summary{cursor:pointer;font-weight:700;font-size:12px}.arcade-settings{display:grid;gap:5px;margin-top:8px;font-size:11px;color:var(--sn-muted)}.arcade-section-head{display:flex;justify-content:space-between;align-items:end}.arcade-section-head h2{margin:6px 0}.arcade-section-head p{margin:0;color:var(--sn-muted)}.arcade-leaderboard{scroll-margin-top:20px}.arcade-ranking-filters{justify-content:flex-start;margin:14px 0}.arcade-ranking{list-style:none;padding:0;margin:14px 0 0;display:grid;gap:7px}.arcade-ranking li{display:grid;grid-template-columns:50px minmax(120px,1fr) 110px 150px;gap:12px;align-items:center;padding:12px;border:1px solid var(--sn-line);border-radius:12px}.arcade-ranking li.me{background:var(--sn-guardian-tint);border-color:var(--sn-guardian-accent)}.arcade-ranking small{color:var(--sn-muted)}.arcade :focus-visible{outline:3px solid var(--sn-guardian-accent);outline-offset:3px}.arcade-result{font-size:24px;font-weight:800}.arcade-alert{color:var(--color-danger)}.arcade-message{color:var(--color-success)}.arcade-alert,.arcade-message{padding:14px;background:var(--sn-surface);border:1px solid var(--sn-line);border-radius:12px}.arcade-history{list-style:none;padding:0}.arcade-history li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--sn-line)}.arcade-round-panel{position:relative;overflow:hidden}.arcade-round-actions{margin-top:20px}.arcade-complete-burst{display:flex;gap:10px;margin:22px 0 4px;font-size:30px;color:var(--sn-guardian-accent)}.arcade-complete-burst span{display:inline-block;animation:arcade-star-pop 520ms cubic-bezier(.2,1.5,.3,1) both}.arcade-complete-burst span:nth-child(2){animation-delay:90ms}.arcade-complete-burst span:nth-child(3){animation-delay:180ms}@keyframes arcade-star-pop{0%{transform:translateY(18px) scale(.2) rotate(-18deg);opacity:0}65%{transform:translateY(-5px) scale(1.18) rotate(8deg);opacity:1}100%{transform:translateY(0) scale(1) rotate(0);opacity:1}}
      @media(max-width:900px){.arcade-controls{grid-template-columns:1fr 1fr}.arcade-games,.arcade-feedback{grid-template-columns:repeat(2,minmax(0,1fr))}.arcade-ranking li{grid-template-columns:45px 1fr 100px}.arcade-ranking small{grid-column:2/-1}}
      @media(max-width:650px){.arcade-games,.arcade-feedback,.arcade-controls{grid-template-columns:1fr}.arcade-hero{display:block}.arcade-panel,.arcade-hero{padding:18px}.arcade-history li{align-items:flex-start;flex-direction:column}.arcade-ranking li{grid-template-columns:40px 1fr}.arcade-ranking li>span:nth-of-type(2),.arcade-ranking small{grid-column:2}.arcade-card-actions button{flex:1}.arcade-round-actions button{flex:1}}
      @media(prefers-reduced-motion:reduce){.arcade-game-card,.arcade-symbol,.arcade button{transition:none}.arcade-game-card.live:hover,.arcade-game-card.live:hover .arcade-symbol,.arcade button:active:not(:disabled){transform:none}.arcade-complete-burst span{animation:none}}
    `}</style>
  </div>;
}
