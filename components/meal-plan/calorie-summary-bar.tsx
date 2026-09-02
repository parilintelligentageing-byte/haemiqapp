import { getCalorieTargetData, getPlanMicronutrientTotals } from "@/lib/actions/calorie-target";
import { getCurrentMealPlan } from "@/lib/actions/meal-plan";
import { calculateMicronutrientTargets, evaluateMicronutrientGaps } from "@/lib/nutrition/micronutrient-targets";
import { CalorieSummaryBarClient } from "@/components/meal-plan/calorie-summary-bar-client";

// Anchors the /meal-plan page the way VitalitySection anchors the
// dashboard — computed fresh on every load (see getCalorieTargetData),
// nothing here is stored. Fetches the current plan independently rather
// than taking it as a prop, matching how VitalitySection fetches its own
// blood reports independently of the dashboard page.
export async function CalorieSummaryBar() {
  const [target, plan] = await Promise.all([getCalorieTargetData(), getCurrentMealPlan()]);

  if (!plan) return null;

  const activeFoods = plan.meal_plan_foods.filter((food) => food.status !== "rejected");
  const totals = activeFoods.reduce(
    (sum, food) => ({
      calories: sum.calories + (food.calories ?? 0),
      protein: sum.protein + (food.protein_g ?? 0),
      carbs: sum.carbs + (food.carbs_g ?? 0),
      fat: sum.fat + (food.fat_g ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const micronutrients = await getPlanMicronutrientTotals(activeFoods);
  const microTargets = calculateMicronutrientTargets(target?.gender ?? null);
  const microGaps = evaluateMicronutrientGaps(micronutrients, microTargets);

  return <CalorieSummaryBarClient target={target} totals={totals} microGaps={microGaps} />;
}

export function CalorieSummaryBarSkeleton() {
  return <div className="h-[220px] animate-pulse rounded-[24px] bg-surface sm:h-[180px]" />;
}
