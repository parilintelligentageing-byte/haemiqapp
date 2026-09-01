"use client";

import { useTransition } from "react";
import { toggleMealLogged } from "@/lib/actions/meal-logs";
import type { MealType } from "@/lib/types/meal-plan";

export function MarkEatenToggle({
  mealPlanId,
  mealType,
  logged,
  onChange,
}: {
  mealPlanId: string;
  mealType: MealType;
  logged: boolean;
  onChange: (next: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    const optimistic = !logged;
    onChange(optimistic);
    startTransition(async () => {
      const result = await toggleMealLogged(mealPlanId, mealType);
      if (result.error) {
        onChange(logged);
        return;
      }
      onChange(result.logged);
    });
  };

  return (
    <button
      type="button"
      aria-label={logged ? "Mark as not eaten" : "Mark as eaten"}
      aria-pressed={logged}
      disabled={isPending}
      onClick={handleClick}
      className="flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors disabled:opacity-50"
      style={
        logged
          ? { borderColor: "var(--color-sage)", backgroundColor: "var(--color-sage)", color: "var(--color-paper)" }
          : { borderColor: "var(--color-line)", color: "var(--color-text-soft)" }
      }
    >
      ✓
    </button>
  );
}
