"use client";

import { useState, useTransition } from "react";
import { Layers3 } from "lucide-react";
import { addClassCategories, type CategoryActionResult } from "../category-actions";

type Category = { classId: string; code: string; displayName: string };

export function ClassCategoryManager({
  classId,
  levelName,
  academicYearName,
  categories,
  canManage,
}: {
  classId: string;
  levelName: string;
  academicYearName: string | null;
  categories: Category[];
  canManage: boolean;
}) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<CategoryActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const split = categories.length > 1 || categories.some((item) => item.code !== "MAIN");

  const submit = () => {
    const next = value.split(",").map((item) => item.trim()).filter(Boolean);
    startTransition(async () => {
      const result = await addClassCategories({ classId, categories: next });
      setMessage(result);
      if (result.ok) {
        setValue("");
        window.setTimeout(() => window.location.reload(), 450);
      }
    });
  };

  return <div style={{ display: "grid", gap: 14 }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <span className="status-pill ready"><Layers3 size={13} aria-hidden="true" /> {split ? "Split into categories" : "One class"}</span>
      {academicYearName ? <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{academicYearName}</span> : null}
    </div>

    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {categories.length ? categories.map((category) => <span key={`${category.classId}:${category.code}`} style={{ padding: "7px 10px", border: "1px solid var(--color-border)", borderRadius: 999, background: "var(--color-bg)", fontSize: 12, fontWeight: 750 }}>{category.displayName}</span>) : <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{levelName} has not been connected to the current academic year yet.</span>}
    </div>

    {canManage ? <div style={{ display: "grid", gap: 8, maxWidth: 620 }}>
      <strong style={{ fontSize: 13 }}>{split ? "Add another category" : `Split ${levelName}`}</strong>
      <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.55 }}>
        {split ? "Enter only the new category names, for example C, D." : "Enter at least two categories such as A, B. If you do nothing, the class stays exactly as it is."}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={split ? "e.g. C, D" : "e.g. A, B"} style={{ flex: "1 1 260px", minHeight: 40, border: "1px solid var(--color-border)", borderRadius: 9, background: "var(--color-bg)", color: "var(--color-text)", padding: "8px 10px", font: "inherit" }} />
        <button className="button primary" type="button" disabled={pending || !value.trim()} onClick={submit}>{pending ? "Saving…" : split ? "Add categories" : "Split class"}</button>
      </div>
      {message ? <div style={{ padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 9, background: message.ok ? "color-mix(in srgb,var(--color-success) 9%,var(--color-surface))" : "color-mix(in srgb,var(--color-danger) 9%,var(--color-surface))", fontSize: 12, fontWeight: 650 }}>{message.message}</div> : null}
    </div> : <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>You can view the categories, but only a user with class-management permission can change them.</p>}
  </div>;
}
