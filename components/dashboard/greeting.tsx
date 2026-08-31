"use client";

import { useState } from "react";
import { getTimeOfDay, type TimeOfDay } from "@/lib/time-of-day";

const GREETINGS: Record<TimeOfDay, { word: string; subtitle: string }> = {
  morning: { word: "Good morning", subtitle: "A fresh day. A fresh reading." },
  midday: { word: "Good afternoon", subtitle: "Bright day, steady body." },
  evening: { word: "Good evening", subtitle: "How's your body doing today?" },
  night: { word: "Good night", subtitle: "Rest is when repair happens." },
};

export function Greeting({ name }: { name: string }) {
  // "Local time" only makes sense relative to the visitor's own clock,
  // not the server's — so this can only be computed client-side. The
  // lazy initializer runs once during the server render (falling back to
  // the night default) and again during client hydration (using the
  // visitor's real clock); suppressHydrationWarning tells React to keep
  // the client's value instead of warning about the intentional mismatch.
  const [timeOfDay] = useState<TimeOfDay>(() =>
    typeof window === "undefined" ? "night" : getTimeOfDay(new Date().getHours())
  );
  const { word, subtitle } = GREETINGS[timeOfDay];

  return (
    <div className="mt-2 mb-10 text-center md:text-left">
      <h1 className="font-serif text-3xl text-ink italic" suppressHydrationWarning>
        {word}, <span className="text-teal not-italic">{name}</span>.
      </h1>
      <p className="mt-1 font-serif text-text-soft italic" suppressHydrationWarning>
        {subtitle}
      </p>
    </div>
  );
}
