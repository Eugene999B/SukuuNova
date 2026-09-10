"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Bold, Heading2, ImagePlus, List, ListOrdered, Plus, Quote, Table2, Trash2, Type } from "lucide-react";

export type LessonBlock = {
  id: string;
  type: "heading" | "paragraph" | "bullet" | "numbered" | "quote" | "callout" | "image" | "table";
  text?: string;
  url?: string;
  caption?: string;
  rows?: string[][];
};

const id = () => `block_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
export const starterLessonBlocks = (): LessonBlock[] => [
  { id: id(), type: "heading", text: "Lesson objective" },
  { id: id(), type: "paragraph", text: "By the end of the lesson, learners should be able to…" },
  { id: id(), type: "heading", text: "Teaching and learning activities" },
  { id: id(), type: "bullet", text: "Starter / prior knowledge" },
  { id: id(), type: "bullet", text: "Teacher modelling and guided practice" },
  { id: id(), type: "bullet", text: "Independent or group task" },
  { id: id(), type: "heading", text: "Assessment for learning" },
  { id: id(), type: "paragraph", text: "Questions, observation, exit ticket or exercise used to check understanding." },
];

const blockOptions = [
  ["paragraph", "Paragraph", Type], ["heading", "Heading", Heading2], ["bullet", "Bullets", List], ["numbered", "Numbered", ListOrdered],
  ["quote", "Quote", Quote], ["callout", "Callout", Bold], ["image", "Image", ImagePlus], ["table", "Table", Table2],
] as const;

function normalizeRows(text: string) {
  return text.split("\n").map((line) => line.split("|").map((cell) => cell.trim())).filter((row) => row.some(Boolean)).slice(0, 12);
}
function rowsText(rows: string[][] | undefined) { return (rows || []).map((row) => row.join(" | ")).join("\n"); }

export default function TeacherDocumentEditor({ value, onChange, disabled = false }: { value: LessonBlock[]; onChange: (blocks: LessonBlock[]) => void; disabled?: boolean }) {
  const outline = useMemo(() => value.filter((block) => block.type === "heading" && block.text?.trim()), [value]);
  const update = (index: number, patch: Partial<LessonBlock>) => onChange(value.map((block, position) => position === index ? { ...block, ...patch } : block));
  const remove = (index: number) => onChange(value.filter((_, position) => position !== index));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value]; [next[index], next[target]] = [next[target], next[index]]; onChange(next);
  };
  const add = (type: LessonBlock["type"]) => {
    const block: LessonBlock = type === "image" ? { id: id(), type, url: "", caption: "" } : type === "table" ? { id: id(), type, rows: [["Heading 1", "Heading 2"], ["", ""]] } : { id: id(), type, text: "" };
    onChange([...value, block]);
  };

  return <div className="tdoc-editor">
    <div className="tdoc-toolbar" role="toolbar" aria-label="Lesson note editor toolbar">{blockOptions.map(([type,label,Icon])=><button key={type} type="button" disabled={disabled} onClick={()=>add(type)} title={`Insert ${label.toLowerCase()}`}><Icon size={15}/><span>{label}</span></button>)}</div>
    <div className="tdoc-workspace">
      <aside className="tdoc-outline"><span>DOCUMENT OUTLINE</span>{outline.length?outline.map((block,index)=><button type="button" key={block.id} onClick={()=>document.getElementById(block.id)?.scrollIntoView({behavior:"smooth",block:"center"})}>{index+1}. {block.text}</button>):<p>Add headings to build an outline.</p>}</aside>
      <div className="tdoc-paper">{value.map((block,index)=><section id={block.id} className={`tdoc-block type-${block.type}`} key={block.id}><div className="tdoc-block-tools"><span>{block.type}</span><button type="button" disabled={disabled||index===0} onClick={()=>move(index,-1)} aria-label="Move block up"><ArrowUp size={13}/></button><button type="button" disabled={disabled||index===value.length-1} onClick={()=>move(index,1)} aria-label="Move block down"><ArrowDown size={13}/></button><button type="button" disabled={disabled} onClick={()=>remove(index)} aria-label="Delete block"><Trash2 size={13}/></button></div>{block.type==="image"?<div className="tdoc-image-edit"><input disabled={disabled} value={block.url||""} onChange={event=>update(index,{url:event.target.value})} placeholder="Paste a school-approved image URL"/><input disabled={disabled} value={block.caption||""} onChange={event=>update(index,{caption:event.target.value})} placeholder="Image caption / accessibility description"/>{block.url?<figure><img src={block.url} alt={block.caption||"Lesson note illustration"}/>{block.caption?<figcaption>{block.caption}</figcaption>:null}</figure>:<div className="tdoc-image-placeholder"><ImagePlus size={25}/><span>Image preview</span></div>}</div>:block.type==="table"?<div className="tdoc-table-edit"><textarea disabled={disabled} rows={5} value={rowsText(block.rows)} onChange={event=>update(index,{rows:normalizeRows(event.target.value)})} placeholder={"Heading 1 | Heading 2\nValue 1 | Value 2"}/>{block.rows?.length?<table><tbody>{block.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=>r===0?<th key={c}>{cell}</th>:<td key={c}>{cell}</td>)}</tr>)}</tbody></table>:null}</div>:<textarea disabled={disabled} rows={block.type==="heading"?1:block.type==="paragraph"?4:2} value={block.text||""} onChange={event=>update(index,{text:event.target.value})} placeholder={block.type==="heading"?"Section heading":block.type==="bullet"?"Bullet point":block.type==="numbered"?"Numbered step":block.type==="quote"?"Quotation / reference":block.type==="callout"?"Important teaching note":"Write here…"}/>}</section>)}{!value.length?<button className="tdoc-empty" type="button" onClick={()=>onChange(starterLessonBlocks())}><Plus size={18}/>Start from lesson-note structure</button>:null}</div>
    </div>
  </div>;
}
