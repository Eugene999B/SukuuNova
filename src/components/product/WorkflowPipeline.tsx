"use client";

import Link from "next/link";

export function WorkflowPipeline(props: { steps: Array<{ key: string; label: string; count?: number; active?: boolean; href?: string }>; ariaLabel?: string }) {
  return (
    <ol className="product-pipeline" aria-label={props.ariaLabel ?? "Workflow"}>
      {props.steps.map((s, i) => {
        const inner = (
          <>
            <span className="product-pipeline-index" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <strong>{s.label}</strong>
              {typeof s.count === "number" ? <small>{s.count}</small> : null}
            </span>
          </>
        );
        return (
          <li key={s.key} aria-current={s.active ? "step" : undefined} className={s.active ? "is-active" : undefined}>
            {s.href ? <Link href={s.href}>{inner}</Link> : <span className="product-pipeline-static">{inner}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function ExportDialogHint(props: { what: string; count: number; formats: string[] }) {
  return (
    <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
      Exporting <strong>{props.count} {props.what}</strong> as {props.formats.join(" / ")}. You stay on this page; the file downloads when ready. Large exports may take a moment — do not close the tab.
    </p>
  );
}
