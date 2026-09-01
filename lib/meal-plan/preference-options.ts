export const DIETARY_OPTIONS = [
  "Omnivore",
  "Vegetarian",
  "Vegan",
  "Pescatarian",
  "Keto",
  "Paleo",
  "Gluten-free",
  "Dairy-free",
] as const;

export const GOAL_OPTIONS = [
  "Weight loss",
  "Muscle gain",
  "General longevity",
  "Manage a specific marker",
] as const;

export const ACTIVITY_LEVEL_OPTIONS = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Lightly active" },
  { value: "moderate", label: "Moderately active" },
  { value: "active", label: "Active" },
  { value: "very_active", label: "Very active" },
] as const;

export const GOAL_INTENSITY_OPTIONS = [
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "aggressive", label: "Aggressive" },
] as const;

// Goals for which a calorie-target "how aggressively" dial makes sense —
// maintenance/longevity and marker-management goals don't have one.
export const INTENSITY_RELEVANT_GOALS = new Set<string>(["Weight loss", "Muscle gain"]);

// Plan generation requires at least a diet and a goal to ground the
// prompt's hard constraints — enforced both at the UI gate and inside
// generateMealPlan itself, so any future entry point can't bypass it.
export function needsPreferencesGate(profile: {
  dietaryPreferences: string[];
  fitnessGoals: string[];
}): boolean {
  return profile.dietaryPreferences.length === 0 || profile.fitnessGoals.length === 0;
}
