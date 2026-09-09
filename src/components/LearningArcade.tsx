"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const games = [
  { id: "math", name: "Math Sprint", symbol: "+", description: "Build confidence with numbers, multiplication, division and equations." },
  { id: "word", name: "Word Builder", symbol: "Aa", description: "Explore words, meanings and clear sentences." },
  { id: "logic", name: "Logic Lab", symbol: "…", description: "Spot a pattern and work out what comes next." }
];
type Child = { id: string; name: string; class: { name: string; level: string | null } | null };
type Progress = { game: string; rounds: number; xp: number; level: number; accuracy: number | null; badges: string[] };
type Overview = { children: Child[]; selected: Child | null; progress: Progress[]; streak: number; recent: Array<{ id: string; game: string; correct: number; stars: number; difficulty: number }> };
type Round = { id: string; studentId: string; game: string; difficulty: number; status: string; answers: string[]; correct: number | null; xp: number; stars: number; questions: Array<{ id: string; prompt: string; options: string[]; answer?: string; explanation?: string }> };
async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? data.error ?? "Could not connect. Your saved progress is safe.");
  return data;
}
export default function LearningArcade() {
  const [data,setData] = useState<Overview | null>(null), [round,setRound] = useState<Round | null>(null);
  const [answers,setAnswers] = useState<string[]>([]), [index,setIndex] = useState(0), [easier,setEasier] = useState(false);
  const [busy,setBusy] = useState(false), [loading,setLoading] = useState(true), [dirty,setDirty] = useState(false);
  const [error,setError] = useState(""), [message,setMessage] = useState("");
  const operation = useRef(false), version = useRef(0), heading = useRef<HTMLHeadingElement>(null);
  const refresh = async (studentId = "") => {
    const request = ++version.current;setLoading(true);setError("");
    try { const next = await api("/api/guardian/arcade?studentId="+encodeURIComponent(studentId));if(request===version.current)setData(next); }
    catch(error){if(request===version.current)setError(error instanceof Error?error.message:"Could not load progress.");}
    finally{if(request===version.current)setLoading(false);}
  };
  useEffect(()=>{void refresh();return()=>{version.current++;};},[]);
  useEffect(()=>{heading.current?.focus();},[index,round?.id,round?.status]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);
  const run=async(action:()=>Promise<void>)=>{
    if(operation.current)return;operation.current=true;setBusy(true);setError("");setMessage("");
    try{await action();}catch(error){setError(error instanceof Error?error.message:"Could not save. Please try again.");}
    finally{operation.current=false;setBusy(false);}
  };
  const open=async(body:unknown)=>run(async()=>{
    const next=await api("/api/guardian/arcade",body);setRound(next);setAnswers(next.answers);setIndex(0);setDirty(false);
  });
  const save=async(finish:boolean,close=false)=>run(async()=>{
    if(!round)return;
    const next:Round=await api("/api/guardian/arcade",{action:"save",roundId:round.id,answers,finish});
    setRound(close?null:next);setDirty(false);setMessage(finish?"Round complete. Take your time to explore the answers.":"Progress saved. You can come back whenever you like.");
    if(finish||close)await refresh(round.studentId);
  });
  const back=()=>{if(round?.status==="in_progress"){void save(false,true);}else{setRound(null);setMessage("");}};
  const question=round?.questions[index], complete=round?.status==="completed";
  const selectedName=data?.children.find(child=>child.id===round?.studentId)?.name??data?.selected?.name??"";
  return <div className="arcade">
    <header className="arcade-hero"><div><span className="arcade-kicker">SUKUUNOVA LEARNING ARCADE</span><h1>A little curiosity goes a long way.</h1><p>Five questions at your pace. Try, think, discover—and keep growing.</p></div><Link href="/guardian" onClick={event=>{if(dirty&&!window.confirm("Leave without saving your latest answers?"))event.preventDefault();}}>Family dashboard →</Link></header>
    {error&&<p role="alert" className="arcade-alert">{error}</p>}{message&&<p role="status" className="arcade-message">{message}</p>}
    {round?<section className="arcade-panel">
      <div className="arcade-row"><button disabled={busy} onClick={back}>← {complete?"Back to games":"Save & return to games"}</button><span>{selectedName} · {games.find(game=>game.id===round.game)?.name} · Difficulty {round.difficulty}/4</span></div>
      {complete?<><h2 ref={heading} tabIndex={-1}>You explored all five questions.</h2><p className="arcade-result">{round.correct}/5 correct · {round.xp} XP · {round.stars}/3 stars</p><p>Practice helps ideas stick. These results are separate from school marks.</p><div className="arcade-feedback">{round.questions.map((item,i)=><article key={item.id}><h3>{item.prompt}</h3><p>Your answer: <strong>{round.answers[i]}</strong>{round.answers[i]===item.answer?" ✓":" · Correct answer: "+item.answer}</p><p>{item.explanation}</p></article>)}</div></>:question?<><p className="arcade-kicker">QUESTION {index+1} OF 5 · {answers.filter(Boolean).length} ANSWERED</p><h2 ref={heading} tabIndex={-1}>{question.prompt}</h2><fieldset className="arcade-options" disabled={busy}><legend>Choose one answer</legend>{question.options.map(option=><label key={option} className={answers[index]===option?"chosen":""}><input type="radio" name={"question-"+question.id} checked={answers[index]===option} onChange={()=>{setAnswers(current=>current.map((value,i)=>i===index?option:value));setDirty(true);setMessage("");}}/>{option}</label>)}</fieldset><div className="arcade-row"><button disabled={busy||index===0} onClick={()=>setIndex(current=>current-1)}>Previous</button><button disabled={busy||!dirty} onClick={()=>void save(false)}>Save progress</button>{index<4?<button className="arcade-primary" disabled={busy} onClick={()=>setIndex(current=>current+1)}>Next question →</button>:<button className="arcade-primary" disabled={busy||answers.some(answer=>!answer)} onClick={()=>void save(true)}>{busy?"Saving…":"Finish round"}</button>}</div><p className="arcade-muted">No timer. You can save and pause at any point.</p></>:null}
    </section>:<>
      <section className="arcade-panel arcade-row"><label>Choose a child<select disabled={busy||loading} value={data?.selected?.id??""} onChange={event=>{setData(current=>current?{...current,selected:null,progress:[],recent:[]}:current);setMessage("");void refresh(event.target.value);}}>{data?.children.map(child=><option key={child.id} value={child.id}>{child.name} · {child.class?.name??"Class not set"}</option>)}</select></label><div><strong>{loading?"…":data?.streak??0}</strong> learning-day streak<p className="arcade-muted">Breaks are welcome. Come back when you are ready.</p></div></section>
      {loading?<p role="status">Loading your learning space…</p>:!data?.selected?<section className="arcade-panel"><h2>No linked learners yet</h2><p>Ask your school to link an active learner to this guardian account.</p></section>:<>
        <div className="arcade-row"><h2>{data.selected.name}'s games</h2><label><input type="checkbox" checked={easier} onChange={event=>setEasier(event.target.checked)}/> Start new rounds one step easier</label></div>
        <div className="arcade-games">{games.map(game=>{const progress=data.progress.find(item=>item.game===game.id);return <article className="arcade-panel" key={game.id}><span aria-hidden="true" className="arcade-symbol">{game.symbol}</span><h3>{game.name}</h3><p>{game.description}</p><p className="arcade-muted">Level {progress?.level??1} · {progress?.xp??0} XP · {progress?.rounds??0} rounds</p><button className="arcade-primary" disabled={busy} onClick={()=>void open({action:"start",studentId:data.selected!.id,game:game.id,easier})}>Play / resume →</button></article>;})}</div>
        <section className="arcade-panel"><h2>Parent progress view</h2><p>Difficulty starts from class level, rises after three strong rounds and eases after two difficult rounds. Accuracy describes practice answers, not curriculum mastery.</p><div className="arcade-feedback">{data.progress.map(progress=><article key={progress.game}><h3>{games.find(game=>game.id===progress.game)?.name}</h3><p>{progress.accuracy===null?"No completed rounds yet":progress.accuracy+"% practice accuracy"}</p><p>{progress.badges.length?progress.badges.join(" · "):"Achievements appear as learning progresses."}</p></article>)}</div></section>
        <section className="arcade-panel"><h2>Recent learning</h2>{data.recent.length?<ul className="arcade-history">{data.recent.map(item=><li key={item.id}><span>{games.find(game=>game.id===item.game)?.name} · {item.correct}/5 · {item.stars} stars · Difficulty {item.difficulty}</span><button disabled={busy} onClick={()=>void open({action:"view",roundId:item.id})}>View answers</button></li>)}</ul>:<p>Complete a round to see its learning feedback here.</p>}</section>
      </>}
    </>}
    <style>{`
      .arcade{max-width:1100px;margin:auto;display:grid;gap:20px;padding-bottom:32px;color:var(--sn-ink)}
      .arcade-hero,.arcade-panel{padding:24px;border:1px solid var(--sn-line);border-radius:var(--sn-radius-xl);background:var(--sn-surface)}
      .arcade-hero{background:linear-gradient(130deg,var(--sn-guardian-tint),var(--sn-surface));display:flex;align-items:center;justify-content:space-between;gap:24px}
      .arcade h1{font-size:clamp(26px,4vw,42px);line-height:1.1;margin:12px 0}.arcade h2{font-size:24px;line-height:1.35}.arcade p{line-height:1.6}
      .arcade-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;color:var(--sn-guardian-accent)}
      .arcade a{color:var(--sn-guardian-accent)}.arcade-muted{color:var(--sn-muted);font-size:13px}
      .arcade-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
      .arcade-games,.arcade-feedback{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
      .arcade-feedback article{padding:16px;background:var(--sn-surface-2);border-radius:12px;overflow-wrap:anywhere}
      .arcade-symbol{display:grid;place-items:center;width:56px;height:56px;font-size:26px;border-radius:16px;background:var(--sn-guardian-tint);color:var(--sn-guardian-accent)}
      .arcade button,.arcade select{font:inherit;min-height:44px;padding:10px 16px;border-radius:10px;border:1px solid var(--sn-line);background:var(--sn-surface-2);color:var(--sn-ink)}
      .arcade button{cursor:pointer}.arcade button:disabled{opacity:.5;cursor:not-allowed}
      .arcade .arcade-primary{background:var(--sn-guardian-accent);color:var(--color-surface);font-weight:700}
      .arcade select{display:block;margin-top:6px;max-width:100%}.arcade label{font-size:14px}
      .arcade-options{border:0;padding:0;margin:20px 0;display:grid;grid-template-columns:1fr 1fr;gap:12px}.arcade-options legend{margin-bottom:12px}
      .arcade-options label{display:flex;gap:12px;align-items:center;padding:20px;border:2px solid var(--sn-line);border-radius:14px;cursor:pointer;font-size:18px;overflow-wrap:anywhere}
      .arcade-options label.chosen{border-color:var(--sn-guardian-accent);background:var(--sn-guardian-tint)}.arcade-options input{width:20px;height:20px;flex-shrink:0}
      .arcade :focus-visible{outline:3px solid var(--sn-guardian-accent);outline-offset:3px}.arcade-result{font-size:24px;font-weight:800}
      .arcade-alert{color:var(--color-danger)}.arcade-message{color:var(--color-success)}.arcade-alert,.arcade-message{padding:14px;background:var(--sn-surface);border:1px solid var(--sn-line);border-radius:12px}
      .arcade-history{list-style:none;padding:0}.arcade-history li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--sn-line)}
      @media(max-width:760px){.arcade-games,.arcade-feedback{grid-template-columns:1fr}.arcade-hero{display:block}.arcade-options{grid-template-columns:1fr}.arcade-panel,.arcade-hero{padding:18px}.arcade-history li{align-items:flex-start;flex-direction:column}}
    `}</style>
  </div>;
}
