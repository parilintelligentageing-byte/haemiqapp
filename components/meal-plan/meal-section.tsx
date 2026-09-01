"use client";

import { useState } from "react";
import { FoodCard } from "@/components/meal-plan/food-card";
import { SwapMealButton } from "@/components/meal-plan/swap-meal-button";
import { MarkEatenToggle } from "@/components/meal-plan/mark-eaten-toggle";
import { MEAL_TYPE_LABELS } from "@/lib/types/meal-plan";
import type { MealPlanFood, MealType } from "@/lib/types/meal-plan";

function sumMacros(foods: MealPlanFood[]) {
  return foods
    .filter((food) => food.status !== "rejected")
    .reduce(
      (totals, food) => ({
        calories: totals.calories + (food.calories ?? 0),
        protein: totals.protein + (food.protein_g ?? 0),
        carbs: totals.carbs + (food.carbs_g ?? 0),
        fat: totals.fat + (food.fat_g ?? 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
}

export function MealSection({
  mealPlanId,
  mealType,
  foods,
  initiallyLogged,
}: {
  mealPlanId: string;
  mealType: MealType;
  foods: MealPlanFood[];
  initiallyLogged: boolean;
}) {
  const [logged, setLogged] = useState(initiallyLogged);
  const totals = sumMacros(foods);
  const hasNutrition = totals.calories > 0 || totals.protein > 0 || totals.carbs > 0 || totals.fat > 0;

  return (
    <div className="transition-opacity" style={{ opacity: logged ? 0.7 : 1 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-sans text-xs font-bold tracking-[0.32em] text-gold uppercase">
            {MEAL_TYPE_LABELS[mealType]}
          </h2>
          {hasNutrition && (
            <span className="font-sans text-xs text-text-soft">
              {Math.round(totals.calories)} cal · {Math.round(totals.protein)}g protein · {Math.round(totals.carbs)}g
              carbs · {Math.round(totals.fat)}g fat
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <SwapMealButton mealPlanId={mealPlanId} mealType={mealType} />
          <MarkEatenToggle mealPlanId={mealPlanId} mealType={mealType} logged={logged} onChange={setLogged} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        {foods.map((food) => (
          <FoodCard key={food.id} food={food} />
        ))}
      </div>
    </div>
  );
}
