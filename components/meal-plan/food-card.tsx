"use client";

import { useState, useTransition } from "react";
import { updateFoodStatus } from "@/lib/actions/meal-plan";
import { MEAL_PLAN_CATEGORY_LABELS } from "@/lib/types/meal-plan";
import type { MealPlanFood } from "@/lib/types/meal-plan";

const STATUS_BUTTONS = [
  { status: "accepted" as const, label: "Accept food", glyph: "✓", color: "var(--color-teal)" },
  { status: "rejected" as const, label: "Reject food", glyph: "✕", color: "var(--color-alert)" },
];

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
  const nutrition = nutritionLine(food);

  return (
    <div
      className="rounded-[20px] border border-line bg-surface p-6 transition-opacity"
      style={{ opacity: status === "rejected" ? 0.55 : 1 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-sans text-[10px] font-semibold tracking-[0.14em] text-gold uppercase">
            {MEAL_PLAN_CATEGORY_LABELS[food.category]}
          </p>
          <p className="mt-1 font-serif text-lg text-ink italic">{quantityLabel}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {STATUS_BUTTONS.map((button) => (
            <button
              key={button.status}
              type="button"
              aria-label={button.label}
              aria-pressed={status === button.status}
              disabled={isPending}
              onClick={() => handleSetStatus(button.status)}
              className="flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors disabled:opacity-50"
              style={
                status === button.status
                  ? { borderColor: button.color, backgroundColor: button.color, color: "var(--color-paper)" }
                  : { borderColor: "var(--color-line)", color: "var(--color-text-soft)" }
              }
            >
              {button.glyph}
            </button>
          ))}
        </div>
      </div>

      {food.rationale && (
        <p className="mt-3 font-sans text-xs leading-relaxed text-text-soft">{food.rationale}</p>
      )}

      {nutrition && (
        <p className="mt-3 border-t border-line pt-3 font-sans text-xs text-ink">{nutrition}</p>
      )}
    </div>
  );
}
