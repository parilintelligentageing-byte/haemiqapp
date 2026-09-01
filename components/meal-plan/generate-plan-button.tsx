"use client";

import { useState, useTransition } from "react";
import { generateMealPlan } from "@/lib/actions/meal-plan";

export function GeneratePlanButton({ hasExistingPlan }: { hasExistingPlan: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [skippedFoods, setSkippedFoods] = useState<string[]>([]);
  const [excludedForAllergy, setExcludedForAllergy] = useState<string[]>([]);
  const [excludedForPreference, setExcludedForPreference] = useState<string[]>([]);

  const handleClick = () => {
    setError(null);
    setSkippedFoods([]);
    setExcludedForAllergy([]);
    setExcludedForPreference([]);
    startTransition(async () => {
      const result = await generateMealPlan();
      setExcludedForAllergy(result.excludedForAllergy);
      setExcludedForPreference(result.excludedForPreference);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSkippedFoods(result.skippedFoods);
    });
  };

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full bg-teal px-8 py-3 font-sans text-sm font-semibold tracking-wide text-paper uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Building your food list…" : hasExistingPlan ? "Regenerate Meal Plan" : "Create My Meal Plan"}
      </button>

      {error && (
        <p className="max-w-md font-sans text-sm text-alert" role="alert">
          {error}
        </p>
      )}

      {excludedForAllergy.length > 0 && (
        <p className="max-w-md font-sans text-xs text-alert">
          Excluded for your allergies: {excludedForAllergy.join(", ")}.
        </p>
      )}

      {excludedForPreference.length > 0 && (
        <p className="max-w-md font-sans text-xs text-text-soft">
          Excluded per your preferences: {excludedForPreference.join(", ")}.
        </p>
      )}

      {skippedFoods.length > 0 && (
        <p className="max-w-md font-sans text-xs text-text-soft">
          Couldn&apos;t find nutrition data for: {skippedFoods.join(", ")}. Everything else was added.
        </p>
      )}

      {hasExistingPlan &&
        !isPending &&
        !error &&
        skippedFoods.length === 0 &&
        excludedForAllergy.length === 0 &&
        excludedForPreference.length === 0 && (
          <p className="max-w-md font-sans text-xs text-text-soft">
            Regenerating replaces your current food list below.
          </p>
        )}
    </div>
  );
}
