"use client";

import { useState } from "react";
import { CATEGORY_LABELS } from "@/lib/vitality/calculate-score";
import type { RecommendedTest } from "@/lib/vitality/recommended-tests";

const PRIORITY_STYLES: Record<RecommendedTest["priority"], { label: string; color: string }> = {
  essential: { label: "Essential", color: "var(--color-alert)" },
  recommended: { label: "Recommended", color: "var(--color-gold)" },
  optional: { label: "Optional", color: "var(--color-text-soft)" },
};

export function TestCard({ test }: { test: RecommendedTest }) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_STYLES[test.priority];

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-lg text-ink italic">{test.name}</p>
          <p className="mt-0.5 font-sans text-[10px] font-semibold tracking-[0.14em] text-gold uppercase">
            {CATEGORY_LABELS[test.category]}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full border px-2.5 py-1 font-sans text-[10px] font-semibold tracking-wide uppercase"
          style={{ borderColor: priority.color, color: priority.color }}
        >
          {priority.label}
        </span>
      </div>

      <p className="mt-3 font-sans text-xs leading-relaxed text-text-soft">{test.whyItMatters}</p>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="mt-3 font-sans text-xs font-medium text-teal transition-opacity hover:opacity-80"
      >
        {expanded ? "Hide details" : "More details"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-1.5 border-t border-line pt-3 font-sans text-xs text-text-soft">
          <p>
            <span className="text-ink">Labs:</span> {test.labs.join(", ")}
          </p>
          <p>
            <span className="text-ink">Medicare:</span> {test.medicareRebate}
          </p>
          <p>
            <span className="text-ink">Private cost:</span> {test.privateCost}
          </p>
          <p>
            <span className="text-ink">Fasting required:</span> {test.fastingRequired ? "Yes" : "No"}
          </p>
          <p>
            <span className="text-ink">Frequency:</span> {test.idealFrequency}
          </p>
        </div>
      )}
    </div>
  );
}
