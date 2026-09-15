"use client";
import { useEffect, useState } from "react";

export function TimeAwareGreeting({ text }: { text: string }) {
  // The first client render must match the server. Update only through React after hydration.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      const hour = new Date().getHours();
      setGreeting(hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 17 ? "Good afternoon" : "Good evening");
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{greeting ? text.replace(/^Good (morning|afternoon|evening)(?=,)/, greeting) : text}</>;
}
