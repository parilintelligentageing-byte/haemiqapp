import type { Gender } from "@/lib/types/user-profile";

export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GoalIntensity = "mild" | "moderate" | "aggressive";

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const INTENSITY_ADJUSTMENT: Record<GoalIntensity, number> = {
  mild: 0.1,
  moderate: 0.2,
  aggressive: 0.25,
};

const INTENSITY_LABELS: Record<GoalIntensity, string> = {
  mild: "Mild",
  moderate: "Moderate",
  aggressive: "Aggressive",
};

const WEIGHT_LOSS_GOALS = new Set(["Weight loss"]);
const MUSCLE_GAIN_GOALS = new Set(["Muscle gain"]);

// Mifflin-St Jeor's offset term. Non-binary/prefer-not-to-say profiles use
// the average of the male (+5) and female (-161) offsets — there's no
// clinical third formula, and this is the least-wrong single number
// available without one.
function bmrOffset(gender: Gender | null): number {
  if (gender === "male") return 5;
  if (gender === "female") return -161;
  return -78;
}

export function calculateBMR(input: {
  age: number;
  gender: Gender | null;
  heightCm: number;
  weightKg: number;
}): number {
  const { age, gender, heightCm, weightKg } = input;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + bmrOffset(gender);
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel | null): number {
  const multiplier = activityLevel ? ACTIVITY_MULTIPLIERS[activityLevel] : ACTIVITY_MULTIPLIERS.moderate;
  return bmr * multiplier;
}

// The safer (higher) of the two stated floors is used for non-binary/
// prefer-not-to-say profiles, since there's no clinical basis to pick
// the lower one instead.
function safetyFloor(gender: Gender | null): number {
  return gender === "female" ? 1200 : 1500;
}

export interface CalorieTargetInput {
  age: number;
  gender: Gender | null;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel | null;
  primaryGoal: string | null;
  goalIntensity: GoalIntensity | null;
}

export interface CalorieTargetResult {
  bmr: number;
  tdee: number;
  targetCalories: number;
  floorApplied: boolean;
  goalLabel: string | null;
  proteinTargetG: number;
  fatTargetG: number;
  carbTargetG: number;
}

// Protein is derived from bodyweight FIRST, not as a share of calories —
// otherwise it silently gets squeezed out by whatever's left over. 2.0
// g/kg is the top of the evidence-based 1.6-2.2 g/kg range for
// preserving/building lean mass; 1.2 g/kg covers maintenance/longevity
// goals where there's no deficit or surplus to protect against.
const HIGH_PROTEIN_GOALS = new Set(["Weight loss", "Muscle gain"]);
const HIGH_PROTEIN_FACTOR = 2.0;
const MAINTENANCE_PROTEIN_FACTOR = 1.2;

// Fat is a fixed share of the TOTAL target (not the calorie remainder
// after protein) so it never gets squeezed out as an afterthought —
// relevant here since elevated cholesterol is a flagged biomarker for
// this user base. Carbs absorb whatever's left.
const FAT_SHARE_OF_TOTAL = 0.25;

function calculateMacroTargets(
  weightKg: number,
  primaryGoal: string | null,
  targetCalories: number
): { proteinTargetG: number; fatTargetG: number; carbTargetG: number } {
  const proteinFactor = primaryGoal && HIGH_PROTEIN_GOALS.has(primaryGoal) ? HIGH_PROTEIN_FACTOR : MAINTENANCE_PROTEIN_FACTOR;
  const proteinTargetG = Math.round(weightKg * proteinFactor);
  const proteinKcal = proteinTargetG * 4;

  const fatKcal = targetCalories * FAT_SHARE_OF_TOTAL;
  const fatTargetG = Math.round(fatKcal / 9);

  const carbKcal = Math.max(0, targetCalories - proteinKcal - fatKcal);
  const carbTargetG = Math.round(carbKcal / 4);

  return { proteinTargetG, fatTargetG, carbTargetG };
}

export function calculateTargetCalories(input: CalorieTargetInput): CalorieTargetResult {
  const bmr = calculateBMR(input);
  const tdee = calculateTDEE(bmr, input.activityLevel);

  let rawTarget = tdee;
  let goalLabel: string | null = null;

  if (input.primaryGoal && WEIGHT_LOSS_GOALS.has(input.primaryGoal)) {
    if (input.goalIntensity) {
      rawTarget = tdee * (1 - INTENSITY_ADJUSTMENT[input.goalIntensity]);
      goalLabel = `${INTENSITY_LABELS[input.goalIntensity]} fat loss`;
    } else {
      goalLabel = "Fat loss";
    }
  } else if (input.primaryGoal && MUSCLE_GAIN_GOALS.has(input.primaryGoal)) {
    if (input.goalIntensity) {
      rawTarget = tdee * (1 + INTENSITY_ADJUSTMENT[input.goalIntensity]);
      goalLabel = `${INTENSITY_LABELS[input.goalIntensity]} muscle gain`;
    } else {
      goalLabel = "Muscle gain";
    }
  } else if (input.primaryGoal) {
    goalLabel = "Maintenance";
  }

  // Hard safety floor: never below BMR, and never below the gender-based
  // minimum, regardless of how aggressive the selected intensity is.
  const floor = Math.max(bmr, safetyFloor(input.gender));
  const floorApplied = rawTarget < floor;
  const targetCalories = Math.round(floorApplied ? floor : rawTarget);

  const { proteinTargetG, fatTargetG, carbTargetG } = calculateMacroTargets(
    input.weightKg,
    input.primaryGoal,
    targetCalories
  );

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories,
    floorApplied,
    goalLabel,
    proteinTargetG,
    fatTargetG,
    carbTargetG,
  };
}
