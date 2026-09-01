import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/dashboard/top-nav";
import { PreferencesForm } from "@/components/meal-plan/preferences-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("name, dietary_preferences, allergies, fitness_goals, activity_level, goal_intensity")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-24">
      <TopNav name={profile?.name ?? "there"} />

      <Link
        href="/meal-plan"
        className="mt-2 inline-block font-sans text-sm text-text-soft transition-colors hover:text-ink"
      >
        ← Back to meal plan
      </Link>

      <div className="mt-8 text-center md:text-left">
        <h1 className="font-serif text-3xl text-ink italic sm:text-4xl">Settings</h1>
        <p className="mt-2 font-serif text-text-soft italic">
          Update the preferences your meal plan is generated from.
        </p>
      </div>

      <div className="mt-8">
        <PreferencesForm
          initialDietaryPreferences={profile?.dietary_preferences ?? []}
          initialAllergies={profile?.allergies ?? []}
          initialPrimaryGoal={profile?.fitness_goals?.[0] ?? null}
          initialActivityLevel={profile?.activity_level ?? null}
          initialGoalIntensity={profile?.goal_intensity ?? null}
          title="Meal plan preferences"
          description="Changes apply the next time you generate or regenerate your meal plan."
          submitLabel="Save changes"
        />
      </div>
    </main>
  );
}
