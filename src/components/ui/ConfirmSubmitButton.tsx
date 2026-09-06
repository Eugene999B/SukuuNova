"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  message: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

/** Submit button that asks for explicit confirmation first. Use for
 * destructive server-action forms (delete subject, remove assignment). */
export function ConfirmSubmitButton({ children, message, className = "", ariaLabel, disabled = false }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      aria-label={ariaLabel}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
