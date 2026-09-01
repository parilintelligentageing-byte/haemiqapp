"use client";

import { useState, useTransition } from "react";
import { swapMealType } from "@/lib/actions/meal-plan";
import type { MealType } from "@/lib/types/meal-plan";

export function SwapMealButton({ mealPlanId, mealType }: { mealPlanId: string; mealType: MealType }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await swapMealType(mealPlanId, mealType);
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      const notes: string[] = [];
      if (result.excludedForAllergy.length > 0) {
        notes.push(`excluded for allergy: ${result.excludedForAllergy.join(", ")}`);
      }
      if (result.excludedForPreference.length > 0) {
        notes.push(`excluded per your preferences: ${result.excludedForPreference.join(", ")}`);
      }
      if (result.skippedFoods.length > 0) {
        notes.push(`no nutrition data for: ${result.skippedFoods.join(", ")}`);
      }
      setMessage(notes.length > 0 ? notes.join("; ") : null);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label="Swap this meal"
        disabled={isPending}
        onClick={handleClick}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-xs text-text-soft transition-colors hover:border-teal hover:text-teal disabled:opacity-50"
      >
        {isPending ? "…" : "⟳"}
      </button>
      {message && <p className="max-w-[220px] text-right font-sans text-[10px] text-text-soft">{message}</p>}
    </div>
  );
}
