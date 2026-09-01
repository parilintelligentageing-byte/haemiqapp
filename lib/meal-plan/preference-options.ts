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

// Plan generation requires at least a diet and a goal to ground the
// prompt's hard constraints — enforced both at the UI gate and inside
// generateMealPlan itself, so any future entry point can't bypass it.
export function needsPreferencesGate(profile: {
  dietaryPreferences: string[];
  fitnessGoals: string[];
}): boolean {
  return profile.dietaryPreferences.length === 0 || profile.fitnessGoals.length === 0;
}
