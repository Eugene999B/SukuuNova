"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

function loginPath(pathname: string): string {
  if (pathname.startsWith("/guardian")) return "/login/guardian";
  return "/login/school";
}

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    console.error("SukuuNova application error", error);
  }, [error]);

  const signInHref = loginPath(pathname);

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">SukuuNova</p>
        <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          The page could not be loaded safely. You can retry the page or return to the appropriate sign-in screen.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm"
          >
            Try again
          </button>
          <Link
            href={signInHref}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Return to sign in
          </Link>
          <Link
            href="/"
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
