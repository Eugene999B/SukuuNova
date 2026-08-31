"use client";

import { useFormStatus } from "react-dom";

type Props = { children: React.ReactNode; pendingLabel?: string; className?: string };

export function OptimisticSubmitButton({ children, pendingLabel = "Saving…", className = "" }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}
