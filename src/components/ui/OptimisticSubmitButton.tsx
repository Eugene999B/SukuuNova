"use client";

import { useFormStatus } from "react-dom";

type Props = { children: React.ReactNode; pendingLabel?: string; className?: string; disabled?: boolean };

export function OptimisticSubmitButton({ children, pendingLabel = "Saving…", className = "", disabled = false }: Props) {
  const { pending } = useFormStatus();
  const unavailable = pending || disabled;
  return (
    <button type="submit" className={className} disabled={unavailable} aria-busy={pending}>
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}
