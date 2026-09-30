"use client";

import { useEffect, type ReactNode } from "react";

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function nextPaint() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function waitForOutstandingImages() {
  const pending = Array.from(document.images).filter((image) => !image.complete);
  if (!pending.length) return;
  await Promise.all(pending.map((image) => new Promise<void>((resolve) => {
    const done = () => resolve();
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
  })));
}

export default function AutoPrint({ children, automatic = true }: { children: ReactNode; automatic?: boolean }) {
  useEffect(() => {
    if (!automatic) return;
    let cancelled = false;

    void (async () => {
      const fontsReady = document.fonts?.ready ?? Promise.resolve();
      await Promise.race([
        Promise.all([fontsReady, waitForOutstandingImages()]),
        delay(5000),
      ]);
      await nextPaint();
      await nextPaint();
      if (!cancelled) window.print();
    })();

    return () => {
      cancelled = true;
    };
  }, [automatic]);

  return <>{!automatic ? <div className="print-pack-actions"><button type="button" onClick={() => window.print()}>Print available reports</button></div> : null}{children}<style>{`@media print { .print-pack-actions, .print-pack-warning { display: none !important; } }`}</style></>;
}
