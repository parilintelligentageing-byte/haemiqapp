import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMealPlan, getMealPlanContext } from "@/lib/actions/meal-plan";
import { TopNav } from "@/components/dashboard/top-nav";
import { FoodCard } from "@/components/meal-plan/food-card";
import { AddFoodForm } from "@/components/meal-plan/add-food-form";
import { GeneratePlanButton } from "@/components/meal-plan/generate-plan-button";
import { PreferencesForm } from "@/components/meal-plan/preferences-form";
import type { MealPlanFoodCategory } from "@/lib/types/meal-plan";

const CATEGORY_ORDER: MealPlanFoodCategory[] = ["protein", "carb", "vegetable", "fruit", "dairy", "other"];

const CATEGORY_LABELS: Record<MealPlanFoodCategory, string> = {
  protein: "Protein",
  carb: "Carbs",
  vegetable: "Vegetables",
  fruit: "Fruit",
  dairy: "Dairy",
  other: "Other",
};

export default async function MealPlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  const [plan, context] = await Promise.all([getCurrentMealPlan(), getMealPlanContext()]);

  // Once diet + goal are set once, the gate never shows again — allergies
  // is intentionally excluded from this check since an empty list is a
  // valid answer ("no allergies"), not a sign the gate was skipped.
  const needsPreferencesGate =
    context.profile.dietaryPreferences.length === 0 || context.profile.fitnessGoals.length === 0;

  const foodsByCategory = CATEGORY_ORDER.map((category) => ({
    category,
    foods: (plan?.meal_plan_foods ?? []).filter((food) => food.category === category),
  })).filter((group) => group.foods.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-24">
      <TopNav name={profile?.name ?? "there"} />

      <Link
        href="/dashboard"
        className="mt-2 inline-block font-sans text-sm text-text-soft transition-colors hover:text-ink"
      >
        ← Back to dashboard
      </Link>

      <div className="mt-8 text-center md:text-left">
        <h1 className="font-serif text-3xl text-ink italic sm:text-4xl">Your meal plan</h1>
        <p className="mt-2 font-serif text-text-soft italic">
          Foods proposed from your biomarkers, recovery data, and goals — real nutrition data, no guessed numbers.
        </p>
      </div>

      {!context.hasBiomarkers && !context.hasWearableData && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="font-serif text-xl text-ink italic">
            No blood report or wearable data yet.
          </p>
          <p className="mt-2 font-sans text-sm text-text-soft">
            That&apos;s fine — we&apos;ll build a food list from your profile alone. Add a blood report or connect
            Oura for a more tailored list.
          </p>
        </div>
      )}

      {needsPreferencesGate ? (
        <div className="mt-10">
          <PreferencesForm
            initialDietaryPreferences={context.profile.dietaryPreferences}
            initialAllergies={context.profile.allergies}
            initialPrimaryGoal={context.profile.fitnessGoals[0] ?? null}
            title="Before your first meal plan"
            description="A few quick questions so we never suggest something outside your diet or allergies."
            submitLabel="Save & continue"
          />
        </div>
      ) : (
        <>
          <div className="mt-10 flex justify-center">
            <GeneratePlanButton hasExistingPlan={Boolean(plan)} />
          </div>
          <div className="mt-3 flex justify-center">
            <Link
              href="/settings"
              className="font-sans text-xs text-text-soft underline-offset-2 transition-colors hover:text-ink hover:underline"
            >
              Edit dietary preferences, allergies, or goals
            </Link>
          </div>
        </>
      )}

      {plan && (
        <>
          {plan.ai_rationale && (
            <div className="mt-10 rounded-2xl border border-line bg-surface p-6">
              <p className="font-sans text-[10px] font-semibold tracking-[0.14em] text-gold uppercase">
                About this list
              </p>
              <p className="mt-2 font-sans text-sm leading-relaxed text-text-soft">{plan.ai_rationale}</p>
            </div>
          )}

          <div className="mt-10 flex flex-col gap-10">
            {foodsByCategory.map(({ category, foods }) => (
              <div key={category}>
                <div className="flex items-baseline justify-between">
                  <h2 className="font-serif text-xl text-ink italic">{CATEGORY_LABELS[category]}</h2>
                  <span className="font-sans text-xs font-bold tracking-[0.2em] text-gold uppercase">
                    {foods.length} {foods.length === 1 ? "food" : "foods"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
                  {foods.map((food) => (
                    <FoodCard key={food.id} food={food} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <AddFoodForm mealPlanId={plan.id} />
          </div>
        </>
      )}
    </main>
  );
}
