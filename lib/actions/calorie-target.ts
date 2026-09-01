import { createClient } from "@/lib/supabase/server";
import {
  calculateTargetCalories,
  type ActivityLevel,
  type GoalIntensity,
  type CalorieTargetResult,
} from "@/lib/nutrition/calorie-targets";
import { sumMicronutrients, type MicronutrientTotals } from "@/lib/nutrition/micronutrients";
import { normalizeSearchKey } from "@/lib/usda/search-key";
import type { Gender } from "@/lib/types/user-profile";
import type { MealPlanFood } from "@/lib/types/meal-plan";
import type { UsdaFoodDetail } from "@/lib/usda/client";

export type { CalorieTargetResult };

// Computed fresh from the profile on every call, same as the Vitality
// Score (lib/actions/vitality.ts) — never stored as a stale column.
export async function getCalorieTargetData(): Promise<CalorieTargetResult | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("age, gender, height_cm, weight_kg, activity_level, fitness_goals, goal_intensity")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.age === null || profile.height_cm === null || profile.weight_kg === null) {
    return null;
  }

  return calculateTargetCalories({
    age: profile.age,
    gender: (profile.gender as Gender | null) ?? null,
    heightCm: profile.height_cm,
    weightKg: profile.weight_kg,
    activityLevel: (profile.activity_level as ActivityLevel | null) ?? null,
    primaryGoal: profile.fitness_goals?.[0] ?? null,
    goalIntensity: (profile.goal_intensity as GoalIntensity | null) ?? null,
  });
}

// Micronutrients aren't stored on meal_plan_foods (only the four macros
// are) — this re-reads each food's cached USDA detail from food_reference
// and scales it to the food's actual (possibly target-scaled) quantity.
// A cache miss for a given food just contributes nothing rather than
// failing the whole summary.
export async function getPlanMicronutrientTotals(foods: MealPlanFood[]): Promise<MicronutrientTotals> {
  const active = foods.filter(
    (f) => f.status !== "rejected" && f.quantity_grams !== null && f.preparation !== null
  );
  if (active.length === 0) return sumMicronutrients([]);

  const supabase = await createClient();
  const searchKeys = active.map((f) => normalizeSearchKey(f.food_name, f.preparation!));

  const { data } = await supabase.from("food_reference").select("search_key, raw_json").in("search_key", searchKeys);

  const detailByKey = new Map((data ?? []).map((row) => [row.search_key, row.raw_json as UsdaFoodDetail]));

  const inputs = active
    .map((f) => {
      const detail = detailByKey.get(normalizeSearchKey(f.food_name, f.preparation!));
      if (!detail) return null;
      return { detail, quantityGrams: f.quantity_grams! };
    })
    .filter((x): x is { detail: UsdaFoodDetail; quantityGrams: number } => x !== null);

  return sumMicronutrients(inputs);
}
