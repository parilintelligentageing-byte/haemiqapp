"use client";

import { useState, useTransition } from "react";
import { updateFoodStatus } from "@/lib/actions/meal-plan";
import type { MealPlanFood, MealPlanFoodCategory } from "@/lib/types/meal-plan";

const CATEGORY_LABELS: Record<MealPlanFoodCategory, string> = {
  protein: "Protein",
  carb: "Carb",
  vegetable: "Vegetable",
  fruit: "Fruit",
  dairy: "Dairy",
  other: "Other",
};

function nutritionLine(food: MealPlanFood): string {
  const parts: string[] = [];
  if (food.protein_g !== null) parts.push(`${food.protein_g}g protein`);
  if (food.carbs_g !== null) parts.push(`${food.carbs_g}g carbs`);
  if (food.fat_g !== null) parts.push(`${food.fat_g}g fat`);
  if (food.calories !== null) parts.push(`${food.calories} cal`);
  return parts.join(" · ");
}

export function FoodCard({ food }: { food: MealPlanFood }) {
  const [status, setStatus] = useState(food.status);
  const [isPending, startTransition] = useTransition();

  const handleSetStatus = (next: "accepted" | "rejected") => {
    setStatus(next);
    startTransition(() => {
      updateFoodStatus(food.id, next);
    });
  };

  const prepLabel = food.preparation ? ` (${food.preparation})` : "";
  const quantityLabel =
    food.quantity_grams !== null ? `${food.quantity_grams}g ${food.food_name}${prepLabel}` : food.food_name;

  return (
    <div
      className="rounded-[20px] border border-line bg-surface p-6 transition-opacity"
      style={{ opacity: status === "rejected" ? 0.55 : 1 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-sans text-[10px] font-semibold tracking-[0.14em] text-gold uppercase">
            {CATEGORY_LABELS[food.category]}
          </p>
          <p className="mt-1 font-serif text-lg text-ink italic">{quantityLabel}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="Accept food"
            aria-pressed={status === "accepted"}
            disabled={isPending}
            onClick={() => handleSetStatus("accepted")}
            className="flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors disabled:opacity-50"
            style={
              status === "accepted"
                ? { borderColor: "var(--color-teal)", backgroundColor: "var(--color-teal)", color: "var(--color-paper)" }
                : { borderColor: "var(--color-line)", color: "var(--color-text-soft)" }
            }
          >
            ✓
          </button>
          <button
            type="button"
            aria-label="Reject food"
            aria-pressed={status === "rejected"}
            disabled={isPending}
            onClick={() => handleSetStatus("rejected")}
            className="flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors disabled:opacity-50"
            style={
              status === "rejected"
                ? { borderColor: "var(--color-alert)", backgroundColor: "var(--color-alert)", color: "var(--color-paper)" }
                : { borderColor: "var(--color-line)", color: "var(--color-text-soft)" }
            }
          >
            ✕
          </button>
        </div>
      </div>

      {food.rationale && (
        <p className="mt-3 font-sans text-xs leading-relaxed text-text-soft">{food.rationale}</p>
      )}

      {nutritionLine(food) && (
        <p className="mt-3 border-t border-line pt-3 font-sans text-xs text-ink">
          {nutritionLine(food)}
        </p>
      )}
    </div>
  );
}
