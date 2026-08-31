"use client";

import { useState } from "react";
import type { RecommendedTest } from "@/lib/vitality/recommended-tests";

export function CopyListButton({ tests }: { tests: RecommendedTest[] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = [
      "Suggested blood tests to ask your GP about:",
      "",
      ...tests.map((test) => `- ${test.name} (${test.priority})`),
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="relative inline-flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-full bg-teal px-8 py-3 font-sans text-sm font-semibold tracking-wide text-paper uppercase transition-opacity hover:opacity-90"
      >
        Copy this list for your GP
      </button>
      {copied && (
        <span className="animate-step-in rounded-full border border-teal bg-surface px-4 py-2 font-sans text-xs text-ink">
          Copied — paste into an email to your GP
        </span>
      )}
    </div>
  );
}
