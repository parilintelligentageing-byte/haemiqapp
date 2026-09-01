import type { MealPlanFoodPreparation } from "@/lib/types/meal-plan";

// Shared by lib/actions/meal-plan.ts (writing the food_reference cache)
// and lib/actions/calorie-target.ts (reading it back for micronutrient
// totals) — split out so neither action file has to import the other.
export function normalizeSearchKey(foodName: string, preparation: MealPlanFoodPreparation): string {
  return `${foodName.trim().toLowerCase()}::${preparation}`;
}
